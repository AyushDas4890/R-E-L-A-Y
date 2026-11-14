// What this person opened lately (pages, channels, people, commands), kept in this browser only: it is a
// convenience, not data. Entries are `Recent` records whose ids carry their kind: `p:`, `ch:`, `u:`, `cmd:`.
// Older builds stored bare page ids as strings; those still read back as pages.
import { pushRecent as push, type Recent } from './commands.ts';

const KEY = 'relay.recent';
const MAX = 20;

export function readRecentEntries(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    const out: Recent[] = [];
    for (const x of raw) {
      if (typeof x === 'string') out.push({ id: `p:${x}`, ts: 0 });
      else if (x && typeof x === 'object' && typeof (x as Recent).id === 'string') out.push({ id: (x as Recent).id, ts: Number((x as Recent).ts) || 0 });
    }
    return out.slice(0, MAX);
  } catch {
    return [];
  }
}

export function recordRecent(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(push(readRecentEntries(), id, Date.now(), MAX)));
  } catch { /* not saved */ }
}

// Page ids only, newest first, for the pages home.
export function readRecent(): string[] {
  return readRecentEntries().filter((r) => r.id.startsWith('p:')).map((r) => r.id.slice(2));
}

export function pushRecent(pageId: string): void {
  recordRecent(`p:${pageId}`);
}
