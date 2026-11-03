import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptMinimal } from './appearance.ts';

test('a browser that has not adopted Minimal starts on it, white or black by system setting', () => {
  assert.deepEqual(adoptMinimal(false, false), { theme: 'minimal', bg: 'none', accent: '' });
  assert.deepEqual(adoptMinimal(false, true), { theme: 'minimal-dark', bg: 'none', accent: '' });
});

test('once adopted, nothing is overridden again', () => {
  assert.equal(adoptMinimal(true, false), null);
  assert.equal(adoptMinimal(true, true), null);
});
