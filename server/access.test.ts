import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyListPatch, canEditWorkflow, mergeWorkflows, removeVerdict, userView } from './access.ts';
import type { ListItem, User, Workflow } from '../src/types.ts';

const user = (over: Partial<User>): User => ({ id: 'u', name: 'U', color: '#000', title: '', status: { emoji: '', text: '' }, email: 'u@x.io', ...over });
const wf = (id: string, over: Partial<Workflow> = {}): Workflow => ({ id, name: id, enabled: true, trigger: { type: 'join', channelId: 'general' }, reply: 'hi', ...over });
const alice = { id: 'alice', admin: false };
const bob = { id: 'bob', admin: false };
const admin = { id: 'root', admin: true };

test('userView shows email to admins and to the person only', () => {
  const u = user({ id: 'bob' });
  assert.equal(userView(u, user({ id: 'alice' })).email, undefined);
  assert.equal(userView(u, user({ id: 'bob' })).email, 'u@x.io');
  assert.equal(userView(u, user({ id: 'root', role: 'admin' })).email, 'u@x.io');
  assert.equal(userView(u, undefined).email, undefined);
  assert.equal(u.email, 'u@x.io', 'the stored user is not changed');
});

test('only the creator or an admin may edit a workflow; ownerless ones are admin-only', () => {
  assert.equal(canEditWorkflow(wf('a', { createdBy: 'alice' }), alice), true);
  assert.equal(canEditWorkflow(wf('a', { createdBy: 'alice' }), bob), false);
  assert.equal(canEditWorkflow(wf('a', { createdBy: 'alice' }), admin), true);
  assert.equal(canEditWorkflow(wf('seed'), alice), false);
});

test('a new workflow is stamped with its creator', () => {
  const { list, rejected } = mergeWorkflows([], [wf('n', { createdBy: 'mallory' })], alice);
  assert.equal(list[0].createdBy, 'alice');
  assert.equal(rejected, 0);
});

test("publishing the full list can't change or delete other people's workflows", () => {
  const prev = [wf('a', { createdBy: 'alice', reply: 'A' }), wf('b', { createdBy: 'bob', reply: 'B' })];
  const hijack = [wf('a', { reply: 'A2' }), wf('b', { reply: 'HACKED' })];
  const out = mergeWorkflows(prev, hijack, alice);
  assert.equal(out.list.find((w) => w.id === 'a')!.reply, 'A2');
  assert.equal(out.list.find((w) => w.id === 'b')!.reply, 'B');
  assert.equal(out.rejected, 1);
  assert.equal(out.list.find((w) => w.id === 'b')!.createdBy, 'bob');
  const dropped = mergeWorkflows(prev, [], alice);
  assert.deepEqual(dropped.list.map((w) => w.id), ['b']);
  assert.equal(dropped.rejected, 1);
});

test('resending other people\'s workflows unchanged is not a rejection', () => {
  const prev = [wf('b', { createdBy: 'bob' })];
  const out = mergeWorkflows(prev, [wf('b'), wf('mine')], alice);
  assert.equal(out.rejected, 0);
  assert.equal(out.list.length, 2);
});

test('an admin may edit and delete any workflow, and it is counted for the audit log', () => {
  const prev = [wf('a', { createdBy: 'alice', reply: 'A' }), wf('b', { createdBy: 'bob' })];
  const out = mergeWorkflows(prev, [wf('a', { reply: 'fixed' })], admin);
  assert.deepEqual(out.list.map((w) => [w.id, w.reply, w.createdBy]), [['a', 'fixed', 'alice']]);
  assert.equal(out.overrode, 2);
  assert.equal(out.rejected, 0);
});

test('duplicate ids in one publish count once', () => {
  assert.equal(mergeWorkflows([], [wf('x'), wf('x')], alice).list.length, 1);
});

const item = (id: string, over: Partial<ListItem> = {}): ListItem => ({ id, title: id, done: false, assignee: '', due: '', status: 'todo', ...over });
const isUser = (id: string) => id === 'alice';

test('a list patch changes one item and leaves the rest alone', () => {
  const items = [item('a'), item('b')];
  const out = applyListPatch(items, { id: 'a', patch: { status: 'done', assignee: 'alice' } }, isUser)!;
  assert.deepEqual(out[0], { id: 'a', title: 'a', done: true, assignee: 'alice', due: '', status: 'done' });
  assert.deepEqual(out[1], items[1]);
});

test('a list patch can add an item, but only with a title', () => {
  assert.equal(applyListPatch([], { id: 'n', patch: { status: 'doing' } }, isUser), null);
  const out = applyListPatch([], { id: 'n', patch: { title: '  ship it  ' } }, isUser)!;
  assert.equal(out[0].title, 'ship it');
});

test('a list patch ignores unknown assignees, bad ids and unknown items to remove', () => {
  assert.equal(applyListPatch([item('a')], { id: 'a', patch: { assignee: 'ghost' } }, isUser)![0].assignee, '');
  assert.equal(applyListPatch([], { id: 5, patch: { title: 'x' } }, isUser), null);
  assert.equal(applyListPatch([item('a')], { id: 'zzz', remove: true }, isUser), null);
  assert.deepEqual(applyListPatch([item('a'), item('b')], { id: 'a', remove: true }, isUser)!.map((i) => i.id), ['b']);
});

test('a list stops growing at 500 items', () => {
  const full = Array.from({ length: 500 }, (_, i) => item(`i${i}`));
  assert.equal(applyListPatch(full, { id: 'extra', patch: { title: 'x' } }, isUser), null);
  assert.notEqual(applyListPatch(full, { id: 'i1', patch: { title: 'y' } }, isUser), null);
});

test('who may remove whom', () => {
  const owner = user({ id: 'o', role: 'owner' });
  const adm = user({ id: 'a', role: 'admin' });
  const member = user({ id: 'm', role: 'member' });
  const guest = user({ id: 'g', role: 'guest' });
  assert.equal(removeVerdict(adm, member), 'ok');
  assert.equal(removeVerdict(adm, guest), 'ok');
  assert.equal(removeVerdict(adm, user({ id: 'a2', role: 'admin' })), 'owner-only');
  assert.equal(removeVerdict(adm, owner), 'owner-only');
  assert.equal(removeVerdict(owner, adm), 'ok');
  assert.equal(removeVerdict(member, guest), 'no');
  assert.equal(removeVerdict(owner, owner), 'no');
  assert.equal(removeVerdict(owner, user({ id: 'b', bot: true })), 'no');
  assert.equal(removeVerdict(owner, user({ id: 'x', inactive: true })), 'no');
  assert.equal(removeVerdict(owner, undefined), 'no');
});
