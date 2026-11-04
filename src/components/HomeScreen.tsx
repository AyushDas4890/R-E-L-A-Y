// Home: the page you land on before choosing a workspace. A greeting, your own notes, to-do lists and
// links (they belong to you, not to any workspace), and a sidebar of the workspaces you can enter.
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { ClientEvent, HomeItem, HomeKind, HomeTask, WorkspaceSummary } from '../types.ts';
import { greeting, progress } from '../home.ts';
import { LogoMark } from './LogoIntro.tsx';
import { WorkspaceTile } from './Workspaces.tsx';
import { Constellation } from './Constellation.tsx';
import { carriesFiles, carriesTextOrLink, classifyDrop, isTextFile, moveBefore, nudge, orderBy, useReorder, useSavedOrder, WORKSPACE_ORDER_KEY } from '../dnd.ts';
import '../home.css';
import '../dnd.css';

interface Props {
  name: string;
  items: HomeItem[];
  mine: WorkspaceSummary[];
  lastWorkspace?: string;
  send: (ev: ClientEvent) => void;
  onEnter: (id: string) => void;
  onCreate: () => void;
  onFind: () => void;
  onSignOut: () => void;
}

// A text box that keeps what you are typing while the server echoes older values, and saves when you leave it.
function Field({ value, onCommit, multiline, label, placeholder, className }: { value: string; onCommit: (v: string) => void; multiline?: boolean; label: string; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  // The latest text lives in a ref too, so leaving the box commits what was typed even if React hasn't re-rendered yet.
  const latest = useRef(value);
  useEffect(() => { if (!focused.current) { setV(value); latest.current = value; } }, [value]);
  const type = (s: string) => { latest.current = s; setV(s); };
  const shared = {
    value: v,
    'aria-label': label,
    placeholder,
    className,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; if (latest.current !== value) onCommit(latest.current); },
  };
  return multiline
    ? <textarea {...shared} rows={4} onChange={(e) => type(e.target.value)} />
    : <input {...shared} onChange={(e) => type(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Card({ item, send, order }: { item: HomeItem; send: Props['send']; order: ReturnType<typeof useReorder> & { nudge: (id: string, dir: -1 | 1) => void } }) {
  const cardRef = useRef<HTMLElement>(null);
  const patch = (p: Partial<Pick<HomeItem, 'title' | 'text' | 'url' | 'tasks'>>) => send({ t: 'homeUpdate', id: item.id, patch: p });
  // A task without an id is new; the server gives it one.
  const setTasks = (tasks: Partial<HomeTask>[]) => patch({ tasks: tasks as HomeTask[] });
  const [next, setNext] = useState('');
  // Tasks inside a to-do list can be dragged into a new order too.
  const taskOrder = useReorder((from, before) => {
    const byId = new Map(item.tasks.map((t) => [t.id, t]));
    setTasks(moveBefore(item.tasks.map((t) => t.id), from, before).map((id) => byId.get(id)!));
  });
  const label = item.kind === 'note' ? 'Note' : item.kind === 'todo' ? 'To-do list' : 'Link';
  return (
    <article ref={cardRef} className={`hs-card ${item.kind} ${order.classOf(item.id)}`} aria-label={`${label}: ${item.title || 'Untitled'}`} {...order.targetProps(item.id)}>
      <header>
        <button className="hs-grip" aria-label={`Move ${label.toLowerCase()}: drag, or press the arrow keys`} title="Drag to reorder" {...order.handleProps(item.id, () => cardRef.current)} {...order.keyProps((d) => order.nudge(item.id, d))}>⠿</button>
        <span className="hs-kind">{label}</span>
        <button className="hs-x" aria-label={`Delete ${label.toLowerCase()}`} title="Delete" onClick={() => { if (confirm(`Delete this ${label.toLowerCase()}?`)) send({ t: 'homeRemove', id: item.id }); }}>×</button>
      </header>
      <Field className="hs-title" label="Title" placeholder="Untitled" value={item.title} onCommit={(title) => patch({ title })} />
      {item.kind === 'note' && <Field multiline label="Note text" placeholder="Write anything…" value={item.text} onCommit={(text) => patch({ text })} />}
      {item.kind === 'link' && (
        <>
          <Field label="Link address" placeholder="https://…" value={item.url} onCommit={(url) => patch({ url })} />
          {item.url && <a className="hs-open" href={item.url} target="_blank" rel="noreferrer noopener">Open link ↗</a>}
        </>
      )}
      {item.kind === 'todo' && (
        <>
          <ul className="hs-tasks">
            {item.tasks.map((t) => (
              <li key={t.id} className={`${t.done ? 'done' : ''} ${taskOrder.classOf(t.id)}`} {...taskOrder.targetProps(t.id)}>
                <button className="hs-grip task" aria-label={`Move task: ${t.text || 'untitled'}`} title="Drag to reorder" {...taskOrder.handleProps(t.id, () => cardRef.current)} {...taskOrder.keyProps((d) => {
                  const byId = new Map(item.tasks.map((x) => [x.id, x]));
                  setTasks(nudge(item.tasks.map((x) => x.id), t.id, d).map((id) => byId.get(id)!));
                })}>⠿</button>
                <input type="checkbox" aria-label={`Done: ${t.text}`} checked={t.done} onChange={(e) => setTasks(item.tasks.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)))} />
                <Field label="Task" value={t.text} onCommit={(text) => setTasks(item.tasks.map((x) => (x.id === t.id ? { ...x, text } : x)))} />
                <button className="hs-x" aria-label="Remove task" onClick={() => setTasks(item.tasks.filter((x) => x.id !== t.id))}>×</button>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); if (next.trim()) { setTasks([...item.tasks, { text: next.trim(), done: false }]); setNext(''); } }}>
            <input className="hs-add-task" aria-label="Add a task" placeholder="Add a task, press Enter" value={next} onChange={(e) => setNext(e.target.value)} />
          </form>
          {item.tasks.length > 0 && <small className="hs-progress">{progress(item.tasks)}</small>}
        </>
      )}
    </article>
  );
}

export function HomeScreen({ name, items, mine, lastWorkspace, send, onEnter, onCreate, onFind, onSignOut }: Props) {
  const now = new Date();
  const add = (kind: HomeKind) => send({ t: 'homeAdd', kind });

  // Cards: the order is the server's, so a drop (or arrow key) just says where the card should go.
  const cardIds = items.map((i) => i.id);
  const cardOrder = useReorder((from, before) => send({ t: 'homeMove', id: from, before }));
  const cards = {
    ...cardOrder,
    nudge: (id: string, dir: -1 | 1) => {
      const next = nudge(cardIds, id, dir);
      const at = next.indexOf(id);
      if (next.join() !== cardIds.join()) send({ t: 'homeMove', id, before: next[at + 1] ?? null });
    },
  };

  // Workspaces: this browser remembers your order; the server doesn't know about it.
  const [saved, saveOrder] = useSavedOrder(WORKSPACE_ORDER_KEY);
  const sorted = orderBy(mine, (w) => w.id, saved);
  const wsIds = sorted.map((w) => w.id);
  const wsOrder = useReorder((from, before) => saveOrder(moveBefore(wsIds, from, before)));

  // Drop a link, some text or a text file anywhere on the page to keep it here.
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const inField = (e: DragEvent) => !!(e.target as HTMLElement).closest?.('input, textarea');
  const wanted = (e: DragEvent) => carriesFiles(e.dataTransfer) || carriesTextOrLink(e.dataTransfer);
  const onDrop = async (e: DragEvent) => {
    setDropping(false);
    if (!wanted(e) || inField(e)) return;
    e.preventDefault();
    const dt = e.dataTransfer;
    const drops = classifyDrop({ uri: dt.getData('text/uri-list'), text: dt.getData('text/plain'), files: Array.from(dt.files) });
    let added = 0, skipped = 0;
    for (const d of drops.slice(0, 10)) {
      if (d.kind === 'link') { send({ t: 'homeAdd', kind: 'link', fields: { title: d.title, url: d.url } }); added++; }
      else if (d.kind === 'text') { send({ t: 'homeAdd', kind: 'note', fields: { title: d.title, text: d.text } }); added++; }
      else if (isTextFile(d.file) && d.file.size <= 200_000) {
        try { send({ t: 'homeAdd', kind: 'note', fields: { title: d.file.name.replace(/\.[^.]+$/, ''), text: await d.file.text() } }); added++; } catch { skipped++; }
      } else skipped++;
    }
    if (drops.length > 10) skipped += drops.length - 10;
    setNotice(skipped ? `Added ${added}. Home keeps notes, to-do lists and links, so only links, text and text files can be dropped.` : `Added ${added} to Home.`);
  };

  return (
    <div className="hs">
      <nav className="hs-side" aria-label="Workspaces">
        <span className="hs-brand"><LogoMark size={22} />Relay</span>
        <button className="hs-nav on" aria-current="page">Home</button>
        <p className="hs-label">Workspaces{mine.length > 1 && <small> · drag to reorder</small>}</p>
        <ul>
          {sorted.map((w) => (
            <li key={w.id} className={wsOrder.classOf(w.id)} {...wsOrder.targetProps(w.id)}>
              <button
                className="hs-nav ws"
                onClick={() => onEnter(w.id)}
                title="Click to open · drag to reorder · Alt+arrows to move"
                {...wsOrder.handleProps(w.id)}
                {...wsOrder.keyProps((d) => saveOrder(nudge(wsIds, w.id, d)), true)}
              >
                <WorkspaceTile ws={w} size={24} />
                <span className="hs-ws-name">{w.name}</span>
                {w.id === lastWorkspace && <small>last used</small>}
              </button>
            </li>
          ))}
        </ul>
        {mine.length === 0 && <p className="hs-empty">You aren’t in a workspace yet.</p>}
        <button className="hs-nav" onClick={onCreate}>+ New workspace</button>
        <button className="hs-nav" onClick={onFind}>Find workspaces to join</button>
        <button className="hs-nav out" onClick={onSignOut}>Sign out</button>
      </nav>
      <div
        className={`hs-stage ${dropping ? 'dropping' : ''}`}
        onDragOver={(e) => { if (wanted(e) && !inField(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dropping) setDropping(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
        onDrop={(e) => void onDrop(e)}
      >
        <Constellation mine={sorted} onEnter={onEnter} />
        {mine.length > 0 && <p className="hs-hint" aria-hidden="true">Hover a glowing node to peek, click to jump in, drag to move it around</p>}
        {dropping && <div className="hs-drop" aria-hidden="true"><b>Drop to add to Home</b><span>A link becomes a link card, text becomes a note</span></div>}
        {notice && <p className="hs-notice" role="status">{notice}</p>}
        <main className="hs-main">
          <h1>{greeting(now.getHours(), name)}</h1>
          <p className="hs-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · Pick a workspace on the left, or keep things here. Only you can see this page.</p>
          <div className="hs-add" role="group" aria-label="Add to Home">
            <button onClick={() => add('note')}>+ Note</button>
            <button onClick={() => add('todo')}>+ To-do list</button>
            <button onClick={() => add('link')}>+ Link</button>
          </div>
          {items.length === 0 ? (
            <p className="hs-empty big">Nothing here yet. Add a note, a to-do list or a link, or drop a link, some text or a text file anywhere on this page.</p>
          ) : (
            <div className="hs-grid">{items.map((i) => <Card key={i.id} item={i} send={send} order={cards} />)}</div>
          )}
        </main>
      </div>
    </div>
  );
}
