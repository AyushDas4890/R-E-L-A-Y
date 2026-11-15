import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greeting, progress } from './home.ts';

test('greeting follows the hour and uses the first name', () => {
  assert.equal(greeting(8, 'Ann Lee'), 'Good morning, Ann');
  assert.equal(greeting(12, 'Ann'), 'Good afternoon, Ann');
  assert.equal(greeting(16, 'Ann'), 'Good afternoon, Ann');
  assert.equal(greeting(17, 'Ann'), 'Good evening, Ann');
  assert.equal(greeting(2, 'Ann'), 'Good evening, Ann');
  assert.equal(greeting(9, '  '), 'Good morning');
});

test('progress counts finished tasks', () => {
  assert.equal(progress([]), '');
  assert.equal(progress([{ done: true }, { done: false }, { done: false }]), '1 of 3 done');
});
