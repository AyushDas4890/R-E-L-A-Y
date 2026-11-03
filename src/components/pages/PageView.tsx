// One open page: cover, icon, title, and the block editor. All edits go through usePageDoc.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { cloneBlocks } from '../../../server/pages.ts';
import {
  BLOCK_CHOICES, LISTY, TEXTY, counts, dateChoices, emptyBlock, filterChoices, formatDateId, headings, joinRich, lineShortcut, parseMarkdown, plain,
  replaceRange, richLength, splitRich, toMarkdown, type BlockChoice, type Draft,
} from '../../editor.ts';
import { findBlock, locateBlock, usePageDoc, type PageDocApi } from '../../pages-store.ts';
import type { Block, BlockType, PageNode, Rich } from '../../types.ts';
import { useDatabase } from '../../db-store.ts';
import { Icon } from '../Icon.tsx';
import { DatabaseView } from '../db/DatabaseView.tsx';
import { RowProps } from '../db/RowProps.tsx';
import { usePopover } from '../ui/Popover.tsx';
import { ShareMenu } from './ShareMenu.tsx';
import { AssistantPanel, CommentsPanel, HistoryPanel } from './SidePanels.tsx';
import { Editable, caretLine, formatSelection, selectionIn, setSelection, type CaretInfo, type MentionLabel } from './Editable.tsx';

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const COVERS = ['sunrise', 'ocean', 'forest', 'dusk', 'slate', 'rose', 'sand', 'mint'];
const EMOJI = ['📄', '📝', '📚', '📌', '📅', '✅', '🎯', '🚀', '💡', '🔥', '⭐', '🧠', '🛠️', '📊', '📈', '🗂️', '🧪', '🎨', '🎵', '🏠', '🌱', '🌍', '☕', '🍀', '🧩', '🔒', '❤️', '🎉', '📦', '🧭', '🪄', '🐛'];
const CALLOUT_ICONS = ['💡', '⚠️', '✅', '❗', 'ℹ️', '🔥', '📌', '🚧'];
const NUMBER_MARK = (n: number) => `${n}.`;

type Popup =
  | { kind: 'slash' | 'mention' | 'link'; blockId: string; from: number; query: string; rect: DOMRect }
  | { kind: 'pages' | 'turn' | 'handle' | 'color' | 'callout'; blockId: string; rect: DOMRect; dbOnly?: boolean }
  | { kind: 'icon' | 'cover' | 'pageMenu'; rect: DOMRect };

interface Item { key: string; label: string; hint?: string; icon?: string; run: () => void; danger?: boolean }

const rectOf = (el: Element | null): DOMRect => (el ?? document.body).getBoundingClientRect();
function caretRect(el: HTMLElement): DOMRect {
  const sel = window.getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
  return r && (r.width || r.height) ? r : el.getBoundingClientRect();
}

export function PageView({ pageId, onOpen, onGone }: { pageId: string; onOpen: (id: string) => void; onGone: () => void }) {
  const { snap, send, listen } = useRelayCtx();
  const doc = usePageDoc(pageId);
  const { blocks, meta, canEdit } = doc;
  const root = useRef<HTMLDivElement | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const want = useRef<{ id: string; at: number | 'end' } | null>(null);
  const pendingSub = useRef<string | null>(null);
  const pendingDb = useRef<string | null>(null);
  // A page id with a dot is a row of a database: `<database>.<row>`.
  const rowRef = pageId.includes('.') ? { dbId: pageId.split('.')[0], rowId: pageId.split('.')[1] } : null;
  const rowDb = useDatabase(rowRef?.dbId ?? null);
  // A row's title and icon live in the database, not on a page of their own.
  const patchMeta = (patch: Parameters<typeof doc.patchMeta>[0]): void => {
    if (!rowRef) return doc.patchMeta(patch);
    const tp = rowDb.db?.props.find((p) => p.type === 'title');
    if (patch.title !== undefined && tp) rowDb.updateRow(rowRef.rowId, { [tp.id]: patch.title });
    if (patch.icon !== undefined) rowDb.setIcon(rowRef.rowId, patch.icon);
  };
  const [popup, setPopup] = useState<Popup | null>(null);
  const [sel, setSel] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; over: string; below: boolean } | null>(null);
  const [bar, setBar] = useState<{ rect: DOMRect; el: HTMLElement } | null>(null);
  const [title, setTitle] = useState('');
  const [panel, setPanel] = useState<'comments' | 'history' | 'assistant' | null>(null);
  const [aboutBlock, setAboutBlock] = useState<string | null>(null);
  const share = usePopover();
  const titleFocus = useRef(false);

  const nodes = snap.pages;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const me = snap.me;
  const label: MentionLabel = (m, fallback) => {
    if (m.kind === 'user') return `@${snap.users[m.id]?.name ?? fallback.replace(/^@/, '')}`;
    if (m.kind === 'page') return nodeById.get(m.id)?.title || fallback || 'Untitled';
    return `@${formatDateId(m.id)}`;
  };

  // Keep the title box in step with the server unless it is being typed in.
  useEffect(() => {
    if (!titleFocus.current) setTitle(meta?.title ?? '');
  }, [meta?.title]);
  useEffect(() => {
  }, [doc.state]);

  // Access taken away while the page was open: leave it.
  useEffect(() => {
    if (doc.state === 'denied' && meta) onGone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.state]);

  // Page created for a sub-page block I asked for.
  useEffect(
    () =>
      listen((ev) => {
        if (ev.t === 'pageCreated' && pendingDb.current) {
          const id = pendingDb.current;
          pendingDb.current = null;
          doc.update(id, { type: 'database', pageId: ev.id, name: '' });
        } else if (ev.t === 'pageCreated' && pendingSub.current) {
          const id = pendingSub.current;
          pendingSub.current = null;
          doc.update(id, { type: 'subpage', pageId: ev.id });
        }
      }),
    [listen, doc.update],
  );

  // Move the caret where a change asked for it, once the new blocks are in the DOM.
  useEffect(() => {
    const w = want.current;
    if (!w) return;
    const el = els.current.get(w.id);
    if (!el) return;
    want.current = null;
    el.focus();
    setSelection(el, w.at === 'end' ? Infinity : w.at);
  });

  // Floating toolbar over a text selection.
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection();
      const el = s?.anchorNode instanceof Node ? (s.anchorNode.parentElement?.closest('.pg-edit[data-bid]') as HTMLElement | null) : null;
      if (!s || s.isCollapsed || !el || !root.current?.contains(el) || el.getAttribute('contenteditable') !== 'true') {
        setBar(null);
        return;
      }
      setBar({ rect: s.getRangeAt(0).getBoundingClientRect(), el });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const register = (id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };
  const focus = (id: string, at: number | 'end' = 'end') => {
    want.current = { id, at };
  };
  const order = () => [...(root.current?.querySelectorAll<HTMLElement>('.pg-edit[data-bid][contenteditable="true"]') ?? [])].map((e) => e.dataset.bid!);

  // ---- Block operations ----
  const insertAfter = (afterId: string | null, parentId: string | null, block: Block) => {
    doc.edit([{ op: 'insert', parent: parentId, after: afterId, block }]);
  };
  const parentOf = (id: string) => locateBlock(blocks, id);

  const setText = (id: string, text: Rich[]) => {
    const b = findBlock(blocks, id);
    if (b && JSON.stringify(b.text) !== JSON.stringify(text)) doc.update(id, { text });
  };

  const convert = (id: string, type: BlockType, extra: Partial<Block> = {}, text?: Rich[]) => {
    const patch: Partial<Block> = { type, ...extra };
    if (text) patch.text = text;
    if (type === 'todo' && extra.checked === undefined) patch.checked = false;
    doc.update(id, patch);
  };

  const remove = (id: string) => {
    const at = parentOf(id);
    const ids = order();
    const i = ids.indexOf(id);
    doc.edit([{ op: 'remove', id }]);
    const prev = ids[i - 1] ?? ids[i + 1];
    if (prev && prev !== id) focus(prev, 'end');
    void at;
  };

  const indent = (id: string) => {
    const at = parentOf(id);
    if (!at || at.index === 0) return;
    const prev = at.list[at.index - 1];
    doc.edit([{ op: 'move', id, parent: prev.id, after: prev.children.length ? prev.children[prev.children.length - 1].id : null }]);
    if (prev.type === 'toggle' && !prev.open) doc.update(prev.id, { open: true });
    focus(id);
  };
  const outdent = (id: string) => {
    const at = parentOf(id);
    if (!at?.parent) return;
    const up = parentOf(at.parent.id);
    doc.edit([{ op: 'move', id, parent: up?.parent?.id ?? null, after: at.parent.id }]);
    focus(id);
  };

  const duplicate = (id: string) => {
    const at = parentOf(id);
    if (!at) return;
    const [copy] = cloneBlocks([at.list[at.index]], doc.newId);
    insertAfter(id, at.parent?.id ?? null, copy);
  };

  const moveBy = (id: string, dir: -1 | 1) => {
    const at = parentOf(id);
    if (!at) return;
    const j = at.index + dir;
    if (j < 0 || j >= at.list.length) return;
    const after = dir === -1 ? (j > 0 ? at.list[j - 1].id : null) : at.list[j].id;
    doc.edit([{ op: 'move', id, parent: at.parent?.id ?? null, after }]);
    focus(id);
  };

  const pasteBlocks = (id: string, drafts: Draft[], info: CaretInfo) => {
    const b = findBlock(blocks, id);
    const at = parentOf(id);
    if (!b || !at) return;
    const [head, tail] = splitRich(b.text, info.start);
    const [first, ...rest] = drafts;
    // The first pasted line joins the text before the caret; the rest become blocks after it.
    doc.update(id, { text: joinRich(head, first.text), ...(first.type !== 'text' && !richLength(head) ? { type: first.type } : {}) });
    let after = id;
    const ops = rest.map((d) => {
      const nb = emptyBlock(d.type, { text: d.text, checked: d.checked, language: d.language, id: doc.newId() });
      const op = { op: 'insert' as const, parent: at.parent?.id ?? null, after, block: nb };
      after = nb.id;
      return op;
    });
    if (richLength(tail)) {
      const nb = emptyBlock('text', { text: tail });
      ops.push({ op: 'insert', parent: at.parent?.id ?? null, after, block: nb });
      after = nb.id;
    }
    doc.edit(ops);
    focus(after, 'end');
  };

  // ---- Keyboard ----
  const onKey = (b: Block) => (e: RKE<HTMLElement>, info: CaretInfo): boolean => {
    // Menu first.
    if (popup && (popup.kind === 'slash' || popup.kind === 'mention' || popup.kind === 'link') && popup.blockId === b.id) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => (items.length ? (s + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length : 0));
        return true;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items[sel]) {
        e.preventDefault();
        items[sel].run();
        return true;
      }
      if (e.key === 'Escape') {
        setPopup(null);
        return true;
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    const at = parentOf(b.id);
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (b.type === 'todo') doc.update(b.id, { checked: !b.checked });
      else if (b.type === 'toggle') doc.update(b.id, { open: !b.open });
      return true;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate(b.id);
      return true;
    }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveBy(b.id, e.key === 'ArrowUp' ? -1 : 1);
      return true;
    }
    if (mod && e.shiftKey && /^Digit[0-9]$/.test(e.code)) {
      const types: BlockType[] = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'number', 'toggle', 'code', 'subpage'];
      const t = types[Number(e.code.slice(5))];
      if (t && t !== 'subpage') {
        e.preventDefault();
        convert(b.id, t, t === 'code' ? { language: 'plain' } : {});
        return true;
      }
    }
    if (e.key === 'Escape') {
      setPicked(b.id);
      (document.activeElement as HTMLElement | null)?.blur();
      root.current?.focus();
      return true;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const empty = richLength(b.text) === 0;
      if (empty && b.type !== 'text' && TEXTY.has(b.type)) {
        if (at?.parent) outdent(b.id);
        else convert(b.id, 'text');
        return true;
      }
      const [head, tail] = splitRich(b.text, info.start);
      const keep = LISTY.has(b.type) ? b.type : b.type === 'toggle' && b.open ? 'text' : 'text';
      const next = emptyBlock(keep as BlockType, { text: tail, ...(keep === 'todo' ? { checked: false } : {}) });
      const intoToggle = b.type === 'toggle' && b.open;
      doc.edit([
        ...(richLength(head) !== richLength(b.text) ? [{ op: 'update' as const, id: b.id, patch: { text: head }, baseRev: b.rev }] : []),
        { op: 'insert', parent: intoToggle ? b.id : (at?.parent?.id ?? null), after: intoToggle ? null : b.id, block: next },
      ]);
      focus(next.id, 0);
      return true;
    }
    if (e.key === 'Backspace' && info.start === 0 && info.end === 0) {
      if (b.type !== 'text') {
        e.preventDefault();
        convert(b.id, 'text');
        return true;
      }
      const ids = order();
      const prevId = ids[ids.indexOf(b.id) - 1];
      const prev = prevId ? findBlock(blocks, prevId) : null;
      if (at?.parent && at.index === 0) {
        e.preventDefault();
        outdent(b.id);
        return true;
      }
      if (prev && TEXTY.has(prev.type) && b.children.length === 0) {
        e.preventDefault();
        const at0 = richLength(prev.text);
        doc.edit([
          { op: 'update', id: prev.id, patch: { text: joinRich(prev.text, b.text) }, baseRev: prev.rev },
          { op: 'remove', id: b.id },
        ]);
        focus(prev.id, at0);
        return true;
      }
      if (prev && richLength(b.text) === 0) {
        e.preventDefault();
        remove(b.id);
        return true;
      }
      return false;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) outdent(b.id);
      else indent(b.id);
      return true;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && caretLine(info.el).first) {
      const ids = order();
      const prev = ids[ids.indexOf(b.id) - 1];
      if (prev) {
        e.preventDefault();
        focus(prev, 'end');
        doc.update(b.id, {}); // re-render to apply the focus request
        els.current.get(prev)?.focus();
        const pe = els.current.get(prev);
        if (pe) setSelection(pe, Infinity);
        want.current = null;
        return true;
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && caretLine(info.el).last) {
      const ids = order();
      const next = ids[ids.indexOf(b.id) + 1];
      if (next) {
        e.preventDefault();
        const ne = els.current.get(next);
        ne?.focus();
        if (ne) setSelection(ne, 0);
        return true;
      }
    }
    return false;
  };

  // ---- Typing: block shortcuts, and the / and @ menus ----
  const onChange = (b: Block) => (spans: Rich[]) => {
    const text = plain(spans);
    const sc = b.type === 'text' ? lineShortcut(text) : null;
    if (sc && (sc.type !== 'code' || text.startsWith('```'))) {
      convert(b.id, sc.type, { ...(sc.checked !== undefined ? { checked: sc.checked } : {}), ...(sc.language ? { language: sc.language } : sc.type === 'code' ? { language: 'plain' } : {}) }, sc.rest ? [{ t: sc.rest }] : []);
      setPopup(null);
      focus(b.id, sc.rest.length);
      return;
    }
    setText(b.id, spans);
    doc.presence(b.id);
  };

  const onTrigger = (b: Block) => (t: ReturnType<typeof import('../../editor.ts').trigger>, el: HTMLElement) => {
    if (!t) {
      if (popup && 'blockId' in popup && popup.blockId === b.id && (popup.kind === 'slash' || popup.kind === 'mention' || popup.kind === 'link')) setPopup(null);
      return;
    }
    setSel(0);
    setPopup({ kind: t.kind === '/' ? 'slash' : t.kind === '@' ? 'mention' : 'link', blockId: b.id, from: t.from, query: t.query, rect: caretRect(el) });
  };

  const items: Item[] = useMemo(() => {
    if (!popup) return [];
    const close = () => setPopup(null);
    const withBlock = <T,>(fn: (b: Block) => T): T | undefined => {
      if (!('blockId' in popup)) return undefined;
      const b = findBlock(blocks, popup.blockId);
      return b ? fn(b) : undefined;
    };
    if (popup.kind === 'slash') {
      return filterChoices(BLOCK_CHOICES, popup.query).map((c) => ({
        key: c.label, label: c.label, hint: c.hint, run: () => { withBlock((b) => runChoice(b, c, popup.from, popup.query)); close(); },
      }));
    }
    if (popup.kind === 'mention' || popup.kind === 'link') {
      const q = popup.query.toLowerCase();
      const list: Item[] = [];
      const put = (kind: 'user' | 'page' | 'date', id: string, text: string, labelText: string, hint: string) => {
        list.push({ key: `${kind}:${id}`, label: labelText, hint, run: () => { withBlock((b) => insertMention(b, popup.from, popup.query, { t: text, mention: { kind, id } })); close(); } });
      };
      if (popup.kind === 'mention') {
        for (const u of Object.values(snap.users)) if (!u.bot && !u.inactive && u.name.toLowerCase().includes(q)) put('user', u.id, `@${u.name}`, u.name, 'Person');
        for (const d of dateChoices()) if (d.label.toLowerCase().includes(q)) put('date', d.id, `@${formatDateId(d.id)}`, d.label, formatDateId(d.id));
      }
      for (const n of nodes) if (!n.trashed && (n.title || 'Untitled').toLowerCase().includes(q)) put('page', n.id, n.title || 'Untitled', `${n.icon || '📄'} ${n.title || 'Untitled'}`, 'Page');
      return list.slice(0, 12);
    }
    if (popup.kind === 'pages') {
      return nodes.filter((n) => !n.trashed && n.id !== pageId && (!popup.dbOnly || n.kind === 'database')).slice(0, 30).map((n) => ({
        key: n.id, label: `${n.icon || (n.kind === 'database' ? '🗂️' : '📄')} ${n.title || 'Untitled'}`, run: () => { doc.update(popup.blockId, popup.dbOnly ? { type: 'database', pageId: n.id, name: '' } : { type: 'pageLink', pageId: n.id }); close(); },
      }));
    }
    if (popup.kind === 'turn') {
      return BLOCK_CHOICES.filter((c) => TEXTY.has(c.type) || c.type === 'code').map((c) => ({
        key: c.type, label: c.label, hint: c.hint, run: () => { convert(popup.blockId, c.type, c.extra ?? {}); close(); },
      }));
    }
    if (popup.kind === 'color') {
      return [
        { key: 'default', label: 'Default', run: () => { doc.update(popup.blockId, { color: '', bg: '' }); close(); } },
        ...COLORS.map((c) => ({ key: `t-${c}`, label: `${c[0].toUpperCase()}${c.slice(1)} text`, run: () => { doc.update(popup.blockId, { color: c }); close(); } })),
        ...COLORS.map((c) => ({ key: `b-${c}`, label: `${c[0].toUpperCase()}${c.slice(1)} background`, run: () => { doc.update(popup.blockId, { bg: c }); close(); } })),
      ];
    }
    if (popup.kind === 'callout') return CALLOUT_ICONS.map((i) => ({ key: i, label: i, run: () => { doc.update(popup.blockId, { icon: i }); close(); } }));
    if (popup.kind === 'handle') {
      const b = findBlock(blocks, popup.blockId);
      const out: Item[] = [];
      if (b && (TEXTY.has(b.type) || b.type === 'code')) out.push({ key: 'turn', label: 'Turn into…', run: () => setPopup({ kind: 'turn', blockId: b.id, rect: popup.rect }) });
      out.push({ key: 'color', label: 'Color…', run: () => setPopup({ kind: 'color', blockId: popup.blockId, rect: popup.rect }) });
      out.push({ key: 'comment', label: 'Comment', run: () => { setAboutBlock(popup.blockId); setPanel('comments'); close(); } });
      out.push({ key: 'dup', label: 'Duplicate', run: () => { duplicate(popup.blockId); close(); } });
      out.push({ key: 'link', label: 'Copy link to block', run: () => { void navigator.clipboard?.writeText(`${location.origin}/?p=${pageId}#${popup.blockId}`); close(); } });
      out.push({ key: 'del', label: 'Delete', danger: true, run: () => { remove(popup.blockId); close(); } });
      return out;
    }
    if (popup.kind === 'icon') {
      return [
        ...EMOJI.map((e) => ({ key: e, label: e, run: () => { patchMeta({ icon: e }); close(); } })),
        { key: 'none', label: 'Remove icon', run: () => { patchMeta({ icon: '' }); close(); } },
      ];
    }
    if (popup.kind === 'cover') {
      return [
        ...COVERS.map((c) => ({ key: c, label: c[0].toUpperCase() + c.slice(1), run: () => { patchMeta({ cover: `preset:${c}` }); close(); } })),
        { key: 'url', label: 'Image link…', run: () => { const u = window.prompt('Image link (https://…)', 'https://'); if (u) patchMeta({ cover: u }); close(); } },
        { key: 'none', label: 'Remove cover', run: () => { patchMeta({ cover: '' }); close(); } },
      ];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, blocks, nodes, snap.users, doc.meta]);

  function runChoice(b: Block, c: BlockChoice, from: number, query: string) {
    const text = replaceRange(b.text, from, from + 1 + query.length, []);
    const emptyAfter = richLength(text) === 0;
    const at = parentOf(b.id);
    const make = (type: BlockType, extra: Partial<Block> = {}) => emptyBlock(type, extra);
    if (c.type === 'columns') {
      const cols = make('columns', { children: [make('column', { children: [make('text')] }), make('column', { children: [make('text')] })] });
      doc.edit([{ op: 'insert', parent: at?.parent?.id ?? null, after: b.id, block: cols }, ...(emptyAfter ? [{ op: 'remove' as const, id: b.id }] : [{ op: 'update' as const, id: b.id, patch: { text }, baseRev: b.rev }])]);
      focus(cols.children[0].children[0].id, 0);
      return;
    }
    const extra = { ...(c.extra ?? {}) };
    const dbMode = c.type === 'database' ? extra.name : undefined;
    if (c.type === 'database') delete extra.name;
    const startDb = (id: string) => {
      if (dbMode === 'new') {
        pendingDb.current = id;
        send({ t: 'dbCreate', parentId: pageId, title: '', layout: 'table' });
      } else setPopup({ kind: 'pages', blockId: id, rect: popup?.rect ?? new DOMRect(), dbOnly: true });
    };
    if (emptyAfter) {
      doc.update(b.id, { type: c.type, text, ...extra });
      if (c.type === 'database') startDb(b.id);
      else if (c.type === 'subpage') {
        pendingSub.current = b.id;
        send({ t: 'pageCreate', parentId: pageId, title: '' });
      } else if (c.type === 'pageLink') setPopup({ kind: 'pages', blockId: b.id, rect: popup?.rect ?? new DOMRect() });
      else if (TEXTY.has(c.type) || c.type === 'code' || c.type === 'equation') focus(b.id, 0);
    } else {
      const nb = make(c.type, extra);
      doc.edit([{ op: 'update', id: b.id, patch: { text }, baseRev: b.rev }, { op: 'insert', parent: at?.parent?.id ?? null, after: b.id, block: nb }]);
      if (c.type === 'database') startDb(nb.id);
      else if (c.type === 'subpage') {
        pendingSub.current = nb.id;
        send({ t: 'pageCreate', parentId: pageId, title: '' });
      } else if (c.type === 'pageLink') setPopup({ kind: 'pages', blockId: nb.id, rect: popup?.rect ?? new DOMRect() });
      else focus(nb.id, 0);
    }
  }

  function insertMention(b: Block, from: number, query: string, span: Rich) {
    const next = replaceRange(b.text, from, from + 1 + query.length + (popup?.kind === 'link' ? 1 : 0), [span, { t: ' ' }]);
    doc.update(b.id, { text: next });
    focus(b.id, from + span.t.length + 1);
  }

  // ---- Drag and drop ----
  const dropOn = () => {
    if (!drag || drag.from === drag.over) return setDrag(null);
    const target = parentOf(drag.over);
    if (!target) return setDrag(null);
    const after = drag.below ? drag.over : target.index > 0 ? target.list[target.index - 1].id : null;
    // Dropping right where it already is does nothing.
    doc.edit([{ op: 'move', id: drag.from, parent: target.parent?.id ?? null, after: after === drag.from ? null : after }]);
    setDrag(null);
  };

  // ---- Rendering ----
  if (doc.state === 'denied' && !meta) {
    return (
      <div className="pg-page"><div className="empty-card pg-denied"><p><b>You don’t have access to this page.</b></p><p className="muted">Ask the people who own it to share it with you.</p><button className="primary" onClick={() => send({ t: 'pageRequestAccess', id: pageId })}>Request access</button> <button className="ghost-btn" onClick={onGone}>Go back</button></div></div>
    );
  }
  if (doc.state === 'denied') return null;
  if (doc.state === 'loading' || !meta) return <div className="pg-page"><p className="muted pg-loading">Opening page…</p></div>;

  const editable = canEdit;
  const node = nodeById.get(pageId);
  const trail = (() => {
    const out: PageNode[] = [];
    let cur = node;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
    }
    return out;
  })();
  const isFav = snap.pageFavorites.includes(pageId);
  const stats = counts(blocks);

  const textEditor = (b: Block, cls = '', ph = ''): ReactNode => (
    <Editable
      key={b.id}
      blockId={b.id}
      text={b.text}
      editable={editable}
      className={cls}
      placeholder={ph}
      label={label}
      register={register}
      onChange={onChange(b)}
      onKey={onKey(b)}
      onTrigger={onTrigger(b)}
      onPasteBlocks={(d, i) => pasteBlocks(b.id, d, i)}
      onFocus={() => setPicked(null)}
    />
  );

  const renderList = (list: Block[], depth: number): ReactNode => {
    let n = 0;
    return list.map((b) => {
      n = b.type === 'number' ? n + 1 : 0;
      return renderBlock(b, n, depth);
    });
  };

  const body = (b: Block, n: number, depth: number): ReactNode => {
    switch (b.type) {
      case 'h1': case 'h2': case 'h3':
        return textEditor(b, `pg-${b.type}`, b.type === 'h1' ? 'Heading 1' : b.type === 'h2' ? 'Heading 2' : 'Heading 3');
      case 'bullet':
        return <div className="pg-row"><span className="pg-mark" aria-hidden>{['•', '◦', '▪'][depth % 3]}</span>{textEditor(b, 'pg-t', 'List')}</div>;
      case 'number':
        return <div className="pg-row"><span className="pg-mark num" aria-hidden>{NUMBER_MARK(n)}</span>{textEditor(b, 'pg-t', 'List')}</div>;
      case 'todo':
        return (
          <div className="pg-row">
            <input type="checkbox" className="pg-check" aria-label="Done" checked={!!b.checked} disabled={!editable} onChange={() => doc.update(b.id, { checked: !b.checked })} />
            {textEditor(b, `pg-t ${b.checked ? 'done' : ''}`, 'To-do')}
          </div>
        );
      case 'toggle':
        return (
          <div className="pg-row">
            <button className={`pg-arrow ${b.open ? 'open' : ''}`} aria-label={b.open ? 'Collapse' : 'Expand'} aria-expanded={!!b.open} onClick={() => doc.update(b.id, { open: !b.open })}><Icon n="chevron" size={14} /></button>
            {textEditor(b, 'pg-t', 'Toggle')}
          </div>
        );
      case 'quote':
        return <div className="pg-quote">{textEditor(b, 'pg-t', 'Quote')}</div>;
      case 'callout':
        return (
          <div className="pg-callout">
            <button className="pg-callout-icon" aria-label="Change icon" disabled={!editable} onClick={(e) => setPopup({ kind: 'callout', blockId: b.id, rect: rectOf(e.currentTarget) })}>{b.icon || '💡'}</button>
            {textEditor(b, 'pg-t', 'Callout')}
          </div>
        );
      case 'divider':
        return <hr className="pg-divider" />;
      case 'code':
        return (
          <div className="pg-code">
            <div className="pg-code-bar">
              <select value={b.language ?? 'plain'} disabled={!editable} aria-label="Language" onChange={(e) => doc.update(b.id, { language: e.target.value })}>
                {['plain', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go', 'rust', 'html', 'css', 'json', 'sql', 'bash', 'markdown'].map((l) => <option key={l}>{l}</option>)}
              </select>
              <button className="ghost-btn" onClick={() => void navigator.clipboard?.writeText(plain(b.text))}>Copy</button>
            </div>
            {textEditor(b, 'pg-code-body', 'Code')}
          </div>
        );
      case 'equation':
        return <div className="pg-equation"><span className="muted">Equation</span>{textEditor(b, 'pg-code-body', 'E = mc^2')}</div>;
      case 'image':
        return b.url ? (
          <figure className="pg-image"><img src={b.url} alt={b.name || ''} loading="lazy" />{textEditor(b, 'pg-caption', editable ? 'Write a caption' : '')}</figure>
        ) : <UrlInput label="Embed an image" placeholder="Paste an image link…" disabled={!editable} onSubmit={(u) => doc.update(b.id, { url: u })} />;
      case 'file':
      case 'bookmark':
        return b.url ? (
          <a className="pg-card" href={b.url} target="_blank" rel="noopener noreferrer">
            <Icon n={b.type === 'file' ? 'paperclip' : 'file'} /><span><strong>{b.name || hostOf(b.url)}</strong><small>{b.url}</small></span>
          </a>
        ) : <UrlInput label={b.type === 'file' ? 'Link a file' : 'Add a web bookmark'} placeholder="Paste a link…" disabled={!editable} onSubmit={(u) => doc.update(b.id, { url: u, name: hostOf(u) })} />;
      case 'table':
        return <TableBlock b={b} disabled={!editable} onChange={(rows) => doc.update(b.id, { rows })} onHeader={(h) => doc.update(b.id, { header: h })} />;
      case 'columns':
        return <div className="pg-columns">{b.children.map((col) => <div key={col.id} className="pg-col">{renderList(col.children, depth)}</div>)}</div>;
      case 'toc': {
        const hs = headings(blocks);
        return (
          <nav className="pg-toc" aria-label="Table of contents">
            {hs.length === 0 && <span className="muted">Add headings and they show up here.</span>}
            {hs.map((h) => <button key={h.id} style={{ paddingLeft: (h.level - 1) * 16 }} onClick={() => els.current.get(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{h.text || 'Untitled'}</button>)}
          </nav>
        );
      }
      case 'breadcrumb':
        return <div className="pg-trail">{trail.map((t, i) => <span key={t.id}>{i > 0 && ' / '}<button onClick={() => onOpen(t.id)}>{t.icon} {t.title || 'Untitled'}</button></span>)}</div>;
      case 'pageLink':
      case 'subpage': {
        const target = b.pageId ? nodeById.get(b.pageId) : undefined;
        if (!b.pageId && b.type === 'subpage') return <span className="muted">Creating page…</span>;
        if (!b.pageId) return <button className="pg-card" onClick={(e) => setPopup({ kind: 'pages', blockId: b.id, rect: rectOf(e.currentTarget) })}>Choose a page…</button>;
        return target
          ? <button className="pg-pagelink" onClick={() => onOpen(target.id)}><span>{target.icon || '📄'}</span><span>{target.title || 'Untitled'}</span></button>
          : <span className="pg-pagelink muted">No access to this page</span>;
      }
      case 'database':
        if (!b.pageId) return <span className="muted">{pendingDb.current === b.id ? 'Creating database…' : 'Choose a database…'}</span>;
        return nodeById.get(b.pageId) ? <DatabaseView dbId={b.pageId} inline onOpenRow={(d, r) => onOpen(r ? `${d}.${r}` : d)} /> : <span className="pg-pagelink muted">No access to this database</span>;
      case 'column':
        return renderList(b.children, depth);
      default:
        return textEditor(b, 'pg-t', 'Type / for commands');
    }
  };

  const renderBlock = (b: Block, n: number, depth: number): ReactNode => {
    const showKids = b.type !== 'columns' && b.type !== 'column' && b.children.length > 0 && (b.type !== 'toggle' || b.open);
    return (
      <div
        key={b.id}
        id={b.id}
        data-block={b.id}
        className={`pg-block ${picked === b.id ? 'picked' : ''} ${b.bg ? `bg-${b.bg}` : ''} ${b.color ? `tc-${b.color}` : ''} ${drag?.over === b.id && drag.from !== b.id ? (drag.below ? 'drop-below' : 'drop-above') : ''}`}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setDrag({ from: drag.from, over: b.id, below: e.clientY > r.top + r.height / 2 });
          e.stopPropagation();
        }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOn(); }}
      >
        {editable && (
          <div className="pg-handles" contentEditable={false}>
            <button className="pg-h" aria-label="Add a block below" title="Click to add a block below" onClick={() => { const at = parentOf(b.id); const nb = emptyBlock('text'); insertAfter(b.id, at?.parent?.id ?? null, nb); focus(nb.id, 0); }}><Icon n="plus" size={14} /></button>
            <button
              className="pg-h grab"
              aria-label="Drag to move, click for options"
              title="Drag to move, click for options"
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; setDrag({ from: b.id, over: b.id, below: true }); }}
              onDragEnd={() => setDrag(null)}
              onClick={(e) => setPopup({ kind: 'handle', blockId: b.id, rect: rectOf(e.currentTarget) })}
            >⋮⋮</button>
          </div>
        )}
        {body(b, n, depth)}
        {showKids && <div className="pg-kids">{renderList(b.children, depth + 1)}</div>}
        {b.type === 'toggle' && b.open && b.children.length === 0 && <div className="pg-kids muted pg-empty-toggle">Empty toggle. Press Enter inside it to add a line.</div>}
      </div>
    );
  };

  const onContainerKey = (e: RKE<HTMLDivElement>) => {
    if (!picked || (e.target as HTMLElement).closest('[contenteditable="true"], input, select, textarea, button')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      remove(picked);
      setPicked(null);
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate(picked);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      els.current.get(picked)?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const ids = [...(root.current?.querySelectorAll<HTMLElement>('[data-block]') ?? [])].map((x) => x.dataset.block!);
      const j = ids.indexOf(picked) + (e.key === 'ArrowDown' ? 1 : -1);
      if (ids[j]) setPicked(ids[j]);
    }
  };

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y step through my edits across blocks, instead of the browser's per-line undo.
  const onUndoKey = (e: RKE<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey || !editable) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, .pg-title') || (t.isContentEditable && !t.closest('.pg-edit'))) return;
    e.preventDefault();
    doc.flush();
    if (k === 'y' || e.shiftKey) doc.redo();
    else doc.undo();
  };

  const exportMd = () => {
    const md = toMarkdown(meta.title, blocks, (id) => nodeById.get(id)?.title || 'Untitled');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(meta.title || 'Untitled').replace(/[^\w -]+/g, '').trim() || 'page'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trashed = !!meta.trashedAt;
  const font = meta.font === 'serif' ? 'serif' : meta.font === 'mono' ? 'mono' : 'default';

  const scrollToBlock = (id: string) => els.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="pg-wrap">
    <div className={`pg-page font-${font} ${meta.smallText ? 'small' : ''} ${meta.fullWidth ? 'wide' : ''}`} ref={root} tabIndex={-1} onKeyDown={onContainerKey} onKeyDownCapture={onUndoKey} onClick={(e) => { if (!(e.target as HTMLElement).closest('.pg-menu')) setPopup((p) => (p && (p.kind === 'slash' || p.kind === 'mention' || p.kind === 'link') ? p : null)); }}>
      {trashed && (
        <div className="pg-banner">
          <span>This page is in the trash.</span>
          <button className="ghost-btn" onClick={() => send({ t: 'pageRestore', id: pageId })}>Restore</button>
          <button className="ghost-btn danger" onClick={() => { if (confirm('Delete this page and everything inside it for good?')) send({ t: 'pageDelete', id: pageId }); }}>Delete permanently</button>
        </div>
      )}
      {meta.locked && !trashed && <div className="pg-banner"><Icon n="lock" size={14} /> <span>This page is locked. {doc.level === 'full' ? 'Unlock it from the ••• menu to edit.' : 'Ask someone with full access to unlock it.'}</span></div>}
      {doc.notice && <div className="pg-banner warn" role="status"><span>{doc.notice}</span><button className="icon-btn" aria-label="Dismiss" onClick={doc.dismissNotice}>×</button></div>}

      <div className="pg-actions">
        {meta.verified && meta.verified.until > Date.now() && <span className="pg-verified" title={`Verified by ${snap.users[meta.verified.by]?.name ?? 'someone'} until ${new Date(meta.verified.until).toLocaleDateString()}`}>✔ Verified</span>}
        {meta.verified && meta.verified.until <= Date.now() && <span className="pg-verified expired">Verification expired</span>}
        <span className="muted pg-edited">Edited {new Date(meta.editedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        {!rowRef && !trashed && <button className="ghost-btn pg-share" aria-haspopup="dialog" onClick={share.toggle}>Share</button>}
        <button className={`icon-btn ${panel === 'comments' ? 'lit' : ''}`} aria-label="Comments" aria-pressed={panel === 'comments'} onClick={() => setPanel(panel === 'comments' ? null : 'comments')}>💬{doc.comments.filter((c) => !c.parent && !c.resolved).length > 0 && <sup>{doc.comments.filter((c) => !c.parent && !c.resolved).length}</sup>}</button>
        <button className={`icon-btn ${panel === 'assistant' ? 'lit' : ''}`} aria-label="Assistant" aria-pressed={panel === 'assistant'} onClick={() => setPanel(panel === 'assistant' ? null : 'assistant')}>✨</button>
        {!rowRef && <button className={`icon-btn ${isFav ? 'lit' : ''}`} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={isFav} onClick={() => send({ t: 'pageFavorite', id: pageId, on: !isFav })}><Icon n="star" fill={isFav} /></button>}
        <button className="icon-btn" aria-label="Page options" onClick={(e) => setPopup({ kind: 'pageMenu', rect: rectOf(e.currentTarget) })}><Icon n="more" /></button>
      </div>

      {meta.cover && <div className={`pg-cover ${meta.cover.startsWith('preset:') ? `cv-${meta.cover.slice(7)}` : ''}`} style={meta.cover.startsWith('preset:') ? undefined : { backgroundImage: `url("${meta.cover.replace(/"/g, '%22')}")` }} />}
      <div className="pg-head">
        {meta.icon && <button className="pg-icon" aria-label="Change icon" disabled={!editable} onClick={(e) => setPopup({ kind: 'icon', rect: rectOf(e.currentTarget) })}>{meta.icon}</button>}
        {editable && (!meta.icon || (!meta.cover && !rowRef)) && (
          <div className="pg-add">
            {!meta.icon && <button className="ghost-btn" onClick={(e) => setPopup({ kind: 'icon', rect: rectOf(e.currentTarget) })}>☺ Add icon</button>}
            {!meta.cover && !rowRef && <button className="ghost-btn" onClick={(e) => setPopup({ kind: 'cover', rect: rectOf(e.currentTarget) })}>▣ Add cover</button>}
          </div>
        )}
        <h1
          className="pg-title"
          contentEditable={editable}
          suppressContentEditableWarning
          data-ph="Untitled"
          role="textbox"
          aria-label="Page title"
          ref={(el) => { if (el && !titleFocus.current && el.textContent !== title) el.textContent = title; }}
          onFocus={() => { titleFocus.current = true; }}
          onBlur={() => { titleFocus.current = false; }}
          onInput={(e) => {
            const t = e.currentTarget.textContent ?? '';
            setTitle(t);
            patchMeta({ title: t });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const first = blocks[0] ?? (() => { const nb = emptyBlock('text'); insertAfter(null, null, nb); return nb; })();
              focus(first.id, 0);
              doc.update(first.id, {});
            }
          }}
          onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' ')); }}
        />
      </div>

      {meta.kind === 'database' && !rowRef && <DatabaseView dbId={pageId} onOpenRow={(d, r) => onOpen(r ? `${d}.${r}` : d)} />}
      {rowRef && <RowProps dbId={rowRef.dbId} rowId={rowRef.rowId} onBack={() => onOpen(rowRef.dbId)} />}

      <div className="pg-body">
        {renderList(blocks, 0)}
        {editable && (
          <button className="pg-tail" onClick={() => {
            const last = blocks[blocks.length - 1];
            if (last && last.type === 'text' && richLength(last.text) === 0) { focus(last.id, 0); doc.update(last.id, {}); return; }
            const nb = emptyBlock('text');
            insertAfter(last?.id ?? null, null, nb);
            focus(nb.id, 0);
          }}>{blocks.length === 0 ? 'Click here to start writing, or press / for commands' : ''}</button>
        )}
      </div>

      {bar && editable && <SelectionBar rect={bar.rect} el={bar.el} onTurn={(r) => setPopup({ kind: 'turn', blockId: bar.el.dataset.bid!, rect: r })} />}

      {popup && popup.kind !== 'pageMenu' && items.length > 0 && <Menu rect={popup.rect} items={items} sel={sel} onClose={() => setPopup(null)} grid={popup.kind === 'icon' || popup.kind === 'callout'} />}
      {popup?.kind === 'pageMenu' && (
        <div className="pg-menu menu" role="menu" style={menuPos(popup.rect, 250)} onClick={(e) => e.stopPropagation()}>
          <p className="menu-title">Style</p>
          <div className="pg-fonts">{(['default', 'serif', 'mono'] as const).map((f) => <button key={f} role="menuitemradio" aria-checked={meta.font === f} className={`pg-font-${f} ${meta.font === f ? 'on' : ''}`} disabled={!editable} onClick={() => patchMeta({ font: f })}><b>Ag</b><small>{f[0].toUpperCase() + f.slice(1)}</small></button>)}</div>
          <label className="pg-switch"><span>Small text</span><input type="checkbox" checked={meta.smallText} disabled={!editable} onChange={(e) => patchMeta({ smallText: e.target.checked })} /></label>
          <label className="pg-switch"><span>Full width</span><input type="checkbox" checked={meta.fullWidth} disabled={!editable} onChange={(e) => patchMeta({ fullWidth: e.target.checked })} /></label>
          <label className="pg-switch"><span>Lock page</span><input type="checkbox" checked={meta.locked} disabled={doc.level !== 'full'} onChange={(e) => patchMeta({ locked: e.target.checked })} /></label>
          <hr />
          {!rowRef && <button role="menuitem" onClick={() => { send({ t: 'pageDuplicate', id: pageId }); setPopup(null); }}>Duplicate</button>}
          <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/?p=${pageId}`); setPopup(null); }}>Copy link</button>
          <button role="menuitem" onClick={() => { exportMd(); setPopup(null); }}>Export as Markdown</button>
          {editable && <button role="menuitem" onClick={() => { setPanel('history'); setPopup(null); }}>Page history</button>}
          {doc.level === 'full' && !rowRef && <button role="menuitem" onClick={() => { send({ t: 'pageVerify', id: pageId, days: meta.verified && meta.verified.until > Date.now() ? 0 : 90 }); setPopup(null); }}>{meta.verified && meta.verified.until > Date.now() ? 'Remove verification' : 'Verify page (90 days)'}</button>}
          {doc.level === 'full' && !trashed && !rowRef && <button role="menuitem" className="danger" onClick={() => { send({ t: 'pageTrash', id: pageId }); setPopup(null); }}>Move to trash</button>}
          {rowRef && editable && <button role="menuitem" className="danger" onClick={() => { rowDb.removeRow(rowRef.rowId); setPopup(null); onOpen(rowRef.dbId); }}>Delete row</button>}
          <hr />
          <p className="menu-note">{stats.words} words · {stats.chars} characters</p>
        </div>
      )}
      {Object.entries(doc.peers).filter(([u, c]) => u !== me && c).length > 0 && (
        <div className="pg-peers" aria-live="polite">{Object.entries(doc.peers).filter(([u, c]) => u !== me && c).map(([u]) => snap.users[u]?.name).filter(Boolean).join(', ')} editing</div>
      )}
      {share.isOpen && <ShareMenu pageId={pageId} meta={meta} level={doc.level} anchor={share.anchor} onClose={share.close} />}
    </div>
    {panel === 'comments' && <CommentsPanel pageId={pageId} comments={doc.comments} suggestions={doc.suggestions} blocks={blocks} level={doc.level} aboutBlock={aboutBlock} onClearBlock={() => setAboutBlock(null)} onGoTo={scrollToBlock} onClose={() => setPanel(null)} />}
    {panel === 'history' && <HistoryPanel pageId={pageId} canRestore={editable} onClose={() => setPanel(null)} />}
    {panel === 'assistant' && <AssistantPanel doc={doc} onClose={() => setPanel(null)} onOpen={onOpen} />}
    </div>
  );
}

const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

function menuPos(r: DOMRect, w = 260): { top: number; left: number } {
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 6;
  const top = below + 320 > window.innerHeight ? Math.max(8, r.top - 326) : below;
  return { top, left };
}

function Menu({ rect, items, sel, onClose, grid }: { rect: DOMRect; items: Item[]; sel: number; onClose: () => void; grid?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [onClose]);
  return (
    <div className={`pg-menu menu ${grid ? 'grid' : ''}`} role="listbox" ref={ref} style={menuPos(rect)} onMouseDown={(e) => e.preventDefault()}>
      {items.map((it, i) => (
        <button key={it.key} role="option" aria-selected={i === sel} className={`${i === sel ? 'on' : ''} ${it.danger ? 'danger' : ''}`} onClick={it.run}>
          <span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function SelectionBar({ rect, el, onTurn }: { rect: DOMRect; el: HTMLElement; onTurn: (r: DOMRect) => void }) {
  const [colors, setColors] = useState(false);
  const act = (a: Parameters<typeof formatSelection>[1]) => formatSelection(el, a);
  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 292));
  return (
    <div className="pg-bar" role="toolbar" aria-label="Format text" style={{ top, left }} onMouseDown={(e) => e.preventDefault()}>
      <button onClick={(e) => onTurn(e.currentTarget.getBoundingClientRect())} title="Turn into">Aa ▾</button>
      <button className="b" onClick={() => act({ kind: 'flag', flag: 'b' })} title="Bold (Ctrl+B)">B</button>
      <button className="i" onClick={() => act({ kind: 'flag', flag: 'i' })} title="Italic (Ctrl+I)">I</button>
      <button className="u" onClick={() => act({ kind: 'flag', flag: 'u' })} title="Underline (Ctrl+U)">U</button>
      <button className="s" onClick={() => act({ kind: 'flag', flag: 's' })} title="Strikethrough (Ctrl+Shift+S)">S</button>
      <button className="c" onClick={() => act({ kind: 'flag', flag: 'c' })} title="Code (Ctrl+E)">{'</>'}</button>
      <button onClick={() => { const s = selectionIn(el); const url = window.prompt('Link to (https://…)', 'https://'); if (s && url && /^(https?:\/\/|mailto:)/i.test(url)) act({ kind: 'link', url }); }} title="Link (Ctrl+K)">🔗</button>
      <button onClick={() => setColors((c) => !c)} title="Color">A▾</button>
      {colors && (
        <div className="pg-colors">
          <button onClick={() => { act({ kind: 'color', color: '' }); setColors(false); }}>Default</button>
          {COLORS.map((c) => <button key={c} className={`tc-${c}`} onClick={() => { act({ kind: 'color', color: c }); setColors(false); }}>{c}</button>)}
        </div>
      )}
    </div>
  );
}

function UrlInput({ label, placeholder, disabled, onSubmit }: { label: string; placeholder: string; disabled: boolean; onSubmit: (url: string) => void }) {
  const [v, setV] = useState('');
  const ok = /^https?:\/\/\S+$/i.test(v.trim());
  return (
    <form className="pg-url" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(v.trim()); }}>
      <span className="muted">{label}</span>
      <input value={v} disabled={disabled} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} />
      <button className="send-btn" disabled={disabled || !ok}>Add</button>
    </form>
  );
}

function TableBlock({ b, disabled, onChange, onHeader }: { b: Block; disabled: boolean; onChange: (rows: string[][]) => void; onHeader: (h: boolean) => void }) {
  const rows = b.rows ?? [['', '']];
  const set = (r: number, c: number, v: string) => onChange(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  return (
    <div className="pg-table-wrap">
      <table className="pg-table">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={b.header && r === 0 ? 'head' : ''}>
              {row.map((cell, c) => <td key={c}><input value={cell} disabled={disabled} aria-label={`Row ${r + 1}, column ${c + 1}`} onChange={(e) => set(r, c, e.target.value)} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div className="pg-table-tools">
          <button className="ghost-btn" disabled={rows.length >= 30} onClick={() => onChange([...rows, rows[0].map(() => '')])}>+ Row</button>
          <button className="ghost-btn" disabled={rows[0].length >= 12} onClick={() => onChange(rows.map((r) => [...r, '']))}>+ Column</button>
          <button className="ghost-btn" disabled={rows.length <= 1} onClick={() => onChange(rows.slice(0, -1))}>− Row</button>
          <button className="ghost-btn" disabled={rows[0].length <= 1} onClick={() => onChange(rows.map((r) => r.slice(0, -1)))}>− Column</button>
          <label className="pg-switch"><span>Header row</span><input type="checkbox" checked={!!b.header} onChange={(e) => onHeader(e.target.checked)} /></label>
        </div>
      )}
    </div>
  );
}

export type { PageDocApi };
