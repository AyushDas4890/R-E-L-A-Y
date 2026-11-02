import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTICLES, CATEGORIES, articleBySlug, searchArticles, type Block } from './help.ts';

const texts = (b: Block): string[] => ('p' in b ? [b.p] : 'h' in b ? [b.h] : 'note' in b ? [b.note] : 'ul' in b ? b.ul : b.ol);

test('every article has a unique url-safe slug, a real category, a summary and a body', () => {
  const slugs = ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const a of ARTICLES) {
    assert.match(a.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.slug);
    assert.ok(CATEGORIES.some((c) => c.id === a.category), `${a.slug}: unknown category`);
    assert.ok(a.title.trim() && a.summary.trim() && a.body.length > 0, a.slug);
  }
});

test('every category has at least one article', () => {
  for (const c of CATEGORIES) assert.ok(ARTICLES.some((a) => a.category === c.id), c.id);
});

test('no empty text blocks, and backticks are always paired so code spans render', () => {
  for (const a of ARTICLES) {
    for (const t of a.body.flatMap(texts)) {
      assert.ok(t.trim(), `${a.slug}: empty block`);
      assert.equal((t.match(/`/g) ?? []).length % 2, 0, `${a.slug}: unpaired backtick in "${t.slice(0, 40)}"`);
    }
  }
});

test('articleBySlug finds an article and nothing else', () => {
  assert.equal(articleBySlug('huddles')?.title, 'Huddles: voice and screen sharing');
  assert.equal(articleBySlug('nope'), undefined);
  assert.equal(articleBySlug(''), undefined);
});

test('search ranks title matches first and ignores case and punctuation', () => {
  assert.equal(searchArticles('HUDDLES!')[0].slug, 'huddles');
  assert.equal(searchArticles('delete account')[0].slug, 'delete-account');
});

test('every word typed must match, so more words narrow the results', () => {
  const wide = searchArticles('email');
  const narrow = searchArticles('email 15 minutes');
  assert.ok(wide.length >= narrow.length && narrow.length > 0);
  assert.equal(narrow[0].slug, 'email-notifications');
  assert.deepEqual(searchArticles('email zzzzqq'), []);
});

test('search finds articles through their keywords and ignores empty queries', () => {
  assert.ok(searchArticles('gdpr').some((a) => a.slug === 'delete-account'));
  assert.deepEqual(searchArticles(''), []);
  assert.deepEqual(searchArticles('   '), []);
  assert.deepEqual(searchArticles('a'), []);
});
