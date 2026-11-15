import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createJwtVerifier, identityFromClaims } from './jwt.ts';

const secret = 'test-secret-at-least-32-characters-long!!';
const key = new TextEncoder().encode(secret);
const mint = (claims: Record<string, unknown>, opts: { exp?: string; alg?: string } = {}) =>
  new SignJWT(claims).setProtectedHeader({ alg: opts.alg ?? 'HS256' }).setSubject('u1').setExpirationTime(opts.exp ?? '1h').sign(key);

test('verifier is null without config', () => { assert.equal(createJwtVerifier({}), null); });
test('valid HS256 token yields claims', async () => {
  const verify = createJwtVerifier({ secret })!;
  const c = await verify(await mint({ email: 'ada@x.io', user_metadata: { full_name: 'Ada', email_verified: true }, app_metadata: { provider: 'google' } }));
  assert.equal(c?.sub, 'u1'); assert.equal(c?.email, 'ada@x.io');
});
test('wrong secret returns null', async () => {
  const verify = createJwtVerifier({ secret: 'another-secret-that-is-also-32-chars-long' })!;
  assert.equal(await verify(await mint({})), null);
});
test('expired token returns null', async () => {
  const verify = createJwtVerifier({ secret })!;
  assert.equal(await verify(await mint({}, { exp: '-1h' })), null);
});
test('garbage and alg none return null without throwing', async () => {
  const verify = createJwtVerifier({ secret })!;
  assert.equal(await verify('not.a.jwt'), null);
  const none = Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from('{"sub":"u1"}').toString('base64url') + '.';
  assert.equal(await verify(none), null);
});
test('identityFromClaims: every valid Supabase JWT counts as verified, metadata is not read', () => {
  assert.equal(identityFromClaims({ sub: 'a', email: 'a@x.io', app_metadata: { provider: 'email' } }).emailVerified, true);
  assert.equal(identityFromClaims({ sub: 'a', email: 'a@x.io', app_metadata: { provider: 'azure' }, user_metadata: {} }).emailVerified, true);
  assert.equal(identityFromClaims({ sub: 'a', email: 'a@x.io', app_metadata: { provider: 'azure' }, user_metadata: { email_verified: true } }).emailVerified, true);
  assert.equal(identityFromClaims({ sub: 'a', email: 'bob@x.io', user_metadata: {} }).name, 'bob');
});
