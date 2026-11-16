import { useState } from 'react';
import type { ClientEvent, Snapshot, WorkspaceSummary } from '../types.ts';
import { Modal } from './Modals.tsx';
import '../apple.css';

export const wsInitials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export function WorkspaceTile({ ws, size = 36, active }: { ws: Pick<WorkspaceSummary, 'name' | 'color'>; size?: number; active?: boolean }) {
  return (
    <span className={`ws-tile ${active ? 'active' : ''}`} style={{ width: size, height: size, background: ws.color, fontSize: size * 0.4 }} aria-hidden>
      {wsInitials(ws.name)}
    </span>
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
