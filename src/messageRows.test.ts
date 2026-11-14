import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows } from './messageRows.ts';
import type { Message } from './types.ts';
const m = (id: string, userId: string, ts: number, over: Partial<Message> = {}): Message => ({ id, channelId: 'c', userId, text: id, ts, reactions: {}, ...over });
const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);

test('day row first, compact within 5 minutes by same author', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 60_000), m('c', 'u2', T0 + 120_000)], 0, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'msg', 'msg']);
  assert.equal((rows[1] as { compact: boolean }).compact, false);
  assert.equal((rows[2] as { compact: boolean }).compact, true);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('new day inserts a day row and breaks compacting', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 86_400_000)], 0, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'day', 'msg']);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('system message is never compact and breaks the run', () => {
  const rows = buildRows([m('a', 'u1', T0), m('s', 'u1', T0 + 1000, { system: true }), m('b', 'u1', T0 + 2000)], 0, 'me');
  assert.equal((rows[2] as { compact: boolean }).compact, false);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('unread row sits before the first message newer than lastRead that is not mine', () => {
  const rows = buildRows([m('a', 'u1', T0), m('mine', 'me', T0 + 1000), m('b', 'u1', T0 + 2000)], T0 + 500, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'msg', 'unread', 'msg']);
});
test('no unread row when lastRead is 0 or everything is read', () => {
  assert.equal(buildRows([m('a', 'u1', T0)], 0, 'me').some((r) => r.kind === 'unread'), false);
  assert.equal(buildRows([m('a', 'u1', T0)], T0 + 1, 'me').some((r) => r.kind === 'unread'), false);
});
test('keys are stable and unique', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 86_400_000)], 0, 'me');
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});
test('the first unread message is never compact', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u1', T0 + 1000)], T0 + 500, 'me');
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'unread', 'msg']);
  assert.equal((rows[3] as { compact: boolean }).compact, false);
});
test('a message arriving after the channel opened gets no divider', () => {
  const rows = buildRows([m('a', 'u1', T0), m('live', 'u2', T0 + 2000)], T0 + 500, 'me', T0);
  assert.equal(rows.some((r) => r.kind === 'unread'), false);
});
test('the divider stays before the first unread message present at open when more arrive', () => {
  const rows = buildRows([m('a', 'u1', T0), m('b', 'u2', T0 + 1000), m('live', 'u3', T0 + 2000)], T0 + 500, 'me', T0 + 1000);
  assert.deepEqual(rows.map((r) => r.kind), ['day', 'msg', 'unread', 'msg', 'msg']);
});
