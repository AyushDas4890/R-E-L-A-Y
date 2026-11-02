// Pure helpers for emailing people who are away: who qualifies, batching, and the email text.
// No I/O so they can be unit-tested in isolation.
import type { Channel, Message, User, UserGroup, UserPrefs } from '../src/types.ts';
import { mentionsUser, plainText } from '../src/premium.ts';

export interface Pending {
  channelId: string;
  messageId: string;
  ts: number;
}

// Wait a little so a burst becomes one email, and so coming back online cancels it.
export const EMAIL_DELAY_MS = 2 * 60_000;
// At most one email per person in this window, however busy the workspace is.
export const EMAIL_MIN_GAP_MS = 15 * 60_000;
const MAX_PENDING = 50;

// Everyone this message is "for": the other side of a DM, or the people it mentions. Only people
// who can see the channel, so a mention can never carry a private message to an outsider.
export function recipients(m: Message, ch: Channel, users: Record<string, User>, groups: UserGroup[], canSee: (ch: Channel, userId: string) => boolean): string[] {
  if (m.system) return [];
  const mentions = m.text.includes('<@') || m.text.includes('<!g:');
  if (ch.kind !== 'dm' && !mentions) return [];
  const pool = ch.kind === 'dm' ? ch.members : Object.keys(users);
  return pool.filter((id) => {
    const u = users[id];
    return !!u && id !== m.userId && !u.bot && !u.inactive && canSee(ch, id) && (ch.kind === 'dm' || mentionsUser(m.text, id, groups));
  });
}

// Their own settings win: no address, email switched off, a muted channel, or Do Not Disturb all stop it.
export function mayEmail(user: User | undefined, prefs: UserPrefs, channelId: string, now: number): boolean {
  return !!user?.email && !user.inactive && prefs.email && prefs.levels[channelId] !== 'mute' && prefs.dndUntil <= now;
}

export type Outbox = Map<string, { dueAt: number; items: Pending[] }>;

export function enqueue(box: Outbox, userId: string, item: Pending, now: number, delay = EMAIL_DELAY_MS): void {
  const entry = box.get(userId);
  if (!entry) box.set(userId, { dueAt: now + delay, items: [item] });
  else if (entry.items.length < MAX_PENDING) entry.items.push(item);
}

// Removes and returns what is due. Someone emailed recently keeps waiting until the gap has passed.
export function takeDue(box: Outbox, lastSent: Map<string, number>, now: number, gap = EMAIL_MIN_GAP_MS): [string, Pending[]][] {
  const due: [string, Pending[]][] = [];
  for (const [userId, entry] of box) {
    if (entry.dueAt > now) continue;
    const next = (lastSent.get(userId) ?? -Infinity) + gap;
    if (next > now) {
      entry.dueAt = next;
      continue;
    }
    box.delete(userId);
    due.push([userId, entry.items]);
  }
  return due;
}

export interface DigestLine {
  from: string;
  channelName: string;
  dm: boolean;
  text: string;
  hasFile: boolean;
}

// Names are other people's input: keep them to one line so they can't add headers or fake lines.
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim();

export function digestLine(m: Message, ch: Channel, users: Record<string, User>): DigestLine {
  return {
    from: oneLine(users[m.userId]?.name ?? 'Someone'),
    channelName: oneLine(ch.name),
    dm: ch.kind === 'dm',
    text: plainText(m.text, users).slice(0, 160),
    hasFile: !!m.files?.length,
  };
}

export function digest(lines: DigestLine[], workspaceName: string, link?: string): { subject: string; text: string } {
  const ws = oneLine(workspaceName);
  const one = lines[0];
  const subject =
    lines.length === 1
      ? one.dm ? `${one.from} sent you a message in ${ws}` : `${one.from} mentioned you in #${one.channelName}`
      : `${lines.length} new messages for you in ${ws}`;
  const body = lines.map((l) => `- ${l.from} ${l.dm ? '(direct message)' : `in #${l.channelName}`}: ${l.text || (l.hasFile ? 'shared a file' : '')}`);
  return {
    subject,
    text: [
      `While you were away in ${ws}:`,
      '',
      ...body,
      '',
      ...(link ? [`Open Relay: ${link}`, ''] : []),
      'You get these emails when you are offline and someone mentions you or sends you a direct message.',
      'Turn them off any time in Profile & preferences.',
    ].join('\n'),
  };
}
