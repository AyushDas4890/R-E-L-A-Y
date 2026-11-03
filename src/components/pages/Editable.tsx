// One editable run of rich text. The DOM is the source of truth while someone types (so the caret never
// jumps); it is only rewritten when the text changed from outside, e.g. a teammate's edit.
import { useLayoutEffect, useRef, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatDateId, formatRange, hasFlag, inlineMarkdown, parseMarkdown, plain, richLength, sameRich, setColor, setLink, tidy, trigger, type Draft } from '../../editor.ts';
import type { Rich } from '../../types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type MentionLabel = (m: NonNullable<Rich['mention']>, fallback: string) => string;

export function toHtml(spans: Rich[], label?: MentionLabel): string {
  let html = '';
  for (const s of spans) {
    if (s.mention) {
      const text = label ? label(s.mention, s.t) : s.t;
      html += `<span class="pg-mention ${s.mention.kind}" data-m="${esc(`${s.mention.kind}:${s.mention.id}`)}" contenteditable="false">${esc(text)}</span>`;
      continue;
    }
    let part = esc(s.t).replace(/\n/g, '<br>');
    if (s.c) part = `<code>${part}</code>`;
    if (s.s) part = `<s>${part}</s>`;
    if (s.u) part = `<u>${part}</u>`;
    if (s.i) part = `<i>${part}</i>`;
    if (s.b) part = `<b>${part}</b>`;
    if (s.color) part = `<span class="tc-${esc(s.color)}" data-c="${esc(s.color)}">${part}</span>`;
    if (s.link) part = `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${part}</a>`;
    html += part;
  }
  // A trailing line break needs a second one to show.
  return plain(spans).endsWith('\n') ? `${html}<br>` : html;
}

function walk(node: Node, ctx: Partial<Rich>, out: Rich[]): void {
  if (node.nodeType === 3) {
    out.push({ ...ctx, t: node.nodeValue ?? '' });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === 'BR') {
    out.push({ ...ctx, t: '\n' });
    return;
  }
  if (node.dataset.m) {
    const [kind, ...rest] = node.dataset.m.split(':');
    if (kind === 'user' || kind === 'page' || kind === 'date') out.push({ t: node.textContent ?? '', mention: { kind, id: rest.join(':') } });
    return;
  }
  const next: Partial<Rich> = { ...ctx };
  switch (node.tagName) {
    case 'B': case 'STRONG': next.b = 1; break;
    case 'I': case 'EM': next.i = 1; break;
    case 'U': next.u = 1; break;
    case 'S': case 'STRIKE': case 'DEL': next.s = 1; break;
    case 'CODE': next.c = 1; break;
    case 'A': {
      const href = node.getAttribute('href');
      if (href) next.link = href;
      break;
    }
  }
  if (node.dataset.c) next.color = node.dataset.c;
  // Browsers wrap a new line in a div or p; that is a line break for us.
  if ((node.tagName === 'DIV' || node.tagName === 'P') && out.length) out.push({ t: '\n' });
  node.childNodes.forEach((c) => walk(c, next, out));
}

export function fromDom(el: HTMLElement): Rich[] {
  const out: Rich[] = [];
  el.childNodes.forEach((c) => walk(c, {}, out));
  // One trailing <br> is the browser's caret placeholder, not a typed line break.
  const last = el.lastChild;
  if (last && last.nodeName === 'BR' && out.length && out[out.length - 1].t === '\n') {
    const prev = last.previousSibling;
    if (!prev || prev.nodeName !== 'BR') out.pop();
  }
  return tidy(out);
}

const textLen = (n: Node): number => (n.nodeType === 3 ? (n.nodeValue ?? '').length : n.nodeName === 'BR' ? 1 : n.childNodes.length && !(n as HTMLElement).dataset?.m ? [...n.childNodes].reduce((t, c) => t + textLen(c), 0) : (n.textContent ?? '').length);

function lengthBefore(root: HTMLElement, node: Node, off: number): number {
  let total = 0;
  let done = false;
  const visit = (n: Node) => {
    if (done) return;
    if (n === node) {
      if (n.nodeType === 3) total += off;
      else for (let i = 0; i < off; i++) total += textLen(n.childNodes[i]);
      done = true;
      return;
    }
    if (n.nodeType === 3) total += (n.nodeValue ?? '').length;
    else if (n.nodeName === 'BR') total += 1;
    else if ((n as HTMLElement).dataset?.m) total += (n.textContent ?? '').length;
    else n.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return total;
}

export function selectionIn(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  return { start: lengthBefore(el, r.startContainer, r.startOffset), end: lengthBefore(el, r.endContainer, r.endOffset) };
}

function pointAt(el: HTMLElement, offset: number): { node: Node; off: number } {
  let acc = 0;
  let found: { node: Node; off: number } | null = null;
  const visit = (n: Node, parent: Node, index: number) => {
    if (found) return;
    if (n.nodeType === 3) {
      const len = (n.nodeValue ?? '').length;
      if (offset <= acc + len) found = { node: n, off: offset - acc };
      acc += len;
    } else if (n.nodeName === 'BR') {
      if (offset <= acc) found = { node: parent, off: index };
      acc += 1;
    } else if ((n as HTMLElement).dataset?.m) {
      const len = (n.textContent ?? '').length;
      if (offset <= acc) found = { node: parent, off: index };
      else if (offset <= acc + len) found = { node: parent, off: index + 1 };
      acc += len;
    } else {
      n.childNodes.forEach((c, i) => visit(c, n, i));
    }
  };
  el.childNodes.forEach((c, i) => visit(c, el, i));
  return found ?? { node: el, off: el.childNodes.length };
}

export function setSelection(el: HTMLElement, start: number, end = start): void {
  const sel = window.getSelection();
  if (!sel) return;
  const a = pointAt(el, start);
  const b = start === end ? a : pointAt(el, end);
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Whether the caret is on the first or last visual line, for arrow keys that cross into the next block.
export function caretLine(el: HTMLElement): { first: boolean; last: boolean } {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { first: true, last: true };
  const rects = sel.getRangeAt(0).getClientRects();
  const box = el.getBoundingClientRect();
  const caret = rects.length ? rects[rects.length - 1] : (sel.anchorNode instanceof Element ? sel.anchorNode.getBoundingClientRect() : box);
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  return { first: caret.top - box.top < line * 0.9, last: box.bottom - caret.bottom < line * 0.9 };
}

export interface CaretInfo { spans: Rich[]; start: number; end: number; el: HTMLElement }

export interface EditableProps {
  text: Rich[];
  editable: boolean;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  label: MentionLabel;
  blockId: string;
  onChange: (spans: Rich[], caret: number) => void;
  // Return true when the key was handled and the editor should do nothing more.
  onKey?: (e: ReactKeyboardEvent<HTMLElement>, info: CaretInfo) => boolean | void;
  onTrigger?: (t: ReturnType<typeof trigger>, el: HTMLElement) => void;
  onPasteBlocks?: (drafts: Draft[], info: CaretInfo) => void;
  onFocus?: () => void;
  register: (id: string, el: HTMLElement | null) => void;
}

export function Editable(p: EditableProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dom = fromDom(el);
    if (sameRich(dom, p.text) && el.dataset.ready) return;
    const focused = document.activeElement === el;
    const sel = focused ? selectionIn(el) : null;
    el.innerHTML = toHtml(p.text, p.label);
    el.dataset.ready = '1';
    if (focused && sel) setSelection(el, Math.min(sel.start, richLength(p.text)), Math.min(sel.end, richLength(p.text)));
  });

  const info = (): CaretInfo | null => {
    const el = ref.current;
    if (!el) return null;
    const s = selectionIn(el) ?? { start: 0, end: 0 };
    return { spans: fromDom(el), start: s.start, end: s.end, el };
  };

  // Re-draws the DOM from a model change and puts the selection back.
  const commit = (spans: Rich[], start: number, end = start) => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = toHtml(spans, p.label);
    setSelection(el, start, end);
    p.onChange(spans, end);
  };

  const onInput = () => {
    const i = info();
    if (!i) return;
    const md = inlineMarkdown(i.spans, i.end);
    if (md) {
      commit(md.spans, md.caret);
      return;
    }
    p.onChange(i.spans, i.end);
    p.onTrigger?.(trigger(plain(i.spans), i.end), i.el);
  };

  const format = (flag: 'b' | 'i' | 'u' | 's' | 'c') => {
    const i = info();
    if (!i || i.start === i.end) return;
    commit(formatRange(i.spans, i.start, i.end, flag, !hasFlag(i.spans, i.start, i.end, flag)), i.start, i.end);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const i = info();
    if (!i) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      const map: Record<string, 'b' | 'i' | 'u' | 'c'> = { b: 'b', i: 'i', u: 'u', e: 'c' };
      if (map[k] && !e.shiftKey) {
        e.preventDefault();
        format(map[k]);
        return;
      }
      if (k === 's' && e.shiftKey) {
        e.preventDefault();
        format('s');
        return;
      }
      if (k === 'k' && i.start !== i.end) {
        e.preventDefault();
        const url = window.prompt('Link to (https://…)', 'https://');
        if (url && /^(https?:\/\/|mailto:)/i.test(url)) commit(setLink(i.spans, i.start, i.end, url), i.start, i.end);
        return;
      }
    }
    if (p.multiline && e.key === 'Enter' && !mod) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    if (e.key === 'Tab' && p.multiline && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }
    if (p.onKey?.(e, i)) return;
  };

  const onPaste = (e: ReactClipboardEvent<HTMLElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const i = info();
    if (!text || !i) return;
    if (p.multiline || !text.includes('\n')) {
      document.execCommand('insertText', false, text);
      return;
    }
    const drafts = parseMarkdown(text);
    if (drafts.length > 1 && p.onPasteBlocks) p.onPasteBlocks(drafts, i);
    else document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
  };

  return (
    <div
      ref={(el) => {
        ref.current = el;
        p.register(p.blockId, el);
      }}
      className={`pg-edit ${p.className ?? ''}`}
      data-bid={p.blockId}
      data-ph={p.placeholder}
      contentEditable={p.editable}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline={p.multiline ? true : undefined}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={p.onFocus}
    />
  );
}

// Used by the floating toolbar: applies one change to the selection of whatever block is being edited.
export function formatSelection(el: HTMLElement, action: { kind: 'flag'; flag: 'b' | 'i' | 'u' | 's' | 'c' } | { kind: 'link'; url: string | null } | { kind: 'color'; color: string }): void {
  const s = selectionIn(el);
  if (!s || s.start === s.end) return;
  const spans = fromDom(el);
  let next: Rich[];
  if (action.kind === 'flag') next = formatRange(spans, s.start, s.end, action.flag, !hasFlag(spans, s.start, s.end, action.flag));
  else if (action.kind === 'link') next = setLink(spans, s.start, s.end, action.url);
  else next = setColor(spans, s.start, s.end, action.color);
  el.innerHTML = toHtml(next);
  setSelection(el, s.start, s.end);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const dateLabel: MentionLabel = (m, fallback) => (m.kind === 'date' ? `@${formatDateId(m.id)}` : fallback);
