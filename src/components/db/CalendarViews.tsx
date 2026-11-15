// The date-based and visual layouts: calendar, timeline and chart.
import { useMemo, useState } from 'react';
import { addDays, aggregate, cellValue, groupRows, isoDay, titleOf, weekStart } from '../../dbquery.ts';
import type { DateValue, PropValue, Row } from '../../types.ts';
import { tintOf, titleProp, type ViewProps } from './Views.tsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isDate = (v: PropValue): v is DateValue => !!v && typeof v === 'object' && !Array.isArray(v);
const span = (v: PropValue): { start: string; end: string } | null => (isDate(v) ? { start: v.start.slice(0, 10), end: (v.end ?? v.start).slice(0, 10) } : null);

// ---- Calendar ----

export function CalendarView({ api, db, view, rows, onOpen, addRow, readOnly }: ViewProps) {
  const dateProp = db.props.find((p) => p.id === view.dateProp);
  const today = isoDay(api.ctx.now);
  const [month, setMonth] = useState(today.slice(0, 7));
  if (!dateProp) return <p className="muted db-empty">Choose a date property to show on the calendar (Layout).</p>;
  const editable = dateProp.type === 'date' && !readOnly;

  const first = `${month}-01`;
  const gridStart = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Only show the last row when the month reaches it.
  const shown = days[35].slice(0, 7) === month || days[28].slice(0, 7) === month ? days : days.slice(0, 35);
  const by = new Map<string, Row[]>();
  for (const row of rows) {
    const s = span(cellValue(db, row, dateProp, api.ctx));
    if (!s) continue;
    for (let d = s.start, n = 0; d <= s.end && n < 62; d = addDays(d, 1), n++) {
      if (d >= shown[0] && d <= shown[shown.length - 1]) (by.get(d) ?? by.set(d, []).get(d)!).push(row);
    }
  }
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const move = (rowId: string, day: string) => {
    const row = rows.find((r) => r.id === rowId);
    const cur = row ? cellValue(db, row, dateProp, api.ctx) : null;
    if (!row || !isDate(cur)) return;
    const s = span(cur)!;
    const len = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 86_400_000);
    const time = cur.start.includes('T') ? cur.start.slice(10) : '';
    const next: DateValue = { start: `${day}${time}` };
    if (cur.end) next.end = `${addDays(day, len)}${cur.end.includes('T') ? cur.end.slice(10) : ''}`;
    api.updateRow(rowId, { [dateProp.id]: next });
  };
  const [y, m] = month.split('-').map(Number);

  return (
    <div className="db-cal">
      <div className="db-cal-bar">
        <b>{MONTHS[m - 1]} {y}</b>
        <span>
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <button className="db-tool" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </span>
      </div>
      <div className="db-cal-grid" role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {DAYS.map((d) => <div key={d} className="db-cal-dow" role="columnheader">{d}</div>)}
        {shown.map((day) => (
          <div
            key={day}
            role="gridcell"
            className={`db-cal-day ${day.slice(0, 7) !== month ? 'out' : ''} ${day === today ? 'today' : ''}`}
            onDragOver={(e) => { if (editable) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id && editable) move(id, day); }}
          >
            <span className="db-cal-num">{Number(day.slice(8))}</span>
            {!readOnly && dateProp.type === 'date' && <button className="db-cal-add icon-btn" aria-label={`New row on ${day}`} onClick={() => addRow({ [dateProp.id]: { start: day } })}>+</button>}
            {(by.get(day) ?? []).slice(0, 4).map((row) => (
              <button key={row.id} className={`db-cal-item ${tintOf(api, db, view, row) || 'bg-blue'}`} draggable={editable} onDragStart={(e) => e.dataTransfer.setData('text/plain', row.id)} onClick={() => onOpen(row.id)}>
                {titleOf(db, row) || 'Untitled'}
              </button>
            ))}
            {(by.get(day)?.length ?? 0) > 4 && <small className="muted">+{by.get(day)!.length - 4} more</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Timeline ----

const DAY_PX = 26;
const DAYS_SHOWN = 84;

export function TimelineView({ api, db, view, rows, onOpen }: ViewProps) {
  const startProp = db.props.find((p) => p.id === view.dateProp);
  const endProp = db.props.find((p) => p.id === view.endProp);
  const today = isoDay(api.ctx.now);
  const dated = useMemo(() => {
    if (!startProp) return [];
    return rows.flatMap((row) => {
      const s = span(cellValue(db, row, startProp, api.ctx));
      const e = endProp ? span(cellValue(db, row, endProp, api.ctx)) : null;
      if (!s) return [];
      const end = e ? (e.end >= s.start ? e.end : s.start) : s.end;
      return [{ row, start: s.start, end }];
    });
  }, [rows, db, startProp, endProp, api.ctx]);
  const [offset, setOffset] = useState(0);
  if (!startProp) return <p className="muted db-empty">Choose a date property for the timeline (Layout).</p>;
  const earliest = dated.reduce((m, d) => (d.start < m ? d.start : m), today);
  const origin = addDays(weekStart(earliest < today ? earliest : today), offset * 28);
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(origin, i));
  const px = (day: string) => Math.round((Date.parse(day) - Date.parse(origin)) / 86_400_000) * DAY_PX;
  const undated = rows.length - dated.length;

  return (
    <div className="db-timeline">
      <div className="db-cal-bar">
        <b>{days[0].slice(0, 7)} → {days[days.length - 1].slice(0, 7)}</b>
        <span>
          <button className="icon-btn" aria-label="Earlier" onClick={() => setOffset((o) => o - 1)}>‹</button>
          <button className="db-tool" onClick={() => setOffset(0)}>Today</button>
          <button className="icon-btn" aria-label="Later" onClick={() => setOffset((o) => o + 1)}>›</button>
        </span>
      </div>
      <div className="db-tl-scroll">
        <div className="db-tl-inner" style={{ width: DAYS_SHOWN * DAY_PX }}>
          <div className="db-tl-head">
            {days.map((d, i) => (i % 7 === 0 ? <span key={d} style={{ left: i * DAY_PX }}>{d.slice(5)}</span> : null))}
            {today >= days[0] && today <= days[days.length - 1] && <i className="db-tl-today" style={{ left: px(today) + DAY_PX / 2 }} aria-hidden />}
          </div>
          {dated.map(({ row, start, end }) => {
            const left = px(start);
            const width = Math.max(DAY_PX, px(end) - left + DAY_PX);
            return (
              <div key={row.id} className="db-tl-row">
                <button className={`db-tl-bar ${tintOf(api, db, view, row) || 'bg-blue'}`} style={{ left, width }} onClick={() => onOpen(row.id)} title={`${titleOf(db, row) || 'Untitled'} · ${start}${end !== start ? ` → ${end}` : ''}`}>
                  <span>{titleOf(db, row) || 'Untitled'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {dated.length === 0 && <p className="muted db-empty">No rows have a date yet.</p>}
      {undated > 0 && <p className="muted db-note">{undated} row{undated === 1 ? ' has' : 's have'} no date and {undated === 1 ? 'isn’t' : 'aren’t'} shown.</p>}
      <p className="muted db-note">{titleProp(db).name} · bars run from start to end date.</p>
    </div>
  );
}

// ---- Chart ----

const PALETTE = ['#2d83d6', '#2f9e6d', '#d9a40b', '#e07a2a', '#9a6dd7', '#d9488f', '#e03e3e', '#a8795a', '#9b9a97'];
const COLOR_HEX: Record<string, string> = { gray: '#9b9a97', brown: '#a8795a', orange: '#e07a2a', yellow: '#d9a40b', green: '#2f9e6d', blue: '#2d83d6', purple: '#9a6dd7', pink: '#d9488f', red: '#e03e3e', default: '#9b9a97' };

export function ChartView({ api, db, view, rows }: ViewProps) {
  const cfg = view.chart;
  const x = db.props.find((p) => p.id === cfg?.x);
  const y = db.props.find((p) => p.id === cfg?.y);
  const data = useMemo(() => {
    if (!cfg || !x) return [];
    return groupRows(rows, x, db, api.ctx).filter((g) => g.rows.length > 0).map((g, i) => {
      const values = y && cfg.fn !== 'count' ? g.rows.map((r) => cellValue(db, r, y, api.ctx)) : g.rows.map(() => 1);
      const v = cfg.fn === 'count' || !y ? g.rows.length : aggregate(cfg.fn, values, y, api.ctx);
      return { label: g.label, value: typeof v === 'number' ? v : 0, color: g.option ? COLOR_HEX[g.option.color] ?? PALETTE[i % PALETTE.length] : PALETTE[i % PALETTE.length] };
    });
  }, [cfg, x, y, rows, db, api.ctx]);
  if (!cfg || !x) return <p className="muted db-empty">Choose an X axis for the chart (Layout).</p>;
  if (!data.length) return <p className="muted db-empty">No data to chart.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const W = 640;
  const H = 280;
  const pad = { l: 44, r: 12, t: 12, b: 56 };
  const bw = (W - pad.l - pad.r) / data.length;
  const ty = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);

  const summary = `${cfg.kind} chart of ${x.name}: ${data.map((d) => `${d.label} ${Math.round(d.value * 100) / 100}`).join(', ')}`;

  if (cfg.kind === 'donut') {
    let a0 = -Math.PI / 2;
    const arcs = data.map((d) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const R = 110;
      const r = 62;
      const p = (rad: number, a: number) => `${150 + rad * Math.cos(a)} ${130 + rad * Math.sin(a)}`;
      const path = data.length === 1
        ? `M150 ${130 - R} A${R} ${R} 0 1 1 149.99 ${130 - R} L149.99 ${130 - r} A${r} ${r} 0 1 0 150 ${130 - r}Z`
        : `M${p(R, a0)} A${R} ${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 ${large} 0 ${p(r, a0)}Z`;
      a0 = a1;
      return { ...d, path };
    });
    return (
      <div className="db-chart donut">
        <svg viewBox="0 0 300 260" role="img" aria-label={summary}>{arcs.map((a) => <path key={a.label} d={a.path} fill={a.color} />)}</svg>
        <ul>{data.map((d) => <li key={d.label}><i style={{ background: d.color }} aria-hidden />{d.label}<b>{Math.round(d.value * 100) / 100}</b></li>)}</ul>
      </div>
    );
  }
  return (
    <div className="db-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad.l} x2={W - pad.r} y1={ty(max * f)} y2={ty(max * f)} className="grid" /><text x={pad.l - 6} y={ty(max * f) + 4} textAnchor="end">{Math.round(max * f * 10) / 10}</text></g>)}
        {cfg.kind === 'bar' && data.map((d, i) => (
          <g key={d.label}>
            <rect x={pad.l + i * bw + bw * 0.15} y={ty(d.value)} width={bw * 0.7} height={H - pad.b - ty(d.value)} fill={d.color} rx={3}><title>{`${d.label}: ${d.value}`}</title></rect>
            <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 16} textAnchor="middle">{d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}</text>
          </g>
        ))}
        {cfg.kind === 'line' && (
          <>
            <polyline fill="none" stroke="#2d83d6" strokeWidth={2.5} points={data.map((d, i) => `${pad.l + i * bw + bw / 2},${ty(d.value)}`).join(' ')} />
            {data.map((d, i) => (
              <g key={d.label}>
                <circle cx={pad.l + i * bw + bw / 2} cy={ty(d.value)} r={4} fill="#2d83d6"><title>{`${d.label}: ${d.value}`}</title></circle>
                <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 16} textAnchor="middle">{d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}</text>
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
