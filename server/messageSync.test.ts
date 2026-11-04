import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunks, createMessageSync, diffMessages, toRow } from './messageSync.ts';
import type { Message } from '../src/types.ts';

const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'c', userId: 'u', text: id, ts: 1, reactions: {}, ...over });
const known = (...ms: Message[]) => new Map(ms.map((m) => [m.id, JSON.stringify(m)]));

test('toRow keeps the whole message and fills the index columns', () => {
  const m = msg('a', { threadId: 't', ts: 5 });
  assert.deepEqual(toRow('ws', m), { workspace_id: 'ws', id: 'a', channel_id: 'c', thread_id: 't', user_id: 'u', ts: 5, data: m });
  assert.equal(toRow('ws', msg('b')).thread_id, null);
});

test('diff: everything is new at first, nothing when unchanged', () => {
  const all = [msg('a'), msg('b')];
  assert.equal(diffMessages(new Map(), all).upserts.length, 2);
  assert.deepEqual(diffMessages(known(...all), all), { upserts: [], deletes: [] });
});

test('diff: an edit or reaction rewrites only that message; a removed message is deleted', () => {
  const a = msg('a');
  const b = msg('b');
  const synced = known(a, b, msg('gone'));
  const { upserts, deletes } = diffMessages(synced, [a, { ...b, reactions: { '👍': ['u'] } }]);
  assert.deepEqual(upserts.map((u) => u.m.id), ['b']);
  assert.deepEqual(deletes, ['gone']);
});

test('chunks splits in order', () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 2), []);
});

// A stand-in for the two Supabase calls the sync uses.
function fakeClient(failUpserts = false) {
  const rows = new Map<string, unknown>();
  const client = {
    from: () => ({
      upsert: async (batch: { id: string }[]) => {
        if (failUpserts) return { error: { message: 'boom' } };
        for (const r of batch) rows.set(r.id, r);
        return { error: null };
      },
      delete: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => { for (const id of ids) rows.delete(id); return { error: null }; } }) }),
    }),
  };
  return { client: client as never, rows };
}

test('sync is off without the flag or a client', () => {
  assert.equal(createMessageSync('ws', fakeClient().client, false), null);
  assert.equal(createMessageSync('ws', null, true), null);
});

test('sync mirrors adds, edits and deletes, and retries after a failure', async () => {
  const ok = fakeClient();
  const s = createMessageSync('ws', ok.client, true)!;
  await s.sync([msg('a'), msg('b')]);
  assert.deepEqual([...ok.rows.keys()].sort(), ['a', 'b']);
  await s.sync([msg('b', { text: 'edited' })]);
  assert.deepEqual([...ok.rows.keys()], ['b']);

  const bad = fakeClient(true);
  const t = createMessageSync('ws', bad.client, true)!;
  await t.sync([msg('x')]);
  assert.equal(bad.rows.size, 0);
});
