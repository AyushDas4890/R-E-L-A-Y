import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DbData, Row } from '../src/types.ts';
import {
  applySchemaOps, applyViewOp, automationEffects, cleanAutomation, cleanFilter, cleanForm, coerce, emptyDb, formValues, newRow,
  orderRowAfter, presetDb, relationDiff, setValues, MAX_ROWS,
} from './databases.ts';

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const make = (): { db: DbData; id: () => string } => {
  const id = counter();
  return { db: presetDb('tasks', id), id };
};
const find = (db: DbData, name: string) => db.props.find((p) => p.name === name)!;

test('a task database has a title, a status with three groups, people, dates and three views', () => {
  const { db } = make();
  assert.equal(db.props[0].type, 'title');
  const status = find(db, 'Status');
  assert.deepEqual(status.options!.map((o) => o.group), ['todo', 'progress', 'done']);
  assert.equal(db.views.length, 3);
  assert.equal(db.views[1].group, status.id);
  assert.equal(db.views[2].dateProp, find(db, 'Due').id);
});

test('coerce checks a value against its property and never trusts the client', () => {
  const { db } = make();
  const status = find(db, 'Status');
  assert.equal(coerce(status, status.options![0].id), status.options![0].id);
  assert.equal(coerce(status, 'not-an-option'), undefined);
  assert.equal(coerce(find(db, 'Due'), { start: '2026-11-03' })?.constructor, Object);
  assert.equal(coerce(find(db, 'Due'), { start: 'tomorrow' }), undefined);
  assert.equal(coerce(find(db, 'Name'), 'a\nb'), 'a b');
  assert.equal(coerce(find(db, 'Name'), 5), undefined);
  assert.equal(coerce(find(db, 'Name'), null), null);
  assert.equal(coerce(find(db, 'Assignee'), ['u1', 'u1', 'u2']) instanceof Array, true);
  assert.deepEqual(coerce(find(db, 'Assignee'), ['u1', 'u1', 'u2']), ['u1', 'u2']);
});

test('a number property takes numbers and numeric text only', () => {
  const { db, id } = make();
  applySchemaOps(db, [{ op: 'addProp', prop: { name: 'Cost', type: 'number' } }], id);
  const cost = find(db, 'Cost');
  assert.equal(coerce(cost, '12.5'), 12.5);
  assert.equal(coerce(cost, 'abc'), undefined);
  assert.equal(coerce(cost, Infinity), undefined);
});

test('computed properties cannot be set by a client', () => {
  const { db, id } = make();
  applySchemaOps(db, [{ op: 'addProp', prop: { name: 'Made', type: 'createdTime' } }, { op: 'addProp', prop: { name: 'Calc', type: 'formula', formula: '1+1' } }], id);
  const row = newRow(db, {}, { id: 'u1' }, id(), 1000) as Row;
  const res = setValues(db, row, { [find(db, 'Made').id]: { start: '2026-01-01' }, [find(db, 'Calc').id]: 5 });
  assert.deepEqual(res.changed, []);
  assert.equal(res.rejected, 2);
});

test('a property can be added, renamed and removed; removing it cleans rows, views and automations', () => {
  const { db, id } = make();
  const due = find(db, 'Due');
  const row = newRow(db, { [due.id]: { start: '2026-11-03' }, [find(db, 'Name').id]: 'A' }, { id: 'u1' }, id(), 1) as Row;
  db.rows.push(row);
  db.views[0].sorts = [{ prop: due.id, dir: 'asc' }];
  db.views[0].filter = { op: 'and', items: [{ prop: due.id, op: 'notEmpty' }] };
  db.automations.push({ id: 'a1', name: 'x', on: true, trigger: { kind: 'propChanged', prop: due.id }, actions: [{ kind: 'notify', user: 'creator', text: 'hi' }] });
  const res = applySchemaOps(db, [{ op: 'patchProp', id: due.id, patch: { name: 'Deadline' } }, { op: 'removeProp', id: due.id }], id);
  assert.equal(res.rejected, 0);
  assert.deepEqual(res.delta.propsRemoved, [due.id]);
  assert.equal(due.id in row.props, false);
  assert.deepEqual(db.views[0].sorts, []);
  assert.deepEqual(db.views[0].filter.items, []);
  assert.equal(db.views[2].dateProp, undefined);
  assert.equal(db.automations.length, 0);
});

test('the title property cannot be removed, retyped or duplicated', () => {
  const { db, id } = make();
  const title = db.props[0];
  const res = applySchemaOps(db, [
    { op: 'removeProp', id: title.id },
    { op: 'patchProp', id: title.id, patch: { type: 'text' } },
    { op: 'addProp', prop: { name: 'Second', type: 'title' } },
  ], id);
  assert.equal(res.rejected, 3);
  assert.equal(db.props.filter((p) => p.type === 'title').length, 1);
});

test('the 500 property cap holds', () => {
  const { db, id } = make();
  const ops = Array.from({ length: 600 }, (_, i) => ({ op: 'addProp' as const, prop: { name: `P${i}`, type: 'text' as const } }));
  const res = applySchemaOps(db, ops, id);
  assert.equal(db.props.length, 500);
  assert.ok(res.error);
});

test('changing a select to text keeps the option names; removing an option clears it from rows', () => {
  const { db, id } = make();
  const status = find(db, 'Status');
  const [a, b] = status.options!;
  const r1 = newRow(db, { [status.id]: a.id }, { id: 'u' }, id(), 1) as Row;
  const r2 = newRow(db, { [status.id]: b.id }, { id: 'u' }, id(), 1) as Row;
  db.rows.push(r1, r2);
  applySchemaOps(db, [{ op: 'patchProp', id: status.id, patch: { options: status.options!.filter((o) => o.id !== a.id) } }], id);
  assert.equal(r1.props[status.id], undefined);
  assert.equal(r2.props[status.id], b.id);
  applySchemaOps(db, [{ op: 'patchProp', id: status.id, patch: { type: 'text' } }], id);
  assert.equal(r2.props[status.id], 'In progress');
});

test('views: add, patch, duplicate, remove, and the last view stays', () => {
  const { db, id } = make();
  const added = applyViewOp(db, { op: 'add', view: { layout: 'gallery', name: 'Cards' } }, id);
  assert.equal(added.delta.views![0].layout, 'gallery');
  const vid = added.delta.views![0].id;
  const patched = applyViewOp(db, { op: 'patch', viewId: vid, patch: { name: 'Pretty', sorts: [{ prop: db.props[0].id, dir: 'desc' }, { prop: 'bogus', dir: 'asc' }] } }, id);
  assert.equal(patched.delta.views![0].name, 'Pretty');
  assert.equal(patched.delta.views![0].sorts.length, 1);
  assert.equal(applyViewOp(db, { op: 'duplicate', viewId: vid }, id).delta.views!.length, 1);
  for (const v of [...db.views]) applyViewOp(db, { op: 'remove', viewId: v.id }, id);
  assert.equal(db.views.length, 1);
});

test('a filter is cleaned: unknown properties and operators go, nesting stops at depth 3', () => {
  const { db } = make();
  const name = db.props[0].id;
  const f = cleanFilter({
    op: 'or',
    items: [
      { prop: name, op: 'contains', value: 'x' },
      { prop: 'nope', op: 'contains', value: 'x' },
      { prop: name, op: 'drop table', value: 'x' },
      { op: 'and', items: [{ op: 'and', items: [{ op: 'and', items: [{ prop: name, op: 'empty' }] }] }] },
    ],
  }, db.props);
  assert.equal(f.op, 'or');
  assert.equal(f.items.length, 2);
  const deep = (f.items[1] as { items: { items: unknown[] }[] }).items[0];
  assert.equal(deep.items.length, 0);
});

test('rows: new rows are credited to the server-side actor and capped', () => {
  const { db, id } = make();
  const row = newRow(db, { [db.props[0].id]: 'Hi' }, { id: 'u1' }, id(), 5) as Row;
  assert.equal(row.createdBy, 'u1');
  assert.equal(row.createdAt, 5);
  for (let i = 0; i < MAX_ROWS; i++) db.rows.push({ ...row, id: `r${i}` });
  assert.equal(typeof newRow(db, {}, { id: 'u1' }, 'x', 1), 'string');
});

test('manual order: a row moves after another or to the front', () => {
  const { db } = make();
  const mk = (id: string, order: number): Row => ({ id, props: {}, createdBy: 'u', createdAt: 0, editedBy: 'u', editedAt: 0, order });
  db.rows.push(mk('a', 1), mk('b', 2), mk('c', 3));
  assert.equal(orderRowAfter(db, 'c', null) < 1, true);
  const o = orderRowAfter(db, 'c', 'a');
  assert.ok(o > 1 && o < 2);
  assert.ok(orderRowAfter(db, 'a', 'c') > 3);
});

test('relationDiff tells which links were added and removed', () => {
  assert.deepEqual(relationDiff(['a', 'b'], ['b', 'c']), { added: ['c'], removed: ['a'] });
  assert.deepEqual(relationDiff(undefined, ['a']), { added: ['a'], removed: [] });
});

test('automations: a row added or a property changed runs setProp and notify; nothing chains', () => {
  const { db, id } = make();
  const status = find(db, 'Status');
  const done = status.options![2].id;
  const made = cleanAutomation(db, {
    name: 'Done notifies',
    trigger: { kind: 'propChanged', prop: status.id, to: done },
    actions: [{ kind: 'setProp', prop: find(db, 'Due').id, value: { start: '2026-12-01' } }, { kind: 'notify', user: 'creator', text: 'Finished' }],
  }, 'a1');
  assert.ok(typeof made !== 'string');
  db.automations.push(made as never);
  const row = newRow(db, { [status.id]: done }, { id: 'maker' }, id(), 1) as Row;
  const fx = automationEffects(db, row, { kind: 'propChanged', prop: status.id });
  assert.deepEqual(fx.notify, [{ user: 'maker', text: 'Finished' }]);
  assert.deepEqual(fx.values[find(db, 'Due').id], { start: '2026-12-01' });
  const other = automationEffects(db, row, { kind: 'rowAdded' });
  assert.deepEqual(other.notify, []);
  const wrong = newRow(db, { [status.id]: status.options![0].id }, { id: 'u' }, id(), 1) as Row;
  assert.deepEqual(automationEffects(db, wrong, { kind: 'propChanged', prop: status.id }).notify, []);
  assert.equal(typeof cleanAutomation(db, { name: 'x', actions: [] }, 'a2'), 'string');
});

test('forms: only asked fields are kept, required ones must be filled, a closed form refuses', () => {
  const { db } = make();
  const name = db.props[0].id;
  const due = find(db, 'Due').id;
  assert.equal(typeof formValues(db, { [name]: 'x' }), 'string');
  db.form = cleanForm(db, { enabled: true, fields: [name, due, 'bogus'], required: [name, 'bogus'] }, db.form);
  assert.deepEqual(db.form.fields, [name, due]);
  assert.deepEqual(db.form.required, [name]);
  assert.equal(formValues(db, { [due]: { start: '2026-01-01' } }), '“Name” is required.');
  assert.deepEqual(formValues(db, { [name]: 'Hello', secret: 'x' }), { [name]: 'Hello' });
});

test('emptyDb has a Name column and one table view; presets fill every view with every property', () => {
  const e = emptyDb(counter());
  assert.equal(e.props.length, 1);
  assert.equal(e.views[0].layout, 'table');
  const p = presetDb('projects', counter());
  for (const v of p.views) assert.equal(v.visible.length, p.props.length - 1);
});
