// The property list at the top of a database row's page.
import { useState } from 'react';
import { useDatabase } from '../../db-store.ts';
import type { Property } from '../../types.ts';
import { Cell, PropIcon } from './Cell.tsx';
import { PropEditor } from './PropEditor.tsx';

export function RowProps({ dbId, rowId, onBack }: { dbId: string; rowId: string; onBack: () => void }) {
  const api = useDatabase(dbId);
  const [editing, setEditing] = useState<{ prop: Property | null; anchor: HTMLElement } | null>(null);
  const { db } = api;
  const row = db?.rows.find((r) => r.id === rowId);
  if (!db) return <p className="muted db-empty">Loading properties…</p>;
  if (!row || row.trashedAt !== undefined) {
    return (
      <div className="db-rowprops">
        <p className="muted">This row was deleted.</p>
        <button className="ghost-btn" onClick={onBack}>Back to {api.meta?.title || 'the database'}</button>
      </div>
    );
  }
  const canSchema = api.canDesign && (!db.locked || api.canManage);
  return (
    <div className="db-rowprops">
      <button className="ghost-btn db-back" onClick={onBack}>← {api.meta?.icon || '🗂️'} {api.meta?.title || 'Untitled'}</button>
      <dl>
        {db.props.filter((p) => p.type !== 'title').map((p) => (
          <div key={p.id} className="db-prop-line">
            <dt><button disabled={!canSchema} onClick={(e) => setEditing({ prop: p, anchor: e.currentTarget })} aria-label={`${p.name} property settings`}><PropIcon type={p.type} /> {p.name}</button></dt>
            <dd><Cell api={api} db={db} row={row} prop={p} /></dd>
          </div>
        ))}
      </dl>
      {canSchema && <button className="ghost-btn" onClick={(e) => setEditing({ prop: null, anchor: e.currentTarget })}>+ Add a property</button>}
      <hr />
      {editing && <PropEditor key={editing.prop?.id ?? 'new'} api={api} anchor={editing.anchor} prop={editing.prop} onClose={() => setEditing(null)} />}
    </div>
  );
}
