import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { mentionsUser } from './premium.ts';
import { supabase, authEnabled } from './supabase.ts';
import type { Analytics, ClientEvent, ServerEvent, Snapshot, WorkspaceSummary } from './types.ts';

interface State {
  snap: Snapshot | null;
  typing: Record<string, Record<string, number>>;
  error: string | null;
  authError: { message: string; code: 'auth-required' | 'invite-required' | 'no-workspace' } | null;
  analytics: Analytics | null;
  workspaces: { mine: WorkspaceSummary[]; discover: WorkspaceSummary[] };
}

type Action = { ev: ServerEvent } | { clearError: true } | { expireTyping: number };

function reduce(state: State, action: Action): State {
  if ('clearError' in action) return { ...state, error: null };
  if ('expireTyping' in action) {
    const typing: State['typing'] = {};
    for (const [ch, users] of Object.entries(state.typing)) {
      const live = Object.fromEntries(Object.entries(users).filter(([, ts]) => ts > action.expireTyping));
      if (Object.keys(live).length) typing[ch] = live;
    }
    return { ...state, typing };
  }
  const ev = action.ev;
  if (ev.t === 'init') return { ...state, snap: ev.snapshot, authError: null };
  // Auth/invite rejections block the session, so they are kept apart from transient errors.
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
    case 'admin':
      return { ...state, snap: { ...snap, admin: ev.admin } };
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
      .then(({ data }) => setToken(data.session?.access_token ?? null))
      .catch((err) => console.warn('session check failed', err))
      .finally(() => {
        clearTimeout(giveUp);
        setReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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
  const [state, dispatch] = useReducer(reduce, { snap: null, typing: {}, error: null, authError: null, analytics: null, workspaces: { mine: [], discover: [] } });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Huddle signaling isn't app state, so it goes to listeners instead of the reducer.
  const listeners = useRef(new Set<(ev: ServerEvent) => void>());
  // The workspace to open on (re)connect; remembered across reloads.
  const target = useRef<string | undefined>(readWorkspace());
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
        if (ev.t === 'rtc' || ev.t === 'huddleCall') listeners.current.forEach((fn) => fn(ev));
        else if (ev.t === 'export') downloadJson(ev.data);
        else if (ev.t === 'workspaceCreated') {
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
    if (wsRef.current) authenticate(wsRef.current);
  }, []);

  return { snap: state.snap, typing: state.typing, error: state.error, authError: state.authError, analytics: state.analytics, workspaces: state.workspaces, connected, send, listen, clearError, switchWorkspace };
}

// Channel ids repeat across workspaces (#general everywhere), so read state is keyed by both.
// The original workspace keeps bare channel ids so existing read state still applies.
export const readKey = (workspaceId: string, channelId: string) => (workspaceId === 'hq' ? channelId : `${workspaceId}/${channelId}`);

export function useLastRead() {
  const [lastRead, setLastRead] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('relay.lastRead') ?? '{}') as Record<string, number>;
    } catch (err) {
      console.warn('lastRead unreadable', err);
      return {};
    }
  });
  const markRead = useCallback((channelId: string) => {
    setLastRead((prev) => {
      const next = { ...prev, [channelId]: Date.now() };
      localStorage.setItem('relay.lastRead', JSON.stringify(next));
      return next;
    });
  }, []);
  return { lastRead, markRead };
}

export function useUnread(snap: Snapshot | null, lastRead: Record<string, number>) {
  return useMemo(() => {
    const out: Record<string, { count: number; mentions: number }> = {};
    if (!snap) return out;
    for (const m of snap.messages) {
      if (m.userId === snap.me || m.threadId || m.system) continue;
      const seen = lastRead[readKey(snap.workspace.id, m.channelId)] ?? 0;
      if (m.ts <= seen) continue;
      const entry = (out[m.channelId] ??= { count: 0, mentions: 0 });
      entry.count += 1;
      if (mentionsUser(m.text, snap.me, snap.groups)) entry.mentions += 1;
    }
    return out;
  }, [snap, lastRead]);
}
