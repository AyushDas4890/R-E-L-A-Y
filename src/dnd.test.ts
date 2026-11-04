import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDrop, isTextFile, moveBefore, nudge, orderBy } from './dnd.ts';

test('moveBefore moves an item earlier, later and to the end', () => {
  assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'a', 'd'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveBefore(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a']);
});

test('moveBefore ignores unknown ids and drops onto itself', () => {
  assert.deepEqual(moveBefore(['a', 'b'], 'x', 'a'), ['a', 'b']);
  assert.deepEqual(moveBefore(['a', 'b'], 'a', 'x'), ['a', 'b']);
  assert.deepEqual(moveBefore(['a', 'b'], 'a', 'a'), ['a', 'b']);
});

test('nudge swaps with the neighbour and stops at the ends', () => {
  assert.deepEqual(nudge(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(nudge(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(nudge(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(nudge(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
});

test('orderBy follows the saved order and keeps unknown items at the end in their own order', () => {
  const ws = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(orderBy(ws, (w) => w.id, ['c', 'a']).map((w) => w.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(orderBy(ws, (w) => w.id, []).map((w) => w.id), ['a', 'b', 'c', 'd']);
});

const none = { uri: '', text: '', files: [] as File[] };

test('classifyDrop turns a dragged link into a link item titled by its host', () => {
  assert.deepEqual(classifyDrop({ ...none, uri: '# comment\r\nhttps://www.example.com/a?b=1' }), [{ kind: 'link', url: 'https://www.example.com/a?b=1', title: 'example.com' }]);
  const r = classifyDrop({ ...none, text: ' https://example.org ' });
  assert.equal(r[0].kind, 'link');
});

test('classifyDrop turns other text into a note titled by its first line', () => {
  assert.deepEqual(classifyDrop({ ...none, text: 'Buy milk\nand eggs' }), [{ kind: 'text', title: 'Buy milk', text: 'Buy milk\nand eggs' }]);
});

test('classifyDrop does not treat non-web addresses as links', () => {
  assert.equal(classifyDrop({ ...none, uri: 'javascript:alert(1)', text: 'javascript:alert(1)' })[0].kind, 'text');
});

test('classifyDrop prefers files and ignores empty drops', () => {
  const f = { name: 'a.txt', type: 'text/plain' } as File;
  assert.deepEqual(classifyDrop({ uri: 'https://x.com', text: 'x', files: [f] }), [{ kind: 'file', file: f }]);
  assert.deepEqual(classifyDrop(none), []);
});

test('isTextFile accepts text types and common text extensions only', () => {
  assert.equal(isTextFile({ name: 'x.md', type: '' }), true);
  assert.equal(isTextFile({ name: 'x', type: 'text/plain' }), true);
  assert.equal(isTextFile({ name: 'x.png', type: 'image/png' }), false);
});
