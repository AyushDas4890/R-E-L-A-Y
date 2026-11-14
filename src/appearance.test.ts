import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUNDS, clampSide, firstLook, migrateTheme, readDensity, resolveTheme, SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, THEMES } from './appearance.ts';

test('the sidebar width is clamped, and junk falls back to the default', () => {
  assert.equal(clampSide(300), 300);
  assert.equal(clampSide(10), SIDE_MIN);
  assert.equal(clampSide(9999), SIDE_MAX);
  assert.equal(clampSide(Number('abc')), SIDE_DEFAULT);
  assert.equal(clampSide(0), SIDE_DEFAULT);
  assert.equal(clampSide(Number(null)), SIDE_DEFAULT);
});

test('a browser that never picked a theme starts on the System theme, whatever the system setting', () => {
  assert.deepEqual(firstLook(false), { theme: 'system', bg: 'none', accent: '' });
});

test('once a theme is stored, nothing is overridden', () => {
  assert.equal(firstLook(true), null);
});

test('the System theme resolves to Apple dark in dark mode and Apple in light mode', () => {
  assert.equal(resolveTheme('system', true), 'apple-dark');
  assert.equal(resolveTheme('system', false), 'apple');
});

test('the Apple themes resolve to themselves, whatever the system setting', () => {
  for (const dark of [true, false]) {
    assert.equal(resolveTheme('apple', dark), 'apple');
    assert.equal(resolveTheme('apple-dark', dark), 'apple-dark');
  }
});

test('anything that is not a current theme is painted as its migrated theme', () => {
  assert.equal(resolveTheme('midnight', false), 'apple-dark');
  assert.equal(resolveTheme('daylight', true), 'apple');
  assert.equal(resolveTheme('nonsense', true), 'apple-dark');
  assert.equal(resolveTheme('nonsense', false), 'apple');
});

test('only System, Apple and Apple dark are offered', () => {
  assert.deepEqual(THEMES.map((t) => t.id), ['system', 'apple', 'apple-dark']);
  assert.equal(THEMES[0].label, 'System (Apple light / dark)');
});

test('removed dark themes migrate to Apple dark', () => {
  for (const id of ['notion-dark', 'minimal-dark', 'plum', 'moonlight', 'chrome', 'midnight', 'aurora', 'sunset']) {
    assert.equal(migrateTheme(id), 'apple-dark', id);
  }
});

test('removed light themes migrate to Apple', () => {
  for (const id of ['notion', 'minimal', 'overcast', 'meadow', 'switchboard', 'daylight']) {
    assert.equal(migrateTheme(id), 'apple', id);
  }
});

test('current choices are kept, and anything unknown falls back to System', () => {
  for (const id of ['system', 'apple', 'apple-dark']) assert.equal(migrateTheme(id), id);
  assert.equal(migrateTheme(''), 'system');
  assert.equal(migrateTheme('cozy'), 'system');
});

test('the only bundled background is Plain', () => {
  assert.deepEqual(BACKGROUNDS.map((b) => b.id), ['none']);
  assert.ok(BACKGROUNDS.every((b) => !b.src));
});

test('a stored density reads back, and anything missing or unknown falls back to comfortable', () => {
  assert.equal(readDensity('compact'), 'compact');
  assert.equal(readDensity('comfortable'), 'comfortable');
  assert.equal(readDensity(null), 'comfortable');
  assert.equal(readDensity(''), 'comfortable');
  assert.equal(readDensity('cozy'), 'comfortable');
  assert.equal(readDensity('COMPACT'), 'comfortable');
});
