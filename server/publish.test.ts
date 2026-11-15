import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Block, Page } from '../src/types.ts';
import { PUBLISH_HEADERS, renderPublished } from './publish.ts';

const page = (title: string): Page => ({
  id: 'p', parentId: null, teamspaceId: null, title, icon: '📄', cover: '', font: 'default', smallText: false, fullWidth: false, locked: false, order: 1,
  createdBy: 'u', createdAt: 0, editedBy: 'u', editedAt: 0, access: { entries: [] },
});
const b = (type: Block['type'], text: Block['text'], extra: Partial<Block> = {}): Block => ({ id: Math.random().toString(36), type, text, children: [], rev: 1, ...extra });
const opts = { linkFor: (id: string) => (id === 'pub' ? '/p/ws.tok' : null), titleFor: (id: string) => (id === 'pub' ? 'Public child' : id === 'priv' ? 'Private child' : null), siteName: 'Relay' };

test('everything from the page is escaped, scripts and bad links never reach the output', () => {
  const html = renderPublished(page('<script>alert(1)</script>'), {
    blocks: [
      b('text', [{ t: '<img src=x onerror=alert(1)>', link: 'javascript:alert(1)' }]),
      b('text', [{ t: 'good', link: 'https://example.com/a?b=1&c=2' }]),
      b('text', [{ t: 'quoted', link: 'https://example.com/"onmouseover="x' }]),
      b('image', [], { url: 'http://insecure.example/x.png' }),
      b('image', [], { url: 'https://ok.example/x.png', name: '"><script>' }),
      b('code', [{ t: '</pre><script>x</script>' }]),
    ],
  }, opts);
  assert.ok(!/<script/i.test(html.replace(/<style>.*<\/style>/s, '')));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'));
  assert.ok(!html.includes('onmouseover'));
  assert.ok(!html.includes('http://insecure.example'));
  assert.ok(html.includes('https://ok.example/x.png'));
});

test('user mentions are hidden and unpublished sub-pages are not linked', () => {
  const html = renderPublished(page('Doc'), {
    blocks: [
      b('text', [{ t: '@Maria Lopez', mention: { kind: 'user', id: 'u9' } }]),
      b('subpage', [], { pageId: 'pub' }),
      b('subpage', [], { pageId: 'priv' }),
      b('subpage', [], { pageId: 'unknown' }),
    ],
  }, opts);
  assert.ok(!html.includes('Maria'));
  assert.ok(html.includes('<a href="/p/ws.tok">Public child</a>'));
  assert.ok(html.includes('<p>Private child</p>'));
  assert.ok(!html.includes('unknown'));
});

test('lists, todos and toggles render; the response forbids script and framing', () => {
  const html = renderPublished(page('Doc'), {
    blocks: [b('bullet', [{ t: 'one' }]), b('bullet', [{ t: 'two' }]), b('todo', [{ t: 'done' }], { checked: true }), b('toggle', [{ t: 'more' }], { children: [b('text', [{ t: 'inside' }])] })],
  }, opts);
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('checked'));
  assert.ok(html.includes('<details><summary>more</summary>'));
  assert.match(PUBLISH_HEADERS['content-security-policy'], /default-src 'none'/);
  assert.equal(PUBLISH_HEADERS['x-frame-options'], 'DENY');
});
