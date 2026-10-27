import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstUrl, isPrivateAddress, parsePreview } from './unfurl.ts';
import { storagePath } from './files.ts';

test('firstUrl finds the first link and trims trailing punctuation', () => {
  assert.equal(firstUrl('see https://example.com/a. and http://b.org'), 'https://example.com/a');
  assert.equal(firstUrl('no links here'), null);
});

test('isPrivateAddress blocks loopback, private and link-local ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('parsePreview prefers Open Graph tags and resolves relative images', () => {
  const html = `<head><title>Fallback</title>
    <meta property="og:title" content="Hello &amp; welcome">
    <meta property="og:description" content="A page">
    <meta property="og:image" content="/img.png"></head>`;
  assert.deepEqual(parsePreview(html, 'https://www.example.com/post'), {
    url: 'https://www.example.com/post',
    title: 'Hello & welcome',
    description: 'A page',
    image: 'https://www.example.com/img.png',
    site: 'example.com',
  });
});

test('parsePreview falls back to <title> and returns null without one', () => {
  assert.equal(parsePreview('<title>Just a title</title>', 'https://x.io')?.title, 'Just a title');
  assert.equal(parsePreview('<p>nothing</p>', 'https://x.io'), null);
});

test('storagePath keeps a safe tail of the name under a random folder', () => {
  assert.equal(storagePath('my report (final).pdf', 'abc'), 'abc/my_report_final_.pdf');
});
