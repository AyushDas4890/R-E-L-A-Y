// Pure helpers for premium features, shared by the server, the UI, and tests.
// The "AI" features here are local text heuristics, not an LLM.
import type { Analytics, Channel, Message, User, UserGroup, Workflow } from './types.ts';

const DAY = 86_400_000;
const STOPWORDS = new Set(
  'a an the and or but if of to in on at for with from by is are was were be been it its this that these those i you we they he she me my our your their them us as so not no do does did have has had will would can could should just about into than then there here what when where who why how all any some more most'.split(' '),
);

export function isAdmin(user: User | undefined): boolean {
  return user?.role === 'owner' || user?.role === 'admin';
}

export function groupTag(groupId: string): string {
  return `<!g:${groupId}>`;
}

export function mentionsUser(text: string, userId: string, groups: UserGroup[]): boolean {
  if (text.includes(`<@${userId}>`)) return true;
  return groups.some((g) => g.members.includes(userId) && text.includes(groupTag(g.id)));
}

export function canPost(ch: Channel, user: User | undefined): boolean {
  return ch.kind === 'dm' || ch.postingPolicy !== 'admins' || isAdmin(user);
}

// Information barriers block DMs and DM huddles between members of two paired groups.
export function barred(a: string, b: string, groups: UserGroup[], barriers: [string, string][]): boolean {
  const inGroup = (userId: string, groupId: string) => !!groups.find((g) => g.id === groupId)?.members.includes(userId);
  return barriers.some(
    ([g1, g2]) => (inGroup(a, g1) && inGroup(b, g2)) || (inGroup(a, g2) && inGroup(b, g1)),
  );
}

export function workflowReply(wf: Workflow, text: string): string {
  if (!wf.branch?.contains) return wf.reply;
  return text.toLowerCase().includes(wf.branch.contains.toLowerCase()) ? wf.branch.reply : wf.reply;
}

// A schedule fires once per day, within SCHEDULE_WINDOW_MIN minutes after its time, so a server
// restart long after the time does not replay a missed run. Returns the day key to dedupe on.
const SCHEDULE_WINDOW_MIN = 5;
export function scheduleDue(trigger: Extract<Workflow['trigger'], { type: 'schedule' }>, now: Date): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(trigger.time);
  if (!m) return null;
  // With a tzOffset, read the clock in the publisher's zone; without one, in the server's.
  const z = typeof trigger.tzOffset === 'number' ? new Date(now.getTime() - trigger.tzOffset * 60_000) : null;
  const day = z ? z.getUTCDay() : now.getDay();
  const hours = z ? z.getUTCHours() : now.getHours();
  const minutes = z ? z.getUTCMinutes() : now.getMinutes();
  if (trigger.weekdaysOnly && (day === 0 || day === 6)) return null;
  const elapsed = hours * 60 + minutes - (Number(m[1]) * 60 + Number(m[2]));
  if (elapsed < 0 || elapsed >= SCHEDULE_WINDOW_MIN) return null;
  return z ? `${z.getUTCFullYear()}-${z.getUTCMonth() + 1}-${z.getUTCDate()}` : `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// {user} becomes a mention of whoever triggered the workflow; {channel} the channel's name.
export function fillWorkflow(text: string, vars: { userId?: string; channel?: string }): string {
  return text
    .replace(/\{user\}/gi, vars.userId ? `<@${vars.userId}>` : 'there')
    .replace(/\{channel\}/gi, vars.channel ? `#${vars.channel}` : 'this channel');
}

export function pruneRetention(messages: Message[], retentionDays: number, legalHolds: string[], now: number) {
  if (retentionDays <= 0) return { kept: messages, removed: 0 };
  const cutoff = now - retentionDays * DAY;
  const kept = messages.filter((m) => m.ts >= cutoff || legalHolds.includes(m.userId));
  return { kept, removed: messages.length - kept.length };
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/<[@!][^>]+>|https?:\/\/\S+/g, ' ').match(/[a-z][a-z0-9'-]{2,}/g) ?? [];
}

export function summarizeText(text: string, maxSentences = 3): string {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
  if (sentences.length === 0) return text.trim().slice(0, 280) || 'The file is empty.';
  const freq = new Map<string, number>();
  for (const w of words(text)) if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sentences.map((s, i) => {
    const ws = words(s).filter((w) => !STOPWORDS.has(w));
    const score = ws.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.max(ws.length, 1);
    return { s: s.trim(), i, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => `• ${x.s.slice(0, 240)}`)
    .join('\n');
}

export function explainTerm(term: string, messages: Message[], users: Record<string, User>): string {
  const needle = term.trim().toLowerCase();
  if (!needle) return 'Usage: /explain <term>';
  const hits = messages.filter((m) => !m.system && m.text.toLowerCase().includes(needle));
  if (hits.length === 0) return `Nobody has mentioned "${term}" in channels you can see.`;
  const definition = hits.find((m) =>
    new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(is|means|stands for|=|-)\\s`, 'i').test(m.text),
  );
  const people = [...new Set(hits.map((m) => users[m.userId]?.name ?? 'someone'))].slice(0, 4);
  const best = definition ?? hits[hits.length - 1];
  return `**${term}** — mentioned ${hits.length}× by ${people.join(', ')}.\n> ${best.text.slice(0, 240)}\n_${definition ? 'Looks like a definition' : 'Most recent mention'} from ${users[best.userId]?.name ?? 'someone'}._`;
}

export function searchAnswer(question: string, messages: Message[]): Message | null {
  const terms = words(question).filter((w) => !STOPWORDS.has(w));
  if (terms.length === 0) return null;
  let best: { m: Message; score: number } | null = null;
  for (const m of messages) {
    if (m.system) continue;
    const ws = new Set(words(m.text));
    const score = terms.filter((t) => ws.has(t)).length;
    if (score > 0 && (!best || score > best.score || (score === best.score && m.ts > best.m.ts))) best = { m, score };
  }
  return best && best.score >= Math.min(2, terms.length) ? best.m : null;
}

export const BOT_HELP =
  'Here’s what I can do:\n• `/remind me <what> in 10m` or `/remind #channel <what> in 2h` sets a reminder\n• `/summarize` recaps this channel or thread, `/recap` DMs you a daily recap\n• `/explain <term>` finds where your team defined it\n• `/huddle` starts a call, `/topic <text>` sets the topic\n• Ask me a question here and I’ll look through your messages for the answer. Press Ctrl+K to search everything.';

const TOPIC_ANSWERS: [RegExp, string][] = [
  [/huddle|call|voice|meet/i, 'Hit Huddle in any channel, or type /huddle. When it ends I post the notes back to the channel.'],
  [/canvas|doc/i, 'Every channel has a canvas for docs right beside the chat. Edits sync live.'],
  [/remind|schedule|later/i, 'Try /remind me stretch in 10m, or /remind #channel ship notes in 2h.'],
  [/workflow|automat/i, 'Workflow Builder can welcome new members, answer keywords and branch on conditions.'],
  [/price|cost|free|paid|plan/i, 'Everything is unlocked. No seat limits, no paywalls.'],
];

// What Relay Bot says when someone talks to it (in its DM, or by @mentioning it).
// `messages` should only hold what the asker can see, without the bot's own posts.
export function botReply(text: string, messages: Message[], users: Record<string, User>, botId: string): string {
  const q = text.replace(new RegExp(`<@${botId}>`, 'g'), '').trim();
  if (/^(help|what can you do\??|commands)\??$/i.test(q) || /\bwhat can you do\b/i.test(q)) return BOT_HELP;
  if (/^(hi|hey|hello|yo|hiya)\b[\s!.?]*$/i.test(q)) return 'Hey! Ask me a question about your workspace, or say "help" to see what I can do.';
  if (/\b(who are you|what are you)\b/i.test(q)) return 'I’m Relay Bot. I recap channels, run reminders and workflows, and answer questions from your messages.';
  const topic = TOPIC_ANSWERS.find(([re]) => re.test(q));
  // A question gets searched in messages first; a plain statement about a feature gets the canned answer.
  if (topic && !/\?\s*$/.test(q)) return topic[1];
  const hit = searchAnswer(q, messages);
  if (hit) {
    const who = users[hit.userId]?.name ?? 'someone';
    return `**${who}** said:\n> ${plainText(hit.text, users).slice(0, 240)}\n_The closest match in channels you can see._`;
  }
  if (topic) return topic[1];
  return 'I couldn’t find that in channels you can see. Try /explain <term>, /summarize or /recap, or say "help".';
}

export function dailyRecap(
  messages: Message[],
  channels: Record<string, Channel>,
  users: Record<string, User>,
  since: number,
  botId: string,
): string {
  const recent = messages.filter((m) => m.ts >= since && !m.system && m.userId !== botId && channels[m.channelId]?.kind !== 'dm');
  if (recent.length === 0) return '**Daily recap** — quiet day, nothing new in your channels.';
  const byChannel = new Map<string, Message[]>();
  for (const m of recent) byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m]);
  const lines = [...byChannel.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([cid, msgs]) => {
      const people = [...new Set(msgs.map((m) => users[m.userId]?.name ?? 'someone'))];
      const top = msgs.reduce((a, b) => (Object.keys(b.reactions).length > Object.keys(a.reactions).length ? b : a));
      return `• **#${channels[cid].name}** — ${msgs.length} messages from ${people.slice(0, 3).join(', ')}. Highlight: ${top.text.slice(0, 90)}`;
    });
  return `**Daily recap** — ${recent.length} messages across ${byChannel.size} channels.\n${lines.join('\n')}`;
}

export function huddleNote(
  channelId: string,
  startedAt: number,
  endedAt: number,
  participants: string[],
  messages: Message[],
  users: Record<string, User>,
): string {
  const mins = Math.max(1, Math.round((endedAt - startedAt) / 60_000));
  const during = messages.filter((m) => m.channelId === channelId && m.ts >= startedAt && m.ts <= endedAt && !m.system);
  const actions = during.filter((m) => /\b(todo|action|will|follow up|next step)\b/i.test(m.text));
  const names = participants.map((id) => users[id]?.name ?? 'someone').join(', ');
  const parts = [`**Huddle notes** — ${mins} min with ${names}.`];
  if (during.length) parts.push(`${during.length} messages shared during the huddle.`);
  if (actions.length) parts.push(`Action items:\n${actions.map((m) => `• ${users[m.userId]?.name ?? 'someone'}: ${m.text.slice(0, 120)}`).join('\n')}`);
  return parts.join('\n');
}

export function computeAnalytics(
  messages: Message[],
  channels: Record<string, Channel>,
  users: Record<string, User>,
  now: number,
): Analytics {
  const real = messages.filter((m) => !m.system && !users[m.userId]?.bot);
  const days: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * DAY);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + DAY;
    days.push({
      day: start.toISOString().slice(5, 10),
      count: real.filter((m) => m.ts >= start.getTime() && m.ts < end).length,
    });
  }
  const tally = (key: (m: Message) => string) => {
    const counts = new Map<string, number>();
    for (const m of real) counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  return {
    totalMessages: real.length,
    activeUsers7d: new Set(real.filter((m) => m.ts >= now - 7 * DAY).map((m) => m.userId)).size,
    messagesByDay: days,
    topChannels: tally((m) => m.channelId).map(([channelId, count]) => ({
      channelId,
      name: channels[channelId]?.kind === 'dm' ? 'direct messages' : channels[channelId]?.name ?? 'deleted',
      count,
    })),
    topPosters: tally((m) => m.userId).map(([userId, count]) => ({ userId, name: users[userId]?.name ?? 'unknown', count })),
    filesShared: real.reduce((a, m) => a + (m.files?.length ?? 0), 0),
    reactions: real.reduce((a, m) => a + Object.values(m.reactions).reduce((x, ids) => x + ids.length, 0), 0),
  };
}

export const WORKFLOW_TEMPLATES: Omit<Workflow, 'id'>[] = [
  {
    name: 'Standup check-in',
    enabled: true,
    trigger: { type: 'keyword', keyword: '!standup', channelId: 'any' },
    reply: 'Standup time: what did you do yesterday, what are you doing today, anything blocking you?',
  },
  {
    name: 'Daily standup (weekdays 9:30)',
    enabled: true,
    trigger: { type: 'schedule', channelId: 'general', time: '09:30', weekdaysOnly: true },
    reply: 'Standup time! Reply in this thread: what did you do yesterday, what are you doing today, anything blocking you?',
  },
  {
    name: 'Incident triage',
    enabled: true,
    trigger: { type: 'keyword', keyword: '!incident', channelId: 'any' },
    reply: 'Incident logged. Post impact, start time, and owner in this thread.',
    branch: { contains: 'sev1', reply: 'SEV1 declared. Page the on-call now and open a huddle in this channel.' },
  },
  {
    name: 'IT help desk',
    enabled: true,
    trigger: { type: 'keyword', keyword: '!it', channelId: 'any' },
    reply: 'Thanks — IT will pick this up. Include your device and what you tried.',
    branch: { contains: 'password', reply: 'For password resets, use the self-service portal, then reply here if it fails.' },
  },
  {
    name: 'Celebrate wins',
    enabled: true,
    trigger: { type: 'keyword', keyword: '!win', channelId: 'any' },
    reply: 'Nice work. Logged to the wins board.',
  },
];

// Alerts can't render formatting, so turn message markup into plain readable text.
export function plainText(text: string, users: Record<string, { name: string }>): string {
  return text
    .replace(/<@([^>]+)>/g, (_, id: string) => `@${users[id]?.name ?? 'someone'}`)
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Only marks at word edges, so snake_case_names survive.
    .replace(/(^|\W)(\*\*|__|~~|\*|_)(\S(?:[\s\S]*?\S)?)\2(?=\W|$)/g, '$1$3')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
