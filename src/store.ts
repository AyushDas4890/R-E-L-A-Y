import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { mentionsUser } from './premium.ts';
import { usePrefs } from './notify.ts';
import { supabase, authEnabled } from './supabase.ts';
import type { Analytics, ClientEvent, HomeItem, ServerEvent, Snapshot, WorkspaceSummary } from './types.ts';

interface State {
  snap: Snapshot | null;
  typing: Record<string, Record<string, number>>;
  error: string | null;
  authError: { message: string; code: 'auth-required' | 'invite-required' | 'no-workspace' | 'removed' | 'left' } | null;
  analytics: Analytics | null;
  workspaces: { mine: WorkspaceSummary[]; discover: WorkspaceSummary[] };
  // On the person's own Home, outside every workspace. Home items arrive from the server and follow them everywhere.
  atHome: boolean;
  home: { items: HomeItem[]; name: string };
}

type Action = { ev: ServerEvent } | { clearError: true } | { expireTyping: number } | { atHome: boolean };

function reduce(state: State, action: Action): State {
  if ('clearError' in action) return { ...state, error: null };
  // Going Home drops the open workspace; going into one waits for its snapshot.
  if ('atHome' in action) return action.atHome ? { ...state, atHome: true, snap: null, authError: null } : { ...state, atHome: false };
  if ('expireTyping' in action) {
    const typing: State['typing'] = {};
    for (const [ch, users] of Object.entries(state.typing)) {
      const live = Object.fromEntries(Object.entries(users).filter(([, ts]) => ts > action.expireTyping));
      if (Object.keys(live).length) typing[ch] = live;
    }
    return { ...state, typing };
  }
  const ev = action.ev;
  // An older server sends no `history`: then the snapshot already holds everything.
  if (ev.t === 'home') return { ...state, home: { items: ev.items, name: ev.name } };
  if (ev.t === 'init') return { ...state, atHome: false, snap: { ...ev.snapshot, history: ev.snapshot.history ?? {}, pages: ev.snapshot.pages ?? [], pageFavorites: ev.snapshot.pageFavorites ?? [], teamspaces: ev.snapshot.teamspaces ?? [], inbox: ev.snapshot.inbox ?? [] }, authError: null };
  // Auth/invite rejections block the session, so they are kept apart from transient errors.
  // Leaving a workspace lands on Home. The message is shown as a notice there.
  if (ev.t === 'error' && ev.code === 'left') return { ...state, atHome: true, snap: null, authError: null, error: ev.message };
  if (ev.t === 'error') return ev.code ? { ...state, authError: { message: ev.message, code: ev.code } } : { ...state, error: ev.message };
  if (ev.t === 'analytics') return { ...state, analytics: ev.data };
  if (ev.t === 'workspaces') return { ...state, workspaces: { mine: ev.mine, discover: ev.discover } };
  const snap = state.snap;
  if (!snap) return state;
  switch (ev.t) {
    case 'user':
      return { ...state, snap: { ...snap, users: { ...snap.users, [ev.user.id]: ev.user } } };
    case 'presence':
      return { ...state, snap: { ...snap, online: ev.online } };
    case 'channel':
      return { ...state, snap: { ...snap, channels: { ...snap.channels, [ev.channel.id]: ev.channel } } };
    case 'message': {
      const exists = snap.messages.some((m) => m.id === ev.message.id);
      const messages = exists
        ? snap.messages.map((m) => (m.id === ev.message.id ? ev.message : m))
        : [...snap.messages, ev.message];
      return { ...state, snap: { ...snap, messages } };
    }
    case 'messageDeleted':
      return {
        ...state,
        snap: { ...snap, messages: snap.messages.filter((m) => m.id !== ev.id && m.threadId !== ev.id) },
      };
    case 'canvas':
      return { ...state, snap: { ...snap, canvases: { ...snap.canvases, [ev.channelId]: ev.content } } };
    case 'workflows':
      return { ...state, snap: { ...snap, workflows: ev.list } };
    case 'scheduled':
      return { ...state, snap: { ...snap, scheduled: ev.list } };
    case 'huddles':
      return { ...state, snap: { ...snap, huddles: ev.huddles } };
    case 'saved':
      return { ...state, snap: { ...snap, saved: ev.saved } };
    case 'lists':
      return { ...state, snap: { ...snap, lists: { ...snap.lists, [ev.channelId]: ev.items } } };
    case 'sections':
      return { ...state, snap: { ...snap, sections: ev.sections } };
    case 'groups':
      return { ...state, snap: { ...snap, groups: ev.groups } };
    case 'settings':
      return { ...state, snap: { ...snap, settings: ev.settings } };
    case 'termsAccepted':
      return { ...state, snap: { ...snap, termsAccepted: ev.version } };
    case 'workspace':
      return { ...state, snap: { ...snap, workspace: ev.workspace } };
    case 'starred':
      return { ...state, snap: { ...snap, starred: ev.list } };
    case 'prefs':
      return { ...state, snap: { ...snap, prefs: ev.prefs } };
    case 'history': {
      const have = new Set(snap.messages.map((m) => m.id));
      const older = ev.messages.filter((m) => !have.has(m.id));
      // Older pages go in front, and the sort is stable, so messages sharing a millisecond keep their order.
      const messages = older.length ? [...older, ...snap.messages].sort((a, b) => a.ts - b.ts) : snap.messages;
      const history = { ...snap.history };
      if (ev.cursor) history[ev.channelId] = ev.cursor;
      else delete history[ev.channelId];
      return { ...state, snap: { ...snap, messages, history } };
    }
    case 'admin':
      return { ...state, snap: { ...snap, admin: ev.admin } };
    case 'pageNodes': {
      const byId = new Map(snap.pages.map((n) => [n.id, n]));
      for (const id of ev.gone) byId.delete(id);
      for (const n of ev.nodes) byId.set(n.id, n);
      return { ...state, snap: { ...snap, pages: [...byId.values()] } };
    }
    case 'pageFavorites':
      return { ...state, snap: { ...snap, pageFavorites: ev.list } };
    case 'teamspaces':
      return { ...state, snap: { ...snap, teamspaces: ev.list } };
    case 'inbox':
      return { ...state, snap: { ...snap, inbox: ev.items } };
    case 'typing':
      return {
        ...state,
        typing: {
          ...state.typing,
          [ev.channelId]: { ...state.typing[ev.channelId], [ev.userId]: Date.now() + 3500 },
        },
      };
    default:
      return state;
  }
}

// Events about the page that is open (its text, its settings, who else is in it). They belong to the
// editor's own copy of the page, so they go to listeners; the tree and favorites go through the reducer.
const PAGE_DOC_EVENTS = new Set<string>(['pageBody', 'pageMeta', 'blockOps', 'blockConflict', 'pagePresence', 'pageRevoked', 'pageCreated', 'dbData', 'dbDelta', 'comments', 'pageAccess', 'pageHistory', 'searchResults', 'calendarFeed', 'pageUploaded', 'linkPreview']);

function downloadJson(data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `relay-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function readWorkspace(): string | undefined {
  try {
    return localStorage.getItem('relay.workspace') ?? undefined;
  } catch {
    return undefined;
  }
}

function saveWorkspace(id: string): void {
  try {
    localStorage.setItem('relay.workspace', id);
  } catch {
    /* private mode: reopen the default workspace next time */
  }
}

// The email last signed in with, so the sign-in page can offer "Continue as …" next time.
const remember = (email?: string | null) => { if (email) try { localStorage.setItem('relay.lastEmail', email); } catch { /* storage blocked */ } };

export interface Session {
  token: string;
  invite: string;
}

// Dev mode (no Supabase): identity is a `uuid:name` token kept in localStorage.
export function getDevSession(): Session | null {
  if (authEnabled) return null;
  try {
    const raw = localStorage.getItem('relay.dev-session');
    if (raw) return JSON.parse(raw) as Session;
    // Carry over identities saved before sign-in existed.
    const old = localStorage.getItem('relay.identity');
    if (!old) return null;
    const { userId, name } = JSON.parse(old) as { userId: string; name: string };
    return saveDevSession(`${userId}:${name}`, '');
  } catch (err) {
    console.warn('dev session unreadable', err);
    return null;
  }
}

export function saveDevSession(token: string, invite: string): Session {
  const s = { token, invite };
  localStorage.setItem('relay.dev-session', JSON.stringify(s));
  return s;
}

export function clearDevSession(): void {
  localStorage.removeItem('relay.dev-session');
  localStorage.removeItem('relay.identity');
}

// Tracks the Supabase access token; in dev mode it stays null and `ready` is true at once.
export function useAuthToken(): { token: string | null; ready: boolean; signOut: () => Promise<void> } {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(!authEnabled);

  useEffect(() => {
    if (!supabase) return;
    // getSession can stall (a slow network, or a refresh blocked on another tab's lock). Never
    // leave the page stuck on the splash: after a few seconds show the landing page anyway;
    // onAuthStateChange still signs the user in when the session does arrive.
    const giveUp = setTimeout(() => setReady(true), 4000);
    supabase.auth.getSession()
      .then(({ data }) => { remember(data.session?.user?.email); setToken(data.session?.access_token ?? null); })
      .catch((err) => console.warn('session check failed', err))
      .finally(() => {
        clearTimeout(giveUp);
        setReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      remember(session?.user?.email);
      setToken(session?.access_token ?? null);
    });
    return () => {
      clearTimeout(giveUp);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    else clearDevSession();
    setToken(null);
  }, []);

  return { token, ready, signOut };
}

export function useRelay(session: Session | null) {
  // Opening the app lands on Home, unless an invite link says which workspace to join.
  const startHome = !session?.invite;
  const [state, dispatch] = useReducer(reduce, { snap: null, typing: {}, error: null, authError: null, analytics: null, workspaces: { mine: [], discover: [] }, atHome: startHome, home: { items: [], name: '' } });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Huddle signaling isn't app state, so it goes to listeners instead of the reducer.
  const listeners = useRef(new Set<(ev: ServerEvent) => void>());
  // The workspace to open on (re)connect; remembered across reloads.
  const target = useRef<string | undefined>(startHome ? 'home' : undefined);
  const lastWorkspace = useRef(readWorkspace());
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const authenticate = (ws: WebSocket, invite?: string) => {
    const s = sessionRef.current;
    if (s && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'auth', token: s.token, invite: invite || undefined, workspace: target.current } satisfies ClientEvent));
  };

  useEffect(() => {
    if (!session) return;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      // Set VITE_WS_URL when the UI is hosted apart from the server (e.g. UI on Vercel).
      const ws = new WebSocket(import.meta.env.VITE_WS_URL || `${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        authenticate(ws, session.invite);
      };
      ws.onmessage = (e) => {
        const ev = JSON.parse(e.data as string) as ServerEvent;
        if (ev.t === 'rtc' || ev.t === 'huddleCall' || PAGE_DOC_EVENTS.has(ev.t)) listeners.current.forEach((fn) => fn(ev));
        else if (ev.t === 'export') downloadJson(ev.data);
        else if (ev.t === 'error' && ev.code === 'left') {
          // This person left the workspace they were in: forget it, so a reconnect opens Home, not that workspace.
          target.current = 'home';
          dispatch({ ev });
        } else if (ev.t === 'workspaceCreated') {
          target.current = ev.id;
          authenticate(ws);
        } else {
          if (ev.t === 'init') {
            target.current = ev.snapshot.workspace.id;
            saveWorkspace(ev.snapshot.workspace.id);
          }
          dispatch({ ev });
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry += 1;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry, 10_000));
      };
    };
    connect();
    // Coming back to the tab or back online: retry now instead of waiting out the backoff.
    const retryNow = () => {
      if (closed || document.visibilityState === 'hidden') return;
      const state = wsRef.current?.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
      clearTimeout(timer);
      retry = 0;
      connect();
    };
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', retryNow);
    const sweep = setInterval(() => dispatch({ expireTyping: Date.now() }), 1000);
    return () => {
      closed = true;
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', retryNow);
      clearTimeout(timer);
      clearInterval(sweep);
      wsRef.current?.close();
    };
  }, [session?.token, session?.invite]);

  const send = useCallback((ev: ClientEvent) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev));
    else console.warn('socket not open, dropped', ev.t);
  }, []);

  const clearError = useCallback(() => dispatch({ clearError: true }), []);

  const listen = useCallback((fn: (ev: ServerEvent) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  // Switching re-authenticates on the open socket; the server moves it to the other workspace.
  const switchWorkspace = useCallback((id: string) => {
    target.current = id;
    dispatch({ atHome: false });
    if (wsRef.current) authenticate(wsRef.current);
  }, []);
  const goHome = useCallback(() => {
    target.current = 'home';
    dispatch({ atHome: true });
    if (wsRef.current) authenticate(wsRef.current);
  }, []);

  return { snap: state.snap, typing: state.typing, error: state.error, authError: state.authError, analytics: state.analytics, workspaces: state.workspaces, atHome: state.atHome, home: state.home, lastWorkspace: lastWorkspace.current, connected, send, listen, clearError, switchWorkspace, goHome };
}

// Read state lives on the server, so it follows the person to every device. The server stamps the
// time (message times are server time too) and echoes the new prefs to all of their tabs.
export function useLastRead(snap: Snapshot | null, send: (ev: ClientEvent) => void) {
  const lastRead = usePrefs(snap).lastRead;
  const sent = useRef<Record<string, number>>({});
  const markRead = useCallback((channelId: string) => {
    if (!snap) return;
    let latest = 0;
    for (const m of snap.messages) if (m.channelId === channelId && m.ts > latest) latest = m.ts;
    // Nothing newer than what the server already has (or than we just reported): stay quiet.
    if ((lastRead[channelId] ?? 0) >= latest || (sent.current[channelId] ?? 0) >= latest) return;
    sent.current[channelId] = latest;
    send({ t: 'markRead', channelId });
  }, [snap?.messages, lastRead, send]);
  return { lastRead, markRead };
}

// Asks for the next page above what a channel has loaded. A cursor is only asked for once, so a
// scroll event firing repeatedly doesn't send the same request again; the answer moves the cursor.
export function useOlderHistory(snap: Snapshot | null, send: (ev: ClientEvent) => void, connected: boolean) {
  const asked = useRef<Record<string, string>>({});
  useEffect(() => {
    asked.current = {};
  }, [connected, snap?.workspace.id]);
  return useCallback((channelId: string) => {
    const before = snap?.history[channelId];
    if (!before) return;
    const key = `${before.ts}:${before.id}`;
    if (asked.current[channelId] === key) return;
    asked.current[channelId] = key;
    send({ t: 'history', channelId, before });
  }, [snap?.history, send]);
}

export function useUnread(snap: Snapshot | null, lastRead: Record<string, number>) {
  return useMemo(() => {
    const out: Record<string, { count: number; mentions: number }> = {};
    if (!snap) return out;
    for (const m of snap.messages) {
      if (m.userId === snap.me || m.threadId || m.system) continue;
      const seen = lastRead[m.channelId] ?? 0;
      if (m.ts <= seen) continue;
      const entry = (out[m.channelId] ??= { count: 0, mentions: 0 });
      entry.count += 1;
      if (mentionsUser(m.text, snap.me, snap.groups)) entry.mentions += 1;
    }
    return out;
  }, [snap, lastRead]);
}
