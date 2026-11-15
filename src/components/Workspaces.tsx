import { useState } from 'react';
import type { ClientEvent, Snapshot, WorkspaceSummary } from '../types.ts';
import { Icon } from './Icon.tsx';
import { Modal } from './Modals.tsx';
import { LogoMark } from './LogoIntro.tsx';
import { Aurora } from './Aurora.tsx';
import { moveBefore, nudge, orderBy, useReorder, useSavedOrder, WORKSPACE_ORDER_KEY } from '../dnd.ts';
import '../apple.css';
import '../dnd.css';

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
export function WorkspaceSwitcher({ current, mine, onSwitch, onHome, onCreate, onFind }: {
  current: Snapshot['workspace'];
  mine: WorkspaceSummary[];
  onSwitch: (id: string) => void;
  onHome?: () => void;
  onCreate: () => void;
  onFind: () => void;
}) {
  // Drag a tile to put your workspaces in your own order (remembered on this device, same order as on Home).
  const [saved, saveOrder] = useSavedOrder(WORKSPACE_ORDER_KEY);
  const list = orderBy(mine.length ? mine : [{ ...current, members: 0, inviteOnly: false }], (w) => w.id, saved);
  const ids = list.map((w) => w.id);
  const order = useReorder((from, before) => saveOrder(moveBefore(ids, from, before)));
  return (
    <div className="ws-switcher" role="list" aria-label="Workspaces">
      {onHome && <button className="ws-switch home" title="Home" aria-label="Home" onClick={onHome}><Icon n="home" /></button>}
      {list.map((w) => (
        <button
          key={w.id}
          role="listitem"
          className={`ws-switch ${w.id === current.id ? 'on' : ''} ${order.classOf(w.id)}`}
          title={`${w.name}${list.length > 1 ? ' (drag to reorder)' : ''}`}
          aria-current={w.id === current.id}
          onClick={() => w.id !== current.id && onSwitch(w.id)}
          {...order.handleProps(w.id)}
          {...order.targetProps(w.id)}
          {...order.keyProps((d) => saveOrder(nudge(ids, w.id, d)), true)}
        >
          <WorkspaceTile ws={w} active={w.id === current.id} />
        </button>
      ))}
      <button className="ws-switch add" title="Add a workspace" aria-label="Add a workspace" onClick={onCreate}><Icon n="plus" /></button>
      <button className="ws-switch find" title="Find workspaces to join" aria-label="Find workspaces" onClick={onFind}><Icon n="search" /></button>
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
        <div className="ws-preview"><WorkspaceTile ws={{ name, color: '#1f5bd8' }} size={44} /><strong>{name.trim()}</strong></div>
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
              <button className="ghost-btn" onClick={() => onJoin(w.id)}>Join</button>
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
      <Aurora motes={18} />
      <div className="ap-sky" aria-hidden />
      <header className="ap-si-nav">
        <span className="ap-brand"><LogoMark size={22} />Relay</span>
        <button className="ap-link-btn" onClick={onSignOut}>Sign out</button>
      </header>
      <div className="ws-picker-card">
        <h1>Choose a workspace</h1>
        <p className="ws-picker-sub">Open one you belong to, join an open one, or start your own.</p>
        {message && <p className="login-error">{message}</p>}
        {mine.length > 0 && (
          <>
            <h2 className="ws-section">Your workspaces</h2>
            <div className="ws-group">
              {mine.map((w) => (
                <div key={w.id} className="ws-row">
                  <WorkspaceTile ws={w} size={40} />
                  <div className="grow"><strong>{w.name}</strong><small className="muted">{w.members} {w.members === 1 ? 'member' : 'members'}</small></div>
                  <span className="ws-lamp" title="You are a member" />
                  <button className="ws-open" onClick={() => onSwitch(w.id)}>Open</button>
                </div>
              ))}
            </div>
          </>
        )}
        {discover.length > 0 && (
          <>
            <h2 className="ws-section">Open to join</h2>
            <div className="ws-group">
              {discover.map((w) => (
                <div key={w.id} className="ws-row">
                  <WorkspaceTile ws={w} size={40} />
                  <div className="grow"><strong>{w.name}</strong><small className="muted">{w.members} {w.members === 1 ? 'member' : 'members'}</small></div>
                  <button className="ws-open" onClick={() => onSwitch(w.id)}>Join</button>
                </div>
              ))}
            </div>
          </>
        )}
        <form className="ws-create-inline" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
          <label>
            Create a workspace
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
          </label>
          <button className="ap-pill blue" disabled={!name.trim()}>Create workspace</button>
        </form>
        <form className="ws-create-inline" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onInvite(code.trim()); }}>
          <label>
            Join with an invite code
            <input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
          </label>
          <button className="ap-pill quiet" disabled={!code.trim()}>Join with invite</button>
        </form>
      </div>
    </div>
  );
}
