import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Block, Rich } from './types.ts';
import {
  counts, dateChoices, filterChoices, formatRange, hasFlag, headings, BLOCK_CHOICES, inlineMarkdown, inlineSpans, joinRich, lineShortcut,
  parseMarkdown, plain, replaceRange, sameRich, setLink, splitRich, tidy, toMarkdown, trigger,
} from './editor.ts';

const r = (t: string, extra: Partial<Rich> = {}): Rich => ({ t, ...extra });
const blk = (id: string, type: Block['type'], text = '', extra: Partial<Block> = {}): Block => ({ id, type, text: text ? [r(text)] : [], children: [], rev: 1, ...extra });

test('tidy joins runs that look the same and drops empty ones, but never merges mentions', () => {
  assert.deepEqual(tidy([r('a'), r('b'), r(''), r('c', { b: 1 })]), [r('ab'), r('c', { b: 1 })]);
  const m = { kind: 'user' as const, id: 'u1' };
  assert.equal(tidy([r('@A', { mention: m }), r('@A', { mention: m })]).length, 2);
});

test('splitting at the caret keeps styles on both sides', () => {
  const [a, b] = splitRich([r('hello '), r('world', { b: 1 })], 8);
  assert.equal(plain(a), 'hello wo');
  assert.deepEqual(b, [r('rld', { b: 1 })]);
  assert.deepEqual(joinRich(a, b), [r('hello '), r('world', { b: 1 })]);
  assert.deepEqual(splitRich([], 0), [[], []]);
});

test('formatting a range toggles one style without touching the rest', () => {
  const bold = formatRange([r('make this bold')], 5, 9, 'b', true);
  assert.deepEqual(bold, [r('make '), r('this', { b: 1 }), r(' bold')]);
  assert.equal(hasFlag(bold, 5, 9, 'b'), true);
  assert.equal(hasFlag(bold, 0, 9, 'b'), false);
  assert.deepEqual(formatRange(bold, 5, 9, 'b', false), [r('make this bold')]);
});

test('links and replacing a range (for a mention)', () => {
  assert.deepEqual(setLink([r('see docs')], 4, 8, 'https://x.dev'), [r('see '), r('docs', { link: 'https://x.dev' })]);
  const m = r('@Ann', { mention: { kind: 'user', id: 'a' } });
  assert.deepEqual(replaceRange([r('hi @a there')], 3, 5, [m]), [r('hi '), m, r(' there')]);
});

test('sameRich ignores how runs are cut', () => {
  assert.equal(sameRich([r('ab')], [r('a'), r('b')]), true);
  assert.equal(sameRich([r('ab')], [r('a'), r('b', { b: 1 })]), false);
});

test('inline markdown applies the style when the closing mark is typed', () => {
  const bold = inlineMarkdown([r('say **loud**')], 12);
  assert.deepEqual(bold, { spans: [r('say '), r('loud', { b: 1 })], caret: 8 });
  assert.deepEqual(inlineMarkdown([r('an *odd* one')], 8)?.spans, [r('an '), r('odd', { i: 1 }), r(' one')]);
  assert.deepEqual(inlineMarkdown([r('run `npm i`')], 11)?.spans, [r('run '), r('npm i', { c: 1 })]);
  assert.deepEqual(inlineMarkdown([r('~gone~')], 6)?.spans, [r('gone', { s: 1 })]);
  assert.equal(inlineMarkdown([r('2 * 3 * 4')], 9), null);
  assert.equal(inlineMarkdown([r('plain text')], 10), null);
});

test('line shortcuts turn typed text into blocks', () => {
  assert.deepEqual(lineShortcut('# Title'), { type: 'h1', rest: 'Title' });
  assert.equal(lineShortcut('### x')?.type, 'h3');
  assert.equal(lineShortcut('- item')?.type, 'bullet');
  assert.equal(lineShortcut('* item')?.type, 'bullet');
  assert.equal(lineShortcut('1. one')?.type, 'number');
  assert.equal(lineShortcut('a. one')?.type, 'number');
  assert.deepEqual(lineShortcut('[] todo'), { type: 'todo', checked: false, rest: 'todo' });
  assert.deepEqual(lineShortcut('[x] done'), { type: 'todo', checked: true, rest: 'done' });
  assert.equal(lineShortcut('> fold')?.type, 'toggle');
  assert.equal(lineShortcut('" said')?.type, 'quote');
  assert.equal(lineShortcut('---')?.type, 'divider');
  assert.equal(lineShortcut('```js ')?.language, 'js');
  assert.equal(lineShortcut('#nospace'), null);
  assert.equal(lineShortcut('hello'), null);
  assert.equal(lineShortcut('####### x'), null);
});

test('the slash menu filters by label and keywords, best first', () => {
  const labels = (q: string) => filterChoices(BLOCK_CHOICES, q).map((c) => c.label);
  assert.ok(labels('head').slice(0, 3).every((l) => l.startsWith('Heading')));
  assert.equal(labels('h1')[0], 'Heading 1');
  assert.ok(labels('checkbox').includes('To-do list'));
  assert.deepEqual(labels('zzzz'), []);
  assert.equal(labels('').length, BLOCK_CHOICES.length);
  assert.equal(labels('bull')[0], 'Bulleted list');
});

test('a / or @ right before the caret opens a menu, but not in the middle of a word', () => {
  assert.deepEqual(trigger('/hea', 4), { kind: '/', from: 0, query: 'hea' });
  assert.deepEqual(trigger('see /', 5), { kind: '/', from: 4, query: '' });
  assert.equal(trigger('a/b', 3), null);
  assert.equal(trigger('http://x', 8), null);
  assert.deepEqual(trigger('hi @an', 6), { kind: '@', from: 3, query: 'an' });
  assert.equal(trigger('me@site', 7), null);
  assert.deepEqual(trigger('go [[pla', 8), { kind: '[[', from: 3, query: 'pla' });
});

test('date choices are real calendar days', () => {
  const d = dateChoices(new Date(2026, 10, 3));
  assert.deepEqual(d.filter((x) => !x.label.startsWith('Remind')).slice(0, 3).map((x) => x.id), ['2026-11-03', '2026-11-04', '2026-11-02']);
  assert.ok(d.slice(0, 2).every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.id)));
  assert.equal(d.find((x) => x.label === 'Next Monday')?.id, '2026-11-09');
  assert.equal(d.find((x) => x.label === 'In a week')?.id, '2026-11-10');
});

test('pasted markdown becomes blocks, with nesting, to-dos and fenced code', () => {
  const got = parseMarkdown('# Plan\n\n- one\n  - nested **bold**\n[x] done\n1. first\n> fold\n```ts\nconst a = 1;\n\nconst b = 2;\n```\nplain [link](https://a.dev)\n---');
  assert.deepEqual(got.map((d) => [d.type, d.depth]), [['h1', 0], ['bullet', 0], ['bullet', 1], ['todo', 0], ['number', 0], ['toggle', 0], ['code', 0], ['text', 0], ['divider', 0]]);
  assert.deepEqual(got[2].text, [r('nested '), r('bold', { b: 1 })]);
  assert.equal(got[3].checked, true);
  assert.equal(got[6].language, 'ts');
  assert.equal(plain(got[6].text), 'const a = 1;\n\nconst b = 2;');
  assert.deepEqual(got[7].text, [r('plain '), r('link', { link: 'https://a.dev' })]);
});

test('inline spans ignore marks that are not closed and unsafe links', () => {
  assert.deepEqual(inlineSpans('2 * 3 and **x'), [r('2 * 3 and **x')]);
  assert.deepEqual(inlineSpans('[x](javascript:alert(1))'), [r('[x](javascript:alert(1))')]);
});

test('markdown export round-trips the common blocks', () => {
  const blocks = [
    blk('1', 'h2', 'Goals'),
    { ...blk('2', 'bullet', 'ship'), children: [blk('3', 'bullet', 'fast')] },
    blk('4', 'todo', 'test', { checked: true }),
    blk('5', 'number', 'a'), blk('6', 'number', 'b'),
    blk('7', 'code', 'x = 1', { language: 'py' }),
    blk('8', 'divider'),
    blk('9', 'table', '', { rows: [['a', 'b'], ['1', '2']] }),
    { id: '10', type: 'text', text: [r('hi ', {}), r('there', { b: 1, link: 'https://a.dev' })], children: [], rev: 1 } as Block,
  ];
  const md = toMarkdown('Doc', blocks);
  assert.match(md, /^# Doc\n\n## Goals\n/);
  assert.match(md, /- ship\n {2}- fast\n/);
  assert.match(md, /- \[x\] test/);
  assert.match(md, /1\. a\n2\. b/);
  assert.match(md, /```py\nx = 1\n```/);
  assert.match(md, /\| a \| b \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  assert.match(md, /hi \[\*\*there\*\*\]\(https:\/\/a\.dev\)/);
  assert.ok(!/\n{3,}/.test(md));
});

test('headings and counts read the whole tree', () => {
  const tree = [blk('a', 'h1', 'One'), { ...blk('b', 'toggle', 'tog two'), children: [blk('c', 'h3', 'Deep')] }];
  assert.deepEqual(headings(tree), [{ id: 'a', level: 1, text: 'One' }, { id: 'c', level: 3, text: 'Deep' }]);
  assert.deepEqual(counts(tree), { words: 4, chars: 16 });
  assert.deepEqual(counts([]), { words: 0, chars: 0 });
});
