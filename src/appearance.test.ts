import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSide, firstLook, SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, THEMES } from './appearance.ts';

test('the sidebar width is clamped, and junk falls back to the default', () => {
  assert.equal(clampSide(300), 300);
  assert.equal(clampSide(10), SIDE_MIN);
  assert.equal(clampSide(9999), SIDE_MAX);
  assert.equal(clampSide(Number('abc')), SIDE_DEFAULT);
  assert.equal(clampSide(0), SIDE_DEFAULT);
  assert.equal(clampSide(Number(null)), SIDE_DEFAULT);
});

test('a browser that never picked a look starts on Notion, white or black by system setting', () => {
  assert.deepEqual(firstLook(false, false), { theme: 'notion', bg: 'none', accent: '' });
  assert.deepEqual(firstLook(false, true), { theme: 'notion-dark', bg: 'none', accent: '' });
});

test('once a look is recorded, nothing is overridden again', () => {
  assert.equal(firstLook(true, false), null);
  assert.equal(firstLook(true, true), null);
});

test('the Notion themes are selectable and every older theme id stays valid', () => {
  const ids = THEMES.map((t) => t.id);
  for (const id of ['notion', 'notion-dark', 'minimal', 'minimal-dark', 'plum', 'moonlight', 'chrome', 'overcast', 'meadow', 'midnight']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
});
