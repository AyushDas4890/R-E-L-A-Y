import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_HELP,
  botReply,
  barred,
  canPost,
  computeAnalytics,
  explainTerm,
  fillWorkflow,
  mentionsUser,
  pruneRetention,
  scheduleDue,
  searchAnswer,
  summarizeText,
  workflowReply,
} from './premium.ts';
import type { Channel, Message, User, UserGroup, Workflow } from './types.ts';

const DAY = 86_400_000;
const user = (id: string, role: User['role'] = 'member'): User => ({ id, name: id, color: '#000', title: '', status: { emoji: '', text: '' }, role });
const msg = (id: string, userId: string, text: string, ts: number, extra: Partial<Message> = {}): Message => ({ id, channelId: 'c', userId, text, ts, reactions: {}, ...extra });
const channel = (extra: Partial<Channel> = {}): Channel => ({ id: 'c', name: 'c', topic: '', kind: 'public', members: [], createdAt: 0, ...extra });
const groups: UserGroup[] = [
  { id: 'g1', handle: 'sales', name: 'Sales', members: ['a'] },
  { id: 'g2', handle: 'legal', name: 'Legal', members: ['b'] },
];

test('admins-only channels block members but not admins or DMs', () => {
  const ch = channel({ postingPolicy: 'admins' });
  assert.equal(canPost(ch, user('a')), false);
  assert.equal(canPost(ch, user('a', 'admin')), true);
  assert.equal(canPost(channel({ kind: 'dm', postingPolicy: 'admins' }), user('a')), true);
});

test('information barriers apply in both directions', () => {
  assert.equal(barred('a', 'b', groups, [['g1', 'g2']]), true);
  assert.equal(barred('b', 'a', groups, [['g1', 'g2']]), true);
  assert.equal(barred('a', 'c', groups, [['g1', 'g2']]), false);
});

test('group mentions notify members only', () => {
  assert.equal(mentionsUser('hi <!g:g1>', 'a', groups), true);
  assert.equal(mentionsUser('hi <!g:g1>', 'b', groups), false);
  assert.equal(mentionsUser('hi <@b>', 'b', groups), true);
});

test('workflow branch overrides the reply only when its condition matches', () => {
  const wf: Workflow = {
    id: 'w', name: 'w', enabled: true,
    trigger: { type: 'keyword', keyword: '!it', channelId: 'any' },
    reply: 'default', branch: { contains: 'password', reply: 'reset it' },
  };
  assert.equal(workflowReply(wf, '!it forgot PASSWORD'), 'reset it');
  assert.equal(workflowReply(wf, '!it printer'), 'default');
});

test('schedule fires once inside its window, skips weekends when asked, and ignores stale restarts', () => {
  const t = { type: 'schedule' as const, channelId: 'general', time: '09:30', weekdaysOnly: true };
  const wed = (h: number, m: number) => new Date(2026, 9, 28, h, m); // Wednesday
  assert.equal(scheduleDue(t, wed(9, 29)), null);
  assert.equal(scheduleDue(t, wed(9, 30)), '2026-10-28');
  assert.equal(scheduleDue(t, wed(9, 34)), '2026-10-28');
  assert.equal(scheduleDue(t, wed(15, 0)), null);
  assert.equal(scheduleDue(t, new Date(2026, 9, 31, 9, 30)), null); // Saturday
  assert.equal(scheduleDue({ ...t, weekdaysOnly: false }, new Date(2026, 9, 31, 9, 30)), '2026-10-31');
  assert.equal(scheduleDue({ ...t, time: 'nope' }, wed(9, 30)), null);
});

test('retention deletes old messages but keeps those under legal hold', () => {
  const now = 100 * DAY;
  const msgs = [msg('old', 'a', 'x', now - 50 * DAY), msg('held', 'b', 'y', now - 50 * DAY), msg('new', 'a', 'z', now - DAY)];
  const { kept, removed } = pruneRetention(msgs, 30, ['b'], now);
  assert.deepEqual(kept.map((m) => m.id), ['held', 'new']);
  assert.equal(removed, 1);
  assert.equal(pruneRetention(msgs, 0, [], now).removed, 0);
});

test('summaries keep the highest-scoring sentences in original order', () => {
  const text = 'Deploys happen every Friday afternoon. Lunch is at noon. The deploy pipeline runs tests before every deploy. Cats are nice.';
  const out = summarizeText(text, 2);
  assert.match(out, /Deploys happen/);
  assert.match(out, /deploy pipeline/);
  assert.doesNotMatch(out, /Cats/);
});

test('explain prefers a definition over the latest mention', () => {
  const users = { a: user('a') };
  const out = explainTerm('SLO', [msg('1', 'a', 'SLO means service level objective', 1), msg('2', 'a', 'checking the SLO dashboard', 2)], users);
  assert.match(out, /service level objective/);
  assert.match(explainTerm('xyz', [], users), /Nobody/);
});

test('search answers need enough matching terms', () => {
  const msgs = [msg('1', 'a', 'The wifi password is on the kitchen fridge', 1), msg('2', 'a', 'Lunch order closes at 11', 2)];
  assert.equal(searchAnswer('what is the wifi password?', msgs)?.id, '1');
  assert.equal(searchAnswer('where is the parking garage?', msgs), null);
});

test('analytics ignore bots and system messages', () => {
  const users = { a: user('a'), bot: { ...user('bot'), bot: true } };
  const now = 10 * DAY;
  const out = computeAnalytics(
    [msg('1', 'a', 'hi', now - 1000, { files: [{ name: 'f', type: 't', size: 1, dataUrl: '' }], reactions: { '👍': ['a', 'b'] } }), msg('2', 'bot', 'beep', now), msg('3', 'a', 'sys', now, { system: true })],
    { c: channel() }, users, now,
  );
  assert.equal(out.totalMessages, 1);
  assert.equal(out.filesShared, 1);
  assert.equal(out.reactions, 2);
  assert.equal(out.messagesByDay.length, 14);
});

test('Relay Bot answers help, topics and questions from visible messages', () => {
  const users = { a: user('a'), relaybot: user('relaybot') };
  const msgs = [msg('1', 'a', 'the wifi password is hunter2', 1)];
  assert.equal(botReply('help', msgs, users, 'relaybot'), BOT_HELP);
  assert.equal(botReply('<@relaybot> what can you do', msgs, users, 'relaybot'), BOT_HELP);
  assert.match(botReply('how do huddles work', msgs, users, 'relaybot'), /Huddle/);
  assert.match(botReply('what is the wifi password?', msgs, users, 'relaybot'), /hunter2/);
  assert.match(botReply('where is the parking garage?', msgs, users, 'relaybot'), /couldn’t find/);
});

test('schedules read the clock in the publisher’s time zone', () => {
  // 09:30 in UTC+5:30 (offset -330) is 04:00 UTC.
  const t = { type: 'schedule' as const, channelId: 'c', time: '09:30', weekdaysOnly: false, tzOffset: -330 };
  assert.ok(scheduleDue(t, new Date(Date.UTC(2026, 0, 7, 4, 0))));
  assert.equal(scheduleDue(t, new Date(Date.UTC(2026, 0, 7, 9, 30))), null);
});

test('workflow placeholders fill in the user and channel', () => {
  assert.equal(fillWorkflow('Welcome {user} to {channel}!', { userId: 'u1', channel: 'general' }), 'Welcome <@u1> to #general!');
});
