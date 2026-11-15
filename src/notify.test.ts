import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dndPresets, legacyPrefs, plainText, shouldNotify } from './notify.ts';
import type { Message, Snapshot } from './types.ts';

const msg = (over: Partial<Message>): Message => ({ id: 'x', channelId: 'general', userId: 'bob', text: 'hi', ts: 0, reactions: {}, ...over });
const snap = {
  me: 'me',
  groups: [],
  channels: {
    general: { id: 'general', name: 'general', kind: 'public', members: ['me', 'bob'] },
    'dm-bob-me': { id: 'dm-bob-me', name: '', kind: 'dm', members: ['me', 'bob'] },
  },
  workspace: { id: 'w1', name: 'W', plan: '', color: '#000' },
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

test('plainText drops formatting marks and names mentions', () => {
  const users = { bob: { name: 'Bob' } } as unknown as Snapshot['users'];
  assert.equal(plainText('**Daily recap** — see `#general`\n• _soon_ <@bob> ~~old~~', users), 'Daily recap — see #general • soon @Bob old');
  assert.equal(plainText('> quoted\nsnake_case_name stays', users), 'quoted snake_case_name stays');
});

test('shouldNotify respects per-channel levels', () => {
  assert.equal(shouldNotify(msg({}), snap, 'all'), true);
  assert.equal(shouldNotify(msg({ text: 'ping <@me>' }), snap, 'mute'), false);
  assert.equal(shouldNotify(msg({ channelId: 'dm-bob-me' }), snap, 'mute'), false);
});

test('legacyPrefs maps the old browser keys to one workspace', () => {
  const lastRead = JSON.stringify({ general: 10, 'w1/general': 20, 'w2/general': 30 });
  const levels = JSON.stringify({ general: 'mute', bad: 5 });
  assert.deepEqual(legacyPrefs('hq', { lastRead, levels, dndUntil: '99' }), { lastRead: { general: 10 }, levels: { general: 'mute' }, dndUntil: 99 });
  assert.deepEqual(legacyPrefs('w1', { lastRead, levels: null, dndUntil: null }), { lastRead: { general: 20 }, levels: {}, dndUntil: 0 });
  assert.deepEqual(legacyPrefs('w1', { lastRead: '{oops', levels: '[1]', dndUntil: 'x' }), { lastRead: {}, levels: {}, dndUntil: 0 });
});
