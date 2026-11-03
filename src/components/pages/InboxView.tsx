// The inbox: what happened on pages you can open (mentions, comments, replies, shares, assignments),
// next to the existing messages activity.
import { useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { InboxItem } from '../../types.ts';
import { ActivityView } from '../Views.tsx';

const VERB: Record<InboxItem['kind'], string> = {
  mention: 'mentioned you in',
  comment: 'commented on',
  reply: 'replied to you on',
  share: 'shared with you',
  assigned: 'assigned you',
  reminder: 'reminder:',
  notify: 'notified you about',
};
const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function InboxView({ onOpen }: { onOpen: (id: string) => void }) {
  const { snap, send } = useRelayCtx();
  const [tab, setTab] = useState<'updates' | 'messages'>('updates');
  const items = [...snap.inbox].reverse();
  const unread = items.filter((i) => !i.read).length;
  const title = (pageId: string): string => {
    const [pid, rid] = pageId.split('.');
    const n = snap.pages.find((p) => p.id === pid);
    return rid ? `a row in ${n?.title || 'Untitled'}` : n?.title || 'a page';
  };
  return (
    <>
      <header className="channel-head">
        <div className="channel-title"><h2>Inbox</h2></div>
        <nav className="channel-tabs" aria-label="Inbox">
          <button className={tab === 'updates' ? 'on' : ''} onClick={() => setTab('updates')}>Page updates{unread > 0 ? ` (${unread})` : ''}</button>
          <button className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>Messages</button>
        </nav>
      </header>
      {tab === 'messages' ? <ActivityView embedded /> : (
        <div className="feed inbox-list">
          {items.length > 0 && (
            <div className="inbox-tools">
              <button className="ghost-btn" disabled={unread === 0} onClick={() => send({ t: 'inboxRead', id: 'all' })}>Mark all as read</button>
              <button className="ghost-btn" onClick={() => send({ t: 'inboxArchive', id: 'all' })}>Archive all</button>
            </div>
          )}
          {items.length === 0 && <div className="empty-card"><p><b>You’re all caught up</b></p><p className="muted">Mentions, comments, replies, shares and assignments on pages show up here.</p></div>}
          {items.map((i) => (
            <div key={i.id} className={`inbox-item ${i.read ? '' : 'unread'}`}>
              <button className="inbox-main" disabled={!i.pageId} onClick={() => { if (!i.read) send({ t: 'inboxRead', id: i.id }); if (i.pageId) onOpen(i.pageId); }}>
                <span className="inbox-dot" aria-hidden />
                <span><b>{snap.users[i.by]?.name ?? 'Someone'}</b> {VERB[i.kind]} <b>{title(i.pageId)}</b>{i.text && i.kind !== 'share' && i.kind !== 'assigned' ? <small className="inbox-text">{i.text.replace(/@\[([A-Za-z0-9_-]+)\]/g, (_m, id: string) => `@${snap.users[id]?.name ?? 'someone'}`)}</small> : i.text && (i.kind === 'share' || i.kind === 'assigned') && !i.pageId ? <small className="inbox-text">{i.text}</small> : null}</span>
                <time className="muted">{ago(i.at)}</time>
              </button>
              <button className="icon-btn" aria-label="Archive" onClick={() => send({ t: 'inboxArchive', id: i.id })}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
