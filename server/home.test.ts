import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, cleanHome, cleanUrl, HOME_MAX_ITEMS, removeItem, updateItem } from './home.ts';
import type { HomeItem } from '../src/types.ts';

let n = 0;
const nid = () => `id${n++}`;
const list = (r: HomeItem[] | string | null): HomeItem[] => {
  assert.ok(Array.isArray(r), String(r));
  return r;
};

test('links keep only web addresses and get a scheme when missing', () => {
  assert.equal(cleanUrl('example.com/a'), 'https://example.com/a');
  assert.equal(cleanUrl('http://example.com'), 'http://example.com/');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,hi'), '');
  assert.equal(cleanUrl(42), '');
  assert.equal(cleanUrl(''), '');
});

test('add puts the newest first and clamps fields', () => {
  const a = list(addItem([], 'note', { title: 'x'.repeat(500), text: 'hello' }, 'a', 1, nid));
  assert.equal(a[0].title.length, 120);
  const b = list(addItem(a, 'todo', { title: 'List', tasks: [{ text: 'milk', done: true }, { text: 'eggs' }] }, 'b', 2, nid));
  assert.deepEqual(b.map((i) => i.id), ['b', 'a']);
  assert.deepEqual(b[0].tasks.map((t) => [t.text, t.done]), [['milk', true], ['eggs', false]]);
  assert.equal(new Set(b[0].tasks.map((t) => t.id)).size, 2);
});

test('add refuses a bad kind, a bad task list, and a full home', () => {
  assert.equal(typeof addItem([], 'poem', {}, 'a', 1, nid), 'string');
  assert.equal(typeof addItem([], 'todo', { tasks: 'nope' }, 'a', 1, nid), 'string');
  const full = Array.from({ length: HOME_MAX_ITEMS }, (_, i) => ({ id: `i${i}`, kind: 'note', title: '', text: '', url: '', tasks: [], createdAt: 0, updatedAt: 0 }) as HomeItem);
  assert.equal(typeof addItem(full, 'note', {}, 'z', 1, nid), 'string');
});

test('update changes only the fields given and stamps the time', () => {
  const a = list(addItem([], 'link', { title: 'Docs', url: 'example.com' }, 'a', 1, nid));
  const u = list(updateItem(a, 'a', { title: 'Docs 2' }, 9, nid));
  assert.equal(u[0].title, 'Docs 2');
  assert.equal(u[0].url, 'https://example.com/');
  assert.equal(u[0].updatedAt, 9);
  assert.equal(u[0].createdAt, 1);
});

test('update ignores unknown ids and bad values', () => {
  const a = list(addItem([], 'todo', {}, 'a', 1, nid));
  assert.equal(updateItem(a, 'nope', { title: 'x' }, 2, nid), null);
  assert.equal(updateItem(a, 'a', { tasks: [1, 2] }, 2, nid), null);
  assert.equal(updateItem(a, 'a', null, 2, nid), null);
  assert.equal(updateItem(a, 7, { title: 'x' }, 2, nid), null);
});

test('remove drops one item and tolerates junk', () => {
  const a = list(addItem(list(addItem([], 'note', {}, 'a', 1, nid)), 'note', {}, 'b', 2, nid));
  assert.deepEqual(removeItem(a, 'a').map((i) => i.id), ['b']);
  assert.equal(removeItem(a, 5).length, 2);
});

test('cleanHome rebuilds a stored document and drops what does not fit', () => {
  const items = cleanHome({ items: [{ id: 'a', kind: 'note', title: 'T', text: 'x' }, { id: 'b', kind: 'weird' }, null, { id: 'c', kind: 'link', url: 'javascript:x' }] });
  assert.deepEqual(items.map((i) => i.id), ['a', 'c']);
  assert.equal(items[1].url, '');
  assert.deepEqual(cleanHome(undefined), []);
  assert.deepEqual(cleanHome({ items: 'x' }), []);
});
