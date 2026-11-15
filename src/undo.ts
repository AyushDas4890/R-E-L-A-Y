// Undo and redo for a page, across blocks. Before an edit is applied, its opposite is worked out
// from the page as it is then; undoing applies those opposites in reverse order.
import type { Block, BlockOp, BlockPatch } from './types.ts';

interface Loc { list: Block[]; index: number; parent: Block | null }

function locate(blocks: Block[], id: string, parent: Block | null = null): Loc | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { list: blocks, index: i, parent };
    const inner = locate(blocks[i].children, id, blocks[i]);
    if (inner) return inner;
  }
  return null;
}

const KEYS: (keyof BlockPatch)[] = ['type', 'text', 'checked', 'open', 'language', 'color', 'bg', 'url', 'name', 'icon', 'pageId', 'rows', 'header'];

// The operation that undoes `op`, or null when there is nothing to undo (a replay, or a missing block).
export function inverseOf(blocks: Block[], op: BlockOp): BlockOp | null {
  if (op.op === 'insert') return locate(blocks, op.block.id) ? null : { op: 'remove', id: op.block.id };
  const at = locate(blocks, op.id);
  if (!at) return null;
  const block = at.list[at.index];
  if (op.op === 'remove') {
    return { op: 'insert', parent: at.parent?.id ?? null, after: at.index > 0 ? at.list[at.index - 1].id : null, block: structuredClone(block) };
  }
  if (op.op === 'move') {
    return { op: 'move', id: op.id, parent: at.parent?.id ?? null, after: at.index > 0 ? at.list[at.index - 1].id : null };
  }
  // update: put back what the patched fields held
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(op.patch) as (keyof BlockPatch)[]) {
    if (!KEYS.includes(k)) continue;
    before[k] = structuredClone(block[k as keyof Block]) ?? (k === 'text' ? [] : k === 'checked' || k === 'open' || k === 'header' ? false : '');
  }
  return { op: 'update', id: op.id, patch: before as BlockPatch, baseRev: block.rev };
}

export interface Entry {
  // Applied in order to undo the original edit.
  ops: BlockOp[];
  at: number;
  // Typing in one block is one step: the block, while it keeps being the same one.
  typing?: string;
}

const MERGE_MS = 1000;
const MAX = 100;

export class History {
  undo: Entry[] = [];
  redo: Entry[] = [];

  // Remember how to undo `ops`, worked out against `blocks` before they are applied.
  record(blocks: Block[], ops: BlockOp[], now: number): void {
    const inverse: BlockOp[] = [];
    // Each op is judged against the page as the earlier ones in the batch leave it.
    const scratch = structuredClone(blocks);
    for (const op of ops) {
      const inv = inverseOf(scratch, op);
      if (inv) inverse.unshift(inv);
      applyLoose(scratch, op);
    }
    if (!inverse.length) return;
    const typing = ops.length === 1 && ops[0].op === 'update' && 'text' in ops[0].patch && Object.keys(ops[0].patch).length === 1 ? ops[0].id : undefined;
    const last = this.undo[this.undo.length - 1];
    if (typing && last?.typing === typing && now - last.at < MERGE_MS) {
      // Keep the oldest text; just extend the time.
      last.at = now;
    } else {
      this.undo.push({ ops: inverse, at: now, typing });
      if (this.undo.length > MAX) this.undo.shift();
    }
    this.redo = [];
  }

  // The next step to undo, with its own opposite worked out for redo.
  takeUndo(blocks: Block[], now: number): BlockOp[] | null {
    return this.take(this.undo, this.redo, blocks, now);
  }

  takeRedo(blocks: Block[], now: number): BlockOp[] | null {
    return this.take(this.redo, this.undo, blocks, now);
  }

  private take(from: Entry[], to: Entry[], blocks: Block[], now: number): BlockOp[] | null {
    const entry = from.pop();
    if (!entry) return null;
    const back: BlockOp[] = [];
    const scratch = structuredClone(blocks);
    // Ops that no longer apply (the block is gone) are skipped.
    const ops: BlockOp[] = [];
    for (const op of entry.ops) {
      const inv = inverseOf(scratch, op);
      if (!inv) continue;
      back.unshift(inv);
      // An update must be based on the block as it is now.
      ops.push(op.op === 'update' && inv.op === 'update' ? { ...op, baseRev: currentRev(scratch, op.id) } : op);
      applyLoose(scratch, op);
    }
    if (!ops.length) return from.length ? this.take(from, to, blocks, now) : null;
    to.push({ ops: back, at: now });
    return ops;
  }
}

const currentRev = (blocks: Block[], id: string): number => locate(blocks, id)?.list[locate(blocks, id)!.index].rev ?? 0;

// A rough local application, only to judge later ops in a batch.
function applyLoose(blocks: Block[], op: BlockOp): void {
  if (op.op === 'insert') {
    const parent = op.parent ? locate(blocks, op.parent)?.list[locate(blocks, op.parent)!.index] : null;
    const list = parent ? parent.children : blocks;
    const i = op.after === null ? 0 : list.findIndex((b) => b.id === op.after) + 1;
    list.splice(i || (op.after === null ? 0 : list.length), 0, structuredClone(op.block));
  } else if (op.op === 'update') {
    const at = locate(blocks, op.id);
    if (at) Object.assign(at.list[at.index], op.patch);
  } else if (op.op === 'move') {
    const at = locate(blocks, op.id);
    if (!at) return;
    const [block] = at.list.splice(at.index, 1);
    const parent = op.parent ? locate(blocks, op.parent)?.list[locate(blocks, op.parent)!.index] : null;
    const list = parent ? parent.children : blocks;
    const i = op.after === null ? 0 : list.findIndex((b) => b.id === op.after) + 1;
    list.splice(i || (op.after === null ? 0 : list.length), 0, block);
  } else {
    const at = locate(blocks, op.id);
    if (at) at.list.splice(at.index, 1);
  }
}
