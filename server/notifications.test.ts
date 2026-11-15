import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest, digestLine, enqueue, mayEmail, recipients, takeDue, type Outbox } from './notifications.ts';
import { consoleProvider, createMailer, resendProvider } from './mailer.ts';
import { emptyPrefs } from './prefs.ts';
import type { Channel, Message, User } from '../src/types.ts';

const user = (id: string, over: Partial<User> = {}): User => ({ id, name: id, color: '#000', title: '', status: { emoji: '', text: '' }, email: `${id}@x.io`, ...over });
const users = { alice: user('alice'), bob: user('bob'), cat: user('cat'), bot: user('bot', { bot: true }), gone: user('gone', { inactive: true }) };
const chan = (over: Partial<Channel>): Channel => ({ id: 'c', name: 'general', topic: '', kind: 'public', members: ['alice', 'bob', 'cat'], createdAt: 0, ...over });
const msg = (over: Partial<Message>): Message => ({ id: 'm', channelId: 'c', userId: 'alice', text: 'hi', ts: 1, reactions: {}, ...over });
const seeAll = () => true;

test('a DM goes to the other person only', () => {
  const dm = chan({ id: 'dm', kind: 'dm', members: ['alice', 'bob'] });
  assert.deepEqual(recipients(msg({ channelId: 'dm' }), dm, users, [], seeAll), ['bob']);
});

test('a channel message goes only to people it mentions, never the author, bots or departed users', () => {
  assert.deepEqual(recipients(msg({ text: 'plain chatter' }), chan({}), users, [], seeAll), []);
  assert.deepEqual(recipients(msg({ text: 'hey <@bob> and <@alice> and <@bot> <@gone>' }), chan({}), users, [], seeAll), ['bob']);
});

test('group mentions reach group members', () => {
  const groups = [{ id: 'g1', handle: 'eng', name: 'Eng', members: ['bob', 'cat'] }];
  assert.deepEqual(recipients(msg({ text: 'ping <!g:g1>' }), chan({}), users, groups, seeAll), ['bob', 'cat']);
});

test('a mention cannot carry a private channel message to someone outside it', () => {
  const priv = chan({ kind: 'private', members: ['alice', 'bob'] });
  const canSee = (ch: Channel, id: string) => ch.kind === 'public' || ch.members.includes(id);
  assert.deepEqual(recipients(msg({ text: '<@bob> <@cat>' }), priv, users, [], canSee), ['bob']);
});

test('system messages never email', () => {
  assert.deepEqual(recipients(msg({ system: true, text: '<@bob>' }), chan({}), users, [], seeAll), []);
});

test('mayEmail honours address, switch, mute and Do Not Disturb', () => {
  const now = 1000;
  assert.equal(mayEmail(users.bob, emptyPrefs(), 'c', now), true);
  assert.equal(mayEmail(user('x', { email: undefined }), emptyPrefs(), 'c', now), false);
  assert.equal(mayEmail(users.bob, { ...emptyPrefs(), email: false }, 'c', now), false);
  assert.equal(mayEmail(users.bob, { ...emptyPrefs(), levels: { c: 'mute' } }, 'c', now), false);
  assert.equal(mayEmail(users.bob, { ...emptyPrefs(), levels: { c: 'all' } }, 'c', now), true);
  assert.equal(mayEmail(users.bob, { ...emptyPrefs(), dndUntil: now + 1 }, 'c', now), false);
  assert.equal(mayEmail(users.bob, { ...emptyPrefs(), dndUntil: now }, 'c', now), true);
  assert.equal(mayEmail(users.gone, emptyPrefs(), 'c', now), false);
});

test('a burst becomes one batch after the delay', () => {
  const box: Outbox = new Map();
  enqueue(box, 'bob', { channelId: 'c', messageId: '1', ts: 1 }, 0, 100);
  enqueue(box, 'bob', { channelId: 'c', messageId: '2', ts: 2 }, 50, 100);
  assert.deepEqual(takeDue(box, new Map(), 99), []);
  const due = takeDue(box, new Map(), 100);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0][1].map((p) => p.messageId), ['1', '2']);
  assert.equal(box.size, 0);
});

test('someone emailed recently waits out the minimum gap, keeping their messages', () => {
  const box: Outbox = new Map();
  enqueue(box, 'bob', { channelId: 'c', messageId: '1', ts: 1 }, 0, 100);
  const lastSent = new Map([['bob', 90]]);
  assert.deepEqual(takeDue(box, lastSent, 200, 1000), []);
  assert.equal(box.get('bob')!.dueAt, 1090);
  assert.equal(takeDue(box, lastSent, 1090, 1000).length, 1);
});

test('a pending batch stops growing at 50', () => {
  const box: Outbox = new Map();
  for (let i = 0; i < 80; i++) enqueue(box, 'bob', { channelId: 'c', messageId: String(i), ts: i }, 0);
  assert.equal(box.get('bob')!.items.length, 50);
});

test('digest wording for one DM, one mention and many', () => {
  const dm = digestLine(msg({ text: 'lunch?' }), chan({ id: 'dm', kind: 'dm', name: 'dm-alice-bob' }), users);
  assert.equal(digest([dm], 'Acme').subject, 'alice sent you a message in Acme');
  const mention = digestLine(msg({ text: 'see <@bob>' }), chan({}), users);
  assert.equal(digest([mention], 'Acme').subject, 'alice mentioned you in #general');
  assert.match(digest([mention], 'Acme').text, /alice in #general: see @bob/);
  const many = digest([dm, mention, mention], 'Acme', 'https://app.example/?ws=hq');
  assert.equal(many.subject, '3 new messages for you in Acme');
  assert.match(many.text, /Open Relay: https:\/\/app\.example\/\?ws=hq/);
  assert.doesNotMatch(digest([dm], 'Acme').text, /Open Relay/);
});

test('names and workspace titles cannot add lines to the subject or body', () => {
  const evil = { ...users, alice: user('alice', { name: 'Eve\r\nBcc: spy@x.io' }) };
  const line = digestLine(msg({}), chan({ name: 'a\nb' }), evil);
  const out = digest([line], 'Ws\r\nX-Injected: 1');
  assert.doesNotMatch(out.subject, /[\r\n]/);
  assert.equal(out.text.split('\n').filter((l) => /^Bcc:|^X-Injected:/.test(l)).length, 0);
});

test('a file with no text is described', () => {
  const line = digestLine(msg({ text: '', files: [{ name: 'a.png', type: 'image/png', size: 1 }] }), chan({}), users);
  assert.match(digest([line], 'Acme').text, /shared a file/);
});

test('email stays off unless a known provider is named; console masks the address', async () => {
  assert.equal(createMailer({}), null);
  assert.equal(createMailer({ RELAY_EMAIL_PROVIDER: 'nope' }), null);
  assert.equal(createMailer({ RELAY_EMAIL_PROVIDER: 'console' })?.name, 'console');
  const lines: string[] = [];
  await consoleProvider((l) => lines.push(l)).send({ to: 'bob@x.io', subject: 'S', text: 'T' });
  assert.match(lines[0], /b\*\*\*@x\.io/);
  assert.doesNotMatch(lines[0], /bob@/);
});

test('resend posts the email to its API with the key in a header only', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
  await resendProvider({ apiKey: 'KEY123', from: 'Relay <relay@x.io>', fetchImpl: ok }).send({ to: 'bob@x.io', subject: 'S', text: 'T' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer KEY123');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { from: 'Relay <relay@x.io>', to: ['bob@x.io'], subject: 'S', text: 'T' });
  assert.doesNotMatch(calls[0].init.body as string, /KEY123/);
});

test('a refusal from resend becomes an error without the key or the address', async () => {
  const refuse = (async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(
    resendProvider({ apiKey: 'KEY123', from: 'f@x.io', fetchImpl: refuse }).send({ to: 'bob@x.io', subject: 'S', text: 'T' }),
    (err: Error) => err.message === 'resend 403: domain not verified' && !/KEY123|bob@/.test(err.message),
  );
  const bare = (async () => new Response('oops', { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(resendProvider({ apiKey: 'k', from: 'f', fetchImpl: bare }).send({ to: 'b@x.io', subject: 'S', text: 'T' }), /^Error: resend 500$/);
});

test('resend stays off until both its settings are present', () => {
  assert.equal(createMailer({ RELAY_EMAIL_PROVIDER: 'resend' }), null);
  assert.equal(createMailer({ RELAY_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }), null);
  assert.equal(createMailer({ RELAY_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', RELAY_EMAIL_FROM: 'Relay <r@x.io>' })?.name, 'resend');
});
