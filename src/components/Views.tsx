import { useMemo, useState } from 'react';
import type { Message } from '../types.ts';
import { useRelayCtx } from '../ctx.ts';
import { channelLabel, RichText, timeLabel } from '../format.tsx';
import { mentionsUser } from '../premium.ts';
import { Avatar } from './Avatar.tsx';

type ActivityTab = 'all' | 'mentions' | 'threads' | 'dms';

function Empty({ mark, title, text }: { mark: string; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden>{mark}</div>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  );
}

function FeedRow({ m, verb }: { m: Message; verb: string }) {
  const { snap, openChannel, openThread } = useRelayCtx();
  const ch = snap.channels[m.channelId];
  return (
    <button className="feed-item" onClick={() => { openChannel(m.channelId); if (m.threadId) openThread(m.threadId); }}>
      <Avatar user={snap.users[m.userId]} size={36} />
      <div className="feed-body">
        <small><b>{snap.users[m.userId]?.name ?? 'Someone'}</b> {verb} {ch ? channelLabel(ch, snap.users, snap.me) : ''} · {timeLabel(m.ts)}</small>
        <RichText text={m.text} users={snap.users} groups={snap.groups} />
      </div>
    </button>
  );
}

// Activity: everything that's about you, with Slack-style tabs.
export function ActivityView() {
  const { snap } = useRelayCtx();
  const [tab, setTab] = useState<ActivityTab>('all');
  const items = useMemo(() => {
    const myThreads = new Set(snap.messages.filter((m) => m.userId === snap.me && !m.threadId).map((m) => m.id));
    for (const m of snap.messages) if (m.userId === snap.me && m.threadId) myThreads.add(m.threadId);
    const others = snap.messages.filter((m) => m.userId !== snap.me && !m.system);
    const tagged = others.map((m) => {
      const ch = snap.channels[m.channelId];
      const kind: Exclude<ActivityTab, 'all'> | null = mentionsUser(m.text, snap.me, snap.groups)
        ? 'mentions'
        : m.threadId && myThreads.has(m.threadId)
          ? 'threads'
          : ch?.kind === 'dm'
            ? 'dms'
            : null;
      return { m, kind };
    }).filter((x): x is { m: Message; kind: Exclude<ActivityTab, 'all'> } => !!x.kind);
    return tagged.filter((x) => tab === 'all' || x.kind === tab).reverse().slice(0, 100);
  }, [snap.messages, tab]);
  const verbs: Record<ActivityTab, string> = { all: '', mentions: 'mentioned you in', threads: 'replied in a thread in', dms: 'messaged you in' };
  return (
    <>
      <header className="channel-head">
        <div className="channel-title"><h2>Activity</h2></div>
        <nav className="channel-tabs" aria-label="Activity filters">
          {(['all', 'mentions', 'threads', 'dms'] as ActivityTab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ all: 'All', mentions: 'Mentions', threads: 'Threads', dms: 'DMs' }[t]}</button>
          ))}
        </nav>
      </header>
      <div className="feed">
        {items.length === 0 && <Empty mark="🔔" title="You’re all caught up" text="Mentions, replies to your threads and DMs show up here." />}
        {items.map(({ m, kind }) => <FeedRow key={m.id} m={m} verb={verbs[kind]} />)}
      </div>
    </>
  );
}

export function SavedView() {
  const { snap } = useRelayCtx();
  const saved = snap.messages.filter((m) => snap.saved.includes(m.id)).reverse();
  return (
    <>
      <header className="channel-head"><div className="channel-title"><h2>Later</h2><p className="topic">Messages you saved to come back to</p></div></header>
      <div className="feed">
        {saved.length === 0 && <Empty mark="★" title="Nothing saved yet" text="Hover a message and press ☆ to keep it here." />}
        {saved.map((m) => <FeedRow key={m.id} m={m} verb="in" />)}
      </div>
    </>
  );
}

// Direct messages: one row per conversation with its latest line.
export function DmsView({ onNew }: { onNew: () => void }) {
  const { snap, openChannel } = useRelayCtx();
  const rows = Object.values(snap.channels)
    .filter((c) => c.kind === 'dm')
    .map((c) => ({ c, last: [...snap.messages].reverse().find((m) => m.channelId === c.id && !m.threadId) }))
    .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0));
  return (
    <>
      <header className="channel-head">
        <div className="channel-title"><h2>Direct messages</h2></div>
        <div className="head-actions"><button className="send-btn" onClick={onNew}>New message</button></div>
      </header>
      <div className="feed">
        {rows.length === 0 && <Empty mark="💬" title="No conversations yet" text="Start one from the People directory." />}
        {rows.map(({ c, last }) => {
          const other = c.members.find((m) => m !== snap.me) ?? snap.me;
          return (
            <button key={c.id} className="feed-item" onClick={() => openChannel(c.id)}>
              <Avatar user={snap.users[other]} size={36} online={snap.online.includes(other)} />
              <div className="feed-body">
                <small><b>{channelLabel(c, snap.users, snap.me)}</b>{last ? ` · ${timeLabel(last.ts)}` : ''}</small>
                <p className="feed-preview">{last ? `${last.userId === snap.me ? 'You: ' : ''}${last.text.replace(/<@[^>]+>/g, '@…').slice(0, 120)}` : 'No messages yet'}</p>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// People directory: everyone in the workspace, searchable, one click to DM.
export function DirectoryView({ onMessage }: { onMessage: (userId: string) => void }) {
  const { snap } = useRelayCtx();
  const [q, setQ] = useState('');
  const people = Object.values(snap.users)
    .filter((u) => !u.bot && (u.name + ' ' + u.title).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <header className="channel-head">
        <div className="channel-title"><h2>People</h2><p className="topic">{Object.values(snap.users).filter((u) => !u.bot).length} members of {snap.workspace.name}</p></div>
      </header>
      <div className="feed">
        <input className="dir-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or title" aria-label="Search people" />
        <div className="people-grid">
          {people.map((u) => (
            <div key={u.id} className="person-card">
              <Avatar user={u} size={64} online={snap.online.includes(u.id)} />
              <strong>{u.name}{u.id === snap.me ? ' (you)' : ''}</strong>
              <small className="muted">{u.title || (u.role && u.role !== 'member' ? u.role : 'Member')}</small>
              {u.status.text && <small>{u.status.emoji} {u.status.text}</small>}
              {u.id !== snap.me && <button className="ghost-btn" onClick={() => onMessage(u.id)}>Message</button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function HuddlesView() {
  const { snap, send, openChannel } = useRelayCtx();
  return (
    <>
      <header className="channel-head"><div className="channel-title"><h2>Huddles</h2><p className="topic">Live conversations happening now</p></div></header>
      <div className="feed">
        {snap.huddles.length === 0 && <Empty mark="🎧" title="No huddles right now" text="Start one from any channel with the 🎧 button or /huddle." />}
        {snap.huddles.map((h) => {
          const ch = snap.channels[h.channelId];
          if (!ch) return null;
          const joined = h.participants.includes(snap.me);
          return (
            <div key={h.channelId} className="huddle-card">
              <div className="grow">
                <strong>{channelLabel(ch, snap.users, snap.me)}</strong>
                <div className="huddle-people">{h.participants.map((id) => <Avatar key={id} user={snap.users[id]} size={28} />)}</div>
              </div>
              <button className="ghost-btn" onClick={() => openChannel(ch.id)}>Open</button>
              <button className="send-btn" onClick={() => send({ t: 'huddle', channelId: ch.id, action: joined ? 'leave' : 'join' })}>{joined ? 'Leave' : 'Join'}</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
