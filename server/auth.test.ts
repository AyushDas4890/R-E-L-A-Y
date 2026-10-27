import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, type AuthClient } from './auth.ts';

function clientReturning(result: Awaited<ReturnType<AuthClient['auth']['getUser']>>): AuthClient {
  return { auth: { getUser: async () => result } };
}

test('verifyToken maps a valid user with metadata', async () => {
  const client = clientReturning({
    data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Ada', avatar_url: 'http://x/a.png' } } },
    error: null,
  });
  const id = await verifyToken('tok', client);
  assert.deepEqual(id, { userId: 'u1', name: 'Ada', email: 'a@b.com', avatarUrl: 'http://x/a.png' });
});

test('verifyToken falls back to email prefix when name metadata is missing', async () => {
  const client = clientReturning({
    data: { user: { id: 'u2', email: 'bob@b.com', user_metadata: {} } },
    error: null,
  });
  const id = await verifyToken('tok', client);
  assert.equal(id?.name, 'bob');
});

test('verifyToken returns null on error', async () => {
  const client = clientReturning({ data: { user: null }, error: { message: 'bad jwt' } });
  assert.equal(await verifyToken('tok', client), null);
});

test('verifyToken returns null when no token is given', async () => {
  const client = clientReturning({ data: { user: { id: 'x', email: null, user_metadata: {} } }, error: null });
  assert.equal(await verifyToken('', client), null);
});
