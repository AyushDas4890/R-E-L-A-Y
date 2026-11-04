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
  HomeItem,
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
  UserPrefs,
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
import { createMessageSync } from './messageSync.ts';
import { addItem, cleanHome, removeItem, updateItem } from './home.ts';
import { createClient } from '@supabase/supabase-js';
import { verifyToken, type AuthClient, type Identity } from './auth.ts';
import { generateCode, validateInvite, decideRole } from './invites.ts';
import { cleanUpload, createFiles } from './files.ts';
import { firstUrl, unfurl } from './unfurl.ts';
import { isCursor, olderMessages, recentMessages } from './history.ts';
import { createMailer, type EmailProvider } from './mailer.ts';
import { digest, digestLine, enqueue, mayEmail, recipients, takeDue, type Outbox } from './notifications.ts';
import { applyListPatch, mergeWorkflows, removeVerdict, userView } from './access.ts';
import { cleanPrefs, mergeImport, visiblePrefs, withDnd, withEmail, withLevel, withRead } from './prefs.ts';
import { createPageRuntime } from './pageRuntime.ts';
import { NOT_FOUND_HTML, PUBLISH_HEADERS, renderPublished } from './publish.ts';
import { createPageStore, type PagesIndex, type PageStore } from './pageStore.ts';

const PORT = Number(process.env.PORT ?? 8787);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const dataFile = path.join(dataDir, 'db.json');
const distDir = path.join(root, 'dist');

const BOT_ID = 'relaybot';
// Stands in for the author of messages whose account was deleted.
const DELETED_ID = 'deleted-user';
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
  prefs: Record<string, UserPrefs>;
  removed: string[];
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
        status: { emoji: '', text: 'Always on' },
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
        reply: 'Welcome aboard. Try `/remind me stretch in 10m`, open a canvas, or press ⌘K to search.',
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
    prefs: {},
    removed: [],
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
// Email is off unless RELAY_EMAIL_PROVIDER names a provider. RELAY_APP_URL is the UI's public address, for links.
const mail = createMailer();
const appUrl = process.env.RELAY_APP_URL?.trim().replace(/\/+$/, '') || undefined;

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
    prefs: {},
    removed: [],
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
// What the runtime needs from outside it: email, and whether a person is connected to any workspace.
interface Outside {
  mail: EmailProvider | null;
  isOnline: (userId: string) => boolean;
  appUrl?: string;
  // Pages live beside the workspace document, not inside it (see server/pageStore.ts).
  pageStore: PageStore;
  pageIndex: PagesIndex;
}

function createRuntime(id: string, db: DB, save: (db: DB) => Promise<void>, onEvict: (ws: WebSocket) => void, outside: Outside) {
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
    await pages.flush();
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

  const pages = createPageRuntime({
    store: outside.pageStore,
    index: outside.pageIndex,
    clients: () => clients,
    workspaceId: id,
    workspaceName: () => db.meta.name,
    offload: (f) => files.offload(f),
    unfurl: (u) => unfurl(u),
    barred: (a, b) => barred(a, b, db.groups, db.settings.barriers),
    groupMembers: (gid) => db.groups.find((g) => g.id === gid)?.members ?? [],
    who: (userId) => {
      const u = db.users[userId];
      return u ? { id: u.id, role: u.role, inactive: u.inactive, bot: u.bot, groups: db.groups.filter((g) => g.members.includes(userId)).map((g) => g.id) } : undefined;
    },
    people: () => Object.fromEntries(Object.values(db.users).filter((u) => !u.inactive && !u.bot).map((u) => [u.id, u.name])),
    send,
    audit: (actor, action, detail) => audit(actor, action, detail),
  });

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
      removed: db.removed,
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

  // Each person gets the user record as they may see it (email only for admins and the user).
  function broadcastUser(user: User): void {
    for (const [ws, uid] of clients) send(ws, { t: 'user', user: userView(user, db.users[uid]) });
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

  function prefsFor(userId: string): UserPrefs {
    return visiblePrefs(cleanPrefs(db.prefs[userId]), (cid) => !!db.channels[cid] && canSee(db.channels[cid], userId));
  }

  // Every open tab of a person, so a change on one device shows on the others at once.
  function sendToUser(userId: string, ev: ServerEvent): void {
    for (const [ws, uid] of clients) if (uid === userId) send(ws, ev);
  }

  function setPrefs(userId: string, next: UserPrefs): void {
    db.prefs[userId] = next;
    sendToUser(userId, { t: 'prefs', prefs: prefsFor(userId) });
    persist();
  }

  function snapshotFor(userId: string): Snapshot {
    const visibleChannels = Object.fromEntries(
      Object.entries(db.channels).filter(([, ch]) => canSee(ch, userId)),
    );
    const recent = recentMessages(db.messages, new Set(Object.keys(visibleChannels)), new Set(db.saved[userId] ?? []));
    return {
      me: userId,
      workspace: workspaceInfo(),
      users: Object.fromEntries(Object.entries(db.users).map(([id, u]) => [id, userView(u, db.users[userId])])),
      online: onlineIds(),
      channels: visibleChannels,
      messages: recent.messages,
      history: recent.history,
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
      prefs: prefsFor(userId),
      admin: isAdmin(db.users[userId]) ? adminData() : undefined,
      pages: pages.nodesFor(userId),
      pageFavorites: pages.favoritesFor(userId),
      teamspaces: pages.teamspacesFor(userId),
      inbox: pages.inboxFor(userId),
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
    queueEmails(message, ch);
    return message;
  }

  // People who are away hear about mentions and DMs by email, in one batch a couple of minutes later.
  const outbox: Outbox = new Map();
  const lastEmailed = new Map<string, number>();

  function queueEmails(m: Message, ch: Channel): void {
    if (!outside.mail) return;
    const now = Date.now();
    for (const uid of recipients(m, ch, db.users, db.groups, canSee)) {
      if (outside.isOnline(uid) || !mayEmail(db.users[uid], cleanPrefs(db.prefs[uid]), ch.id, now)) continue;
      enqueue(outbox, uid, { channelId: ch.id, messageId: m.id, ts: m.ts }, now);
    }
  }

  function sendDueEmails(): void {
    const mail = outside.mail;
    if (!mail) return;
    const now = Date.now();
    for (const [uid, items] of takeDue(outbox, lastEmailed, now)) {
      const user = db.users[uid];
      const prefs = cleanPrefs(db.prefs[uid]);
      // Things may have changed during the wait: they came back, read it, or the message is gone.
      if (outside.isOnline(uid) || !user?.email) continue;
      const lines = items.flatMap((p) => {
        const m = db.messages.find((x) => x.id === p.messageId);
        const ch = db.channels[p.channelId];
        if (!m || !ch || !canSee(ch, uid) || !mayEmail(user, prefs, ch.id, now) || m.ts <= (prefs.lastRead[ch.id] ?? 0)) return [];
        return [digestLine(m, ch, db.users)];
      });
      if (lines.length === 0) continue;
      lastEmailed.set(uid, now);
      const link = outside.appUrl ? `${outside.appUrl}/?ws=${encodeURIComponent(id)}` : undefined;
      mail.send({ to: user.email, ...digest(lines, db.meta.name, link) }).catch((err) => console.error('email failed:', err instanceof Error ? err.message : err));
    }
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
    return !(other && (db.users[other]?.inactive || barred(userId, other, db.groups, db.settings.barriers)));
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
    function join(ws: WebSocket, identity: Identity, invite?: string): 'ok' | 'invite-required' | 'removed' {
      const { userId, name, email, avatarUrl } = identity;
      if (db.removed.includes(userId)) return 'removed';
      let user = db.users[userId];
      const isMember = !!user && !user.inactive;
      const hasOwner = Object.values(db.users).some((u) => u.role === 'owner' && !u.inactive);
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
        // Coming back after leaving: the invite rules above already ran, so this is a fresh start.
        if (user.inactive) {
          user.inactive = false;
          for (const id of ['general', 'random']) ensureMember(db.channels[id], userId);
        }
        // Keep profile details fresh from the identity provider.
        if (authAdmin) user.name = name;
        user.avatarUrl = avatarUrl ?? user.avatarUrl;
        user.email = email ?? user.email;
        if (role === 'owner') user.role = 'owner';
        user.role ??= 'member';
      }

      clients.set(ws, userId);
      send(ws, { t: 'init', snapshot: snapshotFor(userId) });
      broadcastUser(user);
      broadcast({ t: 'presence', online: onlineIds() });
      if (!isMember) runJoinWorkflows('general');
      persist();
      return 'ok';
    }

  function soleOwner(userId: string): boolean {
    const owners = Object.values(db.users).filter((u) => u.role === 'owner' && !u.inactive);
    return owners.length === 1 && owners[0].id === userId;
  }

  // Disconnects every tab of a person at once and tells them why.
  function evict(userId: string, code: 'no-workspace' | 'removed', message: string): void {
    for (const [ws, uid] of [...clients]) {
      if (uid !== userId) continue;
      send(ws, { t: 'error', message, code });
      leave(ws);
      onEvict(ws);
    }
  }

  // Takes a person out of the workspace (they stay as a name on old messages). DMs are kept:
  // the other side's history is theirs too.
  function retire(userId: string, code: 'no-workspace' | 'removed', message: string): void {
    const user = db.users[userId];
    user.inactive = true;
    if (user.role === 'owner' || user.role === 'admin') user.role = 'member';
    db.scheduled = db.scheduled.filter((s) => s.userId !== userId);
    evict(userId, code, message);
    for (const ch of Object.values(db.channels)) {
      if (ch.kind === 'dm' || !ch.members.includes(userId)) continue;
      ch.members = ch.members.filter((u) => u !== userId);
      broadcastChannel(ch, { t: 'channel', channel: ch });
    }
    broadcastUser(user);
    persist();
  }

  // Erases a person's data. Their messages stay in the conversation, credited to "Deleted user".
  function forget(userId: string): void {
    db.users[DELETED_ID] ??= { id: DELETED_ID, name: 'Deleted user', color: '#8a8f98', title: '', status: { emoji: '', text: '' }, role: 'member', inactive: true };
    for (const m of db.messages) {
      if (m.userId === userId) m.userId = DELETED_ID;
      for (const [emoji, who] of Object.entries(m.reactions)) {
        m.reactions[emoji] = who.filter((u) => u !== userId);
        if (m.reactions[emoji].length === 0) delete m.reactions[emoji];
      }
    }
    for (const f of db.flags) if (f.by === userId) f.by = DELETED_ID;
    for (const w of db.workflows) if (w.createdBy === userId) delete w.createdBy;
    for (const g of db.groups) g.members = g.members.filter((u) => u !== userId);
    for (const ch of Object.values(db.channels)) {
      if (!ch.members.includes(userId)) continue;
      ch.members = ch.kind === 'dm' ? [...new Set(ch.members.map((u) => (u === userId ? DELETED_ID : u)))] : ch.members.filter((u) => u !== userId);
    }
    db.scheduled = db.scheduled.filter((s) => s.userId !== userId);
    delete db.users[userId];
    delete db.prefs[userId];
    delete db.saved[userId];
    delete db.sections[userId];
    delete db.starred[userId];
    delete db.termsAccepted[userId];
    pages.forget(userId, DELETED_ID);
  }

  async function handle(ws: WebSocket, ev: ClientEvent): Promise<void> {
    const userId = clients.get(ws);
    if (!userId) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }

    if (await pages.handle(ws, userId, ev)) return;

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
        if (other && db.users[other]?.inactive) {
          send(ws, { t: 'error', message: 'This person is no longer in the workspace.' });
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
              text: `Reminder: ${slash.text}`,
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
        const home = m && db.channels[m.channelId];
        if (!m || !home || m.userId !== userId || typeof ev.text !== 'string') return;
        if (!mayPost(home, userId)) {
          send(ws, { t: 'error', message: `You can't edit messages in ${home.kind === 'dm' ? 'this conversation' : `#${home.name}`} right now.` });
          return;
        }
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
        const home = m && db.channels[m.channelId];
        if (!m || !home || !canSee(home, userId)) return;
        if (!home.members.includes(userId)) {
          send(ws, { t: 'error', message: `Join #${home.name} to pin messages.` });
          return;
        }
        m.pinned = !m.pinned;
        const ch = db.channels[m.channelId];
        if (ch) broadcastChannel(ch, { t: 'message', message: m });
        persist();
        return;
      }
      case 'save': {
        const list = db.saved[userId] ?? [];
        db.saved[userId] = list.includes(ev.id) ? list.filter((i) => i !== ev.id) : [...list, ev.id];
        sendToUser(userId, { t: 'saved', saved: db.saved[userId] });
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
        if (!db.users[ev.userId] || db.users[ev.userId].inactive) return;
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
        broadcastUser(user);
        persist();
        return;
      }
      case 'canvas': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId) || typeof ev.content !== 'string') return;
        if (!ch.members.includes(userId)) {
          send(ws, { t: 'error', message: `Join #${ch.name} to edit its canvas.` });
          return;
        }
        db.canvases[ch.id] = ev.content.slice(0, 100_000);
        broadcastChannel(ch, { t: 'canvas', channelId: ch.id, content: db.canvases[ch.id] });
        persist();
        return;
      }
      case 'workflows': {
        if (db.users[userId]?.role === 'guest' || !Array.isArray(ev.list)) return;
        const merged = mergeWorkflows(db.workflows, ev.list.slice(0, 50).map((w) => cleanWorkflow(w, userId)).filter((w) => w !== null), { id: userId, admin: isAdmin(db.users[userId]) });
        db.workflows = merged.list;
        broadcast({ t: 'workflows', list: db.workflows });
        if (merged.rejected) send(ws, { t: 'error', message: 'Workflows published by other people were left unchanged. Only their creator or an admin can edit them.' });
        audit(userId, 'workflows.publish', `${db.workflows.length} workflows${merged.overrode ? `, changed ${merged.overrode} by other people` : ''}`);
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
      case 'listItem': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId)) return;
        if (!ch.members.includes(userId)) {
          send(ws, { t: 'error', message: `Join #${ch.name} to edit its list.` });
          return;
        }
        const next = applyListPatch(db.lists[ch.id] ?? [], ev, (id) => !!db.users[id] && ch.members.includes(id));
        if (!next) return;
        db.lists[ch.id] = next;
        broadcastChannel(ch, { t: 'lists', channelId: ch.id, items: next });
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
        sendToUser(userId, { t: 'sections', sections: db.sections[userId] });
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
        if (!isAdmin(actor) || !target || target.bot || target.inactive || !['owner', 'admin', 'member', 'guest'].includes(ev.role)) return;
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
        broadcastUser(target);
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
        if (!ch || ch.kind === 'dm' || !db.users[ev.userId] || db.users[ev.userId].inactive || !ch.members.includes(userId)) return;
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
      case 'leaveWorkspace': {
        if (soleOwner(userId)) {
          send(ws, { t: 'error', message: 'Make someone else an owner before you leave.' });
          return;
        }
        audit(userId, 'member.leave', db.users[userId].name);
        retire(userId, 'no-workspace', `You left ${db.meta.name}.`);
        return;
      }
      case 'removeMember': {
        const actor = db.users[userId];
        const target = typeof ev.userId === 'string' ? db.users[ev.userId] : undefined;
        const verdict = removeVerdict(actor, target);
        if (verdict === 'owner-only') send(ws, { t: 'error', message: 'Only an owner can remove admins or owners.' });
        if (verdict !== 'ok' || !target) return;
        if (!db.removed.includes(target.id)) db.removed.push(target.id);
        audit(userId, 'member.remove', target.name);
        retire(target.id, 'removed', `You were removed from ${db.meta.name}.`);
        return;
      }
      case 'restoreMember': {
        if (!isAdmin(db.users[userId]) || typeof ev.userId !== 'string' || !db.removed.includes(ev.userId)) return;
        db.removed = db.removed.filter((u) => u !== ev.userId);
        audit(userId, 'member.restore', db.users[ev.userId]?.name ?? ev.userId);
        persist();
        return;
      }
      case 'deleteMyAccount': {
        if (db.legalHolds.includes(userId)) {
          send(ws, { t: 'error', message: 'Your account is under a legal hold and can’t be deleted right now. Ask an admin.' });
          return;
        }
        if (soleOwner(userId)) {
          send(ws, { t: 'error', message: 'Make someone else an owner before you delete your account.' });
          return;
        }
        audit(userId, 'account.delete', db.users[userId].name);
        // Erase first: evicting sends the person their workspace list, which must no longer include this one.
        forget(userId);
        evict(userId, 'no-workspace', `Your account in ${db.meta.name} was deleted.`);
        // Messages, channels and the user list changed under everyone, so refresh them.
        for (const uid of onlineIds()) resendInit(uid);
        broadcastAdmin();
        persist();
        return;
      }
      case 'history': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId) || !isCursor(ev.before)) return;
        send(ws, { t: 'history', channelId: ch.id, ...olderMessages(db.messages, ch.id, ev.before) });
        return;
      }
      case 'markRead': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId)) return;
        setPrefs(userId, withRead(cleanPrefs(db.prefs[userId]), ch.id, Date.now()));
        return;
      }
      case 'setLevel': {
        const ch = db.channels[ev.channelId];
        if (!ch || !canSee(ch, userId)) return;
        const next = withLevel(cleanPrefs(db.prefs[userId]), ch.id, ev.level);
        if (next) setPrefs(userId, next);
        return;
      }
      case 'setDnd': {
        const next = withDnd(cleanPrefs(db.prefs[userId]), ev.until, Date.now());
        if (next) setPrefs(userId, next);
        return;
      }
      case 'setEmail': {
        const next = withEmail(cleanPrefs(db.prefs[userId]), ev.on);
        if (next) setPrefs(userId, next);
        return;
      }
      case 'importPrefs': {
        const isChannel = (cid: string) => !!db.channels[cid] && canSee(db.channels[cid], userId);
        setPrefs(userId, mergeImport(cleanPrefs(db.prefs[userId]), ev, isChannel, Date.now()));
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
        audit(userId, 'analytics.view', 'Workspace analytics');
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
  timers.push(setInterval(sendDueEmails, 30_000));

  function leave(ws: WebSocket): void {
    if (!clients.has(ws)) return;
    // Drop the tab from its huddle while its user id is still known, then forget the socket.
    const left = dropFromCall(ws);
    pages.drop(ws);
    clients.delete(ws);
    if (left) {
      syncCall(left);
      broadcast({ t: 'huddles', huddles: huddleList() });
    }
    broadcast({ t: 'presence', online: onlineIds() });
  }

  function summary(): WorkspaceSummary {
    return { id, name: db.meta.name, color: db.meta.color, members: Object.values(db.users).filter((u) => !u.bot && !u.inactive).length, inviteOnly: !!db.settings.inviteOnly };
  }

  function stop(): void {
    pages.stop();
    for (const t of timers) clearInterval(t);
  }

  // A published page as HTML for anyone with the link, or null.
  async function renderPublic(token: string): Promise<string | null> {
    const found = await pages.published(token);
    if (!found) return null;
    const idx = outside.pageIndex.pages;
    return renderPublished(found.page, { blocks: found.blocks, db: found.db }, {
      siteName: db.meta.name,
      linkFor: (pid) => { const p = Object.hasOwn(idx, pid) ? idx[pid] : undefined; return p?.publish && p.trashedAt === undefined ? `/p/${p.publish.token}` : null; },
      titleFor: (pid) => { const p = Object.hasOwn(idx, pid) ? idx[pid] : undefined; return p && p.trashedAt === undefined && (p.parentId === found.page.id || p.publish) ? p.title : null; },
    });
  }

  return { id, db, join, handle, leave, summary, flush, stop, renderPublic, isMember: (userId: string) => !!db.users[userId] && !db.users[userId].inactive, hasInvite: (code?: string) => validateInvite(code, db.invites) };
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

// Published pages are public, so they get their own small rate limit per address.
const publicHits = new Map<string, { n: number; at: number }>();
async function servePublished(req: http.IncomingMessage, res: http.ServerResponse, rawToken: string): Promise<void> {
  const ip = req.socket.remoteAddress ?? '?';
  const now = Date.now();
  const hit = publicHits.get(ip);
  if (!hit || now - hit.at > 60_000) publicHits.set(ip, { n: 1, at: now });
  else if (++hit.n > 120) {
    res.writeHead(429, { 'content-type': 'text/plain', 'retry-after': '60' });
    res.end('Too many requests.');
    return;
  }
  if (publicHits.size > 5000) publicHits.clear();
  let token = '';
  try {
    token = decodeURIComponent(rawToken);
  } catch { /* not a token */ }
  const rt = runtimes.get(token.split('.')[0] ?? '');
  const html = /^[A-Za-z0-9_.-]{1,120}$/.test(token) && rt ? await rt.renderPublic(token).catch(() => null) : null;
  res.writeHead(html ? 200 : 404, PUBLISH_HEADERS);
  res.end(req.method === 'HEAD' ? undefined : html ?? NOT_FOUND_HTML);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, workspaces: runtimes.size }));
    return;
  }
  if (url.pathname.startsWith('/p/')) {
    void servePublished(req, res, url.pathname.slice(3));
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
  const pageStore = createPageStore(id, dataDir);
  const pageIndex = await pageStore.loadIndex();
  // Optional mirror of messages into relay_messages (off unless RELAY_MESSAGES_DUAL_WRITE=1). The first
  // sync copies every existing message, so it doubles as the backfill; the document stays the source of truth.
  const mirror = createMessageSync(id, authAdmin, process.env.RELAY_MESSAGES_DUAL_WRITE === '1');
  void mirror?.sync(db.messages);
  const rt = createRuntime(id, db, async (d) => { await st.save(d); void mirror?.sync(d.messages); }, (ws) => {
    // The runtime cut this socket off: forget its workspace and show the person their remaining ones.
    const conn = conns.get(ws);
    if (!conn) return;
    conn.rt = undefined;
    if (conn.identity) send(ws, { t: 'workspaces', ...workspacesFor(conn.identity.userId) });
  }, {
    mail,
    appUrl,
    // Connected to any workspace counts: someone with another one open will see it there.
    isOnline: (userId) => [...conns.values()].some((c) => c.identity?.userId === userId && !!c.rt),
    pageStore,
    pageIndex,
  });
  runtimes.set(id, rt);
  return rt;
}
for (const w of directory.workspaces) await loadRuntime(w.id);

interface Conn { identity?: Identity; rt?: Runtime }
const conns = new Map<WebSocket, Conn>();

// ---- Home: each person's own notes, to-do lists and links, outside every workspace. One small document
// per person (row `home-<userId>`), loaded on first use and saved 250 ms after a change.
const HOME = 'home';
interface HomeDoc { items: HomeItem[] }
const homes = new Map<string, { doc: HomeDoc; save: () => Promise<void>; timer?: NodeJS.Timeout }>();
async function homeOf(userId: string) {
  let h = homes.get(userId);
  if (!h) {
    const st = createStore<HomeDoc>(() => ({ items: [] }), path.join(dataDir, 'homes', `${encodeURIComponent(userId)}.json`), `home-${userId}`);
    const doc: HomeDoc = { items: cleanHome(await st.load()) };
    h = { doc, save: () => st.save(doc) };
    // Another socket may have loaded it meanwhile; keep the first so two copies never diverge.
    homes.set(userId, homes.get(userId) ?? h);
    h = homes.get(userId)!;
  }
  return h;
}
function saveHomeSoon(userId: string): void {
  const h = homes.get(userId);
  if (!h) return;
  clearTimeout(h.timer);
  h.timer = setTimeout(() => void h.save().catch((err) => console.error('home save failed:', err instanceof Error ? err.message : err)), 250);
}
// Every open tab of this person, in any workspace or on Home, shows the same items.
function sendHome(userId: string, doc: HomeDoc): void {
  for (const [sock, c] of conns) if (c.identity?.userId === userId) send(sock, { t: 'home', items: doc.items, name: c.identity.name });
}

function workspacesFor(userId: string): { mine: WorkspaceSummary[]; discover: WorkspaceSummary[] } {
  const mine: WorkspaceSummary[] = [];
  const discover: WorkspaceSummary[] = [];
  for (const rt of runtimes.values()) {
    if (rt.isMember(userId)) mine.push(rt.summary());
    else if (!rt.db.settings.inviteOnly && !rt.db.removed.includes(userId)) discover.push(rt.summary());
  }
  return { mine, discover };
}

// Which workspace a fresh connection lands in: the one an invite code belongs to, the one
// asked for, the user's first workspace, or else the open Relay HQ.
function pickWorkspace(userId: string, wanted?: string, invite?: string): Runtime | undefined {
  if (invite) for (const rt of runtimes.values()) if (rt.hasInvite(invite)) return rt;
  if (wanted && runtimes.has(wanted)) return runtimes.get(wanted);
  for (const rt of runtimes.values()) if (rt.isMember(userId)) return rt;
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
    // Opening the app lands on Home: no workspace joined, just the person's own items and their workspace list.
    if (ev.workspace === HOME && !ev.invite) {
      send(ws, { t: 'workspaces', ...workspacesFor(identity.userId) });
      send(ws, { t: 'home', items: (await homeOf(identity.userId)).doc.items, name: identity.name });
      return;
    }
    const rt = pickWorkspace(identity.userId, ev.workspace, ev.invite);
    if (!rt) {
      send(ws, { t: 'workspaces', ...workspacesFor(identity.userId) });
      send(ws, { t: 'error', message: 'You aren’t in a workspace yet. Create one or join with an invite.', code: 'no-workspace' });
      return;
    }
    const result = rt.join(ws, identity, ev.invite);
    send(ws, { t: 'workspaces', ...workspacesFor(identity.userId) });
    if (result === 'removed') {
      send(ws, { t: 'error', message: `You were removed from ${rt.db.meta.name}.`, code: 'removed' });
      return;
    }
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
    // The workspace row goes first: a directory entry without one would reseed as an open workspace.
    await loadRuntime(id, () => seed(name, createdBy, true));
    directory.workspaces.push({ id, createdAt: Date.now(), createdBy });
    await dirStore.save(directory);
    send(ws, { t: 'workspaceCreated', id });
    return;
  }

  if (ev.t === 'homeAdd' || ev.t === 'homeUpdate' || ev.t === 'homeRemove') {
    if (!conn.identity) {
      send(ws, { t: 'error', message: 'Sign in to continue.', code: 'auth-required' });
      return;
    }
    const userId = conn.identity.userId;
    const h = await homeOf(userId);
    const newId = () => randomUUID().slice(0, 12);
    let next: HomeItem[] | string | null;
    if (ev.t === 'homeAdd') next = addItem(h.doc.items, ev.kind, ev.fields && typeof ev.fields === 'object' ? ev.fields : {}, newId(), Date.now(), newId);
    else if (ev.t === 'homeUpdate') next = updateItem(h.doc.items, ev.id, ev.patch, Date.now(), newId);
    else next = removeItem(h.doc.items, ev.id);
    if (typeof next === 'string') send(ws, { t: 'error', message: next });
    if (!Array.isArray(next)) return;
    h.doc.items = next;
    saveHomeSoon(userId);
    sendHome(userId, h.doc);
    return;
  }

  if (!conn.rt) {
    // Signed in but on Home (or turned away from a workspace): workspace events have nowhere to go.
    if (conn.identity) return;
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
  await Promise.all([...homes.values()].map((h) => { clearTimeout(h.timer); return h.save().catch(() => undefined); }));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));
