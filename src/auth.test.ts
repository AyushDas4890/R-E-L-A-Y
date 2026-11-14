import test from 'node:test';
import assert from 'node:assert/strict';
import { devAuthError, friendlyAuthError, redirectWithInvite } from './auth.ts';

test('friendlyAuthError maps known Supabase messages', () => {
  assert.equal(friendlyAuthError('Invalid login credentials'), 'Wrong email or password.');
  assert.equal(friendlyAuthError('User already registered'), 'An account with this email already exists. Sign in instead.');
  assert.equal(friendlyAuthError('Email not confirmed'), 'Check your inbox and confirm your email first.');
  assert.equal(friendlyAuthError('Password should be at least 6 characters'), 'Use at least 8 characters.');
  assert.equal(friendlyAuthError('Something odd'), 'Something odd');
});
test('redirectWithInvite', () => {
  (globalThis as { window?: unknown }).window = { location: { origin: 'https://r.app' } };
  assert.equal(redirectWithInvite(''), 'https://r.app');
  assert.equal(redirectWithInvite('ab c'), 'https://r.app?invite=ab%20c');
});
test('devAuthError maps dev server codes', () => {
  assert.equal(devAuthError('exists'), 'An account with this email already exists. Sign in instead.');
  assert.equal(devAuthError('weak'), 'Use at least 8 characters.');
  assert.equal(devAuthError('invalid'), 'Enter a valid email address.');
  assert.equal(devAuthError('bad-credentials'), 'Wrong email or password.');
  assert.equal(devAuthError('server'), 'Sign-in failed. Try again.');
  assert.equal(devAuthError(undefined), 'Sign-in failed. Try again.');
});
