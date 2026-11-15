import type { Message } from './types.ts';

// What the message list draws, one entry per virtual row.
export type Row =
  | { kind: 'day'; key: string; ts: number }
  | { kind: 'unread'; key: 'unread' }
  | { kind: 'msg'; key: string; m: Message; compact: boolean };

const COMPACT_GAP = 5 * 60_000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `day-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Turns a channel's messages into rows: a day row whenever the local calendar day changes, a
// message folded under the one before it when the same person wrote again within five minutes,
// and one "New messages" row before the first message from someone else newer than lastRead.
// newestAtOpen is the newest message time when the channel was opened: messages that arrive while
// the reader is watching never qualify, so the divider stays where it was for the visit.
export function buildRows(messages: Message[], lastRead: number, me: string, newestAtOpen = Infinity): Row[] {
  const rows: Row[] = [];
  let unreadPlaced = !(lastRead > 0);
  let prev: Message | undefined;
  let prevDay = '';
  for (const m of messages) {
    const day = dayKey(m.ts);
    const newDay = day !== prevDay;
    if (newDay) rows.push({ kind: 'day', key: day, ts: m.ts });
    let afterDivider = false;
    if (!unreadPlaced && m.ts > lastRead && m.ts <= newestAtOpen && m.userId !== me) {
      rows.push({ kind: 'unread', key: 'unread' });
      unreadPlaced = afterDivider = true;
    }
    // The divider starts a fresh run, so the first unread message shows its author.
    const compact = !newDay && !afterDivider && !!prev && !prev.system && !m.system && prev.userId === m.userId && m.ts - prev.ts < COMPACT_GAP;
    rows.push({ kind: 'msg', key: m.id, m, compact });
    prev = m;
    prevDay = day;
  }
  return rows;
}
