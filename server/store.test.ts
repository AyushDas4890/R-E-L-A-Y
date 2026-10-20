import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from './store.ts';

type Shape = { n: number; items: string[] };
const seed = (): Shape => ({ n: 1, items: [] });

test('file store seeds when the file is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'));
  try {
    const store = createFileStore<Shape>(join(dir, 'db.json'), seed);
    const state = await store.load();
    assert.deepEqual(state, { n: 1, items: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file store round-trips saved state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'));
  try {
    const path = join(dir, 'db.json');
    const a = createFileStore<Shape>(path, seed);
    await a.save({ n: 2, items: ['x'] });
    const b = createFileStore<Shape>(path, seed);
    assert.deepEqual(await b.load(), { n: 2, items: ['x'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
