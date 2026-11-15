// A small assistant that runs entirely in the browser. It finds, ranks and condenses text that is
// already there (summaries, key points, action items, answers with sources). It does not write new
// text and it sends nothing anywhere.
import { plain } from './editor.ts';
import type { Block } from './types.ts';

const STOP = new Set(('a an the and or but if then else of to in on at by for with from as is are was were be been being it its this that these those i you he she we they them his her our your their my me us do does did done have has had will would can could should may might must not no yes so than too very just also about into over under again more most some any each other such only own same can will just than there here when where which who whom what why how all both few many much one two three').split(' '));

const words = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w));
const sentences = (s: string): string[] =>
  s.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((x) => x.trim()).filter((x) => x.length > 12);

export interface Doc { id: string; title: string; text: string }

// The text of a page, one line per block, with the kind of each line.
export function lines(blocks: Block[]): { text: string; type: Block['type']; checked?: boolean; depth: number }[] {
  const out: { text: string; type: Block['type']; checked?: boolean; depth: number }[] = [];
  const walk = (list: Block[], depth: number) => {
    for (const b of list) {
      const text = plain(b.text).trim();
      if (text) out.push({ text, type: b.type, checked: b.checked, depth });
      walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return out;
}

// The most telling sentences, in the order they appear.
export function summarize(text: string, count = 4): string[] {
  const list = sentences(text);
  if (list.length <= count) return list;
  const freq = new Map<string, number>();
  for (const w of words(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = list.map((s, i) => {
    const ws = words(s);
    const score = ws.reduce((n, w) => n + (freq.get(w) ?? 0), 0) / Math.sqrt(ws.length + 3);
    // Earlier sentences tend to carry the point.
    return { s, i, score: score * (1 + 0.3 / (1 + i)) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.i - b.i).map((x) => x.s);
}

// Headings with the first sentence under each.
export function keyPoints(blocks: Block[]): string[] {
  const ls = lines(blocks);
  const out: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    if (!/^h[123]$/.test(ls[i].type)) continue;
    const next = ls.slice(i + 1).find((l) => !/^h[123]$/.test(l.type));
    const first = next ? sentences(next.text)[0] ?? next.text : '';
    out.push(first ? `${ls[i].text}: ${first}` : ls[i].text);
  }
  return out.slice(0, 12);
}

// Open to-dos, plus lines that sound like a commitment.
export function actionItems(blocks: Block[]): string[] {
  const ls = lines(blocks);
  const todos = ls.filter((l) => l.type === 'todo' && !l.checked).map((l) => l.text);
  const said = ls
    .filter((l) => l.type !== 'todo' && !/^h[123]$/.test(l.type))
    .flatMap((l) => sentences(l.text.length > 12 ? `${l.text}.` : l.text))
    .filter((s) => /\b(todo|action item|need to|needs to|should|must|will|follow up|deadline|due|by (mon|tue|wed|thu|fri|sat|sun|tomorrow|next|end of))\b/i.test(s));
  return [...new Set([...todos, ...said.map((s) => s.replace(/\.$/, ''))])].slice(0, 15);
}

// A short title from what a page is about.
export function suggestTitle(blocks: Block[]): string {
  const ls = lines(blocks);
  const head = ls.find((l) => /^h[123]$/.test(l.type));
  if (head) return head.text.slice(0, 60);
  const freq = new Map<string, number>();
  for (const l of ls) for (const w of words(l.text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w[0].toUpperCase() + w.slice(1));
  return top.join(' ').slice(0, 60);
}

export interface Answer { text: string; source: Doc }

// Answers a question with the best-matching sentences from the given documents, each with its source.
export function answer(question: string, docs: Doc[], count = 3): Answer[] {
  const q = words(question);
  if (!q.length) return [];
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(words(`${d.title} ${d.text}`))) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + docs.length / (1 + (df.get(w) ?? 0)));
  const scored: { a: Answer; score: number }[] = [];
  for (const d of docs) {
    const titleWords = new Set(words(d.title));
    for (const s of sentences(d.text)) {
      const sw = new Set(words(s));
      let score = 0;
      for (const w of q) if (sw.has(w)) score += idf(w) + (titleWords.has(w) ? 0.5 : 0);
      if (score > 0) scored.push({ a: { text: s, source: d }, score: score / Math.sqrt(sw.size + 4) });
    }
  }
  const picked: Answer[] = [];
  for (const { a } of scored.sort((x, y) => y.score - x.score)) {
    if (picked.some((p) => p.text === a.text)) continue;
    picked.push(a);
    if (picked.length >= count) break;
  }
  return picked;
}
