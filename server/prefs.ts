// Pure helpers for per-user settings (read state, notification levels, Do Not Disturb).
// No I/O so they can be unit-tested in isolation.
import type { ChannelLevel, UserPrefs } from '../src/types.ts';

const LEVELS: ChannelLevel[] = ['all', 'mentions', 'mute'];
// Bounds so one account can't grow the workspace document without limit.
const MAX_ENTRIES = 5000;
const MAX_DND_MS = 30 * 24 * 3_600_000;

export const emptyPrefs = (): UserPrefs => ({ lastRead: {}, levels: {}, dndUntil: 0, email: true });

// Stored documents may predate a field or hold junk; keep only what is well-formed.
export function cleanPrefs(raw: unknown): UserPrefs {
  const out = emptyPrefs();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<UserPrefs>;
  for (const [id, ts] of Object.entries(r.lastRead ?? {})) if (typeof ts === 'number' && Number.isFinite(ts)) out.lastRead[id] = ts;
  for (const [id, lv] of Object.entries(r.levels ?? {})) if (lv === 'all' || lv === 'mute') out.levels[id] = lv;
  if (typeof r.dndUntil === 'number' && Number.isFinite(r.dndUntil)) out.dndUntil = r.dndUntil;
  if (r.email === false) out.email = false;
  return out;
}

// Read time only moves forward, so a late or duplicated event can't mark messages unread again.
export function withRead(p: UserPrefs, channelId: string, now: number): UserPrefs {
  const prev = p.lastRead[channelId];
  if (prev === undefined && Object.keys(p.lastRead).length >= MAX_ENTRIES) return p;
  return { ...p, lastRead: { ...p.lastRead, [channelId]: Math.max(prev ?? 0, now) } };
}

// 'mentions' is the default, so it is stored as the absence of an entry.
export function withLevel(p: UserPrefs, channelId: string, level: unknown): UserPrefs | null {
  if (typeof level !== 'string' || !LEVELS.includes(level as ChannelLevel)) return null;
  const levels = { ...p.levels };
  if (level === 'mentions') delete levels[channelId];
  else if (levels[channelId] !== undefined || Object.keys(levels).length < MAX_ENTRIES) levels[channelId] = level as ChannelLevel;
  return { ...p, levels };
}

// A time in the past (or 0) switches DND off; far-future times are capped.
export function withDnd(p: UserPrefs, until: unknown, now: number): UserPrefs | null {
  if (typeof until !== 'number' || !Number.isFinite(until)) return null;
  return { ...p, dndUntil: until <= now ? 0 : Math.min(until, now + MAX_DND_MS) };
}

export function withEmail(p: UserPrefs, on: unknown): UserPrefs | null {
  return typeof on === 'boolean' ? { ...p, email: on } : null;
}

// The browser's old values fill gaps only: newer server state always wins, so importing twice,
// or from a stale device, can't undo a choice made elsewhere.
export function mergeImport(p: UserPrefs, raw: unknown, isChannel: (id: string) => boolean, now: number): UserPrefs {
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as { lastRead?: unknown; levels?: unknown; dndUntil?: unknown };
  let next = p;
  if (r.lastRead && typeof r.lastRead === 'object') {
    for (const [id, ts] of Object.entries(r.lastRead).slice(0, MAX_ENTRIES)) {
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0 && isChannel(id)) next = withRead(next, id, Math.min(ts, now));
    }
  }
  if (r.levels && typeof r.levels === 'object') {
    for (const [id, lv] of Object.entries(r.levels).slice(0, MAX_ENTRIES)) {
      if (next.levels[id] === undefined && isChannel(id)) next = withLevel(next, id, lv) ?? next;
    }
  }
  if (next.dndUntil === 0 && typeof r.dndUntil === 'number') next = withDnd(next, r.dndUntil, now) ?? next;
  return next;
}

// What a person is sent: only channels they can still see.
export function visiblePrefs(p: UserPrefs, canSee: (channelId: string) => boolean): UserPrefs {
  const keep = <T>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([id]) => canSee(id)));
  return { lastRead: keep(p.lastRead), levels: keep(p.levels), dndUntil: p.dndUntil, email: p.email };
}
