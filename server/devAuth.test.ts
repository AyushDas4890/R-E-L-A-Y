import test from 'node:test';
import assert from 'node:assert/strict';
import { signup, login, verifyDevToken, hashPassword, type DevAuthDoc } from './devAuth.ts';

const doc = (): DevAuthDoc => ({ secret: 'abc123'.repeat(8), accounts: [] });

test('signup then login round-trips a verifiable token', () => {
  const d = doc();
  const s = signup(d, 'Ada@Example.com', 'hunter22!', 'Ada');
  assert.equal(s.ok, true);
  const l = login(d, 'ada@example.com', 'hunter22!');
  assert.equal(l.ok, true);
  const id = verifyDevToken(d, (l as { token: string }).token);
  assert.equal(id?.email, 'ada@example.com'); assert.equal(id?.name, 'Ada'); assert.equal(id?.emailVerified, true);
});
test('duplicate email, short password, invalid email', () => {
  const d = doc();
  signup(d, 'a@b.co', 'longenough', 'A');
  assert.deepEqual(signup(d, 'A@B.CO', 'longenough', 'A'), { ok: false, error: 'exists' });
  assert.deepEqual(signup(d, 'c@b.co', 'short', 'C'), { ok: false, error: 'weak' });
  assert.deepEqual(signup(d, 'not-an-email', 'longenough', 'C'), { ok: false, error: 'invalid' });
});
test('wrong password and unknown email fail the same way', () => {
  const d = doc();
  signup(d, 'a@b.co', 'longenough', 'A');
  assert.deepEqual(login(d, 'a@b.co', 'nope-nope'), { ok: false, error: 'bad-credentials' });
  assert.deepEqual(login(d, 'zz@b.co', 'longenough'), { ok: false, error: 'bad-credentials' });
});
test('tampered token is rejected', () => {
  const d = doc();
  const { token } = signup(d, 'a@b.co', 'longenough', 'A') as { ok: true; token: string };
  const [p, body, sig] = token.split('.');
  const forged = JSON.parse(Buffer.from(body, 'base64url').toString()); forged.name = 'Mallory';
  assert.equal(verifyDevToken(d, `${p}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`), null);
  assert.equal(verifyDevToken({ ...d, secret: 'other' }, token), null);
});
test('hashPassword is deterministic per salt', () => {
  assert.equal(hashPassword('x', 's1'), hashPassword('x', 's1'));
  assert.notEqual(hashPassword('x', 's1'), hashPassword('x', 's2'));
});
