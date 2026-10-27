import { useState } from 'react';
import type { ClientEvent, Snapshot, WorkspaceSummary } from '../types.ts';
import { Modal } from './Modals.tsx';

export const wsInitials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export function WorkspaceTile({ ws, size = 36, active }: { ws: Pick<WorkspaceSummary, 'name' | 'color'>; size?: number; active?: boolean }) {
  return (
    <span className={`ws-tile ${active ? 'active' : ''}`} style={{ width: size, height: size, background: ws.color, fontSize: size * 0.4 }} aria-hidden>
      {wsInitials(ws.name)}
    </span>
  );
}

// The column of workspace tiles at the top of the rail: one per workspace you're in, then "+".
export function WorkspaceSwitcher({ current, mine, onSwitch, onCreate, onFind }: {
  current: Snapshot['workspace'];
  mine: WorkspaceSummary[];
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onFind: () => void;
}) {
  const list = mine.length ? mine : [{ ...current, members: 0, inviteOnly: false }];
  return (
    <div className="ws-switcher" role="list" aria-label="Workspaces">
      {list.map((w) => (
        <button key={w.id} role="listitem" className={`ws-switch ${w.id === current.id ? 'on' : ''}`} title={w.name} aria-current={w.id === current.id} onClick={() => w.id !== current.id && onSwitch(w.id)}>
          <WorkspaceTile ws={w} active={w.id === current.id} />
        </button>
      ))}
      <button className="ws-switch add" title="Add a workspace" aria-label="Add a workspace" onClick={onCreate}>＋</button>
      <button className="ws-switch find" title="Find workspaces to join" aria-label="Find workspaces" onClick={onFind}>⌕</button>
    </div>
  );
}

export function CreateWorkspaceModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Create a workspace" onClose={onClose}>
      <p className="muted">A workspace is a separate home for a team, with its own channels, people and settings. You’ll be its owner, and it starts invite-only.</p>
      <label>
        Workspace name
        <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Studio" onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim())} />
      </label>
      {name.trim() && (
        <div className="ws-preview"><WorkspaceTile ws={{ name, color: '#7c5cff' }} size={44} /><strong>{name.trim()}</strong></div>
      )}
      <button className="send-btn" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>Create workspace</button>
    </Modal>
  );
}

export function FindWorkspacesModal({ discover, onClose, onJoin }: { discover: WorkspaceSummary[]; onClose: () => void; onJoin: (id: string) => void }) {
  return (
    <Modal title="Find workspaces" onClose={onClose}>
      {discover.length === 0 ? (
        <p className="muted">No open workspaces to join right now. Ask a teammate for an invite link, or create your own.</p>
      ) : (
        <div className="ws-list">
          {discover.map((w) => (
            <div key={w.id} className="ws-row">
              <WorkspaceTile ws={w} size={40} />
              <div className="grow"><strong>{w.name}</strong><small className="muted">{w.members} {w.members === 1 ? 'member' : 'members'} · open to join</small></div>
              <button className="send-btn" onClick={() => onJoin(w.id)}>Join</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Invite teammates: open workspaces share a plain link; invite-only ones need an admin-made code.
export function InviteModal({ snap, send, onClose }: { snap: Snapshot; send: (ev: ClientEvent) => void; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const inviteOnly = !!snap.settings.inviteOnly;
  const isAdmin = ['owner', 'admin'].includes(snap.users[snap.me]?.role ?? '');
  const live = (snap.admin?.invites ?? []).filter((i) => !i.revoked);
  const latest = live[live.length - 1];
  const link = inviteOnly ? (latest ? `${location.origin}/?invite=${latest.code}` : '') : `${location.origin}/?ws=${snap.workspace.id}`;
  const copy = () => { void navigator.clipboard?.writeText(link); setCopied(link); };
  return (
    <Modal title={`Invite people to ${snap.workspace.name}`} onClose={onClose}>
      {inviteOnly && !isAdmin ? (
        <p className="muted">This workspace is invite-only. Ask an owner or admin for an invite link.</p>
      ) : (
        <>
          <p className="muted">{inviteOnly ? 'Anyone with this link can join after signing in with GitHub or Google.' : 'This workspace is open: anyone who signs in can join from this link.'}</p>
          {link ? (
            <div className="invite-link">
              <code>{link}</code>
              <button className="send-btn" onClick={copy}>{copied === link ? 'Copied' : 'Copy link'}</button>
            </div>
          ) : (
            <button className="send-btn" onClick={() => send({ t: 'inviteCreate' })}>Create invite link</button>
          )}
          {inviteOnly && latest && <button className="ghost-btn" onClick={() => send({ t: 'inviteCreate' })}>Create a new link</button>}
        </>
      )}
    </Modal>
  );
}

// Shown when you're signed in but not in any workspace you can open: pick one or start your own.
export function WorkspacePicker({ message, mine, discover, onSwitch, onCreate, onInvite, onSignOut }: {
  message?: string;
  mine: WorkspaceSummary[];
  discover: WorkspaceSummary[];
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onInvite: (code: string) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <div className="ws-picker">
      <div className="ws-picker-card">
        <h1>Choose a workspace</h1>
        {message && <p className="login-error">{message}</p>}
        {[...mine.map((w) => ({ w, label: 'Open' })), ...discover.map((w) => ({ w, label: 'Join' }))].map(({ w, label }) => (
          <div key={w.id} className="ws-row">
            <WorkspaceTile ws={w} size={40} />
            <div className="grow"><strong>{w.name}</strong><small className="muted">{w.members} {w.members === 1 ? 'member' : 'members'}</small></div>
            <button className="send-btn" onClick={() => onSwitch(w.id)}>{label}</button>
          </div>
        ))}
        <form className="ws-create-inline" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
          <label>
            Or create a new workspace
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
          </label>
          <button className="send-btn" disabled={!name.trim()}>Create workspace</button>
        </form>
        <form className="ws-create-inline" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onInvite(code.trim()); }}>
          <label>
            Have an invite code?
            <input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="Paste it here" />
          </label>
          <button className="ghost-btn" disabled={!code.trim()}>Join with invite</button>
        </form>
        <button className="ghost-btn" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
