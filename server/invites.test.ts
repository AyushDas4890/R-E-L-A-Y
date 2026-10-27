import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, validateInvite, decideRole } from './invites.ts';
import type { Invite } from '../src/types.ts';

function invite(code: string, revoked = false): Invite {
  return { code, createdBy: 'owner', createdAt: 0, revoked };
}

test('generateCode returns a url-safe code of reasonable length', () => {
  const code = generateCode(() => 0.5);
  assert.match(code, /^[0-9a-z]{8,}$/);
});

test('generateCode varies with the random source', () => {
  const a = generateCode(() => 0.1);
  const b = generateCode(() => 0.9);
  assert.notEqual(a, b);
});

test('validateInvite accepts an existing non-revoked code', () => {
  assert.equal(validateInvite('abc', [invite('abc')]), true);
});

test('validateInvite rejects missing or revoked codes', () => {
  assert.equal(validateInvite('nope', [invite('abc')]), false);
  assert.equal(validateInvite('abc', [invite('abc', true)]), false);
  assert.equal(validateInvite('', [invite('abc')]), false);
});

test('decideRole: first user with no owner becomes owner', () => {
  assert.equal(decideRole({ hasOwner: false, isMember: false, validInvite: false }), 'owner');
});

test('decideRole: existing member is admitted as member', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: true, validInvite: false }), 'member');
});

test('decideRole: new user with a valid invite joins as member', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: true }), 'member');
});

test('decideRole: in an invite-only workspace a new user without a valid invite is rejected', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: false, inviteOnly: true }), 'reject');
});

test('decideRole: open workspaces let anyone in; invite-only ones need a code', () => {
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: false }), 'member');
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: false, inviteOnly: true }), 'reject');
  assert.equal(decideRole({ hasOwner: true, isMember: false, validInvite: true, inviteOnly: true }), 'member');
  assert.equal(decideRole({ hasOwner: true, isMember: true, validInvite: false, inviteOnly: true }), 'member');
});
