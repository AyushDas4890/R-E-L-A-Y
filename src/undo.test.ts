import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyApplied, applyOps, type PageBody } from '../server/pages.ts';
import { History } from './undo.ts';
import type { Block, BlockOp } from './types.ts';

const blk = (id: string, text = '', extra: Partial<Block> = {}): Block => ({ id, type: 'text', text: text ? [{ t: text }] : [], children: [], rev: 1, ...extra });
const body = (blocks: Block[]): PageBody => ({ id: 'p', version: 0, blocks });
const texts = (b: PageBody): string[] => b.blocks.map((x) => `${x.id}:${x.text.map((r) => r.t).join('')}`);

// Apply an edit the way the page does: remember its opposite first.
function edit(h: History, b: PageBody, ops: BlockOp[], now = 0): void {
  h.record(b.blocks, ops, now);
  applyOps(b, ops);
}
function undo(h: History, b: PageBody): boolean {
  const ops = h.takeUndo(b.blocks, 0);
  if (!ops) return false;
  applyOps(b, ops);
  return true;
}
function redo(h: History, b: PageBody): boolean {
  const ops = h.takeRedo(b.blocks, 0);
  if (!ops) return false;
  applyOps(b, ops);
  return true;
}

test('undo and redo of an insert', () => {
  const b = body([blk('a', 'one')]);
  const h = new History();
  edit(h, b, [{ op: 'insert', parent: null, after: 'a', block: blk('b', 'two') }]);
  assert.deepEqual(texts(b), ['a:one', 'b:two']);
  undo(h, b);
  assert.deepEqual(texts(b), ['a:one']);
  redo(h, b);
  assert.deepEqual(texts(b), ['a:one', 'b:two']);
});

test('undoing a delete brings back the block with its children in the same place', () => {
  const b = body([blk('a', 'one'), blk('b', 'two', { children: [blk('c', 'kid')] }), blk('d', 'three')]);
  const h = new History();
  edit(h, b, [{ op: 'remove', id: 'b' }]);
  assert.deepEqual(texts(b), ['a:one', 'd:three']);
  undo(h, b);
  assert.deepEqual(texts(b), ['a:one', 'b:two', 'd:three']);
  assert.equal(b.blocks[1].children[0].id, 'c');
});

test('undoing a move puts the block back', () => {
  const b = body([blk('a'), blk('b'), blk('c')]);
  const h = new History();
  edit(h, b, [{ op: 'move', id: 'c', parent: null, after: null }]);
  assert.deepEqual(b.blocks.map((x) => x.id), ['c', 'a', 'b']);
  undo(h, b);
  assert.deepEqual(b.blocks.map((x) => x.id), ['a', 'b', 'c']);
});

test('typing in one block within a second is one undo step; a pause or another block starts a new one', () => {
  const b = body([blk('a', 'x'), blk('b', 'y')]);
  const h = new History();
  const typeIn = (id: string, text: string, now: number) => {
    const blockNow = b.blocks.find((k) => k.id === id)!;
    edit(h, b, [{ op: 'update', id, patch: { text: [{ t: text }] }, baseRev: blockNow.rev }], now);
  };
  typeIn('a', 'xa', 0);
  typeIn('a', 'xab', 300);
  typeIn('a', 'xabc', 600);
  typeIn('b', 'yz', 700);
  assert.equal(h.undo.length, 2);
  undo(h, b);
  assert.deepEqual(texts(b), ['a:xabc', 'b:y']);
  undo(h, b);
  assert.deepEqual(texts(b), ['a:x', 'b:y']);
  redo(h, b);
  assert.deepEqual(texts(b), ['a:xabc', 'b:y']);
});

test('a batch is undone as a whole, in reverse', () => {
  const b = body([blk('a', 'one')]);
  const h = new History();
  edit(h, b, [
    { op: 'update', id: 'a', patch: { text: [{ t: 'ONE' }], type: 'h1' }, baseRev: 1 },
    { op: 'insert', parent: null, after: 'a', block: blk('b', 'new') },
  ]);
  undo(h, b);
  assert.deepEqual(texts(b), ['a:one']);
  assert.equal(b.blocks[0].type, 'text');
});

test('a new edit clears redo; undo skips blocks someone else deleted; an empty history does nothing', () => {
  const b = body([blk('a', 'one'), blk('b', 'two')]);
  const h = new History();
  assert.equal(undo(h, b), false);
  edit(h, b, [{ op: 'update', id: 'b', patch: { type: 'h2' }, baseRev: 1 }]);
  undo(h, b);
  assert.equal(h.redo.length, 1);
  edit(h, b, [{ op: 'update', id: 'a', patch: { checked: true }, baseRev: 1 }]);
  assert.equal(h.redo.length, 0);
  // someone removes b, then I undo my earlier steps
  applyApplied(b, { op: 'remove', id: 'a' });
  assert.equal(undo(h, b), false);
});
