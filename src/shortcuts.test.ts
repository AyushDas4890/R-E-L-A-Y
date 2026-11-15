import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextChannel } from './shortcuts.ts';

const ids = ['general', 'random', 'design', 'dm-a-b'];

test('next and previous channel follow the given order', () => {
  assert.equal(nextChannel(ids, 'random', 1, false, {}), 'design');
  assert.equal(nextChannel(ids, 'random', -1, false, {}), 'general');
});

test('moving past either end wraps around', () => {
  assert.equal(nextChannel(ids, 'dm-a-b', 1, false, {}), 'general');
  assert.equal(nextChannel(ids, 'general', -1, false, {}), 'dm-a-b');
});

test('a current channel missing from the list starts from the matching end', () => {
  assert.equal(nextChannel(ids, 'elsewhere', 1, false, {}), 'general');
  assert.equal(nextChannel(ids, 'elsewhere', -1, false, {}), 'dm-a-b');
});

test('unread-only skips channels with nothing unread', () => {
  const unread = { general: 0, random: 0, design: 0, 'dm-a-b': 3 };
  assert.equal(nextChannel(ids, 'general', 1, true, unread), 'dm-a-b');
  assert.equal(nextChannel(ids, 'general', -1, true, unread), 'dm-a-b');
  assert.equal(nextChannel(ids, 'random', 1, true, { general: 2 }), 'general');
});

test('returns null when there is no candidate', () => {
  assert.equal(nextChannel([], 'general', 1, false, {}), null);
  assert.equal(nextChannel(['general'], 'general', 1, false, {}), null);
  assert.equal(nextChannel(ids, 'general', 1, true, {}), null);
  assert.equal(nextChannel(ids, 'general', 1, true, { general: 4 }), null);
});
