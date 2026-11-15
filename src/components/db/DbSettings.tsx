// Database settings (automations, form, templates, data) and the form people fill in.
import { useRef, useState, type ReactNode } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { DatabaseApi } from '../../db-store.ts';
import { toCsv, parseCell, parseCsv } from '../../dbquery.ts';
import type { Action, Automation, DbData, Property, PropValue, RowTemplate } from '../../types.ts';
import { ActionList, ValueInput } from './PropEditor.tsx';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="db-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="db-modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose} autoFocus>✕</button></header>
        {children}
      </div>
    </div>
  );
}

type Tab = 'automations' | 'form' | 'templates' | 'data';

export function DbSettings({ api, onClose }: { api: DatabaseApi; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('automations');
  const db = api.db!;
  const manage = api.canManage;
  const tabs: [Tab, string][] = [['automations', 'Automations'], ['form', 'Form'], ['templates', 'Templates'], ['data', 'Data']];
  return (
    <Modal title="Database settings" onClose={onClose}>
      <div className="db-tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`db-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="db-modal-body">
        {tab === 'automations' && <Automations api={api} db={db} manage={manage} />}
        {tab === 'form' && <FormSettings api={api} db={db} manage={manage} />}
        {tab === 'templates' && <Templates api={api} db={db} />}
        {tab === 'data' && <Data api={api} db={db} manage={manage} />}
      </div>
    </Modal>
  );
}

// ---- Automations ----

function describe(db: DbData, a: Automation): string {
  const prop = a.trigger.kind === 'propChanged' ? db.props.find((p) => p.id === (a.trigger as { prop: string }).prop) : undefined;
  return a.trigger.kind === 'rowAdded' ? 'When a row is added' : `When ${prop?.name ?? 'a property'} changes`;
}

function Automations({ api, db, manage }: { api: DatabaseApi; db: DbData; manage: boolean }) {
  const { send, snap } = useRelayCtx();
  const [draft, setDraft] = useState<(Omit<Automation, 'id'> & { id?: string }) | null>(null);
  const id = db && api.meta?.id;
  if (!id) return null;
  if (draft) {
    const trig = draft.trigger;
    const prop = trig.kind === 'propChanged' ? db.props.find((p) => p.id === trig.prop) : undefined;
    return (
      <div>
        <label className="db-field">Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></label>
        <label className="db-field">When
          <select value={trig.kind} onChange={(e) => setDraft({ ...draft, trigger: e.target.value === 'rowAdded' ? { kind: 'rowAdded' } : { kind: 'propChanged', prop: db.props[0].id } })}>
            <option value="rowAdded">A row is added</option><option value="propChanged">A property changes</option>
          </select>
        </label>
        {trig.kind === 'propChanged' && (
          <div className="db-rule">
            <select aria-label="Property" value={trig.prop} onChange={(e) => setDraft({ ...draft, trigger: { kind: 'propChanged', prop: e.target.value } })}>{db.props.filter((p) => !['formula', 'rollup'].includes(p.type)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <span className="muted">changes to</span>
            {prop && <ValueInput prop={prop} value={(trig.to as PropValue) ?? null} onChange={(v) => setDraft({ ...draft, trigger: { kind: 'propChanged', prop: trig.prop, ...(v === null ? {} : { to: v }) } })} />}
          </div>
        )}
        <ActionList db={db} actions={draft.actions} onChange={(actions: Action[]) => setDraft({ ...draft, actions })} users={snap.users} />
        <div className="db-row-btns">
          <button className="primary" disabled={!draft.actions.length} onClick={() => { send({ t: 'dbAutomation', id, op: { op: 'set', automation: draft } }); setDraft(null); }}>Save</button>
          <button onClick={() => setDraft(null)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="muted db-note">Automations run when a row is added or a property changes. An automation never starts another one.</p>
      {db.automations.map((a) => (
        <div key={a.id} className="db-list-item">
          <span><b>{a.name}</b><small className="muted"> {describe(db, a)} · {a.actions.length} action{a.actions.length === 1 ? '' : 's'}</small></span>
          {manage && (
            <span>
              <label className="db-switch inline"><span className="sr-only">On</span><input type="checkbox" aria-label={`${a.name} on`} checked={a.on} onChange={(e) => send({ t: 'dbAutomation', id, op: { op: 'set', automation: { ...a, on: e.target.checked } } })} /></label>
              <button onClick={() => setDraft(a)}>Edit</button>
              <button className="danger" onClick={() => send({ t: 'dbAutomation', id, op: { op: 'remove', automationId: a.id } })}>Delete</button>
            </span>
          )}
        </div>
      ))}
      {db.automations.length === 0 && <p className="muted db-empty">No automations yet.</p>}
      {manage ? <button className="primary" onClick={() => setDraft({ name: 'New automation', on: true, trigger: { kind: 'rowAdded' }, actions: [] })}>New automation</button> : <p className="muted db-note">Only people with full access can change automations.</p>}
    </div>
  );
}

// ---- Form ----

function FormSettings({ api, db, manage }: { api: DatabaseApi; db: DbData; manage: boolean }) {
  const { send } = useRelayCtx();
  const id = api.meta?.id;
  const f = db.form;
  const [title, setTitle] = useState(f.title);
  const [description, setDescription] = useState(f.description);
  const [submit, setSubmit] = useState(f.submitLabel);
  if (!id) return null;
  const askable = db.props.filter((p) => !['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id'].includes(p.type));
  const patch = (p: Partial<DbData['form']>) => send({ t: 'dbForm', id, patch: p });
  if (!manage) return <p className="muted db-note">Only people with full access can change the form.</p>;
  return (
    <div>
      <label className="db-switch"><span>Accept answers through a form</span><input type="checkbox" checked={f.enabled} onChange={(e) => patch({ enabled: e.target.checked, ...(e.target.checked && f.fields.length === 0 ? { fields: askable.slice(0, 5).map((p) => p.id), required: [askable[0].id] } : {}) })} /></label>
      <label className="db-field">Form title<input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => patch({ title })} /></label>
      <label className="db-field">Description<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => patch({ description })} /></label>
      <label className="db-field">Button text<input value={submit} onChange={(e) => setSubmit(e.target.value)} onBlur={() => patch({ submitLabel: submit })} /></label>
      <p className="db-group-label">Questions</p>
      {askable.map((p) => {
        const on = f.fields.includes(p.id);
        return (
          <div key={p.id} className="db-list-item">
            <label className="db-check-row"><input type="checkbox" checked={on} onChange={(e) => patch({ fields: e.target.checked ? [...f.fields, p.id] : f.fields.filter((x) => x !== p.id), required: e.target.checked ? f.required : f.required.filter((x) => x !== p.id) })} /> {p.name}</label>
            {on && <label className="db-check-row"><input type="checkbox" checked={f.required.includes(p.id)} onChange={(e) => patch({ required: e.target.checked ? [...f.required, p.id] : f.required.filter((x) => x !== p.id) })} /> Required</label>}
          </div>
        );
      })}
      <p className="muted db-note">People who can open this database can fill in the form. Answers become new rows.</p>
    </div>
  );
}

// ---- Templates ----

function Templates({ api, db }: { api: DatabaseApi; db: DbData }) {
  const { send } = useRelayCtx();
  const id = api.meta?.id;
  const [draft, setDraft] = useState<{ id?: string; name: string; props: Record<string, PropValue> } | null>(null);
  if (!id) return null;
  const settable = db.props.filter((p) => !['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id', 'file', 'person', 'relation'].includes(p.type));
  if (draft) {
    return (
      <div>
        <label className="db-field">Template name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></label>
        <p className="db-group-label">Starting values</p>
        {settable.map((p: Property) => (
          <label key={p.id} className="db-field">{p.name}<ValueInput prop={p} value={draft.props[p.id] ?? null} onChange={(v) => setDraft({ ...draft, props: { ...draft.props, [p.id]: v } })} /></label>
        ))}
        <div className="db-row-btns">
          <button className="primary" disabled={!draft.name.trim()} onClick={() => { send({ t: 'dbTemplate', id, op: { op: 'set', template: draft } }); setDraft(null); }}>Save</button>
          <button onClick={() => setDraft(null)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="muted db-note">A template starts a new row with values already filled in. Pick one from the arrow next to New.</p>
      {db.templates.map((t: RowTemplate) => (
        <div key={t.id} className="db-list-item"><b>{t.name}</b>
          <span><button onClick={() => setDraft({ id: t.id, name: t.name, props: t.props })}>Edit</button><button className="danger" onClick={() => send({ t: 'dbTemplate', id, op: { op: 'remove', templateId: t.id } })}>Delete</button></span>
        </div>
      ))}
      {db.templates.length === 0 && <p className="muted db-empty">No templates yet.</p>}
      <button className="primary" disabled={!api.canEdit} onClick={() => setDraft({ name: 'New template', props: {} })}>New template</button>
    </div>
  );
}

// ---- Data ----

function Data({ api, db, manage }: { api: DatabaseApi; db: DbData; manage: boolean }) {
  const { send } = useRelayCtx();
  const id = api.meta?.id;
  const [note, setNote] = useState('');
  if (!id) return null;
  const download = () => {
    const csv = toCsv(db, db.rows.filter((r) => r.trashedAt === undefined), api.ctx);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(api.meta?.title || 'database').replace(/[^\w.-]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importCsv = async (file: File) => {
    if (file.size > 2_000_000) return setNote('That file is too large (limit 2 MB).');
    const table = parseCsv(await file.text());
    if (table.length < 2) return setNote('That file has no rows.');
    // Columns are matched to properties by name; the first column goes to the title if no name matches.
    const head = table[0].map((h) => h.trim().toLowerCase());
    const cols = db.props.map((p) => ({ p, at: head.indexOf(p.name.toLowerCase()) }));
    const title = db.props.find((p) => p.type === 'title')!;
    const titleCol = cols.find((c) => c.p === title)!;
    if (titleCol.at < 0) titleCol.at = 0;
    const rows = table.slice(1, 501);
    let skipped = 0;
    rows.forEach((cells, i) => {
      const values: Record<string, PropValue> = {};
      for (const { p, at } of cols) {
        if (at < 0 || ['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id', 'person', 'relation', 'file'].includes(p.type)) continue;
        const v = parseCell(p, cells[at] ?? '');
        if (v === undefined) skipped += 1;
        else if (v !== null) values[p.id] = v;
      }
      // A few at a time, so a big file does not trip the per-connection rate limit.
      setTimeout(() => send({ t: 'rowCreate', id, props: values }), Math.floor(i / 20) * 500);
    });
    setNote(`Importing ${rows.length} row${rows.length === 1 ? '' : 's'}${skipped ? `; ${skipped} value${skipped === 1 ? '' : 's'} didn’t fit and were left empty` : ''}.${table.length > 501 ? ' Only the first 500 rows are imported.' : ''}`);
  };
  return (
    <div>
      <div className="db-row-btns"><button onClick={download}>Export as CSV</button>{api.canEdit && <label className="db-file"><input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />Import CSV</label>}</div>
      {note && <p role="status" className="muted db-note">{note}</p>}
      {manage && (
        <label className="db-switch"><span>Lock database (no one can change its properties or views)</span><input type="checkbox" checked={db.locked} onChange={(e) => send({ t: 'dbLock', id, locked: e.target.checked })} /></label>
      )}
      <p className="muted db-note">{db.rows.filter((r) => r.trashedAt === undefined).length} rows · {db.props.length} properties · {db.views.length} views</p>
      {db.rows.some((r) => r.trashedAt !== undefined) && (
        <details>
          <summary>Deleted rows ({db.rows.filter((r) => r.trashedAt !== undefined).length})</summary>
          {db.rows.filter((r) => r.trashedAt !== undefined).slice(0, 50).map((r) => (
            <div key={r.id} className="db-list-item"><span>{String(r.props[db.props.find((p) => p.type === 'title')!.id] ?? 'Untitled')}</span><span><button onClick={() => api.removeRow(r.id, true)}>Restore</button><button className="danger" onClick={() => api.removeRow(r.id)}>Delete for good</button></span></div>
          ))}
        </details>
      )}
    </div>
  );
}

// ---- The form itself ----

export function FormModal({ api, onClose }: { api: DatabaseApi; onClose: () => void }) {
  const { send } = useRelayCtx();
  const db = api.db!;
  const id = api.meta?.id;
  const [values, setValues] = useState<Record<string, PropValue>>({});
  const [done, setDone] = useState(false);
  if (!id) return null;
  const fields = db.form.fields.map((f) => db.props.find((p) => p.id === f)).filter((p): p is Property => !!p);
  const missing = fields.filter((p) => db.form.required.includes(p.id)).some((p) => { const v = values[p.id]; return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); });
  return (
    <Modal title={db.form.title || api.meta?.title || 'Form'} onClose={onClose}>
      <div className="db-modal-body">
        {done ? (
          <div><p>Thanks — your answer was added.</p><div className="db-row-btns"><button onClick={() => { setValues({}); setDone(false); }}>Submit another</button><button className="primary" onClick={onClose}>Close</button></div></div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (missing) return; send({ t: 'formSubmit', id, values }); setDone(true); }}>
            {db.form.description && <p className="muted">{db.form.description}</p>}
            {fields.map((p) => (
              <label key={p.id} className="db-field">{p.name}{db.form.required.includes(p.id) ? ' *' : ''}
                {p.type === 'multi' ? (
                  <span className="db-chip-row">{p.options?.map((o) => { const cur = (values[p.id] as string[] | undefined) ?? []; return <label key={o.id} className="db-check-row"><input type="checkbox" checked={cur.includes(o.id)} onChange={(e) => setValues({ ...values, [p.id]: e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id) })} /> {o.name}</label>; })}</span>
                ) : p.type === 'person' || p.type === 'relation' || p.type === 'file' ? (
                  <span className="muted">Not available in forms</span>
                ) : (
                  <ValueInput prop={p} value={values[p.id] ?? null} onChange={(v) => setValues({ ...values, [p.id]: v })} />
                )}
              </label>
            ))}
            <div className="db-row-btns"><button type="submit" className="primary" disabled={missing}>{db.form.submitLabel || 'Submit'}</button></div>
          </form>
        )}
      </div>
    </Modal>
  );
}
