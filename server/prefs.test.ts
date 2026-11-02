import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPrefs, emptyPrefs, mergeImport, visiblePrefs, withDnd, withEmail, withLevel, withRead } from './prefs.ts';

const NOW = 1_000_000;
const anyChannel = () => true;

test('cleanPrefs fills defaults and drops junk', () => {
  assert.deepEqual(cleanPrefs(undefined), emptyPrefs());
  const p = cleanPrefs({ lastRead: { a: 5, b: 'x' }, levels: { a: 'mute', b: 'loud', c: 'mentions' }, dndUntil: 'soon' });
  assert.deepEqual(p, { lastRead: { a: 5 }, levels: { a: 'mute' }, dndUntil: 0, email: true });
});

test('withRead only moves forward', () => {
  const p = withRead(emptyPrefs(), 'a', 100);
  assert.equal(withRead(p, 'a', 50).lastRead.a, 100);
  assert.equal(withRead(p, 'a', 200).lastRead.a, 200);
});

test('withLevel validates and stores the default as no entry', () => {
  const muted = withLevel(emptyPrefs(), 'a', 'mute')!;
  assert.equal(muted.levels.a, 'mute');
  assert.deepEqual(withLevel(muted, 'a', 'mentions')!.levels, {});
  assert.equal(withLevel(muted, 'a', 'loud'), null);
  assert.equal(withLevel(muted, 'a', 7), null);
});

test('withDnd rejects non-numbers, clears past times and caps far ones', () => {
  assert.equal(withDnd(emptyPrefs(), 'x', NOW), null);
  assert.equal(withDnd(emptyPrefs(), NaN, NOW), null);
  assert.equal(withDnd({ ...emptyPrefs(), dndUntil: NOW + 5 }, NOW - 1, NOW)!.dndUntil, 0);
  assert.equal(withDnd(emptyPrefs(), NOW + 60_000, NOW)!.dndUntil, NOW + 60_000);
  assert.equal(withDnd(emptyPrefs(), NOW + 1e15, NOW)!.dndUntil, NOW + 30 * 24 * 3_600_000);
});

test('mergeImport fills gaps and never overrides newer server state', () => {
  const server = { ...emptyPrefs(), lastRead: { a: 900 }, levels: { a: 'mute' as const } };
  const merged = mergeImport(server, { lastRead: { a: 100, b: 500 }, levels: { a: 'all', b: 'mute' }, dndUntil: NOW + 1000 }, anyChannel, NOW);
  assert.equal(merged.lastRead.a, 900);
  assert.equal(merged.lastRead.b, 500);
  assert.equal(merged.levels.a, 'mute');
  assert.equal(merged.levels.b, 'mute');
  assert.equal(merged.dndUntil, NOW + 1000);
  assert.equal(mergeImport({ ...server, dndUntil: NOW + 50 }, { dndUntil: NOW + 9999 }, anyChannel, NOW).dndUntil, NOW + 50);
});

test('mergeImport ignores unknown channels, future read times and bad input', () => {
  const merged = mergeImport(emptyPrefs(), { lastRead: { gone: 5, a: NOW * 10, z: -1 }, levels: { gone: 'mute' } }, (id) => id === 'a', NOW);
  assert.deepEqual(merged, { lastRead: { a: NOW }, levels: {}, dndUntil: 0, email: true });
  assert.deepEqual(mergeImport(emptyPrefs(), 'nope', anyChannel, NOW), emptyPrefs());
});

test('visiblePrefs drops channels the person cannot see', () => {
  const p = { lastRead: { a: 1, b: 2 }, levels: { b: 'mute' as const }, dndUntil: 9, email: false };
  assert.deepEqual(visiblePrefs(p, (id) => id === 'a'), { lastRead: { a: 1 }, levels: {}, dndUntil: 9, email: false });
});

test('withEmail takes only a boolean, and cleanPrefs defaults to on', () => {
  assert.equal(withEmail(emptyPrefs(), false)!.email, false);
  assert.equal(withEmail(emptyPrefs(), 'no'), null);
  assert.equal(cleanPrefs({ email: false }).email, false);
  assert.equal(cleanPrefs({}).email, true);
});
