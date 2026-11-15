// The settings of one property: its name, type and what that type needs (options, a number format,
// a formula, the database a relation points at, a rollup, a button).
import { useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { DatabaseApi } from '../../db-store.ts';
import { CALC_CHOICES } from '../../dbquery.ts';
import { check } from '../../formula.ts';
import type { Action, Property, PropType, PropValue, RollupFn, SelectOption } from '../../types.ts';
import { Popover } from '../ui/Popover.tsx';
import { COLORS, Chip, TYPE_LABEL, newOptionId } from './Cell.tsx';

const TYPES: PropType[] = [
  'text', 'number', 'select', 'status', 'multi', 'date', 'person', 'file', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup',
  'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id', 'place',
];
const FORMATS: [string, string][] = [['plain', 'Number'], ['commas', 'Number with commas'], ['percent', 'Percent'], ['usd', 'US dollar'], ['eur', 'Euro'], ['gbp', 'Pound'], ['inr', 'Rupee']];
const ROLLUP_FNS = CALC_CHOICES.filter((c) => c.id && c.id !== 'count').map((c) => c.id);

interface Props {
  api: DatabaseApi;
  anchor: HTMLElement | null;
  // null = a new property.
  prop: Property | null;
  onClose: () => void;
}

export function PropEditor({ api, anchor, prop, onClose }: Props) {
  const { snap } = useRelayCtx();
  const db = api.db!;
  const isNew = prop === null;
  const [name, setName] = useState(prop?.name ?? '');
  const [type, setType] = useState<PropType>(prop?.type ?? 'text');
  const [options, setOptions] = useState<SelectOption[]>(prop?.options ?? []);
  const [format, setFormat] = useState(prop?.format ?? 'plain');
  const [formula, setFormula] = useState(prop?.formula ?? '');
  const [relDb, setRelDb] = useState(prop?.relation?.dbId ?? '');
  const [twoWay, setTwoWay] = useState(!!prop?.relation?.twoWay || isNew);
  const [rollRel, setRollRel] = useState(prop?.rollup?.relation ?? '');
  const [rollProp, setRollProp] = useState(prop?.rollup?.prop ?? '');
  const [rollFn, setRollFn] = useState<RollupFn>(prop?.rollup?.fn ?? 'count');
  const [btnLabel, setBtnLabel] = useState(prop?.button?.label ?? 'Run');
  const [btnActions, setBtnActions] = useState<Action[]>(prop?.button?.actions ?? []);

  const databases = snap.pages.filter((p) => p.kind === 'database' && !p.trashed);
  const relations = db.props.filter((p) => p.type === 'relation' && p.id !== prop?.id);
  const rollTarget = api.related(db.props.find((p) => p.id === rollRel)?.relation?.dbId ?? '');
  const formulaError = type === 'formula' ? check(formula) : null;
  const wantsOptions = type === 'select' || type === 'multi' || type === 'status';
  const isTitle = prop?.type === 'title';

  const needsMore = (type === 'relation' && !relDb) || (type === 'rollup' && (!rollRel || !rollProp)) || (type === 'formula' && !!formulaError);
  const valid = name.trim().length > 0 && !needsMore;

  const build = (): Partial<Property> => {
    const out: Partial<Property> = { name: name.trim(), type };
    if (wantsOptions) out.options = options;
    if (type === 'number') out.format = format;
    if (type === 'formula') out.formula = formula;
    if (type === 'relation') out.relation = { dbId: relDb, ...(isNew && twoWay ? { twoWay: 'create' } : prop?.relation?.twoWay ? { twoWay: prop.relation.twoWay } : {}) };
    if (type === 'rollup') out.rollup = { relation: rollRel, prop: rollProp, fn: rollFn };
    if (type === 'button') out.button = { label: btnLabel.trim() || 'Run', actions: btnActions };
    return out;
  };
  const save = () => {
    if (!valid) return;
    const body = build();
    if (isNew) api.schema([{ op: 'addProp', prop: body as Partial<Property> & { type: PropType; name: string } }]);
    else if (isTitle) api.schema([{ op: 'patchProp', id: prop.id, patch: { name: body.name } }]);
    else api.schema([{ op: 'patchProp', id: prop.id, patch: body }]);
    onClose();
  };

  const editOption = (i: number, patch: Partial<SelectOption>) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Popover anchor={anchor} onClose={onClose} label={isNew ? 'New property' : `${prop.name} settings`} width={300} className="db-prop-editor">
      <label className="db-field">Name<input value={name} autoFocus placeholder="Property name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); }} /></label>
      {!isTitle && (
        <label className="db-field">Type
          <select value={type} onChange={(e) => setType(e.target.value as PropType)}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
      )}
      {isTitle && <p className="muted db-note">The title column can be renamed, not retyped or removed.</p>}

      {type === 'number' && (
        <label className="db-field">Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </label>
      )}

      {wantsOptions && (
        <div className="db-opts-edit">
          <p className="db-group-label">Options</p>
          {options.map((o, i) => (
            <div key={o.id} className="db-opt-edit">
              <select aria-label="Color" value={o.color} onChange={(e) => editOption(i, { color: e.target.value })}>{COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <input value={o.name} aria-label="Option name" onChange={(e) => editOption(i, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
              {type === 'status' && (
                <select aria-label="Group" value={o.group ?? 'todo'} onChange={(e) => editOption(i, { group: e.target.value as SelectOption['group'] })}>
                  <option value="todo">To-do</option><option value="progress">In progress</option><option value="done">Complete</option>
                </select>
              )}
              <button className="icon-btn" aria-label={`Remove ${o.name}`} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="db-add" onClick={() => setOptions((o) => [...o, { id: newOptionId(), name: `Option ${o.length + 1}`, color: COLORS[(o.length + 1) % COLORS.length], ...(type === 'status' ? { group: 'todo' as const } : {}) }])}>+ Add an option</button>
          {options.length > 0 && <div className="db-chip-row">{options.map((o) => <Chip key={o.id} color={o.color}>{o.name}</Chip>)}</div>}
        </div>
      )}

      {type === 'formula' && (
        <label className="db-field">Formula
          <textarea rows={4} value={formula} placeholder={'prop("Price") * prop("Qty")'} onChange={(e) => setFormula(e.target.value)} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} />
          {formulaError ? <span className="db-error">{formulaError}</span> : <span className="muted db-note">Use prop(&quot;Name&quot;), if(), round(), dateBetween(), join(), …</span>}
        </label>
      )}

      {type === 'relation' && (
        <>
          <label className="db-field">Related database
            <select value={relDb} disabled={!isNew} onChange={(e) => setRelDb(e.target.value)}>
              <option value="">Choose a database…</option>
              {databases.map((d) => <option key={d.id} value={d.id}>{d.title || 'Untitled'}</option>)}
            </select>
          </label>
          {isNew && <label className="db-switch"><span>Also show on the other database</span><input type="checkbox" checked={twoWay} onChange={(e) => setTwoWay(e.target.checked)} /></label>}
        </>
      )}

      {type === 'rollup' && (
        <>
          <label className="db-field">Relation
            <select value={rollRel} onChange={(e) => { setRollRel(e.target.value); setRollProp(''); }}>
              <option value="">Choose a relation…</option>
              {relations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="db-field">Property
            <select value={rollProp} onChange={(e) => setRollProp(e.target.value)} disabled={!rollTarget}>
              <option value="">{rollTarget ? 'Choose a property…' : 'Choose a relation first'}</option>
              {rollTarget?.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="db-field">Calculate
            <select value={rollFn} onChange={(e) => setRollFn(e.target.value as RollupFn)}>
              <option value="count">Count all</option>
              {ROLLUP_FNS.map((id) => <option key={id} value={id}>{CALC_CHOICES.find((c) => c.id === id)?.label ?? id}</option>)}
              <option value="showOriginal">Show original</option>
            </select>
          </label>
          {relations.length === 0 && <p className="muted db-note">Add a relation property first.</p>}
        </>
      )}

      {type === 'button' && (
        <>
          <label className="db-field">Label<input value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
          <ActionList db={db} actions={btnActions} onChange={setBtnActions} users={snap.users} />
        </>
      )}

      <div className="db-row-btns">
        <button className="primary" disabled={!valid} onClick={save}>{isNew ? 'Add property' : 'Save'}</button>
        {!isNew && !isTitle && (
          <>
            <button onClick={() => { api.schema([{ op: 'addProp', prop: { ...build(), name: `${prop.name} copy`, type: prop.type === 'relation' ? 'text' : prop.type } as Partial<Property> & { type: PropType; name: string } }]); onClose(); }}>Duplicate</button>
            <button className="danger" onClick={() => { api.schema([{ op: 'removeProp', id: prop.id }]); onClose(); }}>Delete</button>
          </>
        )}
      </div>
    </Popover>
  );
}

// The actions of a button or an automation: set a property, or tell someone.
export function ActionList({ db, actions, onChange, users }: { db: { props: Property[] }; actions: Action[]; onChange: (a: Action[]) => void; users: Record<string, { name: string; bot?: boolean; inactive?: boolean }> }) {
  const settable = db.props.filter((p) => !['formula', 'rollup', 'createdTime', 'createdBy', 'editedTime', 'editedBy', 'button', 'id', 'file'].includes(p.type));
  const patch = (i: number, a: Action) => onChange(actions.map((x, j) => (j === i ? a : x)));
  return (
    <div className="db-actions">
      <p className="db-group-label">Then</p>
      {actions.map((a, i) => {
        const prop = settable.find((p) => p.id === a.prop);
        return (
          <div key={i} className="db-action">
            <select aria-label="Action" value={a.kind} onChange={(e) => patch(i, e.target.value === 'notify' ? { kind: 'notify', user: 'creator', text: '' } : { kind: 'setProp' })}>
              <option value="setProp">Set property</option><option value="notify">Notify</option>
            </select>
            {a.kind === 'setProp' ? (
              <>
                <select aria-label="Property" value={a.prop ?? ''} onChange={(e) => patch(i, { kind: 'setProp', prop: e.target.value, value: null })}>
                  <option value="">Property…</option>{settable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {prop && <ValueInput prop={prop} value={a.value ?? null} onChange={(v) => patch(i, { ...a, value: v })} />}
              </>
            ) : (
              <>
                <select aria-label="Who" value={a.user ?? 'creator'} onChange={(e) => patch(i, { ...a, user: e.target.value })}>
                  <option value="creator">The row’s creator</option>
                  {Object.entries(users).filter(([, u]) => !u.bot && !u.inactive).map(([id, u]) => <option key={id} value={id}>{u.name}</option>)}
                </select>
                <input aria-label="Message" placeholder="Message" value={a.text ?? ''} onChange={(e) => patch(i, { ...a, text: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
              </>
            )}
            <button className="icon-btn" aria-label="Remove action" onClick={() => onChange(actions.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      {actions.length < 10 && <button className="db-add" onClick={() => onChange([...actions, { kind: 'setProp' }])}>+ Add an action</button>}
    </div>
  );
}

// A way to type a value for a property, used in actions and filters.
export function ValueInput({ prop, value, onChange }: { prop: Property; value: PropValue; onChange: (v: PropValue) => void }) {
  if (prop.type === 'select' || prop.type === 'status')
    return <select aria-label="Value" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)}><option value="">Empty</option>{prop.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
  if (prop.type === 'multi')
    return <select aria-label="Value" value={Array.isArray(value) ? (value as string[])[0] ?? '' : ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : null)}><option value="">Empty</option>{prop.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
  if (prop.type === 'checkbox')
    return <select aria-label="Value" value={value === true ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}><option value="yes">Checked</option><option value="no">Unchecked</option></select>;
  if (prop.type === 'number')
    return <input aria-label="Value" type="number" value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />;
  if (prop.type === 'date')
    return <input aria-label="Value" type="date" value={typeof value === 'object' && value && !Array.isArray(value) ? value.start.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value ? { start: e.target.value } : null)} />;
  return <input aria-label="Value" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
}
