// The browser's working copy of one open page. Edits apply here at once, then go to the server in
// small batches; what other people do arrives as ops and is replayed on the same copy.
// Merge rule (see docs/notion/plan.md): ops address blocks by id; if someone else changed a block's
// text since you last saw it, the server keeps theirs and your text is kept as a new block next to it,
// so nothing anyone typed is lost.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRelayCtx } from './ctx.ts';
import { applyApplied, applyOps, type PageBody } from '../server/pages.ts';
import { emptyBlock, newBlockId } from './editor.ts';
import { History } from './undo.ts';
import type { Block, BlockOp, BlockPatch, PageComment, Suggestion, PageLevel, PageMeta } from './types.ts';

export type DocState = 'loading' | 'ready' | 'denied';

const FLUSH_MS = 150;

// Two updates to the same block back to back are one update (the first base revision, the last text).
function enqueue(queue: BlockOp[], op: BlockOp): void {
  const last = queue[queue.length - 1];
  if (last && last.op === 'update' && op.op === 'update' && last.id === op.id) {
    last.patch = { ...last.patch, ...op.patch };
    return;
  }
  queue.push(op);
}

export function findBlock(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inner = findBlock(b.children, id);
    if (inner) return inner;
  }
  return null;
}

// The list a block sits in, its index and its parent block.
export function locateBlock(blocks: Block[], id: string, parent: Block | null = null): { list: Block[]; index: number; parent: Block | null } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { list: blocks, index: i, parent };
    const inner = locateBlock(blocks[i].children, id, blocks[i]);
    if (inner) return inner;
  }
  return null;
}

export function usePageDoc(id: string | null) {
  const { send, listen, snap } = useRelayCtx();
  const me = snap.me;
  const [state, setState] = useState<DocState>('loading');
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [level, setLevel] = useState<PageLevel>('none');
  const [peers, setPeers] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<PageComment[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const body = useRef<PageBody | null>(null);
  const queue = useRef<BlockOp[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openId = useRef<string | null>(null);
  const hist = useRef(new History());

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const pid = openId.current;
    if (!pid) return;
    while (queue.current.length) send({ t: 'blockOps', id: pid, ops: queue.current.splice(0, 100) });
  }, [send]);

  useEffect(() => {
    openId.current = id;
    body.current = null;
    queue.current = [];
    hist.current = new History();
    setState('loading');
    setMeta(null);
    setPeers({});
    setNotice(null);
    setComments([]);
    setSuggestions([]);
    if (!id) return;
    send({ t: 'pageGet', id });
    const off = listen((ev) => {
      if (ev.t === 'pageBody' && ev.id === id) {
        body.current = { id, version: ev.version, blocks: ev.blocks };
        setMeta(ev.page);
        setLevel(ev.level);
        setComments(ev.comments ?? []);
        setSuggestions(ev.suggestions ?? []);
        setState('ready');
      } else if (ev.t === 'suggestions' && ev.id === id) {
        setSuggestions(ev.suggestions);
      } else if (ev.t === 'comments' && ev.id === id) {
        setComments(ev.comments);
      } else if (ev.t === 'pageMeta' && ev.page.id === id) {
        setMeta(ev.page);
      } else if (ev.t === 'blockOps' && ev.id === id && body.current) {
        if (ev.ack) {
          // Our own edits came back: take the revisions the server chose, apply nothing twice.
          for (const op of ev.ops) {
            if (op.op === 'update' && op.rev !== undefined) {
              const b = findBlock(body.current.blocks, op.id);
              if (b && b.rev < op.rev) b.rev = op.rev;
            }
          }
          body.current.version = ev.version;
        } else {
          for (const op of ev.ops) applyApplied(body.current, op);
          body.current.version = ev.version;
          redraw();
        }
      } else if (ev.t === 'blockConflict' && ev.id === id && body.current) {
        const mine = findBlock(body.current.blocks, ev.block.id);
        if (!mine) return;
        const mineText = mine.text;
        const theirs = ev.block;
        // Their text wins on the block; what I typed becomes a new block right after it.
        mine.text = theirs.text;
        mine.rev = theirs.rev;
        mine.type = theirs.type;
        queue.current = queue.current.filter((op) => !(op.op === 'update' && op.id === mine.id && 'text' in op.patch));
        if (JSON.stringify(mineText) !== JSON.stringify(theirs.text)) {
          const copy = emptyBlock(mine.type, { text: mineText });
          const at = locateBlock(body.current.blocks, mine.id);
          edit([{ op: 'insert', parent: at?.parent?.id ?? null, after: mine.id, block: copy }]);
          setNotice('Someone else edited the same line. Their version is kept; yours is the line below it.');
        }
        redraw();
      } else if (ev.t === 'pagePresence' && ev.id === id) {
        setPeers((p) => ({ ...p, [ev.userId]: ev.cursor }));
      } else if (ev.t === 'pageRevoked' && ev.id === id) {
        setState('denied');
      }
    });
    return () => {
      off();
      clearTimeout(timer.current);
      while (queue.current.length) send({ t: 'blockOps', id, ops: queue.current.splice(0, 100) });
      send({ t: 'pageClose', id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Apply edits to my copy now, queue them for the server.
  function edit(ops: BlockOp[], remember = true): void {
    if (!body.current || !openId.current) return;
    if (remember) hist.current.record(body.current.blocks, ops, Date.now());
    const res = applyOps(body.current, ops);
    for (const op of res.applied) {
      // `applied` has the revision the local copy chose; the server picks its own.
      enqueue(queue.current, op.op === 'update' ? { op: 'update', id: op.id, patch: op.patch, baseRev: op.baseRev } : op);
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, FLUSH_MS);
    redraw();
  }

  // Steps back (or forward) through my own edits, across blocks. Other people's edits are not touched.
  const step = (back: boolean): boolean => {
    if (!body.current) return false;
    const ops = back ? hist.current.takeUndo(body.current.blocks, Date.now()) : hist.current.takeRedo(body.current.blocks, Date.now());
    if (!ops) return false;
    edit(ops, false);
    return true;
  };

  const update = (blockId: string, patch: BlockPatch): void => {
    const b = body.current && findBlock(body.current.blocks, blockId);
    if (b) edit([{ op: 'update', id: blockId, patch, baseRev: b.rev }]);
  };

  const patchMeta = (patch: Partial<Pick<PageMeta, 'title' | 'icon' | 'cover' | 'font' | 'smallText' | 'fullWidth' | 'locked'>>): void => {
    if (!id) return;
    setMeta((m) => (m ? { ...m, ...patch } : m));
    send({ t: 'pageUpdate', id, patch });
  };

  const presence = (cursor: string | null): void => {
    if (id) send({ t: 'pagePresence', id, cursor });
  };

  const canEdit = (level === 'edit-content' || level === 'edit' || level === 'full') && !meta?.locked && !meta?.trashedAt;

  return {
    state,
    meta,
    level,
    blocks: body.current?.blocks ?? [],
    peers,
    comments,
    suggestions,
    notice,
    dismissNotice: () => setNotice(null),
    canEdit,
    edit,
    undo: () => step(true),
    redo: () => step(false),
    update,
    patchMeta,
    presence,
    flush,
    newId: newBlockId,
    me,
  };
}

export type PageDocApi = ReturnType<typeof usePageDoc>;
