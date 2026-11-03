// The editor's pure model: rich text spans, markdown shortcuts, pasting and exporting. No DOM here
// (so it can be unit-tested); src/components/pages/Editable.tsx does the DOM side.
import type { Block, BlockType, Rich } from './types.ts';

// ---- Rich text ----

export const plain = (spans: Rich[]): string => spans.map((s) => s.t).join('');
export const richLength = (spans: Rich[]): number => spans.reduce((n, s) => n + s.t.length, 0);

const flagsOf = (s: Rich): string => JSON.stringify([s.b, s.i, s.u, s.s, s.c, s.link, s.color, s.mention?.kind, s.mention?.id]);

// Joins neighbours that look the same and drops empty runs. Mentions never merge: each is one thing.
export function tidy(spans: Rich[]): Rich[] {
  const out: Rich[] = [];
  for (const s of spans) {
    if (s.t === '') continue;
    const prev = out[out.length - 1];
    if (prev && !s.mention && !prev.mention && flagsOf(prev) === flagsOf(s)) prev.t += s.t;
    else out.push({ ...s });
  }
  return out;
}

// The part of `spans` between two character offsets.
export function sliceRich(spans: Rich[], start: number, end = Infinity): Rich[] {
  const out: Rich[] = [];
  let at = 0;
  for (const s of spans) {
    const from = Math.max(start, at);
    const to = Math.min(end, at + s.t.length);
    if (from < to) {
      // A mention is atomic: keep it whole if it overlaps at all.
      out.push(s.mention ? { ...s } : { ...s, t: s.t.slice(from - at, to - at) });
    }
    at += s.t.length;
  }
  return out;
}

export function splitRich(spans: Rich[], offset: number): [Rich[], Rich[]] {
  return [tidy(sliceRich(spans, 0, offset)), tidy(sliceRich(spans, offset))];
}

export const joinRich = (a: Rich[], b: Rich[]): Rich[] => tidy([...a, ...b]);

export const sameRich = (a: Rich[], b: Rich[]): boolean => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

type Flag = 'b' | 'i' | 'u' | 's' | 'c';

// Turns a style on (or off) for a range of characters.
export function formatRange(spans: Rich[], start: number, end: number, flag: Flag, on: boolean): Rich[] {
  const before = sliceRich(spans, 0, start);
  const mid = sliceRich(spans, start, end).map((s) => {
    const next = { ...s };
    if (on) next[flag] = 1;
    else delete next[flag];
    return next;
  });
  return tidy([...before, ...mid, ...sliceRich(spans, end)]);
}

// True when every character in the range already has the style.
export function hasFlag(spans: Rich[], start: number, end: number, flag: Flag): boolean {
  const mid = sliceRich(spans, start, end);
  return mid.length > 0 && mid.every((s) => !!s[flag]);
}

export function setLink(spans: Rich[], start: number, end: number, link: string | null): Rich[] {
  const mid = sliceRich(spans, start, end).map((s) => {
    const next = { ...s };
    if (link) next.link = link;
    else delete next.link;
    return next;
  });
  return tidy([...sliceRich(spans, 0, start), ...mid, ...sliceRich(spans, end)]);
}

export function setColor(spans: Rich[], start: number, end: number, color: string): Rich[] {
  const mid = sliceRich(spans, start, end).map((s) => {
    const next = { ...s };
    if (color) next.color = color;
    else delete next.color;
    return next;
  });
  return tidy([...sliceRich(spans, 0, start), ...mid, ...sliceRich(spans, end)]);
}

// Replaces characters [start, end) with some other spans (a mention, say).
export const replaceRange = (spans: Rich[], start: number, end: number, insert: Rich[]): Rich[] =>
  tidy([...sliceRich(spans, 0, start), ...insert, ...sliceRich(spans, end)]);

// Inline markdown the moment its closing mark is typed: **bold**, *italic*, `code`, ~strike~.
// `caret` is the offset after the closing mark. Returns the new spans and caret, or null.
const INLINE: [RegExp, Flag][] = [
  [/\*\*([^*]+)\*\*$/, 'b'],
  [/(?<![*\w])\*([^*\s][^*]*)\*$/, 'i'],
  [/`([^`]+)`$/, 'c'],
  [/(?<![~\w])~([^~\s][^~]*)~$/, 's'],
];
export function inlineMarkdown(spans: Rich[], caret: number): { spans: Rich[]; caret: number } | null {
  const before = plain(sliceRich(spans, 0, caret));
  for (const [re, flag] of INLINE) {
    const m = re.exec(before);
    if (!m) continue;
    const mark = flag === 'b' ? 2 : 1;
    const start = m.index;
    const inner = m[1];
    // The marks are removed and the text between them gets the style.
    let next = replaceRange(spans, start, caret, [{ t: inner }]);
    next = formatRange(next, start, start + inner.length, flag, true);
    void mark;
    return { spans: next, caret: start + inner.length };
  }
  return null;
}

// ---- Markdown shortcuts at the start of a line ----

export interface Shortcut { type: BlockType; checked?: boolean; language?: string; rest: string }

// `text` is what has been typed in an empty-typed block. Returns what the block should become.
export function lineShortcut(text: string): Shortcut | null {
  let m: RegExpExecArray | null;
  if ((m = /^(#{1,3}) (.*)$/s.exec(text))) return { type: (['h1', 'h2', 'h3'] as const)[m[1].length - 1], rest: m[2] };
  if ((m = /^[-*+] (.*)$/s.exec(text))) return { type: 'bullet', rest: m[1] };
  if ((m = /^(?:\d{1,3}|[a-z]|[ivx]{1,4})\. (.*)$/s.exec(text))) return { type: 'number', rest: m[1] };
  if ((m = /^\[( |x)?\] (.*)$/s.exec(text))) return { type: 'todo', checked: m[1] === 'x', rest: m[2] };
  if ((m = /^> (.*)$/s.exec(text))) return { type: 'toggle', rest: m[1] };
  if ((m = /^" (.*)$/s.exec(text))) return { type: 'quote', rest: m[1] };
  if ((m = /^```([A-Za-z0-9+#]{0,20}) ?(.*)$/s.exec(text)) && text.length >= 3) return { type: 'code', language: m[1] || undefined, rest: m[2] };
  if (text === '---') return { type: 'divider', rest: '' };
  return null;
}

// ---- Slash and @ menus ----

export interface BlockChoice { type: BlockType; label: string; hint: string; keys: string; group: string; extra?: Partial<Block> }

export const BLOCK_CHOICES: BlockChoice[] = [
  { type: 'text', label: 'Text', hint: 'Just start writing', keys: 'text paragraph plain', group: 'Basic' },
  { type: 'h1', label: 'Heading 1', hint: 'Big section heading', keys: 'h1 heading title large', group: 'Basic' },
  { type: 'h2', label: 'Heading 2', hint: 'Medium section heading', keys: 'h2 heading subtitle', group: 'Basic' },
  { type: 'h3', label: 'Heading 3', hint: 'Small section heading', keys: 'h3 heading small', group: 'Basic' },
  { type: 'todo', label: 'To-do list', hint: 'Track tasks with checkboxes', keys: 'todo task checkbox check', group: 'Basic' },
  { type: 'bullet', label: 'Bulleted list', hint: 'A simple bulleted list', keys: 'bullet list unordered ul', group: 'Basic' },
  { type: 'number', label: 'Numbered list', hint: 'A list with numbering', keys: 'number list ordered ol', group: 'Basic' },
  { type: 'toggle', label: 'Toggle list', hint: 'Hide and show content inside', keys: 'toggle collapse fold', group: 'Basic' },
  { type: 'quote', label: 'Quote', hint: 'Capture a quote', keys: 'quote blockquote', group: 'Basic' },
  { type: 'callout', label: 'Callout', hint: 'Make writing stand out', keys: 'callout note tip warning', group: 'Basic', extra: { icon: '💡' } },
  { type: 'divider', label: 'Divider', hint: 'Visually divide blocks', keys: 'divider line hr separator', group: 'Basic' },
  { type: 'subpage', label: 'Page', hint: 'Embed a sub-page in this page', keys: 'page subpage new', group: 'Basic' },
  { type: 'pageLink', label: 'Link to page', hint: 'Link to an existing page', keys: 'link page reference', group: 'Basic' },
  { type: 'table', label: 'Table', hint: 'A simple grid of text', keys: 'table grid rows columns simple', group: 'Basic', extra: { rows: [['', ''], ['', '']], header: true } },
  { type: 'columns', label: '2 columns', hint: 'Two blocks side by side', keys: 'columns column layout two', group: 'Layout' },
  { type: 'code', label: 'Code', hint: 'A block of code', keys: 'code snippet pre', group: 'Media', extra: { language: 'plain' } },
  { type: 'image', label: 'Image', hint: 'Embed an image from a link', keys: 'image picture photo', group: 'Media' },
  { type: 'file', label: 'File', hint: 'Link to a file', keys: 'file attachment pdf document', group: 'Media' },
  { type: 'bookmark', label: 'Web bookmark', hint: 'Save a link as a visual card', keys: 'bookmark link url web', group: 'Media' },
  { type: 'equation', label: 'Block equation', hint: 'Display a math expression', keys: 'equation math formula latex', group: 'Advanced' },
  { type: 'toc', label: 'Table of contents', hint: 'Links to the headings on this page', keys: 'toc table contents outline', group: 'Advanced' },
  { type: 'breadcrumb', label: 'Breadcrumb', hint: 'Where this page lives', keys: 'breadcrumb path trail', group: 'Advanced' },
];

// Fuzzy-ish match: every typed word must start a word in the label or keys. Best matches first.
export function filterChoices<T extends { label: string; keys?: string }>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored: [number, T][] = [];
  for (const it of items) {
    const hay = `${it.label} ${it.keys ?? ''}`.toLowerCase().split(/[\s/]+/);
    let score = 0;
    for (const w of words) {
      const i = hay.findIndex((h) => h.startsWith(w));
      if (i < 0) {
        score = -1;
        break;
      }
      score += i === 0 ? 0 : 1;
    }
    if (score >= 0) scored.push([score, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, it]) => it);
}

// An open "/something" or "@something" right before the caret, if there is one.
export function trigger(text: string, caret: number): { kind: '/' | '@' | '[['; from: number; query: string } | null {
  const before = text.slice(0, caret);
  let m = /(?:^|\s)\/([\w ]{0,24})$/.exec(before);
  if (m) return { kind: '/', from: caret - m[1].length - 1, query: m[1] };
  m = /(?:^|\s)@([\w ]{0,24})$/.exec(before);
  if (m) return { kind: '@', from: caret - m[1].length - 1, query: m[1] };
  m = /\[\[([\w ]{0,24})$/.exec(before);
  if (m) return { kind: '[[', from: caret - m[1].length - 2, query: m[1] };
  return null;
}

// ---- Dates for @today, @tomorrow and the like ----

export function dateChoices(from = new Date()): { label: string; id: string }[] {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n: number) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  const nextMonday = plus(((8 - from.getDay()) % 7) || 7);
  return [
    { label: 'Today', id: iso(plus(0)) },
    { label: 'Tomorrow', id: iso(plus(1)) },
    { label: 'Yesterday', id: iso(plus(-1)) },
    { label: 'Next Monday', id: iso(nextMonday) },
    { label: 'In a week', id: iso(plus(7)) },
  ];
}

export function formatDateId(id: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return id;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---- Pasting and exporting markdown ----

export interface Draft { type: BlockType; text: Rich[]; checked?: boolean; language?: string; depth: number }

// Turns pasted text into blocks, one per line, recognising markdown lists, headings, to-dos, quotes,
// dividers and fenced code. Indentation of two spaces (or a tab) nests a list item.
export function parseMarkdown(src: string): Draft[] {
  const out: Draft[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim() || undefined;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      out.push({ type: 'code', text: [{ t: body.join('\n') }], language, depth: 0 });
      continue;
    }
    if (!line.trim()) continue;
    const indent = /^(\s*)/.exec(line)![1].replace(/\t/g, '  ').length;
    const depth = Math.min(3, Math.floor(indent / 2));
    const body = line.trim();
    const sc = lineShortcut(body);
    if (sc && sc.type !== 'code') {
      out.push({ type: sc.type, text: inlineSpans(sc.rest), checked: sc.checked, depth: sc.type === 'bullet' || sc.type === 'number' || sc.type === 'todo' ? depth : 0 });
    } else if (/^(\*\*\*|___)$/.test(body)) {
      out.push({ type: 'divider', text: [], depth: 0 });
    } else {
      out.push({ type: 'text', text: inlineSpans(body), depth: 0 });
    }
  }
  return out;
}

// **bold**, *italic*, `code`, ~strike~ and [text](https://…) inside one line.
export function inlineSpans(line: string): Rich[] {
  const spans: Rich[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|~[^~\s][^~]*~|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) spans.push({ t: line.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) spans.push({ t: tok.slice(2, -2), b: 1 });
    else if (tok.startsWith('*')) spans.push({ t: tok.slice(1, -1), i: 1 });
    else if (tok.startsWith('`')) spans.push({ t: tok.slice(1, -1), c: 1 });
    else if (tok.startsWith('~')) spans.push({ t: tok.slice(1, -1), s: 1 });
    else {
      const l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      spans.push({ t: l[1], link: l[2] });
    }
    last = m.index + tok.length;
  }
  if (last < line.length) spans.push({ t: line.slice(last) });
  return tidy(spans);
}

const mdSpan = (s: Rich): string => {
  let t = s.t;
  if (s.c) t = `\`${t}\``;
  if (s.b) t = `**${t}**`;
  if (s.i) t = `*${t}*`;
  if (s.s) t = `~${t}~`;
  if (s.link) t = `[${t}](${s.link})`;
  return t;
};

// A page as markdown. `pageTitle` resolves a page id for links to other pages.
export function toMarkdown(title: string, blocks: Block[], pageTitle: (id: string) => string = () => 'page'): string {
  const lines: string[] = title ? [`# ${title}`, ''] : [];
  const text = (b: Block) => b.text.map(mdSpan).join('');
  const walk = (list: Block[], depth: number) => {
    let n = 0;
    for (const b of list) {
      const pad = '  '.repeat(depth);
      n = b.type === 'number' ? n + 1 : 0;
      switch (b.type) {
        case 'h1': lines.push(`# ${text(b)}`, ''); break;
        case 'h2': lines.push(`## ${text(b)}`, ''); break;
        case 'h3': lines.push(`### ${text(b)}`, ''); break;
        case 'bullet': lines.push(`${pad}- ${text(b)}`); break;
        case 'number': lines.push(`${pad}${n}. ${text(b)}`); break;
        case 'todo': lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${text(b)}`); break;
        case 'toggle': lines.push(`${pad}- ${text(b)}`); break;
        case 'quote': lines.push(`> ${text(b)}`, ''); break;
        case 'callout': lines.push(`> ${b.icon ?? ''} ${text(b)}`.replace('>  ', '> '), ''); break;
        case 'divider': lines.push('---', ''); break;
        case 'code': lines.push(`\`\`\`${b.language && b.language !== 'plain' ? b.language : ''}`, plain(b.text), '```', ''); break;
        case 'image': lines.push(`![${b.name ?? plain(b.text)}](${b.url ?? ''})`, ''); break;
        case 'file':
        case 'bookmark': lines.push(`[${b.name || plain(b.text) || b.url || 'link'}](${b.url ?? ''})`, ''); break;
        case 'pageLink':
        case 'subpage': lines.push(`[${b.pageId ? pageTitle(b.pageId) : 'page'}]`, ''); break;
        case 'equation': lines.push('$$', plain(b.text), '$$', ''); break;
        case 'table':
          (b.rows ?? []).forEach((row, i) => {
            lines.push(`| ${row.join(' | ')} |`);
            if (i === 0) lines.push(`| ${row.map(() => '---').join(' | ')} |`);
          });
          lines.push('');
          break;
        case 'columns':
        case 'column':
        case 'toc':
        case 'breadcrumb':
          break;
        default:
          lines.push(text(b), '');
      }
      if (b.children.length) walk(b.children, b.type === 'column' || b.type === 'columns' ? depth : depth + 1);
    }
  };
  walk(blocks, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Headings in order, for the table of contents.
export function headings(blocks: Block[]): { id: string; level: 1 | 2 | 3; text: string }[] {
  const out: { id: string; level: 1 | 2 | 3; text: string }[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') out.push({ id: b.id, level: Number(b.type[1]) as 1 | 2 | 3, text: plain(b.text) });
      walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

// Words and characters of a page, for the page menu.
export function counts(blocks: Block[]): { words: number; chars: number } {
  let text = '';
  const walk = (list: Block[]) => {
    for (const b of list) {
      text += `${plain(b.text)} `;
      if (b.rows) text += b.rows.flat().join(' ') + ' ';
      walk(b.children);
    }
  };
  walk(blocks);
  const t = text.trim();
  return { words: t ? t.split(/\s+/).length : 0, chars: t.length };
}

// What a block becomes when its type changes: lists keep their text, dividers lose it, and so on.
export function turnInto(b: Block, type: BlockType): Partial<Block> {
  const patch: Partial<Block> = { type };
  if (type === 'todo' && b.checked === undefined) patch.checked = false;
  return patch;
}

export const TEXTY: ReadonlySet<BlockType> = new Set<BlockType>(['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout']);
export const LISTY: ReadonlySet<BlockType> = new Set<BlockType>(['bullet', 'number', 'todo']);

export const newBlockId = (): string => crypto.randomUUID();
export const emptyBlock = (type: BlockType = 'text', extra: Partial<Block> = {}): Block => ({ id: newBlockId(), type, text: [], children: [], rev: 1, ...extra });
