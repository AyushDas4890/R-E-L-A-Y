import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCursor, olderMessages, recentMessages } from './history.ts';
import type { Message } from '../src/types.ts';

const msg = (id: string, ts: number, over: Partial<Message> = {}): Message => ({ id, channelId: 'c', userId: 'u', text: id, ts, reactions: {}, ...over });
const run = (n: number, channelId = 'c') => Array.from({ length: n }, (_, i) => msg(`${channelId}${String(i).padStart(3, '0')}`, 1000 + i, { channelId }));
const ids = (ms: Message[]) => ms.map((m) => m.id);

test('join sends only the newest page per visible channel, with a cursor to go further', () => {
  const all = [...run(120, 'a'), ...run(30, 'b'), ...run(5, 'hidden')];
  const { messages, history } = recentMessages(all, new Set(['a', 'b']), new Set(), 50);
  assert.equal(messages.filter((m) => m.channelId === 'a').length, 50);
  assert.equal(messages.filter((m) => m.channelId === 'b').length, 30);
  assert.equal(messages.some((m) => m.channelId === 'hidden'), false);
  assert.deepEqual(history.a, { ts: 1070, id: 'a070' });
  assert.equal('b' in history, false);
});

test('paging walks back through the channel without gaps or repeats', () => {
  const all = run(120);
  const first = recentMessages(all, new Set(['c']), new Set(), 50);
  const seen = new Set(ids(first.messages));
  let cursor = first.history.c;
  let pages = 0;
  while (cursor) {
    const page = olderMessages(all, 'c', cursor, 50);
    for (const m of page.messages) assert.equal(seen.has(m.id), false, `repeat ${m.id}`);
    for (const m of page.messages) seen.add(m.id);
    cursor = page.cursor!;
    pages += 1;
  }
  assert.equal(pages, 2);
  assert.equal(seen.size, 120);
});

test('messages sharing a timestamp are split cleanly by id', () => {
  const all = ['a', 'b', 'c', 'd'].map((id) => msg(id, 500));
  const first = recentMessages(all, new Set(['c']), new Set(), 2);
  assert.deepEqual(ids(first.messages), ['c', 'd']);
  const page = olderMessages(all, 'c', first.history.c, 2);
  assert.deepEqual(ids(page.messages), ['a', 'b']);
  assert.equal(page.cursor, null);
});

test('a reply brings its older parent along', () => {
  const all = [msg('old', 1), ...run(60), msg('reply', 5000, { threadId: 'old' })];
  const { messages } = recentMessages(all, new Set(['c']), new Set(), 50);
  assert.ok(ids(messages).includes('old'));
  assert.ok(ids(messages).includes('reply'));
});

test('saved and pinned messages arrive even when old, only from visible channels', () => {
  const all = [msg('pinned', 1, { pinned: true }), msg('saved', 2), msg('secret', 3, { channelId: 'x', pinned: true }), ...run(60)];
  const { messages, history } = recentMessages(all, new Set(['c']), new Set(['saved', 'secret']), 50);
  assert.ok(ids(messages).includes('pinned') && ids(messages).includes('saved'));
  assert.equal(ids(messages).includes('secret'), false);
  // the cursor still marks the contiguous window, not the old extras
  assert.equal(history.c.id, 'c010');
});

test('a channel with nothing in it is fine', () => {
  assert.deepEqual(recentMessages([], new Set(['c']), new Set()), { messages: [], history: {} });
  assert.deepEqual(olderMessages([], 'c', { ts: 1, id: 'x' }), { messages: [], cursor: null });
});

test('isCursor rejects anything but { ts, id }', () => {
  assert.equal(isCursor({ ts: 1, id: 'a' }), true);
  for (const bad of [null, 5, {}, { ts: '1', id: 'a' }, { ts: NaN, id: 'a' }, { ts: 1, id: '' }, { ts: 1, id: 'x'.repeat(65) }]) assert.equal(isCursor(bad), false);
});
