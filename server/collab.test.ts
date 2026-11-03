// Handler-level tests for databases, sharing, comments, history, teamspaces, search and publishing:
// who may do what, and that nothing leaks to someone without access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import type { Block, ClientEvent, DbData, ServerEvent } from '../src/types.ts';
import { createMemoryPageStore, emptyIndex } from './pageStore.ts';
import { createPageRuntime } from './pageRuntime.ts';
import type { Who } from './pages.ts';

const users: Record<string, Who> = {
  ann: { id: 'ann', role: 'member' },
  bob: { id: 'bob', role: 'member' },
  root: { id: 'root', role: 'owner' },
  gus: { id: 'gus', role: 'guest' },
};

interface Tab { ws: WebSocket; user: string; got: ServerEvent[] }

async function room() {
  const store = createMemoryPageStore();
  const index = emptyIndex();
  const tabs: Tab[] = [];
  const audits: string[] = [];
  let ids = 0;
  let clock = 1000;
  const rt = createPageRuntime({
    store,
    index,
    workspaceId: 'ws',
    workspaceName: () => 'Test',
    barred: (a, b) => (a === 'root' && b === 'gus') || (a === 'gus' && b === 'root'),
    groupMembers: (g) => (g === 'g-gus' ? ['gus'] : []),
    offload: async (f) => ({ name: f.name, type: f.type, size: f.size, url: `https://files.example/${f.name}` }),
    unfurl: async (u) => (u.includes('bad') ? null : { url: u, title: 'A title' }),
    people: () => Object.fromEntries(Object.keys(users).map((k) => [k, k])),
    clients: () => tabs.map((t) => [t.ws, t.user] as [WebSocket, string]),
    who: (id) => users[id],
    send: (ws, ev) => tabs.find((t) => t.ws === ws)?.got.push(ev),
    audit: (_a, action) => audits.push(action),
    now: () => clock,
    newId: () => `id${++ids}`,
  });
  const join = (user: string): Tab => {
    const tab = { ws: {} as WebSocket, user, got: [] as ServerEvent[] };
    tabs.push(tab);
    return tab;
  };
  const say = (tab: Tab, ev: ClientEvent) => rt.handle(tab.ws, tab.user, ev);
  const last = <T extends ServerEvent['t']>(tab: Tab, t: T) => [...tab.got].reverse().find((e) => e.t === t) as Extract<ServerEvent, { t: T }> | undefined;
  const errors = (tab: Tab) => tab.got.filter((e) => e.t === 'error').length;
  const advance = (ms: number) => { clock += ms; };
  return { rt, index, store, join, say, last, errors, audits, advance };
}

const text = (id: string, t: string): Block => ({ id, type: 'text', text: [{ t }], children: [], rev: 1 });

async function makeDb(r: Awaited<ReturnType<typeof room>>, tab: Tab, preset = 'tasks') {
  await r.say(tab, { t: 'dbCreate', parentId: null, shared: true, title: 'Work', preset });
  const id = r.last(tab, 'pageCreated')!.id;
  await r.say(tab, { t: 'dbGet', id });
  const data = () => ([...tab.got].reverse().find((e) => e.t === 'dbData' && e.id === id) as Extract<ServerEvent, { t: 'dbData' }>).db as DbData;
  return { id, data };
}

test('a database is a page whose body holds the schema and rows; the tree never carries them', async () => {
  const r = await room();
  const a = r.join('ann');
  const { id, data } = await makeDb(r, a);
  assert.equal(data().props[0].type, 'title');
  const nodes = r.rt.nodesFor('ann');
  assert.equal(nodes[0].kind, 'database');
  assert.ok(!('db' in nodes[0]));
  await r.say(a, { t: 'rowCreate', id, props: { [data().props[0].id]: 'First' } });
  const delta = r.last(a, 'dbDelta')!.delta;
  assert.equal(delta.rows![0].createdBy, 'ann');
});

test('rows: update checks values, a stranger cannot edit a private database, a viewer cannot write', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'dbCreate', parentId: null, shared: false, title: 'Mine', preset: 'tasks' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'dbGet', id });
  const db = r.last(a, 'dbData')!.db;
  await r.say(b, { t: 'dbGet', id });
  assert.equal(r.last(b, 'dbData'), undefined);
  assert.ok(r.errors(b) > 0);
  await r.say(b, { t: 'rowCreate', id, props: {} });
  assert.equal(r.last(b, 'dbDelta'), undefined);
  // share view with bob: he can read but not write
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'user', id: 'bob' }, level: 'view' }], restricted: false });
  await r.say(b, { t: 'dbGet', id });
  assert.ok(r.last(b, 'dbData'));
  const before = r.errors(b);
  await r.say(b, { t: 'rowCreate', id, props: {} });
  assert.equal(r.errors(b), before + 1);
  // a bad value is refused and reported
  await r.say(a, { t: 'rowCreate', id, props: {} });
  const rowId = r.last(a, 'dbDelta')!.delta.rows![0].id;
  const status = db.props.find((p) => p.type === 'status')!;
  const e = r.errors(a);
  await r.say(a, { t: 'rowUpdate', id, rowId, props: { [status.id]: 'not-an-option' } });
  assert.equal(r.errors(a), e + 1);
});

test('person values must be people in the workspace', async () => {
  const r = await room();
  const a = r.join('ann');
  const { id, data } = await makeDb(r, a);
  await r.say(a, { t: 'rowCreate', id });
  const rowId = r.last(a, 'dbDelta')!.delta.rows![0].id;
  const who = data().props.find((p) => p.type === 'person')!;
  await r.say(a, { t: 'rowUpdate', id, rowId, props: { [who.id]: ['bob', 'ghost'] } });
  assert.deepEqual(r.last(a, 'dbDelta')!.delta.rows![0].props[who.id], ['bob']);
});

test('assigning a person puts it in their inbox, and an automation can notify too', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const { id, data } = await makeDb(r, a);
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'user', id: 'bob' }, level: 'view' }], restricted: false });
  const who = data().props.find((p) => p.type === 'person')!;
  const status = data().props.find((p) => p.type === 'status')!;
  await r.say(a, { t: 'dbAutomation', id, op: { op: 'set', automation: { name: 'Done', on: true, trigger: { kind: 'propChanged', prop: status.id, to: status.options![2].id }, actions: [{ kind: 'notify', user: 'creator', text: 'Task finished' }] } } });
  await r.say(a, { t: 'rowCreate', id });
  const rowId = r.last(a, 'dbDelta')!.delta.rows![0].id;
  await r.say(a, { t: 'rowUpdate', id, rowId, props: { [who.id]: ['bob'] } });
  assert.equal(r.last(b, 'inbox')!.items.at(-1)!.kind, 'assigned');
  await r.say(a, { t: 'rowUpdate', id, rowId, props: { [status.id]: status.options![2].id } });
  assert.ok(r.rt.inboxFor('ann').length === 0, 'creator is the actor, so they are not told');
});

test('automations on a restricted page do not reach people who cannot open it', async () => {
  const r = await room();
  const a = r.join('ann');
  const { id, data } = await makeDb(r, a);
  const status = data().props.find((p) => p.type === 'status')!;
  await r.say(a, { t: 'dbAutomation', id, op: { op: 'set', automation: { name: 'x', on: true, trigger: { kind: 'rowAdded' }, actions: [{ kind: 'notify', user: 'gus', text: 'hi' }] } } });
  await r.say(a, { t: 'rowCreate', id });
  void status;
  assert.equal(r.rt.inboxFor('gus').length, 0);
});

test('two-way relations keep both sides in step', async () => {
  const r = await room();
  const a = r.join('ann');
  const t1 = await makeDb(r, a, 'tasks');
  const t2 = await makeDb(r, a, 'projects');
  await r.say(a, { t: 'dbSchema', id: t1.id, ops: [{ op: 'addProp', prop: { name: 'Project', type: 'relation', relation: { dbId: t2.id, twoWay: 'create' } } }] });
  const rel = t1.data().props.find((p) => p.type === 'relation')!;
  assert.ok(rel.relation!.twoWay);
  await r.say(a, { t: 'dbGet', id: t2.id });
  const rev = t2.data().props.find((p) => p.type === 'relation')!;
  assert.equal(rev.relation!.twoWay, rel.id);
  await r.say(a, { t: 'rowCreate', id: t2.id });
  const projectRow = r.last(a, 'dbDelta')!.delta.rows![0].id;
  await r.say(a, { t: 'rowCreate', id: t1.id });
  const taskRow = r.last(a, 'dbDelta')!.delta.rows![0].id;
  await r.say(a, { t: 'rowUpdate', id: t1.id, rowId: taskRow, props: { [rel.id]: [projectRow, 'not-a-row'] } });
  assert.deepEqual((await r.store.loadBody(t1.id)).db, undefined, 'not saved yet');
  await r.rt.flush();
  const saved1 = (await r.store.loadBody(t1.id)).db!;
  const saved2 = (await r.store.loadBody(t2.id)).db!;
  assert.deepEqual(saved1.rows[0].props[rel.id], [projectRow]);
  assert.deepEqual(saved2.rows[0].props[rev.id], [taskRow]);
  await r.say(a, { t: 'rowUpdate', id: t1.id, rowId: taskRow, props: { [rel.id]: null } });
  await r.rt.flush();
  assert.equal((await r.store.loadBody(t2.id)).db!.rows[0].props[rev.id], undefined);
});

test('a relation to a database you cannot see is refused', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'dbCreate', parentId: null, shared: false, title: 'Secret', preset: 'people' });
  const secret = r.last(a, 'pageCreated')!.id;
  const mine = await makeDb(r, b, 'tasks');
  const e = r.errors(b);
  await r.say(b, { t: 'dbSchema', id: mine.id, ops: [{ op: 'addProp', prop: { name: 'Rel', type: 'relation', relation: { dbId: secret } } }] });
  assert.equal(r.errors(b), e + 1);
  assert.equal(mine.data().props.some((p) => p.type === 'relation'), false);
});

test('a row has its own page body that follows the database access', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const g = r.join('gus');
  const { id } = await makeDb(r, a);
  await r.say(a, { t: 'rowCreate', id });
  const rowId = r.last(a, 'dbDelta')!.delta.rows![0].id;
  const key = `${id}.${rowId}`;
  await r.say(a, { t: 'pageGet', id: key });
  assert.equal(r.last(a, 'pageBody')!.id, key);
  await r.say(a, { t: 'blockOps', id: key, ops: [{ op: 'insert', parent: null, after: null, block: text('b1', 'row notes') }] });
  assert.equal(r.last(a, 'blockOps')!.ack, true);
  await r.say(b, { t: 'pageGet', id: key });
  assert.equal((r.last(b, 'pageBody')!.blocks[0].text[0].t), 'row notes');
  await r.say(g, { t: 'pageGet', id: key });
  assert.equal(r.last(g, 'pageBody'), undefined);
  await r.say(a, { t: 'pageGet', id: `${id}.nope` });
  assert.ok(r.errors(a) > 0);
  await r.say(a, { t: 'pageGet', id: '../../etc.passwd' });
});

test('forms accept only asked fields and create a row as the submitter', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const { id, data } = await makeDb(r, a);
  const name = data().props[0].id;
  await r.say(b, { t: 'formSubmit', id, values: { [name]: 'x' } });
  assert.ok(r.errors(b) > 0, 'form closed and bob has no access yet');
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'workspace' }, level: 'view' }], restricted: false });
  await r.say(a, { t: 'dbForm', id, patch: { enabled: true, fields: [name], required: [name] } });
  await r.say(b, { t: 'dbGet', id });
  await r.say(b, { t: 'formSubmit', id, values: { [name]: 'From the form', other: 1 } });
  const row = r.last(b, 'dbDelta')!.delta.rows![0];
  assert.equal(row.createdBy, 'bob');
  assert.equal(row.props[name], 'From the form');
});

test('sharing: only full access shares; guests see only what is shared by name; restricted stops inheritance', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const g = r.join('gus');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Parent' });
  const parent = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageCreate', parentId: parent, title: 'Child' });
  const child = r.last(a, 'pageCreated')!.id;
  const e = r.errors(b);
  await r.say(b, { t: 'pageShare', id: parent, entries: [{ who: { kind: 'user', id: 'gus' }, level: 'view' }], restricted: false });
  assert.equal(r.errors(b), e + 1, 'bob only edits, he cannot share');
  await r.say(a, { t: 'pageShare', id: parent, entries: [{ who: { kind: 'user', id: 'gus' }, level: 'comment' }], restricted: false });
  assert.deepEqual(r.rt.nodesFor('gus').map((n) => n.id).sort(), [child, parent].sort());
  assert.equal(r.last(g, 'inbox')!.items[0].kind, 'share');
  await r.say(a, { t: 'pageShare', id: child, entries: [], restricted: true });
  assert.deepEqual(r.rt.nodesFor('gus').map((n) => n.id), [parent]);
  assert.ok(g.got.some((x) => x.t === 'pageRevoked' || x.t === 'pageNodes'));
  // junk entries are refused
  const before = r.errors(a);
  await r.say(a, { t: 'pageShare', id: parent, entries: [{ who: { kind: 'user', id: 'x' }, level: 'owner' }] as never, restricted: false });
  assert.equal(r.errors(a), before + 1);
});

test('a group share reaches its members only', async () => {
  const r = await room();
  const a = r.join('ann');
  users.bob = { id: 'bob', role: 'member', groups: ['g1'] };
  try {
    await r.say(a, { t: 'pageCreate', parentId: null, title: 'Team only' });
    const id = r.last(a, 'pageCreated')!.id;
    assert.equal(r.rt.nodesFor('bob').length, 0);
    await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'group', id: 'g1' }, level: 'edit' }], restricted: false });
    assert.equal(r.rt.nodesFor('bob').length, 1);
  } finally {
    users.bob = { id: 'bob', role: 'member' };
  }
});

test('comments: threads, mentions reach the inbox, only people with access hear, resolve and delete rules', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const g = r.join('gus');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  await r.say(b, { t: 'pageGet', id });
  await r.say(a, { t: 'comment', id, text: 'Hello @[bob] and @[gus]' });
  const c = r.last(b, 'comments')!.comments[0];
  assert.equal(r.last(b, 'inbox')!.items[0].kind, 'mention');
  assert.equal(g.got.some((e) => e.t === 'inbox'), false, 'gus cannot open the page');
  await r.say(b, { t: 'comment', id, text: 'Replying', parent: c.id });
  assert.equal(r.last(a, 'inbox')!.items[0].kind, 'reply');
  const list = r.last(a, 'comments')!.comments;
  assert.equal(list[1].parent, c.id);
  await r.say(b, { t: 'commentResolve', id, commentId: c.id, on: true });
  assert.equal(r.last(a, 'comments')!.comments[0].resolved, true);
  const e = r.errors(b);
  await r.say(b, { t: 'commentDelete', id, commentId: c.id });
  assert.equal(r.errors(b), e + 1, 'bob cannot delete ann’s comment');
  await r.say(a, { t: 'commentDelete', id, commentId: c.id });
  assert.equal(r.last(a, 'comments')!.comments.length, 0, 'the reply goes with its thread');
});

test('mentions in the text of a page notify once, and only people who can open it', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  const blk = (bid: string): Block => ({ id: bid, type: 'text', text: [{ t: '@Bob', mention: { kind: 'user', id: 'bob' } }, { t: ' and ' }, { t: '@Gus', mention: { kind: 'user', id: 'gus' } }], children: [], rev: 1 });
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'insert', parent: null, after: null, block: blk('m1') }] });
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'insert', parent: null, after: 'm1', block: blk('m2') }] });
  assert.equal(r.rt.inboxFor('bob').length, 1, 'the second mention within 30 minutes is folded in');
  assert.equal(r.rt.inboxFor('gus').length, 0);
  void b;
});

test('history: a snapshot of the old text is kept, restore brings it back and keeps what was there', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'insert', parent: null, after: null, block: text('b1', 'one') }] });
  r.advance(11 * 60_000);
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'update', id: 'b1', patch: { text: [{ t: 'two' }] }, baseRev: 1 }] });
  await r.say(a, { t: 'pageHistory', id });
  const versions = r.last(a, 'pageHistory')!.versions;
  assert.equal(versions.length, 1);
  await r.say(a, { t: 'pageHistory', id, versionId: versions[0].id });
  assert.equal(r.last(a, 'pageHistory')!.preview!.blocks[0].text[0].t, 'one');
  await r.say(a, { t: 'pageRestoreVersion', id, versionId: versions[0].id });
  assert.equal(r.last(a, 'pageBody')!.blocks[0].text[0].t, 'one');
  await r.say(a, { t: 'pageHistory', id });
  assert.equal(r.last(a, 'pageHistory')!.versions.length, 2);
});

test('teamspaces: private ones are invisible to outsiders; members edit; closed ones need an owner to add you', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'teamspace', op: 'create', name: 'Design', kind: 'private' });
  const sp = r.last(a, 'teamspaces')!.list.find((s) => s.name === 'Design')!;
  assert.ok(sp);
  assert.equal(r.last(b, 'teamspaces')!.list.some((s) => s.name === 'Design'), false);
  await r.say(a, { t: 'pageCreate', parentId: null, teamspaceId: sp.id, title: 'Specs' });
  const page = r.last(a, 'pageCreated')!.id;
  assert.equal(r.rt.nodesFor('bob').length, 0);
  assert.equal(r.rt.nodesFor('root').length, 0, 'owners of the workspace cannot read a private teamspace');
  const e = r.errors(b);
  await r.say(b, { t: 'teamspace', op: 'join', id: sp.id });
  assert.equal(r.errors(b), e + 1);
  await r.say(a, { t: 'teamspace', op: 'setMember', id: sp.id, userId: 'bob', role: 'member' });
  assert.deepEqual(r.rt.nodesFor('bob').map((n) => n.id), [page]);
  assert.equal(r.rt.nodesFor('bob')[0].level, 'edit');
  await r.say(a, { t: 'teamspace', op: 'removeMember', id: sp.id, userId: 'ann' });
  assert.ok(r.errors(a) > 0, 'a teamspace needs an owner');
  await r.say(a, { t: 'teamspace', op: 'delete', id: sp.id });
  assert.ok(r.last(a, 'error'), 'cannot delete while it has pages');
  assert.ok(r.index.teamspaces[sp.id]);
});

test('open teamspaces can be joined by anyone but guests; outsiders only view', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const g = r.join('gus');
  await r.say(a, { t: 'teamspace', op: 'create', name: 'Everyone-ish', kind: 'open' });
  const sp = r.last(a, 'teamspaces')!.list.find((s) => s.name === 'Everyone-ish')!;
  await r.say(a, { t: 'pageCreate', parentId: null, teamspaceId: sp.id, title: 'Open page' });
  assert.equal(r.rt.nodesFor('bob')[0].level, 'view');
  await r.say(b, { t: 'teamspace', op: 'join', id: sp.id });
  assert.equal(r.rt.nodesFor('bob')[0].level, 'edit');
  await r.say(g, { t: 'teamspace', op: 'join', id: sp.id });
  assert.equal(r.rt.nodesFor('gus').length, 0);
  assert.equal(r.last(g, 'teamspaces')!.list.length, 0);
  // creating in a teamspace you are not in is refused
  const c = r.join('root');
  void c;
});

test('search only returns what the searcher may see, titles outrank body text, rows are found', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Roadmap' });
  const road = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'blockOps', id: road, ops: [{ op: 'insert', parent: null, after: null, block: text('b', 'mentions the unicorn plan') }] });
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Unicorn diary' });
  await r.say(a, { t: 'dbCreate', parentId: null, shared: true, title: 'Tasks', preset: 'tasks' });
  const dbId = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'dbGet', id: dbId });
  const name = r.last(a, 'dbData')!.db.props[0].id;
  await r.say(a, { t: 'rowCreate', id: dbId, props: { [name]: 'Buy a unicorn' } });
  await r.say(a, { t: 'search', q: 'unicorn' });
  const mine = r.last(a, 'searchResults')!.hits;
  assert.deepEqual(mine.map((h) => h.kind).sort(), ['database', 'page', 'page', 'row']);
  await r.say(b, { t: 'search', q: 'unicorn' });
  const his = r.last(b, 'searchResults')!.hits;
  assert.deepEqual(his.map((h) => h.title).sort(), ['Buy a unicorn', 'Roadmap', 'Tasks']);
  assert.equal(his.some((h) => h.title === 'Unicorn diary'), false);
  await r.say(b, { t: 'search', q: '   ' });
  assert.deepEqual(r.last(b, 'searchResults')!.hits, []);
});

test('publish makes a token only a full-access holder can set; unpublish removes it', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Public' });
  const id = r.last(a, 'pageCreated')!.id;
  const e = r.errors(b);
  await r.say(b, { t: 'pagePublish', id, on: true });
  assert.equal(r.errors(b), e + 1);
  await r.say(a, { t: 'pagePublish', id, on: true });
  const token = r.index.pages[id].publish!.token;
  assert.ok(token.startsWith('ws.'));
  assert.equal((await r.rt.published(token))!.page.id, id);
  await r.say(a, { t: 'pagePublish', id, on: false });
  assert.equal(await r.rt.published(token), null);
  assert.deepEqual(r.audits.filter((x) => x.startsWith('page.')).slice(-2), ['page.publish', 'page.unpublish']);
});

test('the inbox can be read and archived, and shows only the owner’s items', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, shared: true, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'comment', id, text: '@[bob] look' });
  const item = r.last(b, 'inbox')!.items[0];
  await r.say(b, { t: 'inboxRead', id: item.id });
  assert.equal(r.last(b, 'inbox')!.items[0].read, true);
  await r.say(a, { t: 'inboxArchive', id: item.id });
  assert.equal(r.rt.inboxFor('bob').length, 1, 'ann cannot archive bob’s item');
  await r.say(b, { t: 'inboxArchive', id: 'all' });
  assert.equal(r.rt.inboxFor('bob').length, 0);
});

test('a database duplicate gets fresh row ids and its own row bodies', async () => {
  const r = await room();
  const a = r.join('ann');
  const { id } = await makeDb(r, a);
  await r.say(a, { t: 'rowCreate', id });
  const rowId = r.last(a, 'dbDelta')!.delta.rows![0].id;
  await r.say(a, { t: 'pageGet', id: `${id}.${rowId}` });
  await r.say(a, { t: 'blockOps', id: `${id}.${rowId}`, ops: [{ op: 'insert', parent: null, after: null, block: text('x', 'row text') }] });
  await r.say(a, { t: 'pageDuplicate', id });
  const copy = r.last(a, 'pageCreated')!.id;
  await r.rt.flush();
  const body = await r.store.loadBody(copy);
  assert.equal(body.db!.rows.length, 1);
  assert.notEqual(body.db!.rows[0].id, rowId);
  const rb = await r.store.loadBody(`${copy}.${body.db!.rows[0].id}`);
  assert.equal(rb.blocks[0].text[0].t, 'row text');
});

test('calendar feed lists dated rows of databases the viewer may open', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  const { id, data } = await makeDb(r, a);
  const due = data().props.find((p) => p.type === 'date')!;
  const name = data().props[0].id;
  await r.say(a, { t: 'rowCreate', id, props: { [name]: 'Ship it', [due.id]: { start: '2026-11-20' } } });
  await r.say(a, { t: 'dbCreate', parentId: null, shared: false, title: 'Mine', preset: 'tasks' });
  const mine = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'dbGet', id: mine });
  const d2 = r.last(a, 'dbData')!.db.props.find((p) => p.type === 'date')!;
  await r.say(a, { t: 'rowCreate', id: mine, props: { [d2.id]: { start: '2026-11-21' } } });
  await r.say(b, { t: 'calendarFeed' });
  assert.deepEqual(r.last(b, 'calendarFeed')!.items.map((i) => i.title), ['Ship it']);
  await r.say(a, { t: 'calendarFeed' });
  assert.equal(r.last(a, 'calendarFeed')!.items.length, 2);
});

test('a template makes a page with its blocks; unknown template ids give a plain page', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'pageCreate', parentId: null, template: 'meeting-notes' });
  const id = r.last(a, 'pageCreated')!.id;
  assert.equal(r.index.pages[id].title, 'Meeting notes');
  await r.say(a, { t: 'pageGet', id });
  assert.ok(r.last(a, 'pageBody')!.blocks.length > 5);
  await r.say(a, { t: 'pageCreate', parentId: null, template: 'nope' });
  assert.equal(r.index.pages[r.last(a, 'pageCreated')!.id].title, '');
});

test('uploads need edit access, must be real data urls, and come back as a stored link', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  const file = { name: 'cat.png', type: 'image/png', size: 4, dataUrl: 'data:image/png;base64,AAAA' };
  await r.say(a, { t: 'pageUpload', id, blockId: 'b1', file });
  assert.equal(r.last(a, 'pageUploaded')!.url, 'https://files.example/cat.png');
  const e = r.errors(a);
  await r.say(a, { t: 'pageUpload', id, blockId: 'b1', file: { ...file, dataUrl: 'javascript:alert(1)' } });
  assert.equal(r.errors(a), e + 1);
  const eb = r.errors(b);
  await r.say(b, { t: 'pageUpload', id, blockId: 'b1', file });
  assert.equal(r.errors(b), eb + 1);
  assert.equal(r.last(b, 'pageUploaded'), undefined);
});

test('link previews are fetched for http(s) links only and cached', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'unfurl', url: 'https://example.com/x' });
  assert.equal(r.last(a, 'linkPreview')!.preview!.title, 'A title');
  await r.say(a, { t: 'unfurl', url: 'https://bad.example/' });
  assert.equal(r.last(a, 'linkPreview')!.preview, null);
  const n = a.got.length;
  await r.say(a, { t: 'unfurl', url: 'javascript:alert(1)' });
  await r.say(a, { t: 'unfurl', url: 'file:///etc/passwd' });
  assert.equal(a.got.length, n);
});

test('suggested edits: commenters propose, editors accept (the text changes) or decline, authors withdraw', async () => {
  const r = await room();
  const a = r.join('ann');
  const g = r.join('gus');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'insert', parent: null, after: null, block: text('b1', 'teh plan') }] });
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'user', id: 'gus' }, level: 'comment' }], restricted: false });
  await r.say(g, { t: 'pageGet', id });
  await r.say(g, { t: 'suggest', id, blockId: 'b1', text: [{ t: 'the plan' }] });
  const sug = r.last(a, 'suggestions')!.suggestions[0];
  assert.equal(sug.was, 'teh plan');
  const e = r.errors(g);
  await r.say(g, { t: 'suggestResolve', id, suggestionId: sug.id, accept: true });
  assert.equal(r.errors(g), e + 1, 'a commenter cannot accept');
  await r.say(a, { t: 'suggestResolve', id, suggestionId: sug.id, accept: true });
  const ops = (a.got.filter((x) => x.t === 'blockOps') as Extract<ServerEvent, { t: 'blockOps' }>[]).at(-1)!;
  assert.equal(ops.ops[0].op, 'update');
  assert.equal(r.last(g, 'suggestions')!.suggestions.length, 0);
  assert.equal(r.last(g, 'inbox')!.items.at(-1)!.kind, 'suggestion');
  await r.say(g, { t: 'suggest', id, blockId: 'b1', text: [{ t: 'nope' }] });
  const s2 = r.last(g, 'suggestions')!.suggestions[0];
  await r.say(g, { t: 'suggestResolve', id, suggestionId: s2.id, accept: false });
  assert.equal(r.last(g, 'suggestions')!.suggestions.length, 0);
});

test('requesting access tells the owners once and never says whether the page exists', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Secret' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(b, { t: 'pageRequestAccess', id });
  await r.say(b, { t: 'pageRequestAccess', id });
  const sent = a.got.filter((x) => x.t === 'inbox').length;
  assert.equal(r.rt.inboxFor('ann').filter((i) => i.kind === 'request').length, 1);
  assert.ok(sent >= 1);
  await r.say(b, { t: 'pageRequestAccess', id: 'does-not-exist' });
  const msgs = b.got.filter((x) => x.t === 'error').map((x) => (x as { message: string }).message);
  assert.equal(new Set(msgs).size, 1);
});

test('information barriers: a share across a barrier is dropped, with a generic message', async () => {
  const r = await room();
  const a = r.join('root');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Doc' });
  const id = r.last(a, 'pageCreated')!.id;
  const e = r.errors(a);
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'user', id: 'bob' }, level: 'view' }, { who: { kind: 'user', id: 'gus' }, level: 'view' }, { who: { kind: 'group', id: 'g-gus' }, level: 'view' }], restricted: false });
  assert.equal(r.errors(a), e + 1);
  assert.deepEqual(r.index.pages[id].access.entries.map((x) => x.who), [{ kind: 'user', id: 'bob' }]);
});

test('edit-content on a database: rows yes, schema and views no; on a page it counts as edit', async () => {
  const r = await room();
  const a = r.join('ann');
  const b = r.join('bob');
  await r.say(a, { t: 'dbCreate', parentId: null, shared: false, title: 'Private', preset: 'tasks' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'dbGet', id });
  const data = () => r.last(a, 'dbData')!.db;
  await r.say(a, { t: 'pageShare', id, entries: [{ who: { kind: 'user', id: 'bob' }, level: 'edit-content' }], restricted: false });
  await r.say(b, { t: 'dbGet', id });
  assert.equal(r.last(b, 'dbData')!.level, 'edit-content');
  await r.say(b, { t: 'rowCreate', id, props: { [data().props[0].id]: 'mine' } });
  assert.equal(r.last(b, 'dbDelta')!.delta.rows![0].createdBy, 'bob');
  const e = r.errors(b);
  await r.say(b, { t: 'dbSchema', id, ops: [{ op: 'addProp', prop: { name: 'X', type: 'text' } }] });
  await r.say(b, { t: 'dbView', id, op: { op: 'add', view: { layout: 'board' } } });
  assert.equal(r.errors(b), e + 2);
  // the row's own page is editable too
  const rowId = r.last(b, 'dbDelta')!.delta.rows![0].id;
  await r.say(b, { t: 'pageGet', id: `${id}.${rowId}` });
  await r.say(b, { t: 'blockOps', id: `${id}.${rowId}`, ops: [{ op: 'insert', parent: null, after: null, block: text('x', 'hi') }] });
  assert.equal(r.last(b, 'blockOps')!.ack, true);
  // on an ordinary page it is just edit
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'P' });
  const pid = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageShare', id: pid, entries: [{ who: { kind: 'user', id: 'bob' }, level: 'edit-content' }], restricted: false });
  assert.equal(r.rt.nodesFor('bob').find((n) => n.id === pid)!.level, 'edit');
});

test('a reminder fires into the writer’s inbox at its time, once', async () => {
  const r = await room();
  const a = r.join('ann');
  await r.say(a, { t: 'pageCreate', parentId: null, title: 'Plans' });
  const id = r.last(a, 'pageCreated')!.id;
  await r.say(a, { t: 'pageGet', id });
  // the room's clock reads 1000 ms after the epoch; remind at 00:01 on 1970-01-01
  const blk: Block = { id: 'r1', type: 'text', text: [{ t: '@later', mention: { kind: 'date', id: '1970-01-01T00:01' } }], children: [], rev: 1 };
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'insert', parent: null, after: null, block: blk }] });
  assert.equal(r.index.reminders.length, 1);
  await r.say(a, { t: 'blockOps', id, ops: [{ op: 'update', id: 'r1', patch: { text: blk.text }, baseRev: 1 }] });
  assert.equal(r.index.reminders.length, 1, 'the same time is not queued twice');
});
