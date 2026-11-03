// The panels beside a page: comments, history and the local assistant.
import { useEffect, useMemo, useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { emptyBlock } from '../../editor.ts';
import { actionItems, answer, keyPoints, lines, suggestTitle, summarize } from '../../localAi.ts';
import type { PageDocApi } from '../../pages-store.ts';
import type { Block, PageComment, PageLevel, PageVersion, SearchHit } from '../../types.ts';

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const blockText = (blocks: Block[], id: string): string => {
  for (const b of blocks) {
    if (b.id === id) return b.text.map((r) => r.t).join('').slice(0, 80);
    const inner = blockText(b.children, id);
    if (inner) return inner;
  }
  return '';
};

// ---- Comments ----

interface CommentsProps {
  pageId: string;
  comments: PageComment[];
  blocks: Block[];
  level: PageLevel;
  // A block the next comment is about (from the block menu).
  aboutBlock: string | null;
  onClearBlock: () => void;
  onGoTo: (blockId: string) => void;
  onClose: () => void;
}

export function CommentsPanel({ pageId, comments, blocks, level, aboutBlock, onClearBlock, onGoTo, onClose }: CommentsProps) {
  const { snap, send } = useRelayCtx();
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const can = level === 'comment' || level === 'edit' || level === 'full';
  const roots = comments.filter((c) => !c.parent);
  const open = roots.filter((c) => !c.resolved);
  const done = roots.filter((c) => c.resolved);
  const people = Object.values(snap.users).filter((u) => !u.bot && !u.inactive);

  // `@[id]` in a comment shows as the person's name.
  const show = (t: string) => t.replace(/@\[([A-Za-z0-9_-]+)\]/g, (_m, id: string) => `@${snap.users[id]?.name ?? 'someone'}`);
  const mentionPicker = (onPick: (token: string) => void) => (
    <select aria-label="Mention a person" value="" onChange={(e) => { if (e.target.value) onPick(`@[${e.target.value}] `); }}>
      <option value="">@ Mention…</option>
      {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
  const post = (body: string, parent?: string, blockId?: string) => {
    if (!body.trim()) return;
    send({ t: 'comment', id: pageId, text: body, ...(parent ? { parent } : {}), ...(blockId ? { blockId } : {}) });
  };
  const thread = (c: PageComment) => {
    const replies = comments.filter((r) => r.parent === c.id);
    return (
      <li key={c.id} className={`cm-thread ${c.resolved ? 'done' : ''}`}>
        {c.blockId && <button className="cm-anchor" onClick={() => onGoTo(c.blockId!)}>“{blockText(blocks, c.blockId) || 'block'}”</button>}
        {[c, ...replies].map((m) => (
          <div key={m.id} className="cm-msg">
            <header><b>{snap.users[m.by]?.name ?? 'Someone'}</b><time className="muted">{ago(m.at)}</time>
              {(m.by === snap.me || level === 'full') && <button className="icon-btn" aria-label="Delete comment" onClick={() => send({ t: 'commentDelete', id: pageId, commentId: m.id })}>✕</button>}
            </header>
            <p>{show(m.text)}</p>
          </div>
        ))}
        {can && (
          <div className="cm-actions">
            <button className="ghost-btn" onClick={() => setReply(reply?.id === c.id ? null : { id: c.id, text: '' })}>Reply</button>
            <button className="ghost-btn" onClick={() => send({ t: 'commentResolve', id: pageId, commentId: c.id, on: !c.resolved })}>{c.resolved ? 'Re-open' : 'Resolve'}</button>
          </div>
        )}
        {reply?.id === c.id && (
          <form className="cm-form" onSubmit={(e) => { e.preventDefault(); post(reply.text, c.id); setReply(null); }}>
            <textarea autoFocus rows={2} aria-label="Reply" placeholder="Reply…" value={reply.text} onChange={(e) => setReply({ id: c.id, text: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(reply.text, c.id); setReply(null); } }} />
            <div className="cm-row">{mentionPicker((t) => setReply({ id: c.id, text: reply.text + t }))}<button className="primary" disabled={!reply.text.trim()}>Reply</button></div>
          </form>
        )}
      </li>
    );
  };

  return (
    <aside className="side-panel" aria-label="Comments">
      <header><h2>Comments</h2><button className="icon-btn" aria-label="Close comments" onClick={onClose}>✕</button></header>
      {can ? (
        <form className="cm-form" onSubmit={(e) => { e.preventDefault(); post(text, undefined, aboutBlock ?? undefined); setText(''); onClearBlock(); }}>
          {aboutBlock && <p className="cm-about">About “{blockText(blocks, aboutBlock) || 'a block'}” <button type="button" className="icon-btn" aria-label="Comment on the whole page instead" onClick={onClearBlock}>✕</button></p>}
          <textarea rows={3} aria-label="New comment" placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(text, undefined, aboutBlock ?? undefined); setText(''); onClearBlock(); } }} />
          <div className="cm-row">{mentionPicker((t) => setText(text + t))}<button className="primary" disabled={!text.trim()}>Comment</button></div>
        </form>
      ) : <p className="muted db-note">You can read comments but not add them.</p>}
      {open.length === 0 && <p className="muted db-note">No open comments.</p>}
      <ul className="cm-list">{open.map(thread)}</ul>
      {done.length > 0 && (
        <>
          <button className="ghost-btn" aria-expanded={showResolved} onClick={() => setShowResolved((s) => !s)}>{showResolved ? 'Hide' : 'Show'} {done.length} resolved</button>
          {showResolved && <ul className="cm-list">{done.map(thread)}</ul>}
        </>
      )}
    </aside>
  );
}

// ---- History ----

export function HistoryPanel({ pageId, canRestore, onClose }: { pageId: string; canRestore: boolean; onClose: () => void }) {
  const { snap, send, listen } = useRelayCtx();
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [preview, setPreview] = useState<{ id: string; blocks: Block[] } | null>(null);
  useEffect(() => {
    const off = listen((ev) => {
      if (ev.t !== 'pageHistory' || ev.id !== pageId) return;
      setVersions(ev.versions);
      if (ev.preview) setPreview(ev.preview);
    });
    send({ t: 'pageHistory', id: pageId });
    return off;
  }, [pageId, listen, send]);
  const ls = preview ? lines(preview.blocks) : [];
  return (
    <aside className="side-panel" aria-label="Page history">
      <header><h2>Page history</h2><button className="icon-btn" aria-label="Close history" onClick={onClose}>✕</button></header>
      {versions === null && <p className="muted db-note">Loading…</p>}
      {versions?.length === 0 && <p className="muted db-note">No earlier versions yet. A version is saved when the page is edited after ten quiet minutes.</p>}
      <ul className="cm-list">
        {versions?.map((v) => (
          <li key={v.id} className={`hist ${preview?.id === v.id ? 'on' : ''}`}>
            <button onClick={() => send({ t: 'pageHistory', id: pageId, versionId: v.id })}><b>{new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b><small>{snap.users[v.by]?.name ?? 'Someone'} · {v.title || 'Untitled'}</small></button>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="hist-preview">
          <h3>Preview</h3>
          <div className="hist-lines">{ls.length ? ls.map((l, i) => <p key={i} style={{ paddingLeft: l.depth * 14 }} className={/^h[123]$/.test(l.type) ? 'h' : ''}>{l.type === 'todo' ? (l.checked ? '☑ ' : '☐ ') : l.type === 'bullet' ? '• ' : ''}{l.text}</p>) : <p className="muted">This version was empty.</p>}</div>
          {canRestore && <button className="primary" onClick={() => { if (confirm('Restore this version? What is on the page now is kept in the history.')) { send({ t: 'pageRestoreVersion', id: pageId, versionId: preview.id }); onClose(); } }}>Restore this version</button>}
        </div>
      )}
    </aside>
  );
}

// ---- Local assistant ----

export function AssistantPanel({ doc, onClose, onOpen }: { doc: PageDocApi; onClose: () => void; onOpen: (id: string) => void }) {
  const { snap, send, listen } = useRelayCtx();
  const [out, setOut] = useState<{ title: string; items: string[]; kind: 'list' | 'text' } | null>(null);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'page' | 'workspace'>('page');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const text = useMemo(() => lines(doc.blocks).map((l) => l.text).join('. '), [doc.blocks]);
  const can = doc.canEdit;

  useEffect(
    () =>
      listen((ev) => {
        if (ev.t === 'searchResults') setHits(ev.hits);
      }),
    [listen],
  );

  const run = (title: string, items: string[], kind: 'list' | 'text' = 'list') => setOut({ title, items, kind });
  const insert = () => {
    if (!out || !can) return;
    const heading = emptyBlock('callout', { icon: '✨', text: [{ t: out.title }], children: out.items.map((t) => emptyBlock(out.kind === 'list' ? 'bullet' : 'text', { text: [{ t }] })) });
    doc.edit([{ op: 'insert', parent: null, after: null, block: heading }]);
  };
  const ask = () => {
    if (!q.trim()) return;
    if (scope === 'page') {
      const found = answer(q, [{ id: 'this', title: doc.meta?.title ?? '', text }]);
      run(`Answer from this page`, found.length ? found.map((f) => f.text) : ['I couldn’t find anything about that on this page.']);
    } else {
      setHits(null);
      send({ t: 'search', q: q.split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(' ') || q });
    }
  };
  const workspaceAnswers = hits === null ? null : answer(q, hits.map((h) => ({ id: h.id, title: h.title, text: h.snippet })), 4);

  return (
    <aside className="side-panel" aria-label="Assistant">
      <header><h2>✨ Assistant</h2><button className="icon-btn" aria-label="Close assistant" onClick={onClose}>✕</button></header>
      <p className="muted db-note">Runs in your browser. It finds and condenses text that is already here; it doesn’t write new content, and nothing leaves your workspace.</p>
      <div className="ai-actions">
        <button className="ghost-btn" disabled={!text} onClick={() => run('Summary', summarize(text, 4).length ? summarize(text, 4) : [text.slice(0, 280)])}>Summarize</button>
        <button className="ghost-btn" disabled={!text} onClick={() => run('Key points', keyPoints(doc.blocks).length ? keyPoints(doc.blocks) : summarize(text, 3))}>Key points</button>
        <button className="ghost-btn" disabled={!text} onClick={() => run('Action items', actionItems(doc.blocks).length ? actionItems(doc.blocks) : ['No action items found.'])}>Action items</button>
        <button className="ghost-btn" disabled={!text} onClick={() => run('Suggested title', [suggestTitle(doc.blocks)], 'text')}>Suggest a title</button>
      </div>
      <form className="cm-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input aria-label="Ask a question" placeholder="Ask about this page or the workspace…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <div className="cm-row">
          <select aria-label="Where to look" value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'workspace')}><option value="page">This page</option><option value="workspace">Everything I can open</option></select>
          <button className="primary" disabled={!q.trim()}>Ask</button>
        </div>
      </form>
      {out && (
        <div className="ai-out">
          <h3>{out.title}</h3>
          {out.kind === 'list' ? <ul>{out.items.map((i, n) => <li key={n}>{i}</li>)}</ul> : <p>{out.items[0]}</p>}
          <div className="db-row-btns">
            {can && out.title !== 'Suggested title' && <button onClick={insert}>Insert into page</button>}
            {can && out.title === 'Suggested title' && out.items[0] && <button onClick={() => doc.patchMeta({ title: out.items[0] })}>Use as title</button>}
            <button onClick={() => void navigator.clipboard?.writeText(out.items.join('\n'))}>Copy</button>
          </div>
        </div>
      )}
      {scope === 'workspace' && workspaceAnswers && (
        <div className="ai-out">
          <h3>From your workspace</h3>
          {workspaceAnswers.length === 0 ? <p className="muted">Nothing found for that.</p> : (
            <ul>{workspaceAnswers.map((a, i) => <li key={i}>{a.text} <button className="cite" onClick={() => onOpen(a.source.id)}>{a.source.title || 'Untitled'}</button></li>)}</ul>
          )}
          {hits && hits.length > 0 && workspaceAnswers.length === 0 && <ul>{hits.slice(0, 5).map((h) => <li key={h.id}><button className="cite" onClick={() => onOpen(h.id)}>{h.title}</button></li>)}</ul>}
        </div>
      )}
      <span hidden>{snap.me}</span>
    </aside>
  );
}
