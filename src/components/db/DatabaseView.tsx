// A database on a page: view tabs, the toolbar and the chosen layout. Filters, sorts and groups you
// change are yours until you save them for everyone, as in Notion.
import { Icon } from '../Icon.tsx';
import { useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../../db-store.ts';
import { viewRows } from '../../dbquery.ts';
import type { Property, PropValue, View, ViewLayout } from '../../types.ts';
import { Popover, usePopover } from '../ui/Popover.tsx';
import { CalendarView, ChartView, TimelineView } from './CalendarViews.tsx';
import { DbSettings, FormModal } from './DbSettings.tsx';
import { PropEditor } from './PropEditor.tsx';
import { FilterButton, GroupButton, LAYOUT_LABEL, LayoutButton, PropsButton, SortButton, layoutGlyph } from './Toolbar.tsx';
import { BoardView, FeedView, GalleryView, ListView, TableView, type ViewProps } from './Views.tsx';

interface Props {
  dbId: string;
  // Shown inside a page (a linked view) rather than as the page itself.
  inline?: boolean;
  onOpenRow: (dbId: string, rowId: string) => void;
}

const rememberKey = (id: string) => `relay.dbview.${id}`;
const recall = (id: string): string | null => {
  try {
    return localStorage.getItem(rememberKey(id));
  } catch {
    return null;
  }
};

export function DatabaseView({ dbId, inline, onOpenRow }: Props) {
  const api = useDatabase(dbId);
  const { db } = api;
  const [viewId, setViewId] = useState<string | null>(() => recall(dbId));
  const [drafts, setDrafts] = useState<Record<string, Partial<View>>>({});
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<{ prop: Property | null; anchor: HTMLElement } | null>(null);
  const [settings, setSettings] = useState(false);
  const [form, setForm] = useState(false);
  const newView = usePopover();
  const tab = usePopover();
  const newMenu = usePopover();

  // The view in use: the remembered one if it still exists, else the first.
  const base: View | undefined = db?.views.find((v) => v.id === viewId) ?? db?.views[0];
  const draft = base ? drafts[base.id] : undefined;
  const view: View | undefined = base ? { ...base, ...draft } : undefined;
  const dirty = !!draft && Object.keys(draft).length > 0;

  useEffect(() => {
    if (base) {
      try {
        localStorage.setItem(rememberKey(dbId), base.id);
      } catch { /* not saved */ }
    }
  }, [base, dbId]);

  const rows = useMemo(() => (db && view ? viewRows(db, view, api.ctx, search) : []), [db, view, api.ctx, search]);

  if (api.state === 'denied') return <p className="muted db-empty">You no longer have access to this database.</p>;
  if (!db || !view || !base) return <p className="muted db-empty">Loading database…</p>;

  const readOnly = !api.canEdit;
  const patch = (p: Partial<View>) => setDrafts((d) => ({ ...d, [base.id]: { ...d[base.id], ...p } }));
  const reset = () => setDrafts((d) => { const { [base.id]: _gone, ...rest } = d; return rest; });
  const saveForEveryone = () => {
    if (!draft) return;
    api.view({ op: 'patch', viewId: base.id, patch: draft as Partial<Omit<View, 'id'>> });
    reset();
  };
  const canSaveView = api.canDesign && (!db.locked || api.canManage);

  const addRow = (values?: Record<string, PropValue>, after?: string | null) => {
    // A new row starts with the view's filter values where they are plain (so it does not vanish from the view).
    const seeded: Record<string, PropValue> = {};
    for (const it of view.filter.items) {
      if ('items' in it) continue;
      const prop = db.props.find((x) => x.id === it.prop);
      if (it.op === 'is' && it.value !== undefined && prop && (prop.type === 'select' || prop.type === 'status')) seeded[it.prop] = it.value;
      if (it.op === 'checked' && prop) seeded[it.prop] = true;
    }
    api.createRow({ ...seeded, ...values }, undefined, after);
  };
  const open = (rowId: string) => onOpenRow(dbId, rowId);
  const props: ViewProps = { api, db, view, rows, onOpen: open, addRow, onEditProp: (p, a) => setEditing({ prop: p, anchor: a }), patch, readOnly };

  const body = (() => {
    switch (view.layout) {
      case 'board': return <BoardView {...props} />;
      case 'list': return <ListView {...props} />;
      case 'gallery': return <GalleryView {...props} />;
      case 'calendar': return <CalendarView {...props} />;
      case 'timeline': return <TimelineView {...props} />;
      case 'chart': return <ChartView {...props} />;
      case 'feed': return <FeedView {...props} />;
      default: return <TableView {...props} />;
    }
  })();

  return (
    <section className={`db ${inline ? 'inline' : ''}`} aria-label={api.meta?.title || 'Database'}>
      {inline && <h3 className="db-inline-title"><button onClick={() => onOpenRow(dbId, '')}>{api.meta?.icon || '🗂️'} {api.meta?.title || 'Untitled'}</button></h3>}
      <div className="db-tabs" role="tablist" aria-label="Views">
        {db.views.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === base.id} className={`db-tab ${v.id === base.id ? 'on' : ''}`} onClick={() => setViewId(v.id)} onDoubleClick={(e) => { if (canSaveView && v.id === base.id) tab.toggle(e); }}>
            <b aria-hidden>{layoutGlyph(drafts[v.id]?.layout ?? v.layout)}</b> {v.name}
          </button>
        ))}
        {canSaveView && <button className="db-tab" onClick={newView.toggle} aria-label="Add a view" aria-haspopup="dialog">+</button>}
        {canSaveView && <button className="db-tab" onClick={tab.toggle} aria-label="View options" aria-haspopup="dialog">⋯</button>}
      </div>
      <div className="db-toolbar" role="toolbar" aria-label="Database controls">
        <FilterButton db={db} view={view} patch={patch} />
        <SortButton db={db} view={view} patch={patch} />
        {(view.layout === 'table' || view.layout === 'board') && <GroupButton db={db} view={view} patch={patch} />}
        <PropsButton db={db} view={view} patch={patch} canEdit={api.canDesign && (!db.locked || api.canManage)} onNew={(a) => setEditing({ prop: null, anchor: a })} onEdit={(p, a) => setEditing({ prop: p, anchor: a })} />
        <LayoutButton db={db} view={view} patch={patch} onSettings={() => setSettings(true)} />
        <span className="db-spacer" />
        {searching ? (
          <input className="db-search-box" autoFocus aria-label="Search rows" placeholder="Type to search…" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => { if (!search) setSearching(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setSearch(''); setSearching(false); } }} />
        ) : (
          <button className="icon-btn" aria-label="Search rows" onClick={() => setSearching(true)}><Icon n="search" /></button>
        )}
        {db.form.enabled && <button className="db-tool" onClick={() => setForm(true)}>Form</button>}
        {!readOnly && (
          <span className="db-new">
            <button className="primary" onClick={() => addRow()}>New</button>
            {db.templates.length > 0 && <button className="primary caret" aria-label="New from template" aria-haspopup="menu" onClick={newMenu.toggle}>▾</button>}
          </span>
        )}
      </div>
      {dirty && (
        <div className="db-draft" role="status">
          <span>Your changes to this view aren’t saved for everyone.</span>
          <button onClick={reset}>Reset</button>
          {canSaveView && <button className="primary" onClick={saveForEveryone}>Save for everyone</button>}
        </div>
      )}
      {db.locked && <p className="muted db-note">This database is locked. Its properties and views can’t be changed until it’s unlocked.</p>}
      <div className="db-body">{body}</div>

      {newMenu.isOpen && (
        <Popover anchor={newMenu.anchor} onClose={newMenu.close} width={220} align="end" label="New row">
          <button className="db-opt" onClick={() => { newMenu.close(); addRow(); }}>Empty row</button>
          {db.templates.map((t) => <button key={t.id} className="db-opt" onClick={() => { newMenu.close(); api.createRow(undefined, t.id); }}>{t.name}</button>)}
        </Popover>
      )}
      {newView.isOpen && (
        <Popover anchor={newView.anchor} onClose={newView.close} width={240} label="Add a view">
          {(Object.keys(LAYOUT_LABEL) as ViewLayout[]).map((l) => (
            <button key={l} className="db-opt" onClick={() => { newView.close(); api.view({ op: 'add', view: { layout: l } }); }}><span><b aria-hidden>{layoutGlyph(l)}</b> {LAYOUT_LABEL[l]}</span></button>
          ))}
        </Popover>
      )}
      {tab.isOpen && (
        <ViewMenu anchor={tab.anchor} onClose={tab.close} view={base} canDelete={db.views.length > 1} onRename={(name) => api.view({ op: 'patch', viewId: base.id, patch: { name } })} onDuplicate={() => api.view({ op: 'duplicate', viewId: base.id })} onDelete={() => api.view({ op: 'remove', viewId: base.id })} />
      )}
      {editing && <PropEditor key={editing.prop?.id ?? 'new'} api={api} anchor={editing.anchor} prop={editing.prop} onClose={() => setEditing(null)} />}
      {settings && <DbSettings api={api} onClose={() => setSettings(false)} />}
      {form && <FormModal api={api} onClose={() => setForm(false)} />}
    </section>
  );
}

function ViewMenu({ anchor, onClose, view, canDelete, onRename, onDuplicate, onDelete }: { anchor: HTMLElement | null; onClose: () => void; view: View; canDelete: boolean; onRename: (n: string) => void; onDuplicate: () => void; onDelete: () => void }) {
  const [name, setName] = useState(view.name);
  return (
    <Popover anchor={anchor} onClose={onClose} width={240} label="View options">
      <label className="db-field">Name<input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== view.name && onRename(name.trim())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { if (name.trim() && name !== view.name) onRename(name.trim()); onClose(); } }} /></label>
      <button className="db-opt" onClick={() => { onClose(); onDuplicate(); }}>Duplicate view</button>
      {canDelete && <button className="db-opt danger" onClick={() => { onClose(); onDelete(); }}>Delete view</button>}
    </Popover>
  );
}
