import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AdminData,
  AuditEntry,
  Channel,
  ClientEvent,
  Flag,
  HuddleState,
  Invite,
  ListItem,
  Message,
  Scheduled,
  Section,
  ServerEvent,
  Settings,
  Snapshot,
  User,
  UserGroup,
  Workflow,
  WorkspaceSummary,
} from '../src/types.ts';
import { MAX_HUDDLE } from '../src/types.ts';
import {
  barred,
  canPost,
  computeAnalytics,
  dailyRecap,
  explainTerm,
  huddleNote,
  isAdmin,
  pruneRetention,
  scheduleDue,
  summarizeText,
  workflowReply,
} from '../src/premium.ts';
import { parseSlash } from './slash.ts';
import { createStore } from './store.ts';
import { createClient } from '@supabase/supabase-js';
import { verifyToken, type AuthClient, type Identity } from './auth.ts';
import { generateCode, validateInvite, decideRole } from './invites.ts';
import { cleanUpload, createFiles } from './files.ts';
import { firstUrl, unfurl } from './unfurl.ts';

const PORT = Number(process.env.PORT ?? 8787);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
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
  lists: Record<string, ListItem[]>;
  sections: Record<string, Section[]>;
  groups: UserGroup[];
  settings: Settings;
  termsAccepted: Record<string, number>;
  flags: Flag[];
  audit: AuditEntry[];
  legalHolds: string[];
  preserved: Message[];
  invites: Invite[];
  starred: Record<string, string[]>;
  meta: { name: string; color: string; createdAt: number; createdBy?: string };
}

const DEFAULT_SETTINGS: Settings = { retentionDays: 0, terms: '', termsVersion: 0, barriers: [] };
const MAX_AUDIT = 1000;

const WORKSPACE_COLORS = ['#f5a400', '#7c5cff', '#18b6a0', '#e0577d', '#3b9cff', '#5fb760', '#c06cf0', '#ff7a45'];

// A fresh workspace. New ones start invite-only; the original Relay HQ stays open.
function seed(name = 'Relay HQ', createdBy?: string, inviteOnly = false): DB {
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
    lists: {},
    sections: {},
    groups: [],
    settings: { ...DEFAULT_SETTINGS, inviteOnly },
    termsAccepted: {},
    flags: [],
    audit: [],
    legalHolds: [],
    preserved: [],
    invites: [],
    starred: {},
    meta: { name, color: WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)], createdAt: now, createdBy },
  };
  db.messages.push({
    id: randomUUID(),
    channelId: 'general',
    userId: BOT_ID,
    text: `Welcome to **${name}** — every premium feature is unlocked. Say \`!help\` to see what I can do.`,
    ts: now,
    reactions: {},
  });
  return db;
}

const files = createFiles();

// Admin client used only to verify access tokens. Null when auth is not configured,
// in which case the server runs in no-auth dev mode (token treated as the identity).
const authAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

function normalize(stored: Partial<DB> & Pick<DB, 'users' | 'channels' | 'messages'>): DB {
  // Databases written before newer features lack some fields; fill defaults.
  return {
    canvases: {},
    workflows: [],
    scheduled: [],
    saved: {},
    lists: {},
    sections: {},
    groups: [],
    termsAccepted: {},
    flags: [],
    audit: [],
    legalHolds: [],
    preserved: [],
    invites: [],
    starred: {},
    ...stored,
    meta: { name: 'Relay HQ', color: '#f5a400', createdAt: 0, ...stored.meta },
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
  };
}

function send(ws: WebSocket, ev: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev));
}


// Resolve an identity from the auth payload. With Supabase configured, verify the JWT.
// Without it (local dev), accept the token as a raw userId:name so the app still runs.
// Name-only sign-in lets anyone claim any user id, so a production server refuses it unless
// RELAY_ALLOW_DEV_AUTH=1 says the deployment is deliberately unauthenticated.
const devAuthAllowed = process.env.NODE_ENV !== 'production' || process.env.RELAY_ALLOW_DEV_AUTH === '1';
if (!authAdmin) {
  console.warn(devAuthAllowed
    ? 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: running with name-only dev sign-in. Anyone can sign in as anyone.'
    : 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in production: sign-in is disabled. Set them, or RELAY_ALLOW_DEV_AUTH=1.');
}

async function resolveIdentity(token: unknown): Promise<Identity | null> {
  if (typeof token !== 'string' || !token || token.length > 8192) return null;
  if (authAdmin) return verifyToken(token, authAdmin as unknown as AuthClient);
  if (!devAuthAllowed) return null;
  const [userId, name] = token.split(':');
  if (!userId || userId === BOT_ID) return null;
  return { userId: userId.slice(0, 64), name: (name || 'Member').trim().slice(0, 40) || 'Member', email: null };
}

// Everything below lives once per workspace: its data, its connected sockets and its timers.
function createRuntime(id: string, db: DB, save: (db: DB) => Promise<void>) {
  const timers: NodeJS.Timeout[] = [];
  const workspaceInfo = () => ({ id, name: db.meta.name, plan: 'Enterprise Grid · all premium unlocked', color: db.meta.color });

  // Moves files saved inline before Storage existed out of the state row, one message at a time.
  async function migrateInlineFiles(): Promise<void> {
    let moved = 0;
    for (const m of db.messages) {
      if (!m.files?.some((f) => f.dataUrl)) continue;
      m.files = await Promise.all(m.files.map((f) => files.offload(f)));
      moved += 1;
    }
    if (moved) {
      console.log(`moved files from ${moved} messages to storage`);
      persist();
    }
  }
  void migrateInlineFiles().catch((err) => console.error('file migration failed:', err instanceof Error ? err.message : err));

  let saveTimer: NodeJS.Timeout | undefined;
  let dirty = false;
  function persist(): void {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), 250);
  }
  // Writes any pending change now. Called by the debounce above and on shutdown, so a redeploy
  // doesn't drop the last quarter-second of messages.
  async function flush(): Promise<void> {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    await save(db).catch((err) => {
      dirty = true;
      console.error('persist failed:', err instanceof Error ? err.message : err);
    });
  }

  const clients = new Map<WebSocket, string>();
  // The tabs in each huddle (channel id -> socket -> peer id). Each tab is one peer in the
  // WebRTC mesh; the huddle's participants are the users behind those tabs.
  const calls = new Map<string, Map<WebSocket, string>>();

  function broadcast(ev: ServerEvent, filter?: (userId: string) => boolean): void {
    const payload = JSON.stringify(ev);
    for (const [ws, uid] of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (filter && !filter(uid)) continue;
      ws.send(payload);
    }
  }

  function canSee(ch: Channel, userId: string): boolean {
    if (db.users[userId]?.role === 'guest') return ch.members.includes(userId);
    return ch.kind === 'public' || ch.members.includes(userId);
  }

  function adminData(): AdminData {
    return {
      flags: db.flags,
      audit: db.audit.slice(-200),
      legalHolds: db.legalHolds,
      preservedCount: db.preserved.length,
      invites: db.invites,
    };
  }

  function broadcastAdmin(): void {
    broadcast({ t: 'admin', admin: adminData() }, (uid) => isAdmin(db.users[uid]));
  }

  function audit(actor: string, action: string, detail: string): void {
    db.audit.push({ ts: Date.now(), actor, action, detail });
    if (db.audit.length > MAX_AUDIT) db.audit = db.audit.slice(-MAX_AUDIT);
    broadcastAdmin();
  }

  function preserve(m: Message): void {
    if (!db.legalHolds.includes(m.userId)) return;
    db.preserved.push({ ...m, reactions: { ...m.reactions } });
    broadcastAdmin();
  }

  function resendInit(userId: string): void {
    for (const [ws, uid] of clients) if (uid === userId) send(ws, { t: 'init', snapshot: snapshotFor(userId) });
  }

  function broadcastChannel(ch: Channel, ev: ServerEvent): void {
    broadcast(ev, (uid) => canSee(ch, uid));
  }

  function onlineIds(): string[] {
    return [...new Set(clients.values())];
  }

  function huddleList(): HuddleState[] {
    return [...calls.entries()]
      .filter(([, call]) => call.size > 0)
      .map(([channelId, call]) => ({ channelId, participants: [...new Set([...call.keys()].map((ws) => clients.get(ws)!))] }));
  }

  function snapshotFor(userId: string): Snapshot {
    const visibleChannels = Object.fromEntries(
      Object.entries(db.channels).filter(([, ch]) => canSee(ch, userId)),
    );
    return {
      me: userId,
      workspace: workspaceInfo(),
      users: db.users,
      online: onlineIds(),
      channels: visibleChannels,
      messages: db.messages.filter((m) => visibleChannels[m.channelId]),
      canvases: Object.fromEntries(Object.entries(db.canvases).filter(([cid]) => visibleChannels[cid])),
      workflows: db.workflows,
      scheduled: db.scheduled.filter((s) => s.userId === userId),
      huddles: huddleList(),
      saved: db.saved[userId] ?? [],
      lists: Object.fromEntries(Object.entries(db.lists).filter(([cid]) => visibleChannels[cid])),
      sections: db.sections[userId] ?? [],
      starred: db.starred[userId] ?? [],
      groups: db.groups,
      settings: db.settings,
      termsAccepted: db.termsAccepted[userId] ?? 0,
      admin: isAdmin(db.users[userId]) ? adminData() : undefined,
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
      postMessage(message.channelId, BOT_ID, workflowReply(wf, message.text), { threadId: message.threadId ?? message.id });
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

  // Fetches a preview for the first link and pushes the updated message. Failures just mean no card.
  async function addPreview(m: Message): Promise<void> {
    const url = firstUrl(m.text);
    if (!url) return;
    const preview = await unfurl(url).catch(() => null);
    const ch = db.channels[m.channelId];
    if (!preview || !ch || !db.messages.includes(m)) return;
    m.preview = preview;
    broadcastChannel(ch, { t: 'message', message: m });
    persist();
  }

  // Returns true when the user was added (so callers can announce it).
  function ensureMember(ch: Channel, userId: string): boolean {
    if (ch.members.includes(userId)) return false;
    ch.members.push(userId);
    return true;
  }

  // A reply's thread must be a top-level message in the same channel; anything else posts top-level.
  function threadIn(channelId: string, threadId: unknown): string | undefined {
    if (typeof threadId !== 'string') return undefined;
    const parent = db.messages.find((m) => m.id === threadId);
    return parent && parent.channelId === channelId && !parent.threadId ? parent.id : undefined;
  }

  // Can this user put a message in this channel right now (visibility, posting policy, barriers)?
  function mayPost(ch: Channel, userId: string): boolean {
    if (!canSee(ch, userId) || !canPost(ch, db.users[userId])) return false;
    const other = ch.kind === 'dm' ? ch.members.find((u) => u !== userId) : undefined;
    return !(other && barred(userId, other, db.groups, db.settings.barriers));
  }

  // Workflows arrive from the client as-is. Keep only well-formed ones, and only let a publisher
  // point a workflow at a channel they could post in themselves (or leave an existing one as it was),
  // so the bot can't be used to write into private or admins-only channels.
  function cleanWorkflow(raw: unknown, userId: string): Workflow | null {
    if (!raw || typeof raw !== 'object') return null;
    const w = raw as Partial<Workflow>;
    const t = w.trigger as Partial<Record<string, unknown>> | undefined;
    if (!t || typeof t.channelId !== 'string') return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    let trigger: Workflow['trigger'];
    if (t.type === 'keyword') {
      const keyword = str(t.keyword, 100).trim();
      if (!keyword) return null;
      trigger = { type: 'keyword', keyword, channelId: t.channelId };
    } else if (t.type === 'join') {
      trigger = { type: 'join', channelId: t.channelId };
    } else if (t.type === 'schedule') {
      trigger = { type: 'schedule', channelId: t.channelId, time: str(t.time, 5), weekdaysOnly: !!t.weekdaysOnly };
    } else return null;
    const id = str(w.id, 64) || randomUUID();
    const prev = db.workflows.find((p) => p.id === id);
    const target = db.channels[trigger.channelId];
    const allowed =
      (trigger.type === 'keyword' && trigger.channelId === 'any') ||
      prev?.trigger.channelId === trigger.channelId ||
      (!!target && mayPost(target, userId));
    if (!allowed) return null;
    const reply = str(w.reply, 4000);
    const branch = w.branch && typeof w.branch.contains === 'string' && w.branch.contains.trim()
      ? { contains: w.branch.contains.slice(0, 100), reply: str(w.branch.reply, 4000) }
      : undefined;
    return { id, name: str(w.name, 80) || 'Workflow', enabled: !!w.enabled, trigger, reply, branch };
  }

  function dmId(a: string, b: string): string {
    return `dm-${[a, b].sort().join('-')}`;
  }

    // Admit (or refuse) one signed-in connection into this workspace.
    function join(ws: WebSocket, identity: Identity, invite?: string): 'ok' | 'invite-required' {
      const { userId, name, email, avatarUrl } = identity;
      let user = db.users[userId];
      const isMember = !!user;
      const hasOwner = Object.values(db.users).some((u) => u.role === 'owner');
      const reservedForOther = !!db.meta.createdBy && db.meta.createdBy !== userId;
      const role = decideRole({ hasOwner, isMember, validInvite: validateInvite(invite, db.invites), inviteOnly: db.settings.inviteOnly, reservedForOther });

      if (role === 'reject') return 'invite-required';

      if (!user) {
        user = {
          id: userId,
          name,
          color: COLORS[Object.keys(db.users).length % COLORS.length],
          title: '',
          status: { emoji: '', text: '' },
          role: role === 'owner' ? 'owner' : 'member',
          email: email ?? undefined,
          avatarUrl,
        };
        db.users[userId] = user;
        for (const id of ['general', 'random']) ensureMember(db.channels[id], userId);
      } else {
        // Keep profile details fresh from the identity provider.
        if (authAdmin) user.name = name;
        user.avatarUrl = avatarUrl ?? user.avatarUrl;
        user.email = email ?? user.email;
        if (role === 'owner') user.role = 'owner';
        user.role ??= 'member';
      }

      clients.set(ws, userId);
      send(ws, { t: 'init', snapshot: snapshotFor(userId) });
      broadcast({ t: 'user', user });
      broadcast({ t: 'presence', online: onlineIds() });
      if (!isMember) runJoinWorkflows('general');
      persist();
      return 'ok';
    }

  async function handle(ws: WebSocket, ev: ClientEvent): Promise<void> {
    const userId = clients.get(ws);
    if (!userId) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }

    switch (ev.t) {
      case 'send': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId) || typeof ev.text !== 'string') return;
        if (!canPost(ch, db.users[userId])) {
          send(ws, { t: 'error', message: `Only admins can post in #${ch.name}` });
          return;
        }
        const other = ch.kind === 'dm' ? ch.members.find((u) => u !== userId) : undefined;
        if (other && barred(userId, other, db.groups, db.settings.barriers)) {
          send(ws, { t: 'error', message: 'An information barrier blocks messages between you two.' });
          return;
        }
        // Posting in a public channel joins it; tell everyone so member lists stay right.
        if (ensureMember(ch, userId)) broadcastChannel(ch, { t: 'channel', channel: ch });
        const threadId = threadIn(ch.id, ev.threadId);
        const slash = parseSlash(ev.text);
        if (slash) {
          if (slash.kind === 'remind') {
            if (db.scheduled.filter((s) => s.userId === userId).length >= 100) {
              send(ws, { t: 'error', message: 'You can have up to 100 reminders and scheduled messages.' });
              return;
            }
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
            ch.topic = slash.text.slice(0, 250);
            broadcastChannel(ch, { t: 'channel', channel: ch });
            postMessage(ch.id, BOT_ID, `<@${userId}> set the topic to: ${ch.topic}`, { system: true });
          } else if (slash.kind === 'huddle') {
            joinHuddle(ws, ch.id);
          } else if (slash.kind === 'summarize') {
            postMessage(ch.id, BOT_ID, summarize(ch.id, threadId), { threadId: threadId });
          } else if (slash.kind === 'recap') {
            const dm = openDM(userId, BOT_ID);
            const visible = db.messages.filter((m) => db.channels[m.channelId] && canSee(db.channels[m.channelId], userId));
            postMessage(dm.id, BOT_ID, dailyRecap(visible, db.channels, db.users, Date.now() - 86_400_000, BOT_ID));
          } else if (slash.kind === 'explain') {
            const visible = db.messages.filter((m) => db.channels[m.channelId] && canSee(db.channels[m.channelId], userId));
            postMessage(ch.id, BOT_ID, explainTerm(slash.term, visible, db.users), { system: true, threadId: threadId });
          } else if (slash.kind === 'usage') {
            postMessage(ev.channelId, BOT_ID, slash.text, { system: true, threadId: threadId });
          } else {
            postMessage(ev.channelId, userId, slash.text, { threadId: threadId });
          }
          return;
        }
        const uploads = Array.isArray(ev.files) ? ev.files.slice(0, 5).map(cleanUpload).filter((f) => f !== null) : [];
        if (!ev.text.trim() && !uploads.length) return;
        const stored = uploads.length ? await Promise.all(uploads.map((f) => files.offload(f))) : undefined;
        const posted = postMessage(ev.channelId, userId, ev.text, { threadId: threadId, files: stored });
        if (posted) void addPreview(posted);
        return;
      }
      case 'edit': {
        const m = db.messages.find((x) => x.id === ev.id);
        if (!m || m.userId !== userId || typeof ev.text !== 'string' || !db.channels[m.channelId] || !canSee(db.channels[m.channelId], userId)) return;
        preserve(m);
        m.text = ev.text.slice(0, MAX_TEXT);
        m.edited = true;
        if (m.preview && firstUrl(m.text) !== m.preview.url) delete m.preview;
        const ch = db.channels[m.channelId];
        if (ch) broadcastChannel(ch, { t: 'message', message: m });
        persist();
        if (!m.preview) void addPreview(m);
        return;
      }
      case 'delete': {
        const idx = db.messages.findIndex((x) => x.id === ev.id);
        const m = db.messages[idx];
        if (!m || (m.userId !== userId && !isAdmin(db.users[userId]))) return;
        for (const x of db.messages) if (x.id === ev.id || x.threadId === ev.id) preserve(x);
        db.messages = db.messages.filter((x) => x.id !== ev.id && x.threadId !== ev.id);
        if (m.userId !== userId) audit(userId, 'message.delete', `Removed a message by ${db.users[m.userId]?.name ?? m.userId}`);
        const ch = db.channels[m.channelId];
        if (ch) broadcastChannel(ch, { t: 'messageDeleted', id: m.id });
        persist();
        return;
      }
      case 'react': {
        const m = db.messages.find((x) => x.id === ev.id);
        if (!m || !db.channels[m.channelId] || !canSee(db.channels[m.channelId], userId)) return;
        if (typeof ev.emoji !== 'string' || !ev.emoji || ev.emoji.length > 16) return;
        if (!m.reactions[ev.emoji] && Object.keys(m.reactions).length >= 50) return;
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
        if (!m || !db.channels[m.channelId] || !canSee(db.channels[m.channelId], userId)) return;
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
        audit(userId, 'channel.create', `${ch.kind} #${ch.name}`);
        persist();
        return;
      }
      case 'join': {
        const ch = db.channels[ev.channelId];
        if (!ch || ch.kind !== 'public' || !canSee(ch, userId)) return;
        if (!ensureMember(ch, userId)) return;
        broadcastChannel(ch, { t: 'channel', channel: ch });
        postMessage(ch.id, BOT_ID, `<@${userId}> joined the channel.`, { system: true });
        runJoinWorkflows(ch.id);
        persist();
        return;
      }
      case 'leave': {
        const ch = db.channels[ev.channelId];
        if (!ch || ch.kind === 'dm' || !ch.members.includes(userId)) return;
        ch.members = ch.members.filter((u) => u !== userId);
        broadcastChannel(ch, { t: 'channel', channel: ch });
        // Someone leaving a private channel can no longer see it, so the broadcast above skips
        // them; resend their snapshot so it drops out of their sidebar.
        if (!canSee(ch, userId)) {
          leaveHuddle(userId, ch.id);
          resendInit(userId);
        }
        persist();
        return;
      }
      case 'openDM': {
        if (!db.users[ev.userId]) return;
        if (barred(userId, ev.userId, db.groups, db.settings.barriers)) {
          send(ws, { t: 'error', message: 'An information barrier blocks DMs with this person.' });
          return;
        }
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
        if (db.users[userId]?.role === 'guest' || !Array.isArray(ev.list)) return;
        db.workflows = ev.list.slice(0, 50).map((w) => cleanWorkflow(w, userId)).filter((w) => w !== null);
        broadcast({ t: 'workflows', list: db.workflows });
        audit(userId, 'workflows.publish', `${db.workflows.length} workflows`);
        persist();
        return;
      }
      case 'schedule': {
        const ch = db.channels[ev.channelId];
        if (!ch || typeof ev.text !== 'string' || !ev.text.trim() || typeof ev.at !== 'number' || ev.at < Date.now()) return;
        if (!mayPost(ch, userId)) {
          send(ws, { t: 'error', message: `You can't post in ${ch.kind === 'dm' ? 'this conversation' : `#${ch.name}`}.` });
          return;
        }
        if (db.scheduled.filter((s) => s.userId === userId).length >= 100) {
          send(ws, { t: 'error', message: 'You can have up to 100 scheduled messages.' });
          return;
        }
        db.scheduled.push({ id: randomUUID(), channelId: ch.id, userId, text: ev.text.slice(0, MAX_TEXT), at: ev.at });
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
        const other = ch.kind === 'dm' ? ch.members.find((u) => u !== userId) : undefined;
        if (ev.action === 'join' && other && barred(userId, other, db.groups, db.settings.barriers)) {
          send(ws, { t: 'error', message: 'An information barrier blocks huddles between you two.' });
          return;
        }
        if (ev.action === 'join') joinHuddle(ws, ch.id);
        else leaveHuddle(userId, ch.id);
        return;
      }
      case 'rtc': {
        if (!ev.signal || !['description', 'candidate', 'state'].includes(ev.signal.kind)) return;
        // Signals only travel between two tabs in the same huddle of this workspace.
        for (const call of calls.values()) {
          const from = call.get(ws);
          if (!from) continue;
          for (const [peer, id] of call) if (id === ev.to && peer !== ws) send(peer, { t: 'rtc', from, signal: ev.signal });
          return;
        }
        return;
      }
      case 'list': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId) || !Array.isArray(ev.items)) return;
        db.lists[ch.id] = ev.items.slice(0, 500).map((it) => ({
          id: String(it.id || randomUUID()).slice(0, 64),
          title: String(it.title).slice(0, 200),
          done: it.status === 'done',
          assignee: db.users[it.assignee] ? it.assignee : '',
          due: String(it.due).slice(0, 10),
          status: it.status === 'doing' || it.status === 'done' ? it.status : 'todo',
        }));
        broadcastChannel(ch, { t: 'lists', channelId: ch.id, items: db.lists[ch.id] });
        persist();
        return;
      }
      case 'sections': {
        if (!Array.isArray(ev.sections)) return;
        db.sections[userId] = ev.sections.slice(0, 30).map((sec) => ({
          id: String(sec.id || randomUUID()).slice(0, 64),
          name: String(sec.name).slice(0, 40) || 'Section',
          channelIds: (Array.isArray(sec.channelIds) ? sec.channelIds : []).filter((cid) => db.channels[cid] && canSee(db.channels[cid], userId)).slice(0, 500),
        }));
        send(ws, { t: 'sections', sections: db.sections[userId] });
        persist();
        return;
      }
      case 'groups': {
        if (!isAdmin(db.users[userId]) || !Array.isArray(ev.groups)) return;
        db.groups = ev.groups.slice(0, 100).map((g) => ({
          id: String(g.id || randomUUID()).slice(0, 64),
          handle: String(g.handle ?? '').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 30) || 'group',
          name: String(g.name).slice(0, 60),
          members: (Array.isArray(g.members) ? g.members : []).filter((u) => db.users[u]),
        }));
        broadcast({ t: 'groups', groups: db.groups });
        audit(userId, 'groups.update', `${db.groups.length} user groups`);
        persist();
        return;
      }
      case 'flag': {
        const m = db.messages.find((x) => x.id === ev.id);
        if (!m || !db.channels[m.channelId] || !canSee(db.channels[m.channelId], userId) || typeof ev.reason !== 'string') return;
        if (db.flags.length >= 1000 || db.flags.some((f) => f.messageId === m.id && f.by === userId)) return;
        db.flags.push({
          id: randomUUID(),
          messageId: m.id,
          channelId: m.channelId,
          by: userId,
          reason: ev.reason.slice(0, 200),
          ts: Date.now(),
          excerpt: m.text.slice(0, 200),
        });
        audit(userId, 'message.flag', ev.reason.slice(0, 80));
        persist();
        return;
      }
      case 'resolveFlag': {
        if (!isAdmin(db.users[userId])) return;
        const flag = db.flags.find((f) => f.id === ev.id);
        if (!flag) return;
        db.flags = db.flags.filter((f) => f.id !== ev.id);
        if (ev.removeMessage) {
          const m = db.messages.find((x) => x.id === flag.messageId);
          if (m) {
            preserve(m);
            db.messages = db.messages.filter((x) => x.id !== m.id && x.threadId !== m.id);
            const ch = db.channels[m.channelId];
            if (ch) broadcastChannel(ch, { t: 'messageDeleted', id: m.id });
          }
        }
        audit(userId, 'flag.resolve', ev.removeMessage ? 'Removed flagged message' : 'Dismissed flag');
        persist();
        return;
      }
      case 'role': {
        const actor = db.users[userId];
        const target = db.users[ev.userId];
        if (!isAdmin(actor) || !target || target.bot || !['owner', 'admin', 'member', 'guest'].includes(ev.role)) return;
        // Only owners can grant or revoke admin rights, and nobody can demote the last owner.
        if ((ev.role === 'owner' || target.role === 'owner' || target.role === 'admin' || ev.role === 'admin') && actor?.role !== 'owner') {
          send(ws, { t: 'error', message: 'Only an owner can change admin or owner roles.' });
          return;
        }
        const owners = Object.values(db.users).filter((u) => u.role === 'owner');
        if (target.role === 'owner' && ev.role !== 'owner' && owners.length === 1) {
          send(ws, { t: 'error', message: 'The workspace needs at least one owner.' });
          return;
        }
        target.role = ev.role;
        broadcast({ t: 'user', user: target });
        audit(userId, 'user.role', `${target.name} → ${ev.role}`);
        resendInit(target.id);
        persist();
        return;
      }
      case 'channelPolicy': {
        const ch = db.channels[ev.channelId];
        if (!ch || ch.kind === 'dm' || !isAdmin(db.users[userId])) return;
        ch.postingPolicy = ev.postingPolicy === 'admins' ? 'admins' : 'everyone';
        broadcastChannel(ch, { t: 'channel', channel: ch });
        audit(userId, 'channel.policy', `#${ch.name}: ${ch.postingPolicy} can post`);
        persist();
        return;
      }
      case 'addMember': {
        const ch = db.channels[ev.channelId];
        if (!ch || ch.kind === 'dm' || !db.users[ev.userId] || !ch.members.includes(userId)) return;
        if (db.users[ev.userId].role === 'guest' && !isAdmin(db.users[userId])) {
          send(ws, { t: 'error', message: 'Only admins can add guests to channels.' });
          return;
        }
        ensureMember(ch, ev.userId);
        broadcastChannel(ch, { t: 'channel', channel: ch });
        resendInit(ev.userId);
        postMessage(ch.id, BOT_ID, `<@${userId}> added <@${ev.userId}>.`, { system: true });
        audit(userId, 'channel.addMember', `${db.users[ev.userId].name} → #${ch.name}`);
        return;
      }
      case 'settings': {
        if (!isAdmin(db.users[userId])) return;
        // Partial updates: the invite switch and the policies form each send only their own fields.
        const next = { ...db.settings, ...ev.settings };
        const terms = (next.terms ?? '').slice(0, 20_000);
        db.settings = {
          inviteOnly: !!next.inviteOnly,
          retentionDays: Math.max(0, Math.min(3650, Math.floor(next.retentionDays) || 0)),
          terms,
          termsVersion: terms !== db.settings.terms ? db.settings.termsVersion + 1 : db.settings.termsVersion,
          barriers: (Array.isArray(next.barriers) ? next.barriers : []).filter((p) => Array.isArray(p) && p.length === 2).slice(0, 200).filter(([a, b]) => a !== b && db.groups.some((g) => g.id === a) && db.groups.some((g) => g.id === b)),
        };
        broadcast({ t: 'settings', settings: db.settings });
        audit(userId, 'settings.update', `${db.settings.inviteOnly ? 'invite-only' : 'open sign-up'}, retention ${db.settings.retentionDays || '∞'}d, ${db.settings.barriers.length} barriers, terms v${db.settings.termsVersion}`);
        applyRetention();
        persist();
        return;
      }
      case 'legalHold': {
        if (!isAdmin(db.users[userId]) || !db.users[ev.userId]) return;
        db.legalHolds = ev.on ? [...new Set([...db.legalHolds, ev.userId])] : db.legalHolds.filter((u) => u !== ev.userId);
        audit(userId, ev.on ? 'legalHold.place' : 'legalHold.release', db.users[ev.userId].name);
        persist();
        return;
      }
      case 'inviteCreate': {
        if (!isAdmin(db.users[userId])) return;
        const inv = { code: generateCode(), createdBy: userId, createdAt: Date.now(), revoked: false };
        db.invites.push(inv);
        audit(userId, 'invite.create', inv.code);
        persist();
        return;
      }
      case 'inviteRevoke': {
        if (!isAdmin(db.users[userId])) return;
        const inv = db.invites.find((i) => i.code === ev.code);
        if (!inv) return;
        inv.revoked = true;
        audit(userId, 'invite.revoke', ev.code);
        persist();
        return;
      }
      case 'renameWorkspace': {
        if (!isAdmin(db.users[userId])) return;
        const name = ev.name.trim().slice(0, 40);
        if (!name) return;
        db.meta.name = name;
        broadcast({ t: 'workspace', workspace: workspaceInfo() });
        audit(userId, 'workspace.rename', name);
        persist();
        return;
      }
      case 'star': {
        if (!db.channels[ev.channelId]) return;
        const mine = db.starred[userId] ?? [];
        db.starred[userId] = mine.includes(ev.channelId) ? mine.filter((c) => c !== ev.channelId) : [...mine, ev.channelId];
        for (const [cws, uid] of clients) if (uid === userId) send(cws, { t: 'starred', list: db.starred[userId] });
        persist();
        return;
      }
      case 'acceptTerms': {
        db.termsAccepted[userId] = db.settings.termsVersion;
        send(ws, { t: 'termsAccepted', version: db.settings.termsVersion });
        persist();
        return;
      }
      case 'fileSummary': {
        const m = db.messages.find((x) => x.id === ev.id);
        const file = m?.files?.[ev.index];
        if (!m || !file || !db.channels[m.channelId] || !canSee(db.channels[m.channelId], userId)) return;
        const isText = /^text\/|json|xml|csv|markdown|javascript/.test(file.type) || /\.(md|txt|csv|json|log|ts|js|py)$/i.test(file.name);
        if (!isText) {
          send(ws, { t: 'error', message: `Can't summarize ${file.name}: only text files are supported.` });
          return;
        }
        const text = (await files.read(file)).subarray(0, 1_000_000).toString('utf8');
        postMessage(m.channelId, BOT_ID, `**Summary of ${file.name}**\n${summarizeText(text)}`, { threadId: m.threadId ?? m.id });
        return;
      }
      case 'analytics': {
        if (!isAdmin(db.users[userId])) return;
        send(ws, { t: 'analytics', data: computeAnalytics(db.messages, db.channels, db.users, Date.now()) });
        return;
      }
      case 'export': {
        if (!isAdmin(db.users[userId])) return;
        audit(userId, 'data.export', 'Full workspace export');
        const { users, channels, messages, canvases, lists, groups, preserved } = db;
        send(ws, { t: 'export', data: { exportedAt: new Date().toISOString(), users, channels, messages, canvases, lists, groups, preserved } });
        return;
      }
    }
  }

  function applyRetention(): void {
    const { kept, removed } = pruneRetention(db.messages, db.settings.retentionDays, db.legalHolds, Date.now());
    if (removed === 0) return;
    const keptIds = new Set(kept.map((m) => m.id));
    const gone = db.messages.filter((m) => !keptIds.has(m.id));
    db.messages = kept;
    for (const m of gone) {
      const ch = db.channels[m.channelId];
      if (ch) broadcastChannel(ch, { t: 'messageDeleted', id: m.id });
    }
    audit('system', 'retention.prune', `Deleted ${removed} messages older than ${db.settings.retentionDays} days`);
    persist();
  }

  const huddleSessions = new Map<string, { startedAt: number; everyone: Set<string> }>();

  // Tells every tab in a huddle who its peers are, so each can connect to the others.
  function syncCall(channelId: string): void {
    const call = calls.get(channelId);
    if (!call) return;
    for (const [ws, self] of call) {
      const peers = [...call].filter(([other]) => other !== ws).map(([other, id]) => ({ id, userId: clients.get(other)! }));
      send(ws, { t: 'huddleCall', channelId, self, peers });
    }
  }

  // Takes one tab out of whatever huddle it is in. Returns that huddle's channel id.
  function dropFromCall(ws: WebSocket): string | undefined {
    for (const [channelId, call] of calls) {
      if (!call.delete(ws)) continue;
      if (ws.readyState === WebSocket.OPEN) send(ws, { t: 'huddleCall', channelId: null, self: '', peers: [] });
      if (call.size === 0) {
        calls.delete(channelId);
        endHuddle(channelId);
      }
      return channelId;
    }
    return undefined;
  }

  // A tab is in one huddle at a time, and a user is in a huddle from one tab: joining from
  // another tab moves them there, so nobody ends up connected to (and hearing) themselves.
  function joinHuddle(ws: WebSocket, channelId: string): void {
    const userId = clients.get(ws)!;
    const current = calls.get(channelId);
    if (current?.has(ws)) {
      syncCall(channelId);
      return;
    }
    const ownTabs = [...(current?.keys() ?? [])].filter((other) => clients.get(other) === userId);
    if (current && current.size - ownTabs.length >= MAX_HUDDLE) {
      send(ws, { t: 'error', message: `This huddle is full. Up to ${MAX_HUDDLE} people can join one.` });
      return;
    }
    // Moving tabs keeps the huddle going, so this skips dropFromCall's end-of-huddle handling.
    for (const other of ownTabs) {
      current!.delete(other);
      send(other, { t: 'huddleCall', channelId: null, self: '', peers: [] });
    }
    const left = dropFromCall(ws);
    const call = calls.get(channelId) ?? new Map<WebSocket, string>();
    call.set(ws, randomUUID());
    calls.set(channelId, call);
    const session = huddleSessions.get(channelId) ?? { startedAt: Date.now(), everyone: new Set<string>() };
    session.everyone.add(userId);
    huddleSessions.set(channelId, session);
    if (left) syncCall(left);
    syncCall(channelId);
    broadcast({ t: 'huddles', huddles: huddleList() });
  }

  // Leaving from any tab takes all of that user's tabs out of the huddle.
  function leaveHuddle(userId: string, channelId: string): void {
    const call = calls.get(channelId);
    if (!call) return;
    for (const ws of [...call.keys()]) if (clients.get(ws) === userId) dropFromCall(ws);
    syncCall(channelId);
    broadcast({ t: 'huddles', huddles: huddleList() });
  }

  function endHuddle(channelId: string): void {
    const session = huddleSessions.get(channelId);
    huddleSessions.delete(channelId);
    if (!session || !db.channels[channelId]) return;
    const now = Date.now();
    if (now - session.startedAt < 30_000) return;
    postMessage(channelId, BOT_ID, huddleNote(channelId, session.startedAt, now, [...session.everyone], db.messages, db.users), { system: true });
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

  timers.push(setInterval(() => {
    const due = db.scheduled.filter((s) => s.at <= Date.now());
    if (due.length === 0) return;
    db.scheduled = db.scheduled.filter((s) => s.at > Date.now());
    for (const s of due) {
      const asBot = s.channelId === dmId(s.userId, BOT_ID);
      const ch = db.channels[s.channelId];
      // Rights can change between scheduling and sending (removed from a channel, made read-only).
      if (!asBot && (!ch || !db.users[s.userId] || !mayPost(ch, s.userId))) {
        sendScheduled(s.userId);
        continue;
      }
      postMessage(s.channelId, asBot ? BOT_ID : s.userId, s.text);
      sendScheduled(s.userId);
    }
    persist();
  }, 1000));

  // Scheduled workflows: post the reply once per day when the clock reaches the trigger time.
  const scheduleFired = new Map<string, string>();
  timers.push(setInterval(() => {
    const now = new Date();
    for (const wf of db.workflows) {
      if (!wf.enabled || wf.trigger.type !== 'schedule') continue;
      const key = scheduleDue(wf.trigger, now);
      if (!key || scheduleFired.get(wf.id) === key) continue;
      scheduleFired.set(wf.id, key);
      postMessage(wf.trigger.channelId, BOT_ID, wf.reply);
    }
  }, 20_000));

  timers.push(setInterval(applyRetention, 60 * 60_000));

  function leave(ws: WebSocket): void {
    if (!clients.has(ws)) return;
    // Drop the tab from its huddle while its user id is still known, then forget the socket.
    const left = dropFromCall(ws);
    clients.delete(ws);
    if (left) {
      syncCall(left);
      broadcast({ t: 'huddles', huddles: huddleList() });
    }
    broadcast({ t: 'presence', online: onlineIds() });
  }

  function summary(): WorkspaceSummary {
    return { id, name: db.meta.name, color: db.meta.color, members: Object.values(db.users).filter((u) => !u.bot).length, inviteOnly: !!db.settings.inviteOnly };
  }

  function stop(): void {
    for (const t of timers) clearInterval(t);
  }

  return { id, db, join, handle, leave, summary, flush, stop, hasInvite: (code?: string) => validateInvite(code, db.invites) };
}

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
    res.end(JSON.stringify({ ok: true, workspaces: runtimes.size }));
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
  res.writeHead(200, {
    'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  fs.createReadStream(file).pipe(res);
});

// ---- Workspaces: a directory of ids, one runtime per workspace, and sockets routed between them.
type Runtime = ReturnType<typeof createRuntime>;
const HQ = 'hq';
const MAX_OWNED_WORKSPACES = 20;
const runtimes = new Map<string, Runtime>();

interface Directory { workspaces: { id: string; createdAt: number; createdBy?: string }[] }
// The original workspace keeps its old storage (db.json / the 'singleton' row) so no data moves.
const fileFor = (id: string) => (id === HQ ? dataFile : path.join(dataDir, `ws-${id}.json`));
const rowFor = (id: string) => (id === HQ ? undefined : `ws-${id}`);
const dirStore = createStore<Directory>(() => ({ workspaces: [{ id: HQ, createdAt: Date.now() }] }), path.join(dataDir, 'directory.json'), 'directory');
const directory = await dirStore.load();

async function loadRuntime(id: string, fresh?: () => DB): Promise<Runtime> {
  const st = createStore<DB>(fresh ?? (() => seed()), fileFor(id), rowFor(id));
  const db = normalize((await st.load()) as Partial<DB> & Pick<DB, 'users' | 'channels' | 'messages'>);
  // A brand-new workspace is written straight away so a restart can't reseed it as a default one.
  if (fresh) await st.save(db);
  const rt = createRuntime(id, db, (d) => st.save(d));
  runtimes.set(id, rt);
  return rt;
}
for (const w of directory.workspaces) await loadRuntime(w.id);

interface Conn { identity?: Identity; rt?: Runtime }
const conns = new Map<WebSocket, Conn>();

function workspacesFor(userId: string): { mine: WorkspaceSummary[]; discover: WorkspaceSummary[] } {
  const mine: WorkspaceSummary[] = [];
  const discover: WorkspaceSummary[] = [];
  for (const rt of runtimes.values()) {
    if (rt.db.users[userId]) mine.push(rt.summary());
    else if (!rt.db.settings.inviteOnly) discover.push(rt.summary());
  }
  return { mine, discover };
}

// Which workspace a fresh connection lands in: the one an invite code belongs to, the one
// asked for, the user's first workspace, or else the open Relay HQ.
function pickWorkspace(userId: string, wanted?: string, invite?: string): Runtime | undefined {
  if (invite) for (const rt of runtimes.values()) if (rt.hasInvite(invite)) return rt;
  if (wanted && runtimes.has(wanted)) return runtimes.get(wanted);
  for (const rt of runtimes.values()) if (rt.db.users[userId]) return rt;
  const hq = runtimes.get(HQ);
  return hq && !hq.db.settings.inviteOnly ? hq : undefined;
}

async function route(ws: WebSocket, ev: ClientEvent): Promise<void> {
  const conn = conns.get(ws) ?? {};
  conns.set(ws, conn);

  if (ev.t === 'auth') {
    const identity = await resolveIdentity(ev.token);
    if (!identity) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }
    conn.identity = identity;
    conn.rt?.leave(ws);
    conn.rt = undefined;
    const rt = pickWorkspace(identity.userId, ev.workspace, ev.invite);
    if (!rt) {
      send(ws, { t: 'workspaces', ...workspacesFor(identity.userId) });
      send(ws, { t: 'error', message: 'You aren’t in a workspace yet. Create one or join with an invite.', code: 'no-workspace' });
      return;
    }
    const result = rt.join(ws, identity, ev.invite);
    send(ws, { t: 'workspaces', ...workspacesFor(identity.userId) });
    if (result === 'invite-required') {
      send(ws, { t: 'error', message: `You need an invite to join ${rt.db.meta.name}.`, code: 'invite-required' });
      return;
    }
    conn.rt = rt;
    return;
  }

  if (ev.t === 'createWorkspace') {
    if (!conn.identity) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }
    const name = ev.name.trim().slice(0, 40);
    if (!name) return;
    const owned = directory.workspaces.filter((w) => w.createdBy === conn.identity!.userId).length;
    if (owned >= MAX_OWNED_WORKSPACES) {
      send(ws, { t: 'error', message: `You can create up to ${MAX_OWNED_WORKSPACES} workspaces.` });
      return;
    }
    const id = randomUUID().slice(0, 8);
    const createdBy = conn.identity.userId;
    directory.workspaces.push({ id, createdAt: Date.now(), createdBy });
    await dirStore.save(directory);
    await loadRuntime(id, () => seed(name, createdBy, true));
    send(ws, { t: 'workspaceCreated', id });
    return;
  }

  if (!conn.rt) {
    send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
    return;
  }
  await conn.rt.handle(ws, ev);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 12 * 1024 * 1024 });
// Per-socket token bucket: bursts of typing, signaling and reactions pass, floods are dropped.
const RATE_BURST = 200;
const RATE_PER_SEC = 50;
// Heartbeat: a socket whose peer vanished (sleeping laptop, dropped mobile network) never sends a
// close, so it would stay "online" and in huddles forever. Ping every 30s; drop what didn't answer.
const alive = new WeakSet<WebSocket>();
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 30_000);

wss.on('connection', (ws) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  ws.on('error', (err) => console.warn('socket error:', err.message));
  let tokens = RATE_BURST;
  let refilled = Date.now();
  ws.on('message', (raw) => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - refilled) / 1000) * RATE_PER_SEC);
    refilled = now;
    if (tokens < 1) return;
    tokens -= 1;
    let ev: ClientEvent;
    try {
      ev = JSON.parse(raw.toString()) as ClientEvent;
    } catch (err) {
      send(ws, { t: 'error', message: `Bad JSON: ${(err as Error).message}` });
      return;
    }
    if (!ev || typeof ev !== 'object' || typeof ev.t !== 'string') return;
    route(ws, ev).catch((err) => {
      console.error('handler failed:', err);
      send(ws, { t: 'error', message: 'Server error' });
    });
  });
  ws.on('close', () => {
    conns.get(ws)?.rt?.leave(ws);
    conns.delete(ws);
  });
});

server.listen(PORT, () => console.log(`Relay server on http://localhost:${PORT}`));

// Hosts send SIGTERM before a redeploy or restart: stop taking connections, save every workspace, exit.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: saving and shutting down`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1012, 'Server restarting');
  server.close();
  for (const rt of runtimes.values()) rt.stop();
  await Promise.all([...runtimes.values()].map((rt) => rt.flush()));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));
