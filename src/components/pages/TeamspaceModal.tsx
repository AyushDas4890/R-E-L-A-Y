// Teamspaces: the places pages live. Browse, join, create and manage them.
import { useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { Teamspace } from '../../types.ts';
import { isAdmin } from '../../premium.ts';
import { Modal } from '../db/DbSettings.tsx';

const KINDS: [Teamspace['kind'], string, string][] = [
  ['open', 'Open', 'Anyone in the workspace can see it and join. Non-members can read its pages.'],
  ['closed', 'Closed', 'Anyone can see it exists, but only members can open its pages. Owners add members.'],
  ['private', 'Private', 'Only members can see it or its pages.'],
];

export function TeamspaceModal({ onClose }: { onClose: () => void }) {
  const { snap, send } = useRelayCtx();
  const me = snap.users[snap.me];
  const admin = isAdmin(me);
  const guest = me?.role === 'guest';
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👥');
  const [kind, setKind] = useState<Teamspace['kind']>('open');
  const space = snap.teamspaces.find((s) => s.id === sel);
  const owns = (s: Teamspace) => s.members[snap.me] === 'owner';
  const manage = (s: Teamspace) => s.kind !== 'default' && (owns(s) || (admin && s.kind !== 'private'));
  const people = Object.values(snap.users).filter((u) => !u.bot && !u.inactive && u.role !== 'guest');

  return (
    <Modal title="Teamspaces" onClose={onClose}>
      <div className="db-modal-body">
        {!space ? (
          <>
            <ul className="share-list">
              {snap.teamspaces.map((s) => (
                <li key={s.id}>
                  <button className="ts-name" onClick={() => setSel(s.id)}><span aria-hidden>{s.icon}</span> <b>{s.name}</b><small>{s.kind === 'default' ? 'Everyone' : `${s.kind} · ${Object.keys(s.members).length} member${Object.keys(s.members).length === 1 ? '' : 's'}`}</small></button>
                  <span>
                    {s.kind === 'open' && !s.members[snap.me] && !guest && <button className="ghost-btn" onClick={() => send({ t: 'teamspace', op: 'join', id: s.id })}>Join</button>}
                    {s.members[snap.me] && s.kind !== 'default' && <button className="ghost-btn" onClick={() => send({ t: 'teamspace', op: 'leave', id: s.id })}>Leave</button>}
                    {s.members[snap.me] && <span className="muted">{owns(s) ? 'Owner' : 'Member'}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {!guest && (
              <form className="ts-create" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { send({ t: 'teamspace', op: 'create', name, icon, kind }); setName(''); } }}>
                <h3>New teamspace</h3>
                <div className="db-rule">
                  <input aria-label="Icon" className="ts-icon" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} />
                  <input aria-label="Name" placeholder="Teamspace name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <label className="db-field">Who can find it<select value={kind} onChange={(e) => setKind(e.target.value as Teamspace['kind'])}>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                <p className="muted db-note">{KINDS.find(([id]) => id === kind)?.[2]}</p>
                <button className="primary" disabled={!name.trim()}>Create teamspace</button>
              </form>
            )}
          </>
        ) : (
          <>
            <button className="ghost-btn" onClick={() => setSel(null)}>← All teamspaces</button>
            <h3>{space.icon} {space.name}</h3>
            {space.kind === 'default' ? <p className="muted">Everyone in the workspace (except guests) is in the default teamspace.</p> : (
              <>
                {manage(space) && (
                  <div className="ts-edit">
                    <label className="db-field">Name<input defaultValue={space.name} onBlur={(e) => e.target.value.trim() && e.target.value !== space.name && send({ t: 'teamspace', op: 'update', id: space.id, name: e.target.value })} /></label>
                    <label className="db-field">Description<input defaultValue={space.description} onBlur={(e) => e.target.value !== space.description && send({ t: 'teamspace', op: 'update', id: space.id, description: e.target.value })} /></label>
                    <label className="db-field">Who can find it<select value={space.kind} onChange={(e) => send({ t: 'teamspace', op: 'update', id: space.id, kind: e.target.value as Teamspace['kind'] })}>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  </div>
                )}
                <p className="db-group-label">Members</p>
                <ul className="share-list">
                  {Object.entries(space.members).map(([uid, role]) => (
                    <li key={uid}>
                      <span><b>{snap.users[uid]?.name ?? 'Someone'}</b></span>
                      {manage(space) ? (
                        <span>
                          <select aria-label={`Role of ${snap.users[uid]?.name}`} value={role} onChange={(e) => send({ t: 'teamspace', op: 'setMember', id: space.id, userId: uid, role: e.target.value as 'owner' | 'member' })}><option value="owner">Owner</option><option value="member">Member</option></select>
                          <button className="icon-btn" aria-label={`Remove ${snap.users[uid]?.name}`} onClick={() => send({ t: 'teamspace', op: 'removeMember', id: space.id, userId: uid })}>✕</button>
                        </span>
                      ) : <span className="muted">{role === 'owner' ? 'Owner' : 'Member'}</span>}
                    </li>
                  ))}
                </ul>
                {manage(space) && (
                  <div className="db-rule">
                    <select aria-label="Add a member" value="" onChange={(e) => e.target.value && send({ t: 'teamspace', op: 'setMember', id: space.id, userId: e.target.value, role: 'member' })}>
                      <option value="">Add a member…</option>
                      {people.filter((u) => !space.members[u.id]).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button className="danger" onClick={() => { if (confirm(`Delete the teamspace “${space.name}”? It must have no pages.`)) { send({ t: 'teamspace', op: 'delete', id: space.id }); setSel(null); } }}>Delete teamspace</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
