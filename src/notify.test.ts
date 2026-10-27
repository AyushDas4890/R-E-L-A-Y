import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dndPresets, shouldNotify } from './notify.ts';
import type { Message, Snapshot } from './types.ts';

const msg = (over: Partial<Message>): Message => ({ id: 'x', channelId: 'general', userId: 'bob', text: 'hi', ts: 0, reactions: {}, ...over });
const snap = {
  me: 'me',
  groups: [],
  channels: {
    general: { id: 'general', name: 'general', kind: 'public', members: ['me', 'bob'] },
    'dm-bob-me': { id: 'dm-bob-me', name: '', kind: 'dm', members: ['me', 'bob'] },
  },
  messages: [msg({ id: 'root', userId: 'me' })],
} as unknown as Snapshot;

test('shouldNotify covers DMs, mentions and replies to your threads only', () => {
  assert.equal(shouldNotify(msg({ channelId: 'dm-bob-me' }), snap), true);
  assert.equal(shouldNotify(msg({ text: 'ping <@me>' }), snap), true);
  assert.equal(shouldNotify(msg({ threadId: 'root' }), snap), true);
  assert.equal(shouldNotify(msg({}), snap), false);
  assert.equal(shouldNotify(msg({ userId: 'me', channelId: 'dm-bob-me' }), snap), false);
  assert.equal(shouldNotify(msg({ channelId: 'dm-bob-me', system: true }), snap), false);
});

test('dndPresets ends "until tomorrow" at 9:00 the next day', () => {
  const now = new Date(2026, 9, 27, 22, 15);
  const last = dndPresets(now).at(-1)!;
  assert.equal(new Date(last.until).getDate(), 28);
  assert.equal(new Date(last.until).getHours(), 9);
  assert.equal(dndPresets(now)[0].until - now.getTime(), 30 * 60_000);
});
