// Home: the page you land on before choosing a workspace. A greeting, your own notes, to-do lists and
// links (they belong to you, not to any workspace), and a sidebar of the workspaces you can enter.
import { useEffect, useRef, useState } from 'react';
import type { ClientEvent, HomeItem, HomeKind, HomeTask, WorkspaceSummary } from '../types.ts';
import { greeting, progress } from '../home.ts';
import { LogoMark } from './LogoIntro.tsx';
import { WorkspaceTile } from './Workspaces.tsx';
import '../home.css';

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

function Card({ item, send }: { item: HomeItem; send: Props['send'] }) {
  const patch = (p: Partial<Pick<HomeItem, 'title' | 'text' | 'url' | 'tasks'>>) => send({ t: 'homeUpdate', id: item.id, patch: p });
  // A task without an id is new; the server gives it one.
  const setTasks = (tasks: Partial<HomeTask>[]) => patch({ tasks: tasks as HomeTask[] });
  const [next, setNext] = useState('');
  const label = item.kind === 'note' ? 'Note' : item.kind === 'todo' ? 'To-do list' : 'Link';
  return (
    <article className={`hs-card ${item.kind}`} aria-label={`${label}: ${item.title || 'Untitled'}`}>
      <header>
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
              <li key={t.id} className={t.done ? 'done' : ''}>
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
  return (
    <div className="hs">
      <nav className="hs-side" aria-label="Workspaces">
        <span className="hs-brand"><LogoMark size={22} />Relay</span>
        <button className="hs-nav on" aria-current="page">Home</button>
        <p className="hs-label">Workspaces</p>
        <ul>
          {mine.map((w) => (
            <li key={w.id}>
              <button className="hs-nav ws" onClick={() => onEnter(w.id)}>
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
      <main className="hs-main">
        <h1>{greeting(now.getHours(), name)}</h1>
        <p className="hs-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · Pick a workspace on the left, or keep things here. Only you can see this page.</p>
        <div className="hs-add" role="group" aria-label="Add to Home">
          <button onClick={() => add('note')}>+ Note</button>
          <button onClick={() => add('todo')}>+ To-do list</button>
          <button onClick={() => add('link')}>+ Link</button>
        </div>
        {items.length === 0 ? (
          <p className="hs-empty big">Nothing here yet. Add a note, a to-do list or a link, anything you like.</p>
        ) : (
          <div className="hs-grid">{items.map((i) => <Card key={i.id} item={i} send={send} />)}</div>
        )}
      </main>
    </div>
  );
}
