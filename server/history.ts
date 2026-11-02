// Pure helpers for paging message history. No I/O so they can be unit-tested in isolation.
import type { HistoryCursor, Message } from '../src/types.ts';

// Newest messages sent per channel on join, and per page when scrolling up.
export const PAGE = 50;

const order = (a: Message, b: Message) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isBefore = (m: Message, c: HistoryCursor) => m.ts < c.ts || (m.ts === c.ts && m.id < c.id);

export function isCursor(c: unknown): c is HistoryCursor {
  if (!c || typeof c !== 'object') return false;
  const { ts, id } = c as Partial<HistoryCursor>;
  return typeof ts === 'number' && Number.isFinite(ts) && typeof id === 'string' && id.length > 0 && id.length <= 64;
}

// The newest `limit` messages older than the cursor, from one channel's messages (any order).
// `cursor` in the result points at the oldest message taken, or is null when nothing older is left.
function takePage(channelMessages: Message[], before: HistoryCursor | undefined, limit: number): { taken: Message[]; cursor: HistoryCursor | null } {
  const older = (before ? channelMessages.filter((m) => isBefore(m, before)) : [...channelMessages]).sort(order);
  const taken = older.slice(-limit);
  return { taken, cursor: older.length > taken.length ? { ts: taken[0].ts, id: taken[0].id } : null };
}

// A reply is useless without the message it answers, so parents older than the page come along.
function withParents(taken: Message[], byId: Map<string, Message>): Message[] {
  const have = new Set(taken.map((m) => m.id));
  const out = [...taken];
  for (const m of taken) {
    const parent = m.threadId ? byId.get(m.threadId) : undefined;
    if (parent && !have.has(parent.id)) {
      have.add(parent.id);
      out.push(parent);
    }
  }
  return out;
}

// What a person gets on join: the newest page of each channel they can see, plus the messages
// they saved and every pinned one (those are shown outside the channel's own scroll).
// `history` has a cursor for each channel that has older messages to fetch.
export function recentMessages(
  all: Message[],
  visible: Set<string>,
  savedIds: Set<string>,
  limit = PAGE,
): { messages: Message[]; history: Record<string, HistoryCursor> } {
  const byChannel = new Map<string, Message[]>();
  for (const m of all) {
    if (!visible.has(m.channelId)) continue;
    const list = byChannel.get(m.channelId);
    if (list) list.push(m);
    else byChannel.set(m.channelId, [m]);
  }
  const byId = new Map(all.map((m) => [m.id, m]));
  const picked = new Map<string, Message>();
  const history: Record<string, HistoryCursor> = {};
  for (const [channelId, list] of byChannel) {
    const { taken, cursor } = takePage(list, undefined, limit);
    if (cursor) history[channelId] = cursor;
    for (const m of withParents(taken, byId)) picked.set(m.id, m);
    for (const m of list) if (m.pinned || savedIds.has(m.id)) picked.set(m.id, m);
  }
  return { messages: [...picked.values()].sort(order), history };
}

// The next page up for one channel (the caller has already checked the person can see it).
export function olderMessages(all: Message[], channelId: string, before: HistoryCursor, limit = PAGE): { messages: Message[]; cursor: HistoryCursor | null } {
  const { taken, cursor } = takePage(all.filter((m) => m.channelId === channelId), before, limit);
  return { messages: withParents(taken, new Map(all.map((m) => [m.id, m]))).sort(order), cursor };
}
