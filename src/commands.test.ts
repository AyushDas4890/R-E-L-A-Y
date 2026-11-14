import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, rankCommands, pushRecent } from './commands.ts';

const GROUPS = ['Navigate', 'Create', 'Preferences', 'Admin'];

test('empty query lists every allowed command in group order and hides admin-only ones', () => {
  const out = rankCommands('', COMMANDS, false);
  assert.ok(out.length > 0);
  assert.equal(out.some((c) => c.adminOnly), false);
  assert.equal(out.some((c) => c.id === 'admin-console'), false);
  const order = out.map((c) => GROUPS.indexOf(c.group));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(out.length, COMMANDS.filter((c) => !c.adminOnly).length);
});

test('admins see admin-only commands', () => {
  assert.ok(rankCommands('', COMMANDS, true).some((c) => c.id === 'admin-console'));
  assert.equal(rankCommands('', COMMANDS, true).length, COMMANDS.length);
});

test('a label match ranks first', () => {
  assert.equal(rankCommands('dark', COMMANDS, false)[0].id, 'theme-dark');
  assert.equal(rankCommands('DARK', COMMANDS, false)[0].id, 'theme-dark');
});

test('a keyword match is found when the label does not match', () => {
  const out = rankCommands('dens', COMMANDS, false);
  assert.ok(out.some((c) => c.id === 'toggle-density'));
  const cmd = COMMANDS.find((c) => c.id === 'toggle-density')!;
  assert.equal(cmd.label.toLowerCase().includes('dens'), false);
});

test('label matches come before keyword-only matches', () => {
  const cmds = [
    { id: 'a', label: 'Alpha', keywords: ['theme'], group: 'Navigate' as const },
    { id: 'b', label: 'Theme picker', group: 'Preferences' as const },
  ];
  assert.deepEqual(rankCommands('theme', cmds, false).map((c) => c.id), ['b', 'a']);
});

test('no match returns nothing', () => {
  assert.deepEqual(rankCommands('zzzqqq', COMMANDS, true), []);
});

test('the brief command ids are all present', () => {
  const ids = ['go-home', 'go-dms', 'go-activity', 'go-saved', 'go-people', 'go-calendar', 'go-pages', 'new-channel', 'new-dm', 'set-status', 'toggle-density', 'theme-dark', 'theme-light', 'shortcuts', 'admin-console', 'invite-people'];
  assert.deepEqual(COMMANDS.map((c) => c.id).sort(), [...ids].sort());
});

test('pushRecent moves to front, dedupes and caps at 8', () => {
  let list = pushRecent([], 'a', 1);
  list = pushRecent(list, 'b', 2);
  list = pushRecent(list, 'a', 3);
  assert.deepEqual(list, [{ id: 'a', ts: 3 }, { id: 'b', ts: 2 }]);
  for (let i = 0; i < 12; i++) list = pushRecent(list, `x${i}`, 10 + i);
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 'x11');
  assert.equal(new Set(list.map((r) => r.id)).size, 8);
});

test('pushRecent honours a custom cap and does not mutate its input', () => {
  const start = [{ id: 'a', ts: 1 }];
  const out = pushRecent(start, 'b', 2, 1);
  assert.deepEqual(out, [{ id: 'b', ts: 2 }]);
  assert.deepEqual(start, [{ id: 'a', ts: 1 }]);
});
