import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  Channel,
  ClientEvent,
  HuddleState,
  Message,
  Scheduled,
  ServerEvent,
  Snapshot,
  User,
  Workflow,
} from '../src/types.ts';
import { parseSlash } from './slash.ts';

const PORT = Number(process.env.PORT ?? 8787);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const dataFile = path.join(dataDir, 'db.json');
const distDir = path.join(root, 'dist');

const BOT_ID = 'relaybot';
const COLORS = ['#7c5cff', '#ff6b8b', '#18b6a0', '#f5a524', '#3b9cff', '#e0577d', '#5fb760', '#c06cf0'];
const MAX_TEXT = 8000;

interface DB {
  users: Record<string, User>;
  channels: Record<string, Channel>;
  messages: Message[];
  canvases: Record<string, string>;
  workflows: Workflow[];
  scheduled: Scheduled[];
  saved: Record<string, string[]>;
}

function seed(): DB {
  const now = Date.now();
  const mk = (id: string, name: string, topic: string): Channel => ({
    id,
    name,
    topic,
    kind: 'public',
    members: [BOT_ID],
    createdAt: now,
  });
  const channels = [
    mk('general', 'general', 'Company-wide announcements and chatter'),
    mk('random', 'random', 'Memes, music, and everything off-topic'),
    mk('announcements', 'announcements', 'Read-only vibes: big news goes here'),
    mk('engineering', 'engineering', 'Ship it. Break it. Fix it.'),
    mk('design', 'design', 'Pixels, prototypes, and polish'),
  ];
  const db: DB = {
    users: {
      [BOT_ID]: {
        id: BOT_ID,
        name: 'Relay Bot',
        color: '#7c5cff',
        title: 'Workflow automation',
        status: { emoji: '🤖', text: 'Always on' },
        bot: true,
      },
    },
    channels: Object.fromEntries(channels.map((c) => [c.id, c])),
    messages: [],
    canvases: {
      general: '# Team handbook\n\nWelcome to Relay. Edit this canvas — it is shared with everyone in the channel.\n\n- Be kind\n- Ship small\n- Write things down',
    },
    workflows: [
      {
        id: 'wf-welcome',
        name: 'Welcome new members',
        enabled: true,
        trigger: { type: 'join', channelId: 'general' },
        reply: 'Welcome aboard! 👋 Try `/remind me stretch in 10m`, open a canvas, or press ⌘K to search.',
      },
      {
        id: 'wf-help',
        name: 'Answer "help"',
        enabled: true,
        trigger: { type: 'keyword', keyword: '!help', channelId: 'any' },
        reply: 'Slash commands: /remind, /topic, /me, /shrug, /huddle, /summarize. Press ⌘K to search anything.',
      },
    ],
    scheduled: [],
    saved: {},
  };
  db.messages.push({
    id: randomUUID(),
    channelId: 'general',
    userId: BOT_ID,
    text: 'Welcome to **Relay** — every premium feature is unlocked. Say `!help` to see what I can do.',
    ts: now,
    reactions: {},
  });
  return db;
}

function load(): DB {
  if (!fs.existsSync(dataFile)) return seed();
  const raw = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(raw) as DB;
}

const db = load();
let saveTimer: NodeJS.Timeout | undefined;
function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFile(dataFile, JSON.stringify(db), (err) => {
      if (err) console.error('persist failed:', err.message);
    });
  }, 250);
}

const clients = new Map<WebSocket, string>();
const huddles = new Map<string, Set<string>>();

function send(ws: WebSocket, ev: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev));
}

function broadcast(ev: ServerEvent, filter?: (userId: string) => boolean): void {
  const payload = JSON.stringify(ev);
  for (const [ws, uid] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (filter && !filter(uid)) continue;
    ws.send(payload);
  }
}

function canSee(ch: Channel, userId: string): boolean {
  return ch.kind === 'public' || ch.members.includes(userId);
}

function broadcastChannel(ch: Channel, ev: ServerEvent): void {
  broadcast(ev, (uid) => canSee(ch, uid));
}

function onlineIds(): string[] {
  return [...new Set(clients.values())];
}

function huddleList(): HuddleState[] {
  return [...huddles.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([channelId, set]) => ({ channelId, participants: [...set] }));
}

function snapshotFor(userId: string): Snapshot {
  const visibleChannels = Object.fromEntries(
    Object.entries(db.channels).filter(([, ch]) => canSee(ch, userId)),
  );
  return {
    me: userId,
    workspace: { name: 'Relay HQ', plan: 'Enterprise Grid · all premium unlocked' },
    users: db.users,
    online: onlineIds(),
    channels: visibleChannels,
    messages: db.messages.filter((m) => visibleChannels[m.channelId]),
    canvases: db.canvases,
    workflows: db.workflows,
    scheduled: db.scheduled.filter((s) => s.userId === userId),
    huddles: huddleList(),
    saved: db.saved[userId] ?? [],
  };
}

function postMessage(
  channelId: string,
  userId: string,
  text: string,
  extra: Partial<Message> = {},
): Message | null {
  const ch = db.channels[channelId];
  if (!ch) return null;
  const message: Message = {
    id: randomUUID(),
    channelId,
    userId,
    text: text.slice(0, MAX_TEXT),
    ts: Date.now(),
    reactions: {},
    ...extra,
  };
  db.messages.push(message);
  broadcastChannel(ch, { t: 'message', message });
  persist();
  runWorkflows(message);
  return message;
}

function runWorkflows(message: Message): void {
  if (message.userId === BOT_ID) return;
  for (const wf of db.workflows) {
    if (!wf.enabled || wf.trigger.type !== 'keyword') continue;
    const { keyword, channelId } = wf.trigger;
    if (channelId !== 'any' && channelId !== message.channelId) continue;
    if (!message.text.toLowerCase().includes(keyword.toLowerCase())) continue;
    postMessage(message.channelId, BOT_ID, wf.reply, { threadId: message.threadId ?? message.id });
  }
}

function runJoinWorkflows(channelId: string): void {
  for (const wf of db.workflows) {
    if (wf.enabled && wf.trigger.type === 'join' && wf.trigger.channelId === channelId) {
      postMessage(channelId, BOT_ID, wf.reply);
    }
  }
}

function summarize(channelId: string, threadId?: string): string {
  const msgs = db.messages.filter(
    (m) => m.channelId === channelId && !m.system && m.userId !== BOT_ID && (threadId ? m.threadId === threadId || m.id === threadId : !m.threadId),
  );
  if (msgs.length === 0) return 'Nothing to summarize yet.';
  const people = [...new Set(msgs.map((m) => db.users[m.userId]?.name ?? 'someone'))];
  const last = msgs.slice(-3).map((m) => `• ${db.users[m.userId]?.name ?? 'someone'}: ${m.text.slice(0, 90)}`);
  const links = msgs.filter((m) => /https?:\/\//.test(m.text)).length;
  return `**Recap** — ${msgs.length} messages from ${people.join(', ')}${links ? `, ${links} with links` : ''}.\n${last.join('\n')}`;
}

function ensureMember(ch: Channel, userId: string): void {
  if (!ch.members.includes(userId)) ch.members.push(userId);
}

function dmId(a: string, b: string): string {
  return `dm-${[a, b].sort().join('-')}`;
}

function handle(ws: WebSocket, ev: ClientEvent): void {
  if (ev.t === 'hello') {
    const userId = String(ev.userId).slice(0, 64);
    const name = String(ev.name).trim().slice(0, 40) || 'Guest';
    let user = db.users[userId];
    const isNew = !user;
    if (!user) {
      user = {
        id: userId,
        name,
        color: COLORS[Object.keys(db.users).length % COLORS.length],
        title: '',
        status: { emoji: '', text: '' },
      };
      db.users[userId] = user;
      for (const id of ['general', 'random']) ensureMember(db.channels[id], userId);
    }
    clients.set(ws, userId);
    send(ws, { t: 'init', snapshot: snapshotFor(userId) });
    broadcast({ t: 'user', user });
    broadcast({ t: 'presence', online: onlineIds() });
    if (isNew) runJoinWorkflows('general');
    persist();
    return;
  }

  const userId = clients.get(ws);
  if (!userId) {
    send(ws, { t: 'error', message: 'Send hello first' });
    return;
  }

  switch (ev.t) {
    case 'send': {
      const ch = db.channels[ev.channelId];
      if (!ch || !canSee(ch, userId)) return;
      ensureMember(ch, userId);
      const slash = parseSlash(ev.text);
      if (slash) {
        if (slash.kind === 'remind') {
          const sched: Scheduled = {
            id: randomUUID(),
            channelId: dmId(userId, BOT_ID),
            userId,
            text: `⏰ Reminder: ${slash.text}`,
            at: Date.now() + slash.inMs,
          };
          openDM(userId, BOT_ID);
          db.scheduled.push(sched);
          sendScheduled(userId);
          postMessage(ev.channelId, BOT_ID, `Got it — I'll remind <@${userId}> to "${slash.text}" in ${slash.label}.`, { system: true });
        } else if (slash.kind === 'topic') {
          ch.topic = slash.text;
          broadcastChannel(ch, { t: 'channel', channel: ch });
          postMessage(ch.id, BOT_ID, `<@${userId}> set the topic to: ${slash.text}`, { system: true });
        } else if (slash.kind === 'huddle') {
          toggleHuddle(ch.id, userId, 'join');
        } else if (slash.kind === 'summarize') {
          postMessage(ch.id, BOT_ID, summarize(ch.id, ev.threadId), { threadId: ev.threadId });
        } else if (slash.kind === 'usage') {
          postMessage(ev.channelId, BOT_ID, slash.text, { system: true, threadId: ev.threadId });
        } else {
          postMessage(ev.channelId, userId, slash.text, { threadId: ev.threadId });
        }
        return;
      }
      if (!ev.text.trim() && !ev.files?.length) return;
      postMessage(ev.channelId, userId, ev.text, { threadId: ev.threadId, files: ev.files?.slice(0, 5) });
      return;
    }
    case 'edit': {
      const m = db.messages.find((x) => x.id === ev.id);
      if (!m || m.userId !== userId) return;
      m.text = ev.text.slice(0, MAX_TEXT);
      m.edited = true;
      const ch = db.channels[m.channelId];
      if (ch) broadcastChannel(ch, { t: 'message', message: m });
      persist();
      return;
    }
    case 'delete': {
      const idx = db.messages.findIndex((x) => x.id === ev.id);
      const m = db.messages[idx];
      if (!m || m.userId !== userId) return;
      db.messages = db.messages.filter((x) => x.id !== ev.id && x.threadId !== ev.id);
      const ch = db.channels[m.channelId];
      if (ch) broadcastChannel(ch, { t: 'messageDeleted', id: m.id });
      persist();
      return;
    }
    case 'react': {
      const m = db.messages.find((x) => x.id === ev.id);
      if (!m) return;
      const list = m.reactions[ev.emoji] ?? [];
      m.reactions[ev.emoji] = list.includes(userId) ? list.filter((u) => u !== userId) : [...list, userId];
      if (m.reactions[ev.emoji].length === 0) delete m.reactions[ev.emoji];
      const ch = db.channels[m.channelId];
      if (ch) broadcastChannel(ch, { t: 'message', message: m });
      persist();
      return;
    }
    case 'pin': {
      const m = db.messages.find((x) => x.id === ev.id);
      if (!m) return;
      m.pinned = !m.pinned;
      const ch = db.channels[m.channelId];
      if (ch) broadcastChannel(ch, { t: 'message', message: m });
      persist();
      return;
    }
    case 'save': {
      const list = db.saved[userId] ?? [];
      db.saved[userId] = list.includes(ev.id) ? list.filter((i) => i !== ev.id) : [...list, ev.id];
      send(ws, { t: 'saved', saved: db.saved[userId] });
      persist();
      return;
    }
    case 'createChannel': {
      const name = ev.name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      if (!name) {
        send(ws, { t: 'error', message: 'Channel name required' });
        return;
      }
      if (Object.values(db.channels).some((c) => c.name === name && c.kind !== 'dm')) {
        send(ws, { t: 'error', message: `#${name} already exists` });
        return;
      }
      const ch: Channel = {
        id: randomUUID(),
        name,
        topic: ev.topic.slice(0, 200),
        kind: ev.kind === 'private' ? 'private' : 'public',
        members: [userId],
        createdAt: Date.now(),
      };
      db.channels[ch.id] = ch;
      broadcastChannel(ch, { t: 'channel', channel: ch });
      persist();
      return;
    }
    case 'join': {
      const ch = db.channels[ev.channelId];
      if (!ch || ch.kind !== 'public') return;
      ensureMember(ch, userId);
      broadcastChannel(ch, { t: 'channel', channel: ch });
      postMessage(ch.id, BOT_ID, `<@${userId}> joined the channel.`, { system: true });
      persist();
      return;
    }
    case 'leave': {
      const ch = db.channels[ev.channelId];
      if (!ch || ch.kind === 'dm') return;
      ch.members = ch.members.filter((u) => u !== userId);
      broadcastChannel(ch, { t: 'channel', channel: ch });
      persist();
      return;
    }
    case 'openDM': {
      if (!db.users[ev.userId]) return;
      openDM(userId, ev.userId);
      return;
    }
    case 'typing': {
      const ch = db.channels[ev.channelId];
      if (!ch || !canSee(ch, userId)) return;
      broadcast({ t: 'typing', channelId: ch.id, userId }, (uid) => uid !== userId && canSee(ch, uid));
      return;
    }
    case 'profile': {
      const user = db.users[userId];
      if (ev.name !== undefined) user.name = ev.name.trim().slice(0, 40) || user.name;
      if (ev.title !== undefined) user.title = ev.title.slice(0, 80);
      if (ev.status) user.status = { emoji: ev.status.emoji.slice(0, 8), text: ev.status.text.slice(0, 80) };
      broadcast({ t: 'user', user });
      persist();
      return;
    }
    case 'canvas': {
      const ch = db.channels[ev.channelId];
      if (!ch || !canSee(ch, userId)) return;
      db.canvases[ch.id] = ev.content.slice(0, 100_000);
      broadcastChannel(ch, { t: 'canvas', channelId: ch.id, content: db.canvases[ch.id] });
      persist();
      return;
    }
    case 'workflows': {
      db.workflows = ev.list.slice(0, 50).map((w) => ({ ...w, id: w.id || randomUUID() }));
      broadcast({ t: 'workflows', list: db.workflows });
      persist();
      return;
    }
    case 'schedule': {
      const ch = db.channels[ev.channelId];
      if (!ch || !canSee(ch, userId) || !ev.text.trim() || ev.at < Date.now()) return;
      db.scheduled.push({ id: randomUUID(), channelId: ch.id, userId, text: ev.text, at: ev.at });
      sendScheduled(userId);
      persist();
      return;
    }
    case 'unschedule': {
      db.scheduled = db.scheduled.filter((s) => !(s.id === ev.id && s.userId === userId));
      sendScheduled(userId);
      persist();
      return;
    }
    case 'huddle': {
      const ch = db.channels[ev.channelId];
      if (!ch || !canSee(ch, userId)) return;
      toggleHuddle(ch.id, userId, ev.action);
      return;
    }
  }
}

function toggleHuddle(channelId: string, userId: string, action: 'join' | 'leave'): void {
  const set = huddles.get(channelId) ?? new Set<string>();
  if (action === 'join') set.add(userId);
  else set.delete(userId);
  huddles.set(channelId, set);
  broadcast({ t: 'huddles', huddles: huddleList() });
}

function openDM(a: string, b: string): Channel {
  const id = dmId(a, b);
  let ch = db.channels[id];
  if (!ch) {
    ch = { id, name: id, topic: '', kind: 'dm', members: [...new Set([a, b])], createdAt: Date.now() };
    db.channels[id] = ch;
    persist();
  }
  broadcastChannel(ch, { t: 'channel', channel: ch });
  return ch;
}

function sendScheduled(userId: string): void {
  const list = db.scheduled.filter((s) => s.userId === userId);
  for (const [ws, uid] of clients) if (uid === userId) send(ws, { t: 'scheduled', list });
}

setInterval(() => {
  const due = db.scheduled.filter((s) => s.at <= Date.now());
  if (due.length === 0) return;
  db.scheduled = db.scheduled.filter((s) => s.at > Date.now());
  for (const s of due) {
    const asBot = s.channelId === dmId(s.userId, BOT_ID);
    postMessage(s.channelId, asBot ? BOT_ID : s.userId, s.text);
    sendScheduled(s.userId);
  }
  persist();
}, 1000);

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, users: Object.keys(db.users).length, messages: db.messages.length }));
    return;
  }
  if (!fs.existsSync(distDir)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Relay API running. Start the UI with `npm run dev:web` or build with `npm run build`.');
    return;
  }
  const requested = path.normalize(path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname));
  const file = requested.startsWith(distDir) && fs.existsSync(requested) && fs.statSync(requested).isFile()
    ? requested
    : path.join(distDir, 'index.html');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 12 * 1024 * 1024 });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let ev: ClientEvent;
    try {
      ev = JSON.parse(raw.toString()) as ClientEvent;
    } catch (err) {
      send(ws, { t: 'error', message: `Bad JSON: ${(err as Error).message}` });
      return;
    }
    try {
      handle(ws, ev);
    } catch (err) {
      console.error('handler failed:', err);
      send(ws, { t: 'error', message: 'Server error' });
    }
  });
  ws.on('close', () => {
    const uid = clients.get(ws);
    clients.delete(ws);
    if (uid && !onlineIds().includes(uid)) {
      for (const [cid, set] of huddles) if (set.delete(uid)) huddles.set(cid, set);
      broadcast({ t: 'huddles', huddles: huddleList() });
    }
    broadcast({ t: 'presence', online: onlineIds() });
  });
});

server.listen(PORT, () => console.log(`Relay server on http://localhost:${PORT}`));
