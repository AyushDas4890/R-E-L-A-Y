import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Block } from './types.ts';
import { actionItems, answer, keyPoints, suggestTitle, summarize } from './localAi.ts';

let n = 0;
const b = (type: Block['type'], text: string, extra: Partial<Block> = {}): Block => ({ id: `b${++n}`, type, text: [{ t: text }], children: [], rev: 1, ...extra });

const TEXT = 'Our launch is planned for March. The launch needs a final design review. Marketing will prepare the announcement by Friday. Lunch is on Tuesday. The design review covers the launch page and the pricing table. We should also follow up with legal about the terms.';

test('summarize keeps the most relevant sentences in their original order and never invents text', () => {
  const s = summarize(TEXT, 3);
  assert.equal(s.length, 3);
  for (const line of s) assert.ok(TEXT.includes(line));
  assert.deepEqual([...s].sort((a, c) => TEXT.indexOf(a) - TEXT.indexOf(c)), s);
  assert.deepEqual(summarize('Short one. Tiny.', 3), []);
});

test('key points are headings with the first sentence under each', () => {
  const blocks = [b('h2', 'Plan'), b('text', 'We ship in March. Then we rest.'), b('h2', 'Risks'), b('bullet', 'Legal may be late.')];
  assert.deepEqual(keyPoints(blocks), ['Plan: We ship in March.', 'Risks: Legal may be late.']);
});

test('action items: open to-dos first, finished ones skipped, commitments found in prose', () => {
  const blocks = [b('todo', 'Book the room', { checked: false }), b('todo', 'Send invites', { checked: true }), b('text', 'Marketing will prepare the announcement by Friday. The weather is nice.')];
  const items = actionItems(blocks);
  assert.equal(items[0], 'Book the room');
  assert.ok(!items.includes('Send invites'));
  assert.ok(items.some((i) => i.startsWith('Marketing will prepare')));
  assert.ok(!items.some((i) => i.includes('weather')));
});

test('a title comes from the first heading, else the most used words', () => {
  assert.equal(suggestTitle([b('text', 'x'), b('h1', 'Q4 Roadmap')]), 'Q4 Roadmap');
  const t = suggestTitle([b('text', 'budget budget budget forecast forecast hiring')]);
  assert.equal(t, 'Budget Forecast Hiring');
});

test('answers come from the documents with their sources, best match first', () => {
  const docs = [
    { id: 'a', title: 'Offsite', text: 'The offsite is in Lisbon in June. Flights are booked by the team lead.' },
    { id: 'b', title: 'Pricing', text: 'The pricing table has three tiers. The team plan costs twelve dollars.' },
  ];
  const r = answer('How much does the team plan cost?', docs, 2);
  assert.equal(r[0].source.id, 'b');
  assert.ok(r[0].text.includes('twelve dollars'));
  assert.deepEqual(answer('zzzz qqqq', docs), []);
  assert.deepEqual(answer('the and of', docs), []);
});
