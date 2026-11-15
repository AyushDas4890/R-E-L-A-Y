// One value of one property in one row, shown and edited in place. Computed properties are read-only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { DatabaseApi } from '../../db-store.ts';
import { cellValue, formatDateValue, formatNumber, formulaError, optionName, optionOf, titleOf } from '../../dbquery.ts';
import type { DateValue, DbData, Property, PropType, PropValue, Row, SelectOption } from '../../types.ts';
import { Popover, usePopover } from '../ui/Popover.tsx';

export const TYPE_LABEL: Record<PropType, string> = {
  title: 'Title', text: 'Text', number: 'Number', select: 'Select', status: 'Status', multi: 'Multi-select', date: 'Date', person: 'Person',
  file: 'Files & media', checkbox: 'Checkbox', url: 'URL', email: 'Email', phone: 'Phone', formula: 'Formula', relation: 'Relation',
  rollup: 'Rollup', createdTime: 'Created time', createdBy: 'Created by', editedTime: 'Last edited time', editedBy: 'Last edited by',
  button: 'Button', id: 'ID', place: 'Place',
};
const GLYPH: Record<PropType, string> = {
  title: 'Aa', text: '≡', number: '#', select: '◉', status: '◐', multi: '☰', date: '▦', person: '◔', file: '⎘', checkbox: '☑', url: '↗', email: '@',
  phone: '✆', formula: 'ƒ', relation: '⇄', rollup: 'Σ', createdTime: '◷', createdBy: '◔', editedTime: '◷', editedBy: '◔', button: '▶', id: '№', place: '⌖',
};
export const PropIcon = ({ type }: { type: PropType }) => <span className="db-glyph" aria-hidden>{GLYPH[type]}</span>;

export const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const Chip = ({ color = 'gray', children }: { color?: string; children: ReactNode }) => <span className={`db-chip bg-${color === 'default' ? 'gray' : color}`}>{children}</span>;

export const newOptionId = (): string => crypto.randomUUID();
const isDate = (v: PropValue): v is DateValue => !!v && typeof v === 'object' && !Array.isArray(v);
const safeLink = (u: string): string | null => (/^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : null);

interface CellProps {
  api: DatabaseApi;
  db: DbData;
  row: Row;
  prop: Property;
  // A read-only cell (viewers, locked views).
  readOnly?: boolean;
  // Shown inside a card or list item: no editing chrome.
  compact?: boolean;
}

export function Cell({ api, db, row, prop, readOnly, compact }: CellProps) {
  const { snap } = useRelayCtx();
  const value = cellValue(db, row, prop, api.ctx);
  const can = api.canEdit && !readOnly;
  const set = (v: PropValue) => api.updateRow(row.id, { [prop.id]: v });

  switch (prop.type) {
    case 'checkbox':
      return <input type="checkbox" className="db-check" aria-label={prop.name} checked={value === true} disabled={!can} onChange={(e) => set(e.target.checked)} onClick={(e) => e.stopPropagation()} />;
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'place':
    case 'title':
    case 'number':
      return <TextCell prop={prop} value={value} can={can} onSave={set} compact={compact} />;
    case 'select':
    case 'status':
    case 'multi':
      return <SelectCell api={api} prop={prop} value={value} can={can} onSave={set} />;
    case 'date':
      return <DateCell value={value} can={can} onSave={set} />;
    case 'person':
      return <PersonCell value={value} can={can} onSave={set} users={snap.users} />;
    case 'relation':
      return <RelationCell api={api} prop={prop} value={value} can={can} onSave={set} />;
    case 'file':
      return <FileCell value={value} can={can} onSave={set} />;
    case 'button':
      return <button className="db-button" disabled={!can} onClick={(e) => { e.stopPropagation(); api.pressButton(row.id, prop.id); }}>{prop.button?.label || 'Run'}</button>;
    case 'createdBy':
    case 'editedBy':
      return <span>{(value as string[]).map((id) => snap.users[id]?.name ?? 'Someone').join(', ')}</span>;
    case 'createdTime':
    case 'editedTime':
      return <span className="muted">{isDate(value) ? formatDateValue({ start: value.start }) : ''}</span>;
    case 'id':
      return <span className="muted">{String(value ?? '')}</span>;
    case 'formula': {
      const err = formulaError(db, row, prop, api.ctx);
      if (err) return <span className="db-error" title={err}>⚠ Error</span>;
      return <span>{renderComputed(value)}</span>;
    }
    case 'rollup':
      return <span>{renderComputed(value)}</span>;
    default:
      return null;
  }
}

function renderComputed(v: PropValue): ReactNode {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? '☑' : '☐';
  if (typeof v === 'number') return formatNumber(v);
  if (Array.isArray(v)) return v.join(', ');
  if (isDate(v)) return formatDateValue(v);
  return v;
}

// ---- Text, number, link ----

function TextCell({ prop, value, can, onSave, compact }: { prop: Property; value: PropValue; can: boolean; onSave: (v: PropValue) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  const shown = typeof value === 'number' ? formatNumber(value, prop.format) : typeof value === 'string' ? value : '';
  const start = () => {
    if (!can) return;
    setDraft(typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '');
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = prop.type === 'number' ? (draft.trim() === '' ? null : Number(draft.replace(/,/g, ''))) : draft;
    if (typeof next === 'number' && !Number.isFinite(next)) return;
    if ((next ?? '') !== (value ?? '')) onSave(next);
  };
  if (editing) {
    return (
      <input
        ref={ref}
        className="db-input"
        aria-label={prop.name}
        type="text"
        inputMode={prop.type === 'number' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  const link = (prop.type === 'url' || prop.type === 'email' || prop.type === 'phone') && shown ? safeLink(prop.type === 'email' ? `mailto:${shown}` : prop.type === 'phone' ? `tel:${shown}` : shown) : null;
  return (
    <span className={`db-text ${prop.type === 'number' ? 'num' : ''} ${can ? 'editable' : ''}`} onDoubleClick={compact ? undefined : start} onClick={(e) => { if (can && !compact) { e.stopPropagation(); start(); } }} tabIndex={can && !compact ? 0 : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && can && !compact) start(); }}>
      {link ? <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{shown}</a> : shown || (prop.type === 'title' ? <span className="muted">Untitled</span> : '')}
    </span>
  );
}

// ---- Select, status, multi-select ----

function SelectCell({ api, prop, value, can, onSave }: { api: DatabaseApi; prop: Property; value: PropValue; can: boolean; onSave: (v: PropValue) => void }) {
  const pop = usePopover();
  const [q, setQ] = useState('');
  const multi = prop.type === 'multi';
  const chosen = multi ? (Array.isArray(value) ? (value as string[]) : []) : typeof value === 'string' ? [value] : [];
  const options = prop.options ?? [];
  const list = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());

  const pick = (o: SelectOption) => {
    if (multi) onSave(chosen.includes(o.id) ? chosen.filter((x) => x !== o.id) : [...chosen, o.id]);
    else {
      onSave(chosen[0] === o.id ? null : o.id);
      pop.close();
    }
  };
  const create = () => {
    const name = q.trim();
    if (!name || exact) return;
    const id = newOptionId();
    const color = COLORS[(options.length + 1) % COLORS.length];
    api.schema([{ op: 'patchProp', id: prop.id, patch: { options: [...options, { id, name, color }] } }]);
    onSave(multi ? [...chosen, id] : id);
    setQ('');
    if (!multi) pop.close();
  };

  return (
    <>
      <span className={`db-select ${can ? 'editable' : ''}`} onClick={(e) => { e.stopPropagation(); if (can) pop.toggle(e); }} tabIndex={can ? 0 : undefined} role={can ? 'button' : undefined} aria-label={can ? `Edit ${prop.name}` : undefined} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && can) { e.preventDefault(); e.stopPropagation(); pop.toggle({ currentTarget: e.currentTarget }); } }}>
        {chosen.map((id) => {
          const o = optionOf(prop, id);
          return o ? <Chip key={id} color={o.color}>{o.name}</Chip> : null;
        })}
      </span>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label={prop.name} width={240}>
          <input className="db-search" placeholder={multi ? 'Search or create an option' : 'Select an option'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { if (list[0] && (exact || !q.trim())) pick(list[0]); else if (q.trim() && !exact) create(); else if (list[0]) pick(list[0]); } }} />
          <div className="db-options">
            {prop.type === 'status' ? (['todo', 'progress', 'done'] as const).map((g) => {
              const inGroup = list.filter((o) => (o.group ?? 'todo') === g);
              return inGroup.length ? (
                <div key={g}>
                  <p className="db-group-label">{g === 'todo' ? 'To-do' : g === 'progress' ? 'In progress' : 'Complete'}</p>
                  {inGroup.map((o) => <OptionRow key={o.id} o={o} on={chosen.includes(o.id)} onPick={() => pick(o)} />)}
                </div>
              ) : null;
            }) : list.map((o) => <OptionRow key={o.id} o={o} on={chosen.includes(o.id)} onPick={() => pick(o)} />)}
            {q.trim() && !exact && <button className="db-opt" onClick={create}>Create <Chip color="gray">{q.trim()}</Chip></button>}
            {!list.length && !q.trim() && <p className="muted db-empty">No options yet. Type to create one.</p>}
          </div>
          {chosen.length > 0 && <button className="db-opt clear" onClick={() => { onSave(null); pop.close(); }}>Clear</button>}
        </Popover>
      )}
    </>
  );
}

const OptionRow = ({ o, on, onPick }: { o: SelectOption; on: boolean; onPick: () => void }) => (
  <button className={`db-opt ${on ? 'on' : ''}`} role="option" aria-selected={on} onClick={onPick}>
    <Chip color={o.color}>{o.name}</Chip>{on && <span aria-hidden>✓</span>}
  </button>
);

// ---- Date ----

function DateCell({ value, can, onSave }: { value: PropValue; can: boolean; onSave: (v: PropValue) => void }) {
  const pop = usePopover();
  const d = isDate(value) ? value : null;
  const hasTime = !!d?.start.includes('T');
  const [end, setEnd] = useState(!!d?.end);
  const toInput = (s: string | undefined) => (s ? (hasTime ? s.slice(0, 16) : s.slice(0, 10)) : '');
  const update = (start: string, endV?: string) => {
    if (!start) return onSave(null);
    onSave(endV ? { start, end: endV } : { start });
  };
  const toggleTime = (on: boolean) => {
    if (!d) return;
    const fix = (s: string | undefined) => (s ? (on ? `${s.slice(0, 10)}T${s.includes('T') ? s.slice(11, 16) : '09:00'}` : s.slice(0, 10)) : undefined);
    onSave({ start: fix(d.start)!, ...(d.end ? { end: fix(d.end)! } : {}) });
  };
  return (
    <>
      <span className={`db-date ${can ? 'editable' : ''}`} onClick={(e) => { e.stopPropagation(); if (can) pop.toggle(e); }} tabIndex={can ? 0 : undefined} role={can ? 'button' : undefined} aria-label={can ? 'Edit date' : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && can) { e.stopPropagation(); pop.toggle({ currentTarget: e.currentTarget }); } }}>
        {d ? formatDateValue(d) : ''}
      </span>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Date" width={260}>
          <label className="db-field">Start<input type={hasTime ? 'datetime-local' : 'date'} value={toInput(d?.start)} onChange={(e) => update(e.target.value, d?.end)} /></label>
          {end && <label className="db-field">End<input type={hasTime ? 'datetime-local' : 'date'} value={toInput(d?.end)} min={toInput(d?.start)} onChange={(e) => update(d?.start ?? e.target.value, e.target.value)} /></label>}
          <label className="db-switch"><span>End date</span><input type="checkbox" checked={end} onChange={(e) => { setEnd(e.target.checked); if (!e.target.checked && d) update(d.start); }} /></label>
          <label className="db-switch"><span>Include time</span><input type="checkbox" checked={hasTime} disabled={!d} onChange={(e) => toggleTime(e.target.checked)} /></label>
          <div className="db-row-btns">
            <button onClick={() => update(new Date().toISOString().slice(0, 10), d?.end)}>Today</button>
            <button onClick={() => { onSave(null); pop.close(); }}>Clear</button>
          </div>
        </Popover>
      )}
    </>
  );
}

// ---- Person ----

function PersonCell({ value, can, onSave, users }: { value: PropValue; can: boolean; onSave: (v: PropValue) => void; users: Record<string, { name: string; color: string; bot?: boolean; inactive?: boolean }> }) {
  const pop = usePopover();
  const [q, setQ] = useState('');
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  const people = Object.entries(users).filter(([, u]) => !u.bot && !u.inactive && u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <span className={`db-people ${can ? 'editable' : ''}`} onClick={(e) => { e.stopPropagation(); if (can) pop.toggle(e); }} tabIndex={can ? 0 : undefined} role={can ? 'button' : undefined} aria-label={can ? 'Edit people' : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && can) { e.stopPropagation(); pop.toggle({ currentTarget: e.currentTarget }); } }}>
        {chosen.map((id) => (
          <span key={id} className="db-person"><i style={{ background: users[id]?.color }} aria-hidden>{(users[id]?.name ?? '?')[0]}</i>{users[id]?.name ?? 'Someone'}</span>
        ))}
      </span>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="People" width={240}>
          <input className="db-search" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <div className="db-options">
            {people.map(([id, u]) => (
              <button key={id} className={`db-opt ${chosen.includes(id) ? 'on' : ''}`} onClick={() => onSave(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])}>
                <span className="db-person"><i style={{ background: u.color }} aria-hidden>{u.name[0]}</i>{u.name}</span>{chosen.includes(id) && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

// ---- Relation ----

function RelationCell({ api, prop, value, can, onSave }: { api: DatabaseApi; prop: Property; value: PropValue; can: boolean; onSave: (v: PropValue) => void }) {
  const pop = usePopover();
  const [q, setQ] = useState('');
  const other = prop.relation ? api.related(prop.relation.dbId) : undefined;
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const rows = other ? other.rows.filter((r) => r.trashedAt === undefined && titleOf(other, r).toLowerCase().includes(q.toLowerCase())).slice(0, 50) : [];
  return (
    <>
      <span className={`db-rel ${can ? 'editable' : ''}`} onClick={(e) => { e.stopPropagation(); if (can && other) pop.toggle(e); }} tabIndex={can && other ? 0 : undefined} role={can ? 'button' : undefined} aria-label={can ? `Edit ${prop.name}` : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && can && other) { e.stopPropagation(); pop.toggle({ currentTarget: e.currentTarget }); } }}>
        {ids.map((id) => {
          const r = other?.rows.find((x) => x.id === id);
          return <span key={id} className="db-link-chip">{other ? (r ? titleOf(other, r) || 'Untitled' : 'Deleted') : 'No access'}</span>;
        })}
      </span>
      {pop.isOpen && other && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Link rows" width={260}>
          <input className="db-search" placeholder="Search rows" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <div className="db-options">
            {rows.map((r) => (
              <button key={r.id} className={`db-opt ${ids.includes(r.id) ? 'on' : ''}`} onClick={() => onSave(ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id])}>
                <span>{titleOf(other, r) || 'Untitled'}</span>{ids.includes(r.id) && <span aria-hidden>✓</span>}
              </button>
            ))}
            {!rows.length && <p className="muted db-empty">No rows.</p>}
          </div>
        </Popover>
      )}
    </>
  );
}

// ---- Files ----

function FileCell({ value, can, onSave }: { value: PropValue; can: boolean; onSave: (v: PropValue) => void }) {
  const pop = usePopover();
  const [url, setUrl] = useState('');
  const urls = Array.isArray(value) ? (value as string[]) : [];
  const nameOf = (u: string) => decodeURIComponent(u.split('/').pop()?.split('?')[0] || u).slice(0, 40);
  return (
    <>
      <span className={`db-files ${can ? 'editable' : ''}`} onClick={(e) => { e.stopPropagation(); if (can) pop.toggle(e); }} tabIndex={can ? 0 : undefined} role={can ? 'button' : undefined} aria-label={can ? 'Edit files' : undefined}>
        {urls.map((u) => <a key={u} className="db-link-chip" href={u} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{nameOf(u)}</a>)}
      </span>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} label="Files" width={280}>
          <form onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//i.test(url)) { onSave([...urls, url.trim()]); setUrl(''); } }}>
            <input className="db-search" placeholder="Paste a link to a file (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </form>
          <div className="db-options">
            {urls.map((u) => <button key={u} className="db-opt" onClick={() => onSave(urls.filter((x) => x !== u))}><span>{nameOf(u)}</span><span aria-hidden>✕</span></button>)}
          </div>
        </Popover>
      )}
    </>
  );
}

export { optionName };
