import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import type { Block, BlockOp, Page, ServerEvent } from '../src/types.ts';
import {
  GENERAL, MAX_DEPTH, applyOps, canMove, levelFor, newPage, nodeFor, orderAfter, subtree, visibleNodes, type PageBody, type Pages, type Who,
} from './pages.ts';
import { createMemoryPageStore, emptyIndex } from './pageStore.ts';
import { createPageRuntime } from './pageRuntime.ts';

const ann: Who = { id: 'ann', role: 'member' };
const bob: Who = { id: 'bob', role: 'member' };
const admin: Who = { id: 'root', role: 'owner' };
const guest: Who = { id: 'gus', role: 'guest' };
const bot: Who = { id: 'relaybot', role: 'member', bot: true };

let n = 0;
const make = (pages: Pages, input: { parentId?: string | null; shared?: boolean; title?: string }, who: Who): Page => {
  const page = newPage(pages, { parentId: input.parentId ?? null, shared: input.shared ?? false, title: input.title }, who, `p${++n}`, 1000 + n);
  assert.ok(typeof page !== 'string', String(page));
  pages[page.id] = page;
  return page;
};
const block = (id: string, text = '', extra: Partial<Block> = {}): Block => ({ id, type: 'text', text: text ? [{ t: text }] : [], children: [], rev: 1, ...extra });
const ins = (b: Block, parent: string | null = null, after: string | null = null): BlockOp => ({ op: 'insert', parent, after, block: b });
const body = (blocks: Block[] = []): PageBody => ({ id: 'x', version: 0, blocks });

// ---- access ----

test('a private page belongs to its creator alone, admins included', () => {
  const pages: Pages = {};
  const p = make(pages, { title: 'Diary' }, ann);
  assert.equal(levelFor(pages, p, ann), 'full');
  assert.equal(levelFor(pages, p, bob), 'none');
  assert.equal(levelFor(pages, p, admin), 'none');
  assert.equal(levelFor(pages, p, guest), 'none');
  assert.equal(nodeFor(pages, p, bob), null);
});

test('a teamspace page is editable by members, full for admins, hidden from guests, view-only for bots', () => {
  const pages: Pages = {};
  const p = make(pages, { shared: true }, ann);
  assert.equal(p.teamspaceId, GENERAL);
  assert.equal(levelFor(pages, p, bob), 'edit');
  assert.equal(levelFor(pages, p, admin), 'full');
  assert.equal(levelFor(pages, p, guest), 'none');
  assert.equal(levelFor(pages, p, bot), 'view');
  assert.equal(levelFor(pages, p, undefined), 'none');
  assert.equal(levelFor(pages, p, { ...bob, inactive: true }), 'none');
});

test('a share by name reaches a guest, down the tree, until a page is restricted', () => {
  const pages: Pages = {};
  const top = make(pages, { shared: true }, ann);
  const mid = make(pages, { parentId: top.id }, ann);
  const leaf = make(pages, { parentId: mid.id }, ann);
  top.access.entries.push({ who: { kind: 'user', id: 'gus' }, level: 'comment' });
  assert.equal(levelFor(pages, leaf, guest), 'comment');
  mid.access.restricted = true;
  assert.equal(levelFor(pages, leaf, guest), 'none');
  assert.equal(levelFor(pages, leaf, bob), 'none'); // restricted pages drop the teamspace default too
  assert.equal(levelFor(pages, leaf, ann), 'full');
  assert.equal(levelFor(pages, leaf, admin), 'full');
});

test('a workspace share never reaches a guest', () => {
  const pages: Pages = {};
  const p = make(pages, {}, ann);
  p.access.entries.push({ who: { kind: 'workspace' }, level: 'view' });
  assert.equal(levelFor(pages, p, bob), 'view');
  assert.equal(levelFor(pages, p, guest), 'none');
});

test('a user id that looks like a share keyword gets nothing extra', () => {
  const pages: Pages = {};
  const p = make(pages, {}, ann);
  p.access.entries.push({ who: { kind: 'workspace' }, level: 'view' });
  assert.equal(levelFor(pages, p, { id: 'workspace', role: 'guest' }), 'none');
});

test('trashed pages and their children vanish for everyone but people with full access', () => {
  const pages: Pages = {};
  const top = make(pages, { shared: true }, ann);
  const kid = make(pages, { parentId: top.id }, ann);
  top.trashedAt = 5;
  assert.equal(levelFor(pages, kid, bob), 'none');
  assert.equal(levelFor(pages, kid, ann), 'full');
  const ids = (who: Who) => visibleNodes(pages, who).map((x) => x.id);
  assert.deepEqual(ids(bob), []);
  assert.deepEqual(ids(ann), [top.id]); // the trashed page shows (flagged); its child is hidden with it
  assert.equal(nodeFor(pages, top, ann)?.trashed, true);
});

test('a parent loop does not hang the level check', () => {
  const pages: Pages = {};
  const a = make(pages, { shared: true }, ann);
  const b = make(pages, { parentId: a.id }, ann);
  a.parentId = b.id;
  assert.equal(levelFor(pages, a, bob), 'none'); // teamspace defaults come from a real root, and a loop has none
});

// ---- tree ----

test('pages are created only where the person may edit, guests get no top-level pages', () => {
  const pages: Pages = {};
  const mine = make(pages, {}, ann);
  assert.equal(typeof newPage(pages, { parentId: mine.id, shared: false }, bob, 'z1', 1), 'string');
  assert.equal(typeof newPage(pages, { parentId: null, shared: true }, guest, 'z2', 1), 'string');
  assert.equal(typeof newPage(pages, { parentId: 'nope', shared: false }, ann, 'z3', 1), 'string');
  mine.locked = true;
  assert.equal(typeof newPage(pages, { parentId: mine.id, shared: false }, ann, 'z4', 1), 'string');
});

test('titles are one line and capped; icons and covers are checked', () => {
  const pages: Pages = {};
  const p = newPage(pages, { parentId: null, shared: false, title: `a\nb${'x'.repeat(500)}`, icon: '<b>' }, ann, 'q', 1);
  assert.ok(typeof p !== 'string');
  assert.ok(!p.title.includes('\n') && p.title.length === 200);
  assert.equal(p.icon, '');
});

test('a page cannot move under itself or its own descendants', () => {
  const pages: Pages = {};
  const a = make(pages, {}, ann);
  const b = make(pages, { parentId: a.id }, ann);
  const c = make(pages, { parentId: b.id }, ann);
  assert.equal(canMove(pages, a.id, c.id), false);
  assert.equal(canMove(pages, a.id, a.id), false);
  assert.equal(canMove(pages, c.id, a.id), true);
  assert.equal(canMove(pages, c.id, null), true);
  assert.deepEqual(subtree(pages, a.id).sort(), [a.id, b.id, c.id].sort());
});

test('order: first, between and last positions', () => {
  const pages: Pages = {};
  const a = make(pages, {}, ann);
  const b = make(pages, {}, ann);
  const c = make(pages, {}, ann);
  assert.ok(orderAfter(pages, null, null, null) < a.order);
  const mid = orderAfter(pages, null, null, a.id);
  assert.ok(mid > a.order && mid < b.order);
  assert.ok(orderAfter(pages, null, null, c.id) > c.order);
  assert.ok(orderAfter(pages, null, null, 'gone') > c.order);
  // moving a page is not blocked by its own old slot
  assert.ok(orderAfter(pages, null, null, null, a.id) < b.order);
});

// ---- blocks ----

test('inserts land after the block asked for, first on null, last when it is gone', () => {
  const b = body();
  applyOps(b, [ins(block('a')), ins(block('c'), null, 'a'), ins(block('b'), null, 'a')]);
  assert.deepEqual(b.blocks.map((x) => x.id), ['a', 'b', 'c']);
  applyOps(b, [ins(block('first'), null, null), ins(block('last'), null, 'missing')]);
  assert.deepEqual(b.blocks.map((x) => x.id), ['first', 'a', 'b', 'c', 'last']);
  assert.equal(b.version, 2);
});

test('a replayed insert is ignored, not rejected', () => {
  const b = body();
  applyOps(b, [ins(block('a', 'hi'))]);
  const again = applyOps(b, [ins(block('a', 'hi'))]);
  assert.equal(again.applied.length, 0);
  assert.equal(again.rejected, 0);
  assert.equal(b.blocks.length, 1);
  assert.equal(b.version, 1);
});

test('edits to different blocks never collide, even from stale versions', () => {
  const b = body([block('a', 'one'), block('b', 'two')]);
  const r1 = applyOps(b, [{ op: 'update', id: 'a', patch: { text: [{ t: 'ONE' }] }, baseRev: 1 }]);
  const r2 = applyOps(b, [{ op: 'update', id: 'b', patch: { text: [{ t: 'TWO' }] }, baseRev: 1 }]);
  assert.equal(r1.conflicts.length + r2.conflicts.length, 0);
  assert.deepEqual(b.blocks.map((x) => x.text[0].t), ['ONE', 'TWO']);
});

test('two edits to one block: the late one comes back as a conflict, the stored text wins', () => {
  const b = body([block('a', 'start')]);
  applyOps(b, [{ op: 'update', id: 'a', patch: { text: [{ t: 'from ann' }] }, baseRev: 1 }]);
  const res = applyOps(b, [{ op: 'update', id: 'a', patch: { text: [{ t: 'from bob' }] }, baseRev: 1 }]);
  assert.equal(res.applied.length, 0);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].text[0].t, 'from ann');
  assert.equal(res.conflicts[0].rev, 2);
  // sent again on top of the new revision, it goes through
  const retry = applyOps(b, [{ op: 'update', id: 'a', patch: { text: [{ t: 'from bob' }] }, baseRev: 2 }]);
  assert.equal(retry.applied.length, 1);
  assert.equal(b.blocks[0].rev, 3);
});

test('non-text changes (a ticked box) apply even from an old revision', () => {
  const b = body([block('a', 'task', { type: 'todo' })]);
  applyOps(b, [{ op: 'update', id: 'a', patch: { text: [{ t: 'task!' }] }, baseRev: 1 }]);
  const res = applyOps(b, [{ op: 'update', id: 'a', patch: { checked: true }, baseRev: 1 }]);
  assert.equal(res.applied.length, 1);
  assert.equal(b.blocks[0].checked, true);
});

test('edits to a block someone already removed are dropped quietly', () => {
  const b = body([block('a')]);
  applyOps(b, [{ op: 'remove', id: 'a' }]);
  const res = applyOps(b, [{ op: 'update', id: 'a', patch: { checked: true }, baseRev: 1 }, { op: 'remove', id: 'a' }]);
  assert.equal(res.rejected, 0);
  assert.equal(res.applied.length, 0);
});

test('move nests, reorders, and refuses to drop a block into itself', () => {
  const b = body([block('a'), block('b'), block('c')]);
  applyOps(b, [{ op: 'move', id: 'c', parent: 'a', after: null }]);
  assert.deepEqual(b.blocks.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(b.blocks[0].children.map((x) => x.id), ['c']);
  const bad = applyOps(b, [{ op: 'move', id: 'a', parent: 'c', after: null }, { op: 'move', id: 'a', parent: 'a', after: null }, { op: 'move', id: 'b', parent: 'b', after: null }]);
  assert.equal(bad.rejected, 3);
  assert.deepEqual(b.blocks.map((x) => x.id), ['a', 'b']);
  applyOps(b, [{ op: 'move', id: 'b', parent: null, after: null }]);
  assert.deepEqual(b.blocks.map((x) => x.id), ['b', 'a']);
});

test('a move to a parent that does not exist leaves the block where it was', () => {
  const b = body([block('a'), block('b')]);
  const res = applyOps(b, [{ op: 'move', id: 'a', parent: 'nope', after: null }]);
  assert.equal(res.rejected, 1);
  assert.deepEqual(b.blocks.map((x) => x.id), ['a', 'b']);
});

test(`nesting is capped at ${MAX_DEPTH} levels`, () => {
  const b = body();
  let parent: string | null = null;
  let rejected = 0;
  for (let i = 0; i < MAX_DEPTH + 2; i++) {
    rejected += applyOps(b, [ins(block(`n${i}`), parent)]).rejected;
    parent = `n${i}`;
  }
  assert.equal(rejected, 2);
});

test('the block limit stops an insert that would pass it', () => {
  const b = body([block('a'), block('b')]);
  const res = applyOps(b, [ins(block('c'))], 2);
  assert.equal(res.rejected, 1);
  assert.equal(b.blocks.length, 2);
});

test('unchecked input is rebuilt: unknown types, bad urls, odd fields and bad ids are dropped', () => {
  const b = body();
  const evil = { id: 'x', type: 'text', text: [{ t: 'hi', link: 'javascript:alert(1)', color: 'red; x', b: 1 }], children: [], rev: 99, url: 'javascript:1', onclick: 'x' } as unknown as Block;
  applyOps(b, [ins(evil)]);
  const stored = b.blocks[0];
  assert.equal(stored.rev, 1);
  assert.equal(stored.text[0].link, undefined);
  assert.equal(stored.text[0].color, undefined);
  assert.equal(stored.text[0].b, 1);
  assert.equal(stored.url, '');
  assert.equal('onclick' in stored, false);
  const rej = applyOps(b, [
    ins({ ...evil, id: 'y', type: 'script' as never }),
    ins({ ...evil, id: '' }),
    ins({ ...evil, id: 'z', text: 'nope' as never }),
    { op: 'nope' } as unknown as BlockOp,
  ]);
  assert.equal(rej.rejected, 4);
  assert.equal(b.blocks.length, 1);
});

// ---- runtime ----

interface Tab { ws: WebSocket; user: string; got: ServerEvent[] }

async function room() {
  const store = createMemoryPageStore();
  const index = emptyIndex();
  const users: Record<string, Who> = { ann, bob, root: admin, gus: guest };
  const tabs: Tab[] = [];
  const audits: string[] = [];
  let ids = 0;
  const rt = createPageRuntime({
    store,
    index,
    clients: () => tabs.map((t) => [t.ws, t.user] as [WebSocket, string]),
    who: (id) => users[id],
    send: (ws, ev) => tabs.find((t) => t.ws === ws)?.got.push(ev),
    audit: (_a, action) => audits.push(action),
    now: () => 5000,
    newId: () => `id${++ids}`,
  });
  const join = (user: string): Tab => {
    const tab = { ws: {} as WebSocket, user, got: [] as ServerEvent[] };
    tabs.push(tab);
    return tab;
  };
  const say = (tab: Tab, ev: Parameters<typeof rt.handle>[2]) => rt.handle(tab.ws, tab.user, ev);
  const last = <T extends ServerEvent['t']>(tab: Tab, t: T) => [...tab.got].reverse().find((e) => e.t === t) as Extract<ServerEvent, { t: T }> | undefined;
  return { rt, index, store, join, say, last, audits, tabs };
}

test('init-sized data is the tree only: nodes carry no blocks, and a page you cannot see is not in it', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Handbook' });
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Diary' });
  const nodes = r.rt.nodesFor('bob');
  assert.deepEqual(nodes.map((x) => x.title), ['Handbook']);
  assert.ok(!('blocks' in nodes[0]) && !('access' in nodes[0]));
  assert.equal(r.rt.nodesFor('ann').length, 2);
  // bob was told about the shared page, not the private one
  const told = b.got.filter((e) => e.t === 'pageNodes').flatMap((e) => (e as Extract<ServerEvent, { t: 'pageNodes' }>).nodes.map((x) => x.title));
  assert.deepEqual(told, ['Handbook']);
});

test('the tree payload stays flat as pages get bigger: bodies are never in it', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Big' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  const small = JSON.stringify(r.rt.nodesFor('ann')).length;
  const ops: BlockOp[] = Array.from({ length: 150 }, (_, i) => ins(block(`b${i}`, 'x'.repeat(1000)), null, i ? `b${i - 1}` : null));
  await r.say(a, { t: 'blockOps', id, ops });
  assert.equal(JSON.stringify(r.rt.nodesFor('ann')).length, small);
});

test('a page you cannot read gives the same answer whether it exists or not, and opens nothing', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Diary' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(b, { t: 'pageGet', id });
  await r.say(b, { t: 'pageGet', id: 'does-not-exist' });
  await r.say(b, { t: 'pageGet', id: '__proto__' });
  const errors = b.got.filter((e) => e.t === 'error');
  assert.equal(errors.length, 3);
  assert.equal(new Set(errors.map((e) => (e as { message: string }).message)).size, 1);
  assert.equal(b.got.some((e) => e.t === 'pageBody'), false);
});

test('edits reach everyone who has the page open, not people who closed it, and are saved', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const c = r.join('root');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Notes' });
  const id = r.last(a, 'pageCreated')!.id;
  for (const t of [a, b, c]) await r.say(t, { t: 'pageGet', id });
  await r.say(c, { t: 'pageClose', id });
  await r.say(a, { t: 'blockOps', id, ops: [ins(block('h', 'Hello'))] });
  assert.equal(r.last(b, 'blockOps')?.by, 'ann');
  assert.equal(r.last(a, 'blockOps')?.version, 1);
  assert.equal(c.got.some((e) => e.t === 'blockOps'), false);
  await r.rt.flush();
  assert.equal(r.store.bodies.get(id)?.blocks[0].text[0].t, 'Hello');
  assert.ok(r.store.index.pages[id]);
});

test('view-only people and guests cannot edit; locked pages refuse edits until unlocked by someone with full access', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const g = r.join('gus');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Spec' });
  const id = r.last(a, 'pageCreated')!.id;
  r.index.pages[id].access.entries.push({ who: { kind: 'user', id: 'gus' }, level: 'view' });
  await r.say(g, { t: 'pageGet', id });
  assert.ok(r.last(g, 'pageBody'));
  await r.say(g, { t: 'blockOps', id, ops: [ins(block('x', 'nope'))] });
  assert.equal(g.got.filter((e) => e.t === 'error').length, 1);
  await r.say(b, { t: 'pageGet', id });
  await r.say(b, { t: 'blockOps', id, ops: [ins(block('y', 'ok'))] });
  assert.equal(r.last(b, 'blockOps')?.ops.length, 1);
  // bob can edit but not lock; ann (creator, full) can
  await r.say(b, { t: 'pageUpdate', id, patch: { locked: true } });
  assert.equal(r.index.pages[id].locked, false);
  await r.say(a, { t: 'pageUpdate', id, patch: { locked: true } });
  assert.equal(r.index.pages[id].locked, true);
  const before = r.last(a, 'blockOps')?.version;
  await r.say(b, { t: 'blockOps', id, ops: [ins(block('z', 'late'))] });
  await r.say(b, { t: 'pageUpdate', id, patch: { title: 'renamed' } });
  assert.equal(r.index.pages[id].title, 'Spec');
  assert.equal(r.last(a, 'blockOps')?.version, before);
});

test('oversized or empty edit batches are refused without touching the page', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'P' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  await r.say(a, { t: 'blockOps', id, ops: [] });
  await r.say(a, { t: 'blockOps', id, ops: Array.from({ length: 201 }, (_, i) => ins(block(`b${i}`))) });
  await r.say(a, { t: 'blockOps', id, ops: [ins(block('big', 'x'.repeat(300_000)))] });
  assert.equal(a.got.filter((e) => e.t === 'error').length, 3);
  assert.equal(r.store.bodies.size, 0);
});

test('trash hides a page tree from others; restore brings it back; delete needs the trash first and revokes open tabs', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Top' });
  const top = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageCreate', parentId: top, title: 'Kid' });
  const kid = r.last(a, 'pageCreated')!.id;
  await r.say(b, { t: 'pageGet', id: kid });
  assert.ok(r.last(b, 'pageBody'));
  await r.say(a, { t: 'pageDelete', id: top }); // not in the trash yet
  assert.ok(r.index.pages[top]);
  await r.say(a, { t: 'pageTrash', id: top });
  assert.deepEqual(r.rt.nodesFor('bob'), []);
  assert.ok(b.got.some((e) => e.t === 'pageRevoked' && e.id === kid));
  await r.say(b, { t: 'pageTrash', id: top }); // bob has only edit
  assert.ok(r.index.pages[top].trashedAt !== undefined);
  await r.say(a, { t: 'pageRestore', id: top });
  assert.equal(r.rt.nodesFor('bob').length, 2);
  await r.say(a, { t: 'pageTrash', id: top });
  await r.say(a, { t: 'pageDelete', id: top });
  assert.deepEqual(Object.keys(r.index.pages), []);
  assert.deepEqual(r.audits.filter((x) => x === 'page.delete'), ['page.delete']);
});

test('moving: needs full access on the page and edit on the target, and never into itself', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'A' });
  const pa = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageCreate', parentId: pa, title: 'child' });
  const child = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageMove', id: pa, parentId: child, after: null });
  assert.equal(r.index.pages[pa].parentId, null);
  await r.say(b, { t: 'pageMove', id: child, parentId: null, after: null }); // bob: edit only
  assert.equal(r.index.pages[child].parentId, pa);
  await r.say(a, { t: 'pageMove', id: child, parentId: null, after: null }); // ann: out to Private
  assert.equal(r.index.pages[child].teamspaceId, null);
  assert.equal(r.rt.nodesFor('bob').some((x) => x.id === child), false);
});

test('duplicate copies a page with its sub-pages and text, as a new page owned by the copier', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Plan' });
  const plan = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageCreate', parentId: plan, title: 'Step' });
  await r.say(a, { t: 'pageGet', id: plan });
  await r.say(a, { t: 'blockOps', id: plan, ops: [ins(block('t', 'text'))] });
  await r.say(b, { t: 'pageDuplicate', id: plan });
  const copy = r.last(b, 'pageCreated')!.id;
  assert.equal(r.index.pages[copy].title, 'Plan (copy)');
  assert.equal(r.index.pages[copy].createdBy, 'bob');
  assert.equal(Object.keys(r.index.pages).length, 4);
  await r.say(b, { t: 'pageGet', id: copy });
  const got = r.last(b, 'pageBody')!;
  assert.equal(got.blocks[0].text[0].t, 'text');
  assert.notEqual(got.blocks[0].id, 't');
});

test('favorites only list pages you can still see', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'F' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(b, { t: 'pageFavorite', id, on: true });
  assert.deepEqual(r.rt.favoritesFor('bob'), [id]);
  await r.say(a, { t: 'pageMove', id, parentId: null, after: null }); // to Private
  assert.deepEqual(r.rt.favoritesFor('bob'), []);
  await r.say(b, { t: 'pageFavorite', id, on: true }); // can't favorite what you can't see
  assert.equal(b.got.filter((e) => e.t === 'error').length, 1);
  assert.deepEqual(r.rt.favoritesFor('bob'), []);
});

test('deleting an account erases its private pages and credits the rest to the deleted user', async () => {
  const r = await room();
  const a = r.join('ann');
  r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Mine' });
  const mine = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Team' });
  const team = r.last(a, 'pageCreated')!.id;
  r.index.pages[team].access.entries.push({ who: { kind: 'user', id: 'ann' }, level: 'full' });
  r.rt.forget('ann', 'deleted-user');
  assert.equal(r.index.pages[mine], undefined);
  assert.equal(r.index.pages[team].createdBy, 'deleted-user');
  assert.deepEqual(r.index.pages[team].access.entries, []);
});

test('presence goes to the other tabs on the page only', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const c = r.join('root');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'P' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  await r.say(b, { t: 'pageGet', id });
  await r.say(a, { t: 'pagePresence', id, cursor: 'blk1' });
  await r.say(c, { t: 'pagePresence', id, cursor: 'blk1' }); // not on the page: ignored
  assert.equal(r.last(b, 'pagePresence')?.userId, 'ann');
  assert.equal(a.got.some((e) => e.t === 'pagePresence'), false);
  assert.equal(c.got.some((e) => e.t === 'pagePresence'), false);
});
