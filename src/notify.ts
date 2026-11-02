import { useCallback, useEffect, useRef, useState } from 'react';
import { mentionsUser, plainText } from './premium.ts';
import type { ChannelLevel, ClientEvent, Message, Snapshot, UserPrefs } from './types.ts';

const NO_PREFS: UserPrefs = { lastRead: {}, levels: {}, dndUntil: 0, email: true };

// A browser-side copy of the server's prefs. The server is the source of truth; this only fills in
// when the UI is newer than the server it talks to (no `prefs` in the snapshot yet).
const cacheKey = (workspaceId: string) => `relay.prefs.${workspaceId}`;

function readPrefsCache(workspaceId: string): UserPrefs | null {
  try {
    const raw = localStorage.getItem(cacheKey(workspaceId));
    return raw ? { ...NO_PREFS, ...(JSON.parse(raw) as Partial<UserPrefs>) } : null;
  } catch {
    return null;
  }
}

export function usePrefs(snap: Snapshot | null): UserPrefs {
  const workspaceId = snap?.workspace.id;
  const fromServer = snap?.prefs;
  useEffect(() => {
    if (!workspaceId || !fromServer) return;
    try {
      localStorage.setItem(cacheKey(workspaceId), JSON.stringify(fromServer));
    } catch {
      /* private mode: the server copy is the one that counts */
    }
  }, [workspaceId, fromServer]);
  return fromServer ?? (workspaceId ? readPrefsCache(workspaceId) : null) ?? NO_PREFS;
}

// What this browser kept before prefs moved to the server, in the shape `importPrefs` takes.
// Read state was one map for all workspaces: HQ used bare channel ids, others `<workspace>/<channel>`.
export function legacyPrefs(
  workspaceId: string,
  raw: { lastRead?: string | null; levels?: string | null; dndUntil?: string | null },
): { lastRead: Record<string, number>; levels: Record<string, string>; dndUntil: number } {
  const parse = (text?: string | null): Record<string, unknown> => {
    try {
      const v = text ? JSON.parse(text) : {};
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const lastRead: Record<string, number> = {};
  const prefix = `${workspaceId}/`;
  for (const [key, ts] of Object.entries(parse(raw.lastRead))) {
    if (typeof ts !== 'number') continue;
    if (workspaceId === 'hq' ? !key.includes('/') : key.startsWith(prefix)) lastRead[workspaceId === 'hq' ? key : key.slice(prefix.length)] = ts;
  }
  const levels: Record<string, string> = {};
  for (const [id, lv] of Object.entries(parse(raw.levels))) if (typeof lv === 'string') levels[id] = lv;
  return { lastRead, levels, dndUntil: Number(raw.dndUntil) || 0 };
}

// Uploads the old browser-only values once per workspace per browser. The server only fills gaps,
// so a second device with stale values can't undo anything.
export function usePrefsMigration(snap: Snapshot | null, send: (ev: ClientEvent) => void): void {
  const workspaceId = snap?.workspace.id;
  const hasPrefs = !!snap?.prefs;
  useEffect(() => {
    if (!workspaceId || !hasPrefs) return;
    const flag = `relay.prefsMigrated.${workspaceId}`;
    try {
      if (localStorage.getItem(flag)) return;
      const legacy = legacyPrefs(workspaceId, {
        lastRead: localStorage.getItem('relay.lastRead'),
        levels: localStorage.getItem(`relay.levels.${workspaceId}`),
        dndUntil: localStorage.getItem('relay.dndUntil'),
      });
      send({ t: 'importPrefs', ...legacy });
      localStorage.setItem(flag, '1');
    } catch {
      /* storage blocked: nothing to migrate */
    }
  }, [workspaceId, hasPrefs]);
}

// Do Not Disturb: a timestamp until which alerts stay quiet (0 = off). Kept on the server.
export function useDnd(snap: Snapshot | null, send: (ev: ClientEvent) => void) {
  const until = usePrefs(snap).dndUntil;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const left = until - Date.now();
    if (left <= 0) return;
    // Re-render when the snooze ends so the moon badge clears on its own.
    const t = setTimeout(() => tick((n) => n + 1), Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [until]);
  const setUntil = useCallback((ts: number) => send({ t: 'setDnd', until: ts }), [send]);
  return { until, active: until > Date.now(), setUntil };
}

export function dndPresets(now = new Date()): { label: string; until: number }[] {
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(now.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return [
    { label: '30 minutes', until: now.getTime() + 30 * 60_000 },
    { label: '1 hour', until: now.getTime() + 60 * 60_000 },
    { label: '4 hours', until: now.getTime() + 4 * 60 * 60_000 },
    { label: 'Until tomorrow, 9:00', until: tomorrow9.getTime() },
  ];
}

export { plainText };

export type { ChannelLevel };

// Per-channel notification level, kept on the server per workspace.
export function useChannelLevels(snap: Snapshot | null, send: (ev: ClientEvent) => void) {
  const levels = usePrefs(snap).levels;
  const setLevel = useCallback((channelId: string, level: ChannelLevel) => send({ t: 'setLevel', channelId, level }), [send]);
  const levelOf = useCallback((channelId: string): ChannelLevel => levels[channelId] ?? 'mentions', [levels]);
  return { levelOf, setLevel };
}

// Slack's default: notify for DMs, mentions, and replies in threads you started.
// A channel set to 'all' notifies for every message; 'mute' never does.
export function shouldNotify(m: Message, snap: Snapshot, level: ChannelLevel = 'mentions'): boolean {
  if (m.userId === snap.me || m.system || level === 'mute') return false;
  const ch = snap.channels[m.channelId];
  if (!ch) return false;
  if (level === 'all') return true;
  if (ch.kind === 'dm') return true;
  if (mentionsUser(m.text, snap.me, snap.groups)) return true;
  if (m.threadId) return snap.messages.some((x) => x.id === m.threadId && x.userId === snap.me);
  return false;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function useMessageAlerts(
  snap: Snapshot | null,
  activeChannel: string,
  dndActive: boolean,
  open: (channelId: string, threadId?: string) => void,
  levelOf: (channelId: string) => ChannelLevel = () => 'mentions',
) {
  const seen = useRef<Set<string> | null>(null);
  const seenWs = useRef<string | null>(null);
  const since = useRef(0);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    if (!snap) return;
    // The first snapshot is history, not news.
    if (!seen.current || seenWs.current !== snap.workspace.id) {
      seen.current = new Set(snap.messages.map((m) => m.id));
      seenWs.current = snap.workspace.id;
      since.current = snap.messages.reduce((t, m) => Math.max(t, m.ts), 0);
      return;
    }
    // Older pages loaded by scrolling up are history, not news.
    const fresh = snap.messages.filter((m) => !seen.current!.has(m.id) && m.ts >= since.current);
    for (const m of fresh) seen.current.add(m.id);
    if (dndActive || permission !== 'granted') return;
    for (const m of fresh) {
      const looking = !document.hidden && m.channelId === activeChannel && !m.threadId;
      if (looking || !shouldNotify(m, snap, levelOf(m.channelId))) continue;
      const author = snap.users[m.userId]?.name ?? 'Someone';
      const ch = snap.channels[m.channelId];
      const where = ch.kind === 'dm' ? author : `${author} in #${ch.name}`;
      const n = new Notification(where, {
        body: plainText(m.text, snap.users).slice(0, 140) || (m.files?.length ? 'Shared a file' : ''),
        tag: m.id,
      });
      n.onclick = () => {
        window.focus();
        open(m.channelId, m.threadId);
        n.close();
      };
    }
  }, [snap?.messages, activeChannel, dndActive, permission]);

  const request = useCallback(async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  return { permission, request };
}
