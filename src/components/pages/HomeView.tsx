// Home: where you were, what changed, what is coming up, and quick ways to start something.
import { Icon } from '../Icon.tsx';
import { useEffect, useMemo, useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { readRecent } from '../../recent.ts';
import type { CalendarItem, PageNode } from '../../types.ts';
import { iconOf } from './PageTree.tsx';

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface Props {
  onOpen: (id: string) => void;
  onNew: (db?: boolean) => void;
  onLibrary: () => void;
  onCalendar: () => void;
}

export function HomeView({ onOpen, onNew, onLibrary, onCalendar }: Props) {
  const { snap, send, listen } = useRelayCtx();
  const [feed, setFeed] = useState<CalendarItem[] | null>(null);
  useEffect(() => {
    const off = listen((ev) => {
      if (ev.t === 'calendarFeed') setFeed(ev.items);
    });
    send({ t: 'calendarFeed' });
    return off;
  }, [listen, send]);

  const byId = useMemo(() => new Map(snap.pages.map((n) => [n.id, n])), [snap.pages]);
  const visited = readRecent().map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed).slice(0, 8);
  const edited = [...snap.pages].filter((n) => !n.trashed).sort((a, b) => b.editedAt - a.editedAt).slice(0, 8);
  const favs = snap.pageFavorites.map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = (feed ?? []).filter((i) => i.start.slice(0, 10) >= today && i.start.slice(0, 10) <= soon).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);

  const card = (n: PageNode) => (
    <button key={n.id} className="home-card" onClick={() => onOpen(n.id)}>
      <span className="home-icon" aria-hidden>{iconOf(n)}</span>
      <b>{n.title || 'Untitled'}</b>
      <small>{n.kind === 'database' ? 'Database · ' : ''}{ago(n.editedAt)}{n.editedAt && snap.users[n.createdBy] ? ` · ${snap.users[n.createdBy].name}` : ''}</small>
    </button>
  );

  return (
    <div className="home-view">
      <h1>Home</h1>
      <div className="home-quick">
        <button className="ghost-btn" onClick={() => onNew(false)}><Icon n="file" /> New page</button>
        <button className="ghost-btn" onClick={() => onNew(true)}><Icon n="database" /> New database</button>
        <button className="ghost-btn" onClick={onLibrary}><Icon n="layout" /> Templates</button>
        <button className="ghost-btn" onClick={onCalendar}><Icon n="calendar" /> Calendar</button>
      </div>
      {favs.length > 0 && (<section><h2>Favorites</h2><div className="home-row">{favs.slice(0, 8).map(card)}</div></section>)}
      <section>
        <h2>Recently visited</h2>
        {visited.length ? <div className="home-row">{visited.map(card)}</div> : <p className="muted">Pages you open show up here.</p>}
      </section>
      <section>
        <h2>Upcoming</h2>
        {feed === null ? <p className="muted">Loading…</p> : upcoming.length ? (
          <ul className="home-list">
            {upcoming.map((i) => (
              <li key={`${i.dbId}.${i.rowId}.${i.prop}`}><button onClick={() => onOpen(`${i.dbId}.${i.rowId}`)}><b>{i.title}</b><small>{new Date(i.start.slice(0, 10)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · {i.dbTitle}</small></button></li>
            ))}
          </ul>
        ) : <p className="muted">Nothing dated in the next 7 days. Rows with a date in any database you can open appear here.</p>}
      </section>
      <section>
        <h2>Recently edited</h2>
        {edited.length ? <div className="home-row">{edited.map(card)}</div> : <p className="muted">No pages yet. Create one from the sidebar or pick a template.</p>}
      </section>
    </div>
  );
}
