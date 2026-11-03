// Calendar: every dated row from every database you can open, on one month grid.
import { useEffect, useMemo, useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { addDays, isoDay, weekStart } from '../../dbquery.ts';
import type { CalendarItem } from '../../types.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarApp({ onOpen }: { onOpen: (id: string) => void }) {
  const { send, listen, snap } = useRelayCtx();
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const today = isoDay(Date.now());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(today);

  useEffect(() => {
    const off = listen((ev) => {
      if (ev.t === 'calendarFeed') setItems(ev.items);
    });
    send({ t: 'calendarFeed' });
    return off;
  }, [listen, send]);

  const dbs = useMemo(() => [...new Map((items ?? []).map((i) => [i.dbId, i.dbTitle])).entries()], [items]);
  const first = `${month}-01`;
  const start = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shown = days[35].slice(0, 7) === month || days[28].slice(0, 7) === month ? days : days.slice(0, 35);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) {
      if (hidden[it.dbId]) continue;
      const s = it.start.slice(0, 10);
      const e = (it.end ?? it.start).slice(0, 10);
      for (let d = s, n = 0; d <= e && n < 62; d = addDays(d, 1), n++) (m.get(d) ?? m.set(d, []).get(d)!).push(it);
    }
    return m;
  }, [items, hidden]);
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  };
  const [y, m] = month.split('-').map(Number);
  const dayItems = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="home-view cal-app">
      <header className="cal-head">
        <h1>{MONTHS[m - 1]} {y}</h1>
        <span>
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <button className="ghost-btn" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </span>
      </header>
      {dbs.length > 0 && (
        <div className="cal-filters" role="group" aria-label="Databases shown">
          {dbs.map(([id, title]) => (
            <label key={id} className="db-check-row"><input type="checkbox" checked={!hidden[id]} onChange={(e) => setHidden((h) => ({ ...h, [id]: !e.target.checked }))} /> {title}</label>
          ))}
        </div>
      )}
      {items === null ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <div className="empty-card">
          <p><b>Nothing on the calendar yet.</b></p>
          <p className="muted">Rows with a date property, in any database you can open, show up here.</p>
          <button className="primary" onClick={() => send({ t: 'dbCreate', parentId: null, title: 'Events', preset: 'tasks', layout: 'calendar', teamspaceId: 'general', shared: true })}>Create a calendar database</button>
          {snap.pages.some((n) => n.kind === 'database') && <p className="muted db-note">Or add a date property to a database you already have.</p>}
        </div>
      ) : (
        <div className="cal-layout">
          <div className="db-cal-grid" role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
            {DAYS.map((d) => <div key={d} className="db-cal-dow" role="columnheader">{d}</div>)}
            {shown.map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <div key={day} role="gridcell" className={`db-cal-day ${day.slice(0, 7) !== month ? 'out' : ''} ${day === today ? 'today' : ''} ${selected === day ? 'sel' : ''}`} onClick={() => setSelected(day)}>
                  <button className="db-cal-num" aria-label={`${day}, ${list.length} item${list.length === 1 ? '' : 's'}`} onClick={() => setSelected(day)}>{Number(day.slice(8))}</button>
                  {list.slice(0, 3).map((it) => <button key={`${it.rowId}${it.prop}`} className="db-cal-item bg-blue" onClick={(e) => { e.stopPropagation(); onOpen(`${it.dbId}.${it.rowId}`); }}>{it.title}</button>)}
                  {list.length > 3 && <small className="muted">+{list.length - 3} more</small>}
                </div>
              );
            })}
          </div>
          <aside className="cal-day" aria-label="Selected day">
            <h2>{selected ? new Date(`${selected}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'Pick a day'}</h2>
            {dayItems.length === 0 ? <p className="muted">Nothing on this day.</p> : (
              <ul className="home-list">
                {dayItems.map((it) => <li key={`${it.rowId}${it.prop}`}><button onClick={() => onOpen(`${it.dbId}.${it.rowId}`)}><b>{it.title}</b><small>{it.dbTitle} · {it.prop}{it.start.includes('T') ? ` · ${it.start.slice(11, 16)}` : ''}</small></button></li>)}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
