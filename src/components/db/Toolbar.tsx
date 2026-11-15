// The controls above a database view: filter, sort, group, properties, layout, search.
import { useState } from 'react';
import { opsFor } from '../../dbquery.ts';
import type { DbData, FilterGroup, FilterRule, Property, PropValue, SortRule, View, ViewLayout } from '../../types.ts';
import { Popover, usePopover } from '../ui/Popover.tsx';
import { PropIcon, TYPE_LABEL } from './Cell.tsx';
import { ValueInput } from './PropEditor.tsx';

export const LAYOUT_LABEL: Record<ViewLayout, string> = {
  table: 'Table', board: 'Board', list: 'List', gallery: 'Gallery', calendar: 'Calendar', timeline: 'Timeline', chart: 'Chart', feed: 'Feed',
};
const LAYOUT_GLYPH: Record<ViewLayout, string> = { table: '▤', board: '▥', list: '☰', gallery: '▦', calendar: '▣', timeline: '▭', chart: '◔', feed: '▮' };
export const layoutGlyph = (l: ViewLayout): string => LAYOUT_GLYPH[l];

type Patch = (p: Partial<View>) => void;

// ---- Filter ----

const emptyRule = (db: DbData): FilterRule => {
  const p = db.props[0];
  return { prop: p.id, op: opsFor(p.type)[0].op };
};

function RuleRow({ db, rule, onChange, onRemove }: { db: DbData; rule: FilterRule; onChange: (r: FilterRule) => void; onRemove: () => void }) {
  const prop = db.props.find((p) => p.id === rule.prop) ?? db.props[0];
  const ops = opsFor(prop.type);
  const op = ops.find((o) => o.op === rule.op) ?? ops[0];
  return (
    <div className="db-rule">
      <select aria-label="Property" value={prop.id} onChange={(e) => { const p = db.props.find((x) => x.id === e.target.value)!; onChange({ prop: p.id, op: opsFor(p.type)[0].op }); }}>
        {db.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Condition" value={op.op} onChange={(e) => onChange({ ...rule, op: e.target.value as FilterRule['op'] })}>
        {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {!op.noValue && <FilterValue prop={prop} value={rule.value ?? null} onChange={(v) => onChange({ ...rule, value: v })} />}
      <button className="icon-btn" aria-label="Remove filter" onClick={onRemove}>✕</button>
    </div>
  );
}

function FilterValue({ prop, value, onChange }: { prop: Property; value: PropValue; onChange: (v: PropValue) => void }) {
  if (prop.type === 'date' || prop.type === 'createdTime' || prop.type === 'editedTime') {
    const rel = value === 'today' || value === 'tomorrow' || value === 'yesterday' ? value : 'date';
    return (
      <span className="db-date-filter">
        <select aria-label="When" value={rel} onChange={(e) => onChange(e.target.value === 'date' ? new Date().toISOString().slice(0, 10) : e.target.value)}>
          <option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="yesterday">Yesterday</option><option value="date">Exact date</option>
        </select>
        {rel === 'date' && <input type="date" aria-label="Date" value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />}
      </span>
    );
  }
  if (prop.type === 'person' || prop.type === 'relation' || prop.type === 'createdBy' || prop.type === 'editedBy')
    return <input aria-label="Value" placeholder="Id" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
  return <ValueInput prop={prop} value={value} onChange={onChange} />;
}

function GroupEditor({ db, group, onChange, depth }: { db: DbData; group: FilterGroup; onChange: (g: FilterGroup) => void; depth: number }) {
  const set = (items: FilterGroup['items']) => onChange({ ...group, items });
  return (
    <div className={`db-filter-group ${depth ? 'nested' : ''}`}>
      {group.items.map((it, i) => (
        <div key={i} className="db-filter-item">
          <span className="db-join">
            {i === 0 ? 'Where' : i === 1 ? (
              <select aria-label="Match" value={group.op} onChange={(e) => onChange({ ...group, op: e.target.value as 'and' | 'or' })}><option value="and">And</option><option value="or">Or</option></select>
            ) : group.op === 'and' ? 'And' : 'Or'}
          </span>
          {'items' in it ? (
            <div className="db-sub">
              <GroupEditor db={db} group={it} depth={depth + 1} onChange={(g) => set(group.items.map((x, j) => (j === i ? g : x)))} />
              <button className="icon-btn" aria-label="Remove group" onClick={() => set(group.items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ) : (
            <RuleRow db={db} rule={it} onChange={(r) => set(group.items.map((x, j) => (j === i ? r : x)))} onRemove={() => set(group.items.filter((_, j) => j !== i))} />
          )}
        </div>
      ))}
      <div className="db-row-btns">
        <button className="db-add" onClick={() => set([...group.items, emptyRule(db)])}>+ Add a filter</button>
        {depth < 2 && <button className="db-add" onClick={() => set([...group.items, { op: 'and', items: [emptyRule(db)] }])}>+ Add a group</button>}
      </div>
    </div>
  );
}

export function FilterButton({ db, view, patch }: { db: DbData; view: View; patch: Patch }) {
  const pop = usePopover();
  const n = view.filter.items.length;
  return (
    <>
      <button className={`db-tool ${n ? 'on' : ''}`} onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.isOpen}>Filter{n ? ` · ${n}` : ''}</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Filter" width={460}>
          {n === 0 && <p className="muted db-empty">No filters yet.</p>}
          <GroupEditor db={db} group={view.filter} depth={0} onChange={(g) => patch({ filter: g })} />
          {n > 0 && <button className="db-add danger" onClick={() => patch({ filter: { op: 'and', items: [] } })}>Delete filter</button>}
        </Popover>
      )}
    </>
  );
}

// ---- Sort ----

export function SortButton({ db, view, patch }: { db: DbData; view: View; patch: Patch }) {
  const pop = usePopover();
  const sorts = view.sorts;
  const set = (s: SortRule[]) => patch({ sorts: s });
  return (
    <>
      <button className={`db-tool ${sorts.length ? 'on' : ''}`} onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.isOpen}>Sort{sorts.length ? ` · ${sorts.length}` : ''}</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Sort" width={360}>
          {sorts.length === 0 && <p className="muted db-empty">No sorts. Rows keep the order you drag them into.</p>}
          {sorts.map((s, i) => (
            <div key={i} className="db-rule">
              <select aria-label="Property" value={s.prop} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))}>
                {db.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select aria-label="Direction" value={s.dir} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}>
                <option value="asc">Ascending</option><option value="desc">Descending</option>
              </select>
              <button className="icon-btn" aria-label="Remove sort" onClick={() => set(sorts.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {sorts.length < 5 && <button className="db-add" onClick={() => set([...sorts, { prop: db.props.find((p) => !sorts.some((s) => s.prop === p.id))?.id ?? db.props[0].id, dir: 'asc' }])}>+ Add a sort</button>}
          {sorts.length > 0 && <button className="db-add danger" onClick={() => set([])}>Delete sort</button>}
        </Popover>
      )}
    </>
  );
}

// ---- Group ----

const GROUPABLE = new Set(['select', 'status', 'multi', 'person', 'checkbox', 'date', 'text', 'number', 'relation']);

export function GroupButton({ db, view, patch }: { db: DbData; view: View; patch: Patch }) {
  const pop = usePopover();
  const current = db.props.find((p) => p.id === view.group);
  return (
    <>
      <button className={`db-tool ${current ? 'on' : ''}`} onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.isOpen}>Group{current ? ` · ${current.name}` : ''}</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Group by" width={260}>
          <button className={`db-opt ${!current ? 'on' : ''}`} onClick={() => { patch({ group: undefined }); pop.close(); }}>None</button>
          {db.props.filter((p) => GROUPABLE.has(p.type)).map((p) => (
            <button key={p.id} className={`db-opt ${current?.id === p.id ? 'on' : ''}`} onClick={() => { patch({ group: p.id }); pop.close(); }}><span><PropIcon type={p.type} /> {p.name}</span></button>
          ))}
        </Popover>
      )}
    </>
  );
}

// ---- Properties ----

export function PropsButton({ db, view, patch, onNew, onEdit, canEdit }: { db: DbData; view: View; patch: Patch; onNew: (anchor: HTMLElement) => void; onEdit: (p: Property, anchor: HTMLElement) => void; canEdit: boolean }) {
  const pop = usePopover();
  const [q, setQ] = useState('');
  const shown = view.visible.filter((id) => db.props.some((p) => p.id === id && p.type !== 'title'));
  const hidden = db.props.filter((p) => p.type !== 'title' && !shown.includes(p.id));
  const move = (id: string, d: number) => {
    const i = shown.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ visible: next });
  };
  const row = (p: Property, on: boolean) => (
    <div key={p.id} className="db-prop-row">
      <span className="db-prop-name"><PropIcon type={p.type} /> {p.name}</span>
      <span className="db-prop-tools">
        {on && <><button className="icon-btn" aria-label={`Move ${p.name} up`} onClick={() => move(p.id, -1)}>↑</button><button className="icon-btn" aria-label={`Move ${p.name} down`} onClick={() => move(p.id, 1)}>↓</button></>}
        {canEdit && <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={(e) => onEdit(p, e.currentTarget)}>⋯</button>}
        <button className="icon-btn" aria-label={on ? `Hide ${p.name}` : `Show ${p.name}`} aria-pressed={on} onClick={() => patch({ visible: on ? shown.filter((x) => x !== p.id) : [...shown, p.id] })}>{on ? '👁' : '◌'}</button>
      </span>
    </div>
  );
  const match = (p: Property) => p.name.toLowerCase().includes(q.toLowerCase());
  return (
    <>
      <button className="db-tool" onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.isOpen}>Properties</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Properties" width={320}>
          <input className="db-search" placeholder="Search properties" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <p className="db-group-label">Shown in view</p>
          {shown.map((id) => db.props.find((p) => p.id === id)!).filter(match).map((p) => row(p, true))}
          {hidden.filter(match).length > 0 && <p className="db-group-label">Hidden in view</p>}
          {hidden.filter(match).map((p) => row(p, false))}
          {canEdit && <button className="db-add" onClick={(e) => onNew(e.currentTarget)}>+ New property</button>}
        </Popover>
      )}
    </>
  );
}

// ---- Layout ----

export function LayoutButton({ db, view, patch, onSettings }: { db: DbData; view: View; patch: Patch; onSettings: () => void }) {
  const pop = usePopover();
  const dates = db.props.filter((p) => p.type === 'date' || p.type === 'createdTime' || p.type === 'editedTime');
  const files = db.props.filter((p) => p.type === 'file');
  return (
    <>
      <button className="db-tool" onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.isOpen}>Layout</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Layout" width={300}>
          <div className="db-layouts" role="radiogroup" aria-label="Layout">
            {(Object.keys(LAYOUT_LABEL) as ViewLayout[]).map((l) => (
              <button key={l} role="radio" aria-checked={view.layout === l} className={view.layout === l ? 'on' : ''} onClick={() => patch({ layout: l })}><b aria-hidden>{layoutGlyph(l)}</b>{LAYOUT_LABEL[l]}</button>
            ))}
          </div>
          {(view.layout === 'calendar' || view.layout === 'timeline') && (
            <>
              <label className="db-field">Show by<select value={view.dateProp ?? ''} onChange={(e) => patch({ dateProp: e.target.value || undefined })}><option value="">Choose a date property…</option>{dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              {view.layout === 'timeline' && <label className="db-field">End date<select value={view.endProp ?? ''} onChange={(e) => patch({ endProp: e.target.value || undefined })}><option value="">Same as start</option>{dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            </>
          )}
          {(view.layout === 'gallery' || view.layout === 'board') && (
            <>
              <label className="db-field">Card size<select value={view.cardSize ?? 'medium'} onChange={(e) => patch({ cardSize: e.target.value as View['cardSize'] })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
              <label className="db-field">Card cover<select value={view.cardCover ?? 'none'} onChange={(e) => patch({ cardCover: e.target.value })}><option value="none">None</option>{files.map((p) => <option key={p.id} value={`prop:${p.id}`}>{p.name}</option>)}</select></label>
            </>
          )}
          {view.layout === 'chart' && (
            <>
              <label className="db-field">Chart<select value={view.chart?.kind ?? 'bar'} onChange={(e) => patch({ chart: { ...(view.chart ?? { x: db.props[0].id, fn: 'count' }), kind: e.target.value as 'bar' | 'line' | 'donut' } })}><option value="bar">Bar</option><option value="line">Line</option><option value="donut">Donut</option></select></label>
              <label className="db-field">X axis<select value={view.chart?.x ?? ''} onChange={(e) => patch({ chart: { ...(view.chart ?? { kind: 'bar', fn: 'count' }), x: e.target.value } as View['chart'] })}>{db.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="db-field">Y axis<select value={view.chart?.fn ?? 'count'} onChange={(e) => patch({ chart: { ...(view.chart ?? { kind: 'bar', x: db.props[0].id }), fn: e.target.value as 'count' | 'sum' | 'avg' } as View['chart'] })}><option value="count">Count of rows</option><option value="sum">Sum of…</option><option value="avg">Average of…</option></select></label>
              {view.chart && view.chart.fn !== 'count' && <label className="db-field">Of<select value={view.chart.y ?? ''} onChange={(e) => patch({ chart: { ...view.chart!, y: e.target.value || undefined } })}><option value="">Choose a number property…</option>{db.props.filter((p) => p.type === 'number' || p.type === 'formula' || p.type === 'rollup').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            </>
          )}
          {view.layout === 'table' && <label className="db-switch"><span>Wrap all cells</span><input type="checkbox" checked={!!view.wrap} onChange={(e) => patch({ wrap: e.target.checked })} /></label>}
          <hr />
          <ColorRules db={db} view={view} patch={patch} />
          <button className="db-opt" onClick={() => { pop.close(); onSettings(); }}>Database settings…</button>
        </Popover>
      )}
    </>
  );
}

// Conditional colors: rows that match a rule are tinted.
function ColorRules({ db, view, patch }: { db: DbData; view: View; patch: Patch }) {
  const rules = view.colors;
  return (
    <div>
      <p className="db-group-label">Conditional color</p>
      {rules.map((r, i) => {
        const prop = db.props.find((p) => p.id === r.prop) ?? db.props[0];
        return (
          <div key={i} className="db-rule">
            <select aria-label="Property" value={prop.id} onChange={(e) => { const p = db.props.find((x) => x.id === e.target.value)!; patch({ colors: rules.map((x, j) => (j === i ? { ...x, prop: p.id, op: opsFor(p.type)[0].op, value: undefined } : x)) }); }}>
              {db.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select aria-label="Condition" value={r.op} onChange={(e) => patch({ colors: rules.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterRule['op'] } : x)) })}>
              {opsFor(prop.type).map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {!opsFor(prop.type).find((o) => o.op === r.op)?.noValue && <FilterValue prop={prop} value={r.value ?? null} onChange={(v) => patch({ colors: rules.map((x, j) => (j === i ? { ...x, value: v ?? undefined } : x)) })} />}
            <select aria-label="Color" value={r.color} onChange={(e) => patch({ colors: rules.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}>
              {['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="icon-btn" aria-label="Remove rule" onClick={() => patch({ colors: rules.filter((_, j) => j !== i) })}>✕</button>
          </div>
        );
      })}
      {rules.length < 10 && <button className="db-add" onClick={() => patch({ colors: [...rules, { prop: db.props[0].id, op: opsFor(db.props[0].type)[0].op, color: 'yellow' }] })}>+ Add a rule</button>}
    </div>
  );
}

export { TYPE_LABEL };
