import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSide, firstLook, readDensity, resolveTheme, SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, THEMES } from './appearance.ts';

test('the sidebar width is clamped, and junk falls back to the default', () => {
  assert.equal(clampSide(300), 300);
  assert.equal(clampSide(10), SIDE_MIN);
  assert.equal(clampSide(9999), SIDE_MAX);
  assert.equal(clampSide(Number('abc')), SIDE_DEFAULT);
  assert.equal(clampSide(0), SIDE_DEFAULT);
  assert.equal(clampSide(Number(null)), SIDE_DEFAULT);
});

test('a browser that never picked a look starts on the System theme, whatever the system setting', () => {
  assert.deepEqual(firstLook(false, false), { theme: 'system', bg: 'none', accent: '' });
  assert.deepEqual(firstLook(false, true), { theme: 'system', bg: 'none', accent: '' });
});

test('the System theme resolves to Aurora in dark mode and Daylight in light mode', () => {
  assert.equal(resolveTheme('system', true), 'aurora');
  assert.equal(resolveTheme('system', false), 'daylight');
});

test('a concrete theme resolves to itself, whatever the system setting', () => {
  assert.equal(resolveTheme('midnight', true), 'midnight');
  assert.equal(resolveTheme('midnight', false), 'midnight');
});

test('System is offered in the theme list', () => {
  assert.ok(THEMES.some((t) => t.id === 'system'));
});

test('once a look is recorded, nothing is overridden again', () => {
  assert.equal(firstLook(true, false), null);
  assert.equal(firstLook(true, true), null);
});

test('the Apple and Notion themes are selectable and every older theme id stays valid', () => {
  const ids = THEMES.map((t) => t.id);
  for (const id of ['apple', 'apple-dark', 'notion', 'notion-dark', 'minimal', 'minimal-dark', 'plum', 'moonlight', 'chrome', 'overcast', 'meadow', 'midnight']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('a stored density reads back, and anything missing or unknown falls back to comfortable', () => {
  assert.equal(readDensity('compact'), 'compact');
  assert.equal(readDensity('comfortable'), 'comfortable');
  assert.equal(readDensity(null), 'comfortable');
  assert.equal(readDensity(''), 'comfortable');
  assert.equal(readDensity('cozy'), 'comfortable');
  assert.equal(readDensity('COMPACT'), 'comfortable');
});
