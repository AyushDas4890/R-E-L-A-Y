// The list-like layouts of a database: table, board, list, gallery and feed.
import { useState, type ReactNode } from 'react';
import type { DatabaseApi } from '../../db-store.ts';
import { CALC_CHOICES, aggregate, asText, cellValue, formatNumber, groupRows, matchRule, titleOf, type Group } from '../../dbquery.ts';
import type { DbData, Property, PropValue, Row, View } from '../../types.ts';
import { Popover, usePopover } from '../ui/Popover.tsx';
import { Cell, Chip, PropIcon } from './Cell.tsx';

export interface ViewProps {
  api: DatabaseApi;
  db: DbData;
  view: View;
  rows: Row[];
  onOpen: (rowId: string) => void;
  addRow: (values?: Record<string, PropValue>, after?: string | null) => void;
  onEditProp: (p: Property, anchor: HTMLElement) => void;
  patch: (p: Partial<View>) => void;
  readOnly: boolean;
}

export const titleProp = (db: DbData): Property => db.props.find((p) => p.type === 'title') ?? db.props[0];
export const shownProps = (db: DbData, view: View): Property[] =>
  view.visible.map((id) => db.props.find((p) => p.id === id)).filter((p): p is Property => !!p && p.type !== 'title');

// The tint a row gets from the view's color rules.
export function tintOf(api: DatabaseApi, db: DbData, view: View, row: Row): string {
  for (const rule of view.colors) {
    const prop = db.props.find((p) => p.id === rule.prop);
    if (prop && matchRule({ prop: rule.prop, op: rule.op, value: rule.value }, prop, cellValue(db, row, prop, api.ctx), api.ctx)) return `bg-${rule.color}`;
  }
  return '';
}

function RowMenu({ api, db, row, onOpen, disabled }: { api: DatabaseApi; db: DbData; row: Row; onOpen: () => void; disabled: boolean }) {
  const pop = usePopover();
  const copy = () => {
    const values: Record<string, PropValue> = {};
    for (const p of db.props) {
      const v = row.props[p.id];
      if (v !== undefined && !['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id'].includes(p.type)) values[p.id] = p.type === 'title' ? `${String(v)} (copy)` : v;
    }
    api.createRow(values);
  };
  return (
    <>
      <button className="icon-btn db-row-menu" aria-label="Row options" aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); pop.toggle(e); }}>⋯</button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} width={180} label="Row options">
          <button className="db-opt" onClick={() => { pop.close(); onOpen(); }}>Open</button>
          {!disabled && <button className="db-opt" onClick={() => { pop.close(); copy(); }}>Duplicate</button>}
          {!disabled && <button className="db-opt danger" onClick={() => { pop.close(); api.removeRow(row.id); }}>Delete</button>}
        </Popover>
      )}
    </>
  );
}

const TitleCell = ({ api, db, row, readOnly, open }: { api: DatabaseApi; db: DbData; row: Row; readOnly: boolean; open: () => void }) => (
  <div className="db-title-cell">
    {row.icon && <span aria-hidden>{row.icon}</span>}
    <Cell api={api} db={db} row={row} prop={titleProp(db)} readOnly={readOnly} />
    <button className="db-open" onClick={(e) => { e.stopPropagation(); open(); }} aria-label={`Open ${titleOf(db, row) || 'Untitled'}`}>Open</button>
  </div>
);

// ---- Table ----

export function TableView(p: ViewProps) {
  const { api, db, view, rows, onOpen, addRow, readOnly } = p;
  const props = shownProps(db, view);
  const groupProp = db.props.find((x) => x.id === view.group);
  const groups: Group[] = groupProp ? groupRows(rows, groupProp, db, api.ctx) : [{ key: '', label: '', rows }];
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const canReorder = !readOnly && view.sorts.length === 0 && !groupProp;
  const cols = `minmax(240px, 1.6fr) ${props.map(() => 'minmax(130px, 1fr)').join(' ')} 36px`;
  const canSchema = api.canEdit && (!db.locked || api.canManage);

  return (
    <div className="db-table" role="grid" aria-label={api.meta?.title || 'Database'} aria-rowcount={rows.length + 1}>
      <div className="db-head" role="row" style={{ gridTemplateColumns: cols }}>
        {[titleProp(db), ...props].map((pr) => (
          <HeaderCell key={pr.id} prop={pr} disabled={!canSchema} onEdit={p.onEditProp} />
        ))}
        <span />
      </div>
      {groups.map((g) => (
        <div key={g.key} className="db-group">
          {groupProp && (
            <button className="db-group-head" aria-expanded={!folded[g.key]} onClick={() => setFolded((f) => ({ ...f, [g.key]: !f[g.key] }))}>
              <i aria-hidden>{folded[g.key] ? '▸' : '▾'}</i>{g.option ? <Chip color={g.option.color}>{g.label}</Chip> : <span>{g.label}</span>}<small>{g.rows.length}</small>
            </button>
          )}
          {!folded[g.key] && g.rows.map((row) => (
            <div
              key={row.id}
              role="row"
              className={`db-row ${tintOf(api, db, view, row)} ${over === row.id ? 'over' : ''}`}
              style={{ gridTemplateColumns: cols }}
              draggable={canReorder}
              onDragStart={() => setDrag(row.id)}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDragOver={(e) => { if (drag && drag !== row.id) { e.preventDefault(); setOver(row.id); } }}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== row.id) api.moveRow(drag, row.id); setDrag(null); setOver(null); }}
            >
              <div role="gridcell" className="db-cell title"><TitleCell api={api} db={db} row={row} readOnly={readOnly} open={() => onOpen(row.id)} /></div>
              {props.map((pr) => (
                <div role="gridcell" key={pr.id} className={`db-cell ${view.wrap ? 'wrap' : ''}`}><Cell api={api} db={db} row={row} prop={pr} readOnly={readOnly} /></div>
              ))}
              <div role="gridcell" className="db-cell tools"><RowMenu api={api} db={db} row={row} onOpen={() => onOpen(row.id)} disabled={readOnly} /></div>
            </div>
          ))}
          {!folded[g.key] && !readOnly && (
            <button className="db-new-row" onClick={() => addRow(groupProp && g.key ? { [groupProp.id]: groupProp.type === 'multi' ? [g.key] : g.key } : undefined)}>+ New</button>
          )}
        </div>
      ))}
      {rows.length === 0 && <p className="muted db-empty">No rows{view.filter.items.length ? ' match this filter' : ' yet'}.</p>}
      <Footer {...p} props={props} cols={cols} />
    </div>
  );
}

function HeaderCell({ prop, disabled, onEdit }: { prop: Property; disabled: boolean; onEdit: (p: Property, a: HTMLElement) => void }) {
  return (
    <button role="columnheader" className="db-th" disabled={disabled} onClick={(e) => onEdit(prop, e.currentTarget)} aria-label={`${prop.name} property settings`}>
      <PropIcon type={prop.type} /> <span>{prop.name}</span>
    </button>
  );
}

function Footer({ api, db, view, rows, props, cols, patch }: ViewProps & { props: Property[]; cols: string }) {
  const any = Object.values(view.calc).some(Boolean);
  const ctx = api.ctx;
  const calcOf = (pr: Property): string => {
    const fn = view.calc[pr.id];
    if (!fn) return '';
    const v = aggregate(fn, rows.map((r) => cellValue(db, r, pr, ctx)), pr, ctx);
    if (v === null) return '';
    if (typeof v === 'number') return fn.startsWith('percent') ? `${v}%` : formatNumber(v, pr.type === 'number' && !['count', 'countValues', 'countUnique', 'countEmpty'].includes(fn) ? pr.format : 'plain');
    if (typeof v === 'object' && !Array.isArray(v)) return v.start;
    return Array.isArray(v) ? v.join(', ') : String(v);
  };
  return (
    <div className={`db-foot ${any ? 'any' : ''}`} role="row" style={{ gridTemplateColumns: cols }}>
      {[titleProp(db), ...props].map((pr) => (
        <label key={pr.id} className="db-calc">
          <select aria-label={`Calculate ${pr.name}`} value={view.calc[pr.id] ?? ''} onChange={(e) => patch({ calc: { ...view.calc, [pr.id]: e.target.value } })}>
            {CALC_CHOICES.filter((c) => !c.types || c.types.includes(pr.type)).map((c) => <option key={c.id} value={c.id}>{c.id ? c.label : 'Calculate'}</option>)}
          </select>
          <span>{calcOf(pr)}</span>
        </label>
      ))}
      <span />
    </div>
  );
}

// ---- Cards shared by board, gallery and feed ----

function Card({ api, db, view, row, onOpen, children, draggable, onDragStart, onDragEnd }: { api: DatabaseApi; db: DbData; view: View; row: Row; onOpen: () => void; children?: ReactNode; draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const props = shownProps(db, view);
  const cover = view.cardCover?.startsWith('prop:') ? cellValue(db, row, db.props.find((p) => p.id === view.cardCover!.slice(5)) ?? db.props[0], api.ctx) : null;
  const img = Array.isArray(cover) ? (cover as string[]).find((u) => /^https:\/\//i.test(u)) : undefined;
  return (
    <div className={`db-card size-${view.cardSize ?? 'medium'} ${tintOf(api, db, view, row)}`} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <button className="db-card-main" onClick={onOpen}>
        {img && <img src={img} alt="" loading="lazy" />}
        <b>{row.icon ? `${row.icon} ` : ''}{titleOf(db, row) || 'Untitled'}</b>
      </button>
      {props.filter((p) => { const v = cellValue(db, row, p, api.ctx); return v !== null && v !== '' && !(Array.isArray(v) && v.length === 0); }).slice(0, 6).map((p) => (
        <div key={p.id} className="db-card-prop"><Cell api={api} db={db} row={row} prop={p} readOnly compact /></div>
      ))}
      {children}
    </div>
  );
}

// ---- Board ----

const BOARDABLE = new Set(['select', 'status', 'multi', 'person', 'checkbox']);

export function BoardView(p: ViewProps) {
  const { api, db, view, rows, onOpen, addRow, readOnly } = p;
  const groupProp = db.props.find((x) => x.id === view.group && BOARDABLE.has(x.type));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!groupProp) {
    return <p className="muted db-empty">Choose a select, status, multi-select, person or checkbox property to group the board by (Group).</p>;
  }
  const groups = groupRows(rows, groupProp, db, api.ctx);
  const valueFor = (g: Group): PropValue => {
    if (groupProp.type === 'checkbox') return g.key === 'yes';
    if (!g.key) return null;
    return groupProp.type === 'multi' || groupProp.type === 'person' ? [g.key] : g.key;
  };
  const move = (rowId: string, g: Group, after: string | null) => {
    api.updateRow(rowId, { [groupProp.id]: valueFor(g) });
    api.moveRow(rowId, after);
  };
  return (
    <div className="db-board">
      {groups.map((g) => (
        <section key={g.key} className={`db-col ${over === g.key ? 'over' : ''}`} aria-label={g.label} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(g.key); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); if (drag) move(drag, g, g.rows.filter((r) => r.id !== drag).at(-1)?.id ?? null); setDrag(null); setOver(null); }}>
          <header>{g.option ? <Chip color={g.option.color}>{g.label}</Chip> : <span className="muted">{g.label}</span>}<small>{g.rows.length}</small>
            {!readOnly && <button className="icon-btn" aria-label={`New row in ${g.label}`} onClick={() => addRow({ [groupProp.id]: valueFor(g) })}>+</button>}</header>
          {g.rows.map((row) => (
            <div key={row.id} onDragOver={(e) => { if (drag && drag !== row.id) e.preventDefault(); }} onDrop={(e) => { e.stopPropagation(); e.preventDefault(); if (drag && drag !== row.id) move(drag, g, row.id); setDrag(null); setOver(null); }}>
              <Card api={api} db={db} view={view} row={row} onOpen={() => onOpen(row.id)} draggable={!readOnly} onDragStart={() => setDrag(row.id)} onDragEnd={() => { setDrag(null); setOver(null); }} />
            </div>
          ))}
          {!readOnly && <button className="db-new-row" onClick={() => addRow({ [groupProp.id]: valueFor(g) })}>+ New</button>}
        </section>
      ))}
    </div>
  );
}

// ---- List ----

export function ListView(p: ViewProps) {
  const { api, db, view, rows, onOpen, addRow, readOnly } = p;
  const props = shownProps(db, view).slice(0, 4);
  return (
    <div className="db-list" role="list">
      {rows.map((row) => (
        <div key={row.id} role="listitem" className={`db-list-row ${tintOf(api, db, view, row)}`}>
          <button className="db-list-main" onClick={() => onOpen(row.id)}>
            <span aria-hidden>{row.icon || '📄'}</span><b>{titleOf(db, row) || 'Untitled'}</b>
          </button>
          <span className="db-list-props">
            {props.map((pr) => <span key={pr.id} className="db-list-prop"><Cell api={api} db={db} row={row} prop={pr} readOnly compact /></span>)}
          </span>
          <RowMenu api={api} db={db} row={row} onOpen={() => onOpen(row.id)} disabled={readOnly} />
        </div>
      ))}
      {rows.length === 0 && <p className="muted db-empty">No rows{view.filter.items.length ? ' match this filter' : ' yet'}.</p>}
      {!readOnly && <button className="db-new-row" onClick={() => addRow()}>+ New</button>}
    </div>
  );
}

// ---- Gallery ----

export function GalleryView(p: ViewProps) {
  const { api, db, view, rows, onOpen, addRow, readOnly } = p;
  return (
    <div className={`db-gallery size-${view.cardSize ?? 'medium'}`}>
      {rows.map((row) => <Card key={row.id} api={api} db={db} view={view} row={row} onOpen={() => onOpen(row.id)} />)}
      {!readOnly && <button className="db-card new" onClick={() => addRow()}>+ New</button>}
      {rows.length === 0 && readOnly && <p className="muted db-empty">No rows.</p>}
    </div>
  );
}

// ---- Feed ----

export function FeedView(p: ViewProps) {
  const { api, db, view, rows, onOpen, addRow, readOnly } = p;
  const props = shownProps(db, view);
  const { snap } = { snap: api.ctx };
  return (
    <div className="db-feed">
      {[...rows].sort((a, b) => b.editedAt - a.editedAt).map((row) => (
        <article key={row.id} className={`db-feed-item ${tintOf(api, db, view, row)}`}>
          <header>
            <button onClick={() => onOpen(row.id)}><b>{row.icon ? `${row.icon} ` : ''}{titleOf(db, row) || 'Untitled'}</b></button>
            <small className="muted">Edited by {snap.userName(row.editedBy)} · {new Date(row.editedAt).toLocaleDateString()}</small>
          </header>
          <dl>
            {props.map((pr) => {
              const text = asText(pr, cellValue(db, row, pr, api.ctx), api.ctx).join(', ');
              return text ? <div key={pr.id}><dt>{pr.name}</dt><dd><Cell api={api} db={db} row={row} prop={pr} readOnly={readOnly} /></dd></div> : null;
            })}
          </dl>
        </article>
      ))}
      {!readOnly && <button className="db-new-row" onClick={() => addRow()}>+ New</button>}
      {rows.length === 0 && <p className="muted db-empty">No rows.</p>}
    </div>
  );
}
