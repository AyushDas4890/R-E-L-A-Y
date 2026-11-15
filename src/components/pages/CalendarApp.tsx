// Calendar: every dated row from every database you can open, in month, week and day views.
// Events are database rows, so adding, moving, editing and deleting here are the same row events the
// database views use, and the server checks the person may edit each row.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { addDay, buildSpan, clock, daysBetween, hasTime, lanes, minutesOf, moveToDay, moveToTime, spanOf, stepAnchor, viewDays, type SpanInput } from '../../calendarMath.ts';
import type { CalendarDb, CalendarItem, DateValue } from '../../types.ts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR = 44; // px per hour in the week and day grids
type View = 'month' | 'week' | 'day';

const keyOf = (it: CalendarItem) => `${it.dbId}.${it.rowId}.${it.propId}`;
const valueOf = (it: CalendarItem): DateValue => (it.end ? { start: it.start, end: it.end } : { start: it.start });
const long = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);

interface Draft { item?: CalendarItem; dbId: string; title: string; f: SpanInput; error: string }

export function CalendarApp({ onOpen }: { onOpen: (id: string) => void }) {
  const { send, listen, snap } = useRelayCtx();
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [dbs, setDbs] = useState<CalendarDb[]>([]);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(today());
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string>(today());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [undo, setUndo] = useState<{ text: string; dbId: string; rowId: string } | null>(null);
  const dragged = useRef<CalendarItem | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const refresh = () => send({ t: 'calendarFeed' });
  useEffect(() => {
    const off = listen((ev) => {
      if (ev.t === 'calendarFeed') { setItems(ev.items); setDbs(ev.dbs); }
    });
    refresh();
    return off;
  }, [listen, send]);
  // Changes made by others show up without a reload.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
    return () => clearInterval(t);
  }, [send]);
  // The week and day grids open scrolled to the morning.
  useEffect(() => { if (view !== 'month' && gridRef.current) gridRef.current.scrollTop = 7 * HOUR; }, [view]);

  const editable = dbs.filter((d) => d.canEdit);
  const days = viewDays(view, anchor);
  const month = anchor.slice(0, 7);

  // Items per day: an all-day item covers every day of its range; a timed one is cut to the day shown.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) {
      if (hidden[it.dbId]) continue;
      const s = it.start.slice(0, 10);
      const e = (it.end ?? it.start).slice(0, 10);
      for (let d = s, n = 0; d <= e && n < 62; d = addDay(d, 1), n++) (m.get(d) ?? m.set(d, []).get(d)!).push(it);
    }
    for (const list of m.values()) list.sort((a, b) => (minutesOf(a.start) ?? -1) - (minutesOf(b.start) ?? -1));
    return m;
  }, [items, hidden]);

  // ---- Changes. Each updates the screen at once and asks the server; a refresh sets right any refusal.
  const settle = () => { setTimeout(refresh, 350); };
  function move(it: CalendarItem, v: DateValue) {
    setItems((list) => (list ?? []).map((x) => (keyOf(x) === keyOf(it) ? { ...x, start: v.start, end: v.end } : x)));
    send({ t: 'rowUpdate', id: it.dbId, rowId: it.rowId, props: { [it.propId]: v } });
    settle();
  }
  function remove(it: CalendarItem) {
    setItems((list) => (list ?? []).filter((x) => !(x.dbId === it.dbId && x.rowId === it.rowId)));
    send({ t: 'rowRemove', id: it.dbId, rowId: it.rowId });
    setUndo({ text: it.title, dbId: it.dbId, rowId: it.rowId });
    setDraft(null);
    settle();
  }
  function restore() {
    if (!undo) return;
    send({ t: 'rowRemove', id: undo.dbId, rowId: undo.rowId, restore: true });
    setUndo(null);
    settle();
  }
  function save() {
    if (!draft) return;
    const span = buildSpan(draft.f);
    if (typeof span === 'string') return setDraft({ ...draft, error: span });
    const title = draft.title.trim();
    if (draft.item) {
      const db = dbs.find((d) => d.id === draft.item!.dbId);
      send({ t: 'rowUpdate', id: draft.item.dbId, rowId: draft.item.rowId, props: { ...(db ? { [db.titleProp]: title } : {}), [draft.item.propId]: span } });
    } else {
      const db = dbs.find((d) => d.id === draft.dbId);
      if (!db) return setDraft({ ...draft, error: 'Pick a database.' });
      send({ t: 'rowCreate', id: db.id, props: { [db.titleProp]: title, [db.dateProp]: span } });
      setSelected(draft.f.date);
    }
    setDraft(null);
    settle();
  }
  function openNew(day: string, mins?: number) {
    setSelected(day);
    setUndo(null);
    setDraft({ dbId: editable[0]?.id ?? '', title: '', error: '', f: { date: day, time: mins === undefined ? '' : clock(mins), endDate: '', endTime: mins === undefined ? '' : clock(mins + 60) } });
  }
  function openEdit(it: CalendarItem) {
    setUndo(null);
    setDraft({ item: it, dbId: it.dbId, title: it.title === 'Untitled' ? '' : it.title, error: '', f: spanOf(valueOf(it)) });
  }

  // ---- Dragging an event to another day (or hour) reschedules its row.
  const dragProps = (it: CalendarItem) => it.canEdit
    ? { draggable: true, onDragStart: (e: DragEvent) => { dragged.current = it; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', keyOf(it)); }, onDragEnd: () => { dragged.current = null; } }
    : {};
  const dropOn = (day: string, mins?: number) => ({
    onDragOver: (e: DragEvent) => { if (dragged.current) e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      const it = dragged.current;
      dragged.current = null;
      if (!it) return;
      e.preventDefault();
      const v = valueOf(it);
      move(it, mins === undefined ? moveToDay(v, day) : moveToTime(v, day, mins));
    },
  });

  const chip = (it: CalendarItem, cls = '') => (
    <button
      key={keyOf(it)}
      className={`db-cal-item bg-blue ${cls}`}
      title={`${it.title} · ${it.dbTitle}`}
      onClick={(e) => { e.stopPropagation(); setSelected(it.start.slice(0, 10)); openEdit(it); }}
      {...dragProps(it)}
    >
      {hasTime(it.start) && <b>{it.start.slice(11, 16)} </b>}{it.title}
    </button>
  );

  const title = view === 'month' ? long(`${month}-01`, { month: 'long', year: 'numeric' })
    : view === 'day' ? long(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `${long(days[0], { month: 'short', day: 'numeric' })} – ${long(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const go = (dir: 1 | -1) => { const a = stepAnchor(view, anchor, dir); setAnchor(a); if (view === 'day') setSelected(a); };
  const dayItems = byDay.get(selected) ?? [];

  // ---- Week and day grid: an all-day band, then 24 hour rows with timed events laid over them.
  function timeGrid() {
    return (
      <div className="cal-time" role="grid" aria-label={title}>
        <div className="cal-time-head" style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span />
          {days.map((d) => (
            <button key={d} className={`cal-col-head ${d === today() ? 'today' : ''} ${d === selected ? 'sel' : ''}`} onClick={() => setSelected(d)}>
              {long(d, { weekday: 'short' })} <b>{Number(d.slice(8))}</b>
            </button>
          ))}
        </div>
        <div className="cal-time-allday" style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span className="muted">all day</span>
          {days.map((d) => <div key={d} className="cal-allday-cell" {...dropOn(d)}>{(byDay.get(d) ?? []).filter((it) => !hasTime(it.start)).map((it) => chip(it))}</div>)}
        </div>
        <div className="cal-time-scroll" ref={gridRef}>
          <div className="cal-time-body" style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR }}>
            <div className="cal-hours">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ height: HOUR }}>{h === 0 ? '' : clock(h * 60)}</span>)}</div>
            {days.map((d) => {
              const timed = (byDay.get(d) ?? []).filter((it) => hasTime(it.start));
              const spans = timed.map((it) => {
                const s = it.start.slice(0, 10) === d ? minutesOf(it.start)! : 0;
                const e = it.end && it.end.slice(0, 10) >= d && hasTime(it.end) ? (it.end.slice(0, 10) === d ? minutesOf(it.end)! : 1440) : s + 60;
                return { start: s, end: Math.min(Math.max(e, s + 20), 1440) };
              });
              const place = lanes(spans);
              return (
                <div key={d} className={`cal-day-col ${d === today() ? 'today' : ''}`}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="cal-slot" style={{ height: HOUR }} onClick={() => openNew(d, h * 60)} {...dropOn(d, h * 60)} />
                  ))}
                  {timed.map((it, i) => (
                    <button
                      key={keyOf(it)}
                      className="cal-event bg-blue"
                      style={{ top: (spans[i].start / 60) * HOUR, height: Math.max(((spans[i].end - spans[i].start) / 60) * HOUR - 2, 18), left: `${(place[i].lane / place[i].of) * 100}%`, width: `calc(${100 / place[i].of}% - 2px)` }}
                      title={`${it.title} · ${it.dbTitle}`}
                      onClick={(e) => { e.stopPropagation(); setSelected(d); openEdit(it); }}
                      {...dragProps(it)}
                    >
                      <b>{it.start.slice(11, 16)}</b> {it.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function monthGrid() {
    return (
      <div className="db-cal-grid" role="grid" aria-label={title}>
        {DAYS.map((d) => <div key={d} className="db-cal-dow" role="columnheader">{d}</div>)}
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          return (
            <div key={day} role="gridcell" className={`db-cal-day ${day.slice(0, 7) !== month ? 'out' : ''} ${day === today() ? 'today' : ''} ${selected === day ? 'sel' : ''}`} onClick={() => setSelected(day)} onDoubleClick={() => openNew(day)} {...dropOn(day)}>
              <button className="db-cal-num" aria-label={`${day}, ${list.length} item${list.length === 1 ? '' : 's'}`} onClick={() => setSelected(day)}>{Number(day.slice(8))}</button>
              {editable.length > 0 && <button className="db-cal-add icon-btn" aria-label={`Add an event on ${day}`} onClick={(e) => { e.stopPropagation(); openNew(day); }}>+</button>}
              {list.slice(0, 3).map((it) => chip(it))}
              {list.length > 3 && <small className="muted">+{list.length - 3} more</small>}
            </div>
          );
        })}
      </div>
    );
  }

  function form() {
    if (!draft) return null;
    const set = (patch: Partial<SpanInput>) => setDraft({ ...draft, error: '', f: { ...draft.f, ...patch } });
    const timed = !!draft.f.time;
    return (
      <form className="cal-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2>{draft.item ? 'Edit event' : 'New event'}</h2>
        <label>Title<input autoFocus value={draft.title} placeholder="Untitled" maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        {!draft.item && (
          <label>Database
            <select value={draft.dbId} onChange={(e) => setDraft({ ...draft, dbId: e.target.value })}>
              {editable.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
        )}
        <div className="cal-form-row">
          <label>Date<input type="date" required value={draft.f.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <label>Time<input type="time" value={draft.f.time} onChange={(e) => set({ time: e.target.value, ...(e.target.value ? {} : { endTime: '' }) })} /></label>
        </div>
        <div className="cal-form-row">
          <label>Ends<input type="date" min={draft.f.date} value={draft.f.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
          <label>At<input type="time" disabled={!timed} value={draft.f.endTime} onChange={(e) => set({ endTime: e.target.value })} /></label>
        </div>
        {draft.error && <p className="cal-error" role="alert">{draft.error}</p>}
        <div className="cal-form-actions">
          <button type="submit" className="primary">{draft.item ? 'Save' : 'Add event'}</button>
          <button type="button" className="ghost-btn" onClick={() => setDraft(null)}>Cancel</button>
          {draft.item && (
            <>
              <button type="button" className="ghost-btn" onClick={() => onOpen(`${draft.item!.dbId}.${draft.item!.rowId}`)}>Open page</button>
              <button type="button" className="ghost-btn danger" onClick={() => remove(draft.item!)}>Delete</button>
            </>
          )}
        </div>
      </form>
    );
  }

  const noPlace = items !== null && dbs.length === 0;
  return (
    <div className="home-view cal-app">
      <header className="cal-head">
        <h1>{title}</h1>
        <span className="cal-controls">
          <span className="cal-views" role="group" aria-label="View">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button key={v} className={`ghost-btn ${view === v ? 'on' : ''}`} aria-pressed={view === v} onClick={() => { setView(v); setAnchor(selected); }}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </span>
          <button className="icon-btn" aria-label={`Previous ${view}`} onClick={() => go(-1)}>‹</button>
          <button className="ghost-btn" onClick={() => { setAnchor(today()); setSelected(today()); }}>Today</button>
          <button className="icon-btn" aria-label={`Next ${view}`} onClick={() => go(1)}>›</button>
          {editable.length > 0 && <button className="primary" onClick={() => openNew(selected)}>+ New event</button>}
        </span>
      </header>
      {dbs.length > 1 && (
        <div className="cal-filters" role="group" aria-label="Databases shown">
          {dbs.map((d) => (
            <label key={d.id} className="db-check-row"><input type="checkbox" checked={!hidden[d.id]} onChange={(e) => setHidden((h) => ({ ...h, [d.id]: !e.target.checked }))} /> {d.title}</label>
          ))}
        </div>
      )}
      {undo && (
        <p className="cal-undo" role="status">Deleted “{undo.text}”. <button className="ghost-btn" onClick={restore}>Undo</button></p>
      )}
      {items === null ? <p className="muted">Loading…</p> : noPlace ? (
        <div className="empty-card">
          <p><b>Nothing on the calendar yet.</b></p>
          <p className="muted">Events are rows in a database with a date property.</p>
          <button className="primary" onClick={() => { send({ t: 'dbCreate', parentId: null, title: 'Events', preset: 'tasks', layout: 'calendar', teamspaceId: 'general', shared: true }); settle(); }}>Create a calendar database</button>
          {snap.pages.some((n) => n.kind === 'database') && <p className="muted db-note">Or add a date property to a database you already have.</p>}
        </div>
      ) : (
        <div className="cal-layout">
          {view === 'month' ? monthGrid() : timeGrid()}
          <aside className="cal-day" aria-label="Selected day">
            {draft ? form() : (
              <>
                <h2>{long(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                {dayItems.length === 0 ? <p className="muted">Nothing on this day.</p> : (
                  <ul className="home-list">
                    {dayItems.map((it) => (
                      <li key={keyOf(it)}>
                        <button onClick={() => (it.canEdit ? openEdit(it) : onOpen(`${it.dbId}.${it.rowId}`))}>
                          <b>{it.title}</b>
                          <small>{it.dbTitle} · {it.prop}{hasTime(it.start) ? ` · ${it.start.slice(11, 16)}${it.end && hasTime(it.end) ? `–${it.end.slice(11, 16)}` : ''}` : ''}{it.end && daysBetween(it.start, it.end) > 0 ? ` · until ${long(it.end.slice(0, 10), { month: 'short', day: 'numeric' })}` : ''}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {editable.length > 0 && <button className="ghost-btn" onClick={() => openNew(selected)}>+ Add event on this day</button>}
                {editable.length === 0 && <p className="muted db-note">You can view these events but not change them.</p>}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
