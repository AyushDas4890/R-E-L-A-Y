import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSignup, domainAllowed, normalizeDomains } from './signup.ts';

const base = { email: 'ada@example.com', emailVerified: true, isMember: false, removed: false, hasOwner: true, ownerEmail: undefined, allowedDomains: [], inviteOnly: false, validInvite: false, defaultRole: 'member' as const };

test('existing member signs in regardless of policy', () => {
  assert.deepEqual(decideSignup({ ...base, isMember: true, inviteOnly: true }), { ok: true, role: 'member' });
});
test('removed user is rejected even with a valid invite', () => {
  assert.deepEqual(decideSignup({ ...base, removed: true, validInvite: true }), { ok: false, reason: 'removed' });
});
test('unverified email is rejected', () => {
  assert.deepEqual(decideSignup({ ...base, emailVerified: false }), { ok: false, reason: 'unverified' });
});
test('owner email becomes owner even when an owner exists', () => {
  assert.deepEqual(decideSignup({ ...base, ownerEmail: 'Ada@Example.com' }), { ok: true, role: 'owner' });
});
test('without owner and without RELAY_OWNER_EMAIL the first signer is owner', () => {
  assert.deepEqual(decideSignup({ ...base, hasOwner: false }), { ok: true, role: 'owner' });
});
test('without owner but with RELAY_OWNER_EMAIL set, a stranger on an open org is rejected as owner-pending', () => {
  assert.deepEqual(decideSignup({ ...base, hasOwner: false, ownerEmail: 'boss@example.com', inviteOnly: false }), { ok: false, reason: 'owner-pending' });
});
test('without owner, allowed-domain signer joins as member', () => {
  assert.deepEqual(decideSignup({ ...base, hasOwner: false, ownerEmail: 'boss@example.com', allowedDomains: ['example.com'] }), { ok: true, role: 'member' });
});
test('allowed domain matches case-insensitively', () => {
  assert.deepEqual(decideSignup({ ...base, email: 'Ada@EXAMPLE.COM', inviteOnly: true, allowedDomains: ['example.com'] }), { ok: true, role: 'member' });
});
test('invite-only without invite or domain is invite-required', () => {
  assert.deepEqual(decideSignup({ ...base, inviteOnly: true }), { ok: false, reason: 'invite-required' });
});
test('domain list set and email outside it on an open org is rejected with domain', () => {
  assert.deepEqual(decideSignup({ ...base, allowedDomains: ['corp.io'] }), { ok: false, reason: 'domain' });
});
test('valid invite overrides domain list', () => {
  assert.deepEqual(decideSignup({ ...base, allowedDomains: ['corp.io'], validInvite: true }), { ok: true, role: 'member' });
});
test('new signer gets defaultRole', () => {
  assert.deepEqual(decideSignup({ ...base, defaultRole: 'guest' }), { ok: true, role: 'guest' });
});
test('domainAllowed', () => {
  assert.equal(domainAllowed('a@b.co', ['b.co']), true);
  assert.equal(domainAllowed('a@sub.b.co', ['b.co']), false);
  assert.equal(domainAllowed(null, ['b.co']), false);
  assert.equal(domainAllowed('a@b.co', []), false);
});
test('normalizeDomains cleans input', () => {
  assert.deepEqual(normalizeDomains([' @Example.com ', 'example.com', '', 7, 'x.io']), ['example.com', 'x.io']);
  assert.equal(normalizeDomains(Array(60).fill('a.io').map((d, i) => `${i}${d}`)).length, 50);
  assert.deepEqual(normalizeDomains('nope'), []);
});
