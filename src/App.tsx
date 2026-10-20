import { useEffect, useMemo, useState } from 'react';
import { Ctx } from './ctx.ts';
import { channelLabel, RichText } from './format.tsx';
import { getIdentity, saveIdentity, useLastRead, useRelay, useUnread } from './store.ts';
import { Avatar } from './components/Avatar.tsx';
import { Composer } from './components/Composer.tsx';
import { HuddleBar } from './components/Huddle.tsx';
import { MessageList } from './components/MessageList.tsx';
import {
  NewChannelModal,
  PlanModal,
  ProfileModal,
  ScheduledModal,
  SchedulePicker,
  SearchPalette,
  WorkflowModal,
} from './components/Modals.tsx';
import { CanvasPanel, DetailsPanel, ThreadPanel } from './components/Panels.tsx';

type Modal = null | 'search' | 'new' | 'profile' | 'plan' | 'scheduled' | 'workflows' | { schedule: string };
type Panel = null | { kind: 'thread'; id: string } | { kind: 'canvas' } | { kind: 'details' };
type View = 'channel' | 'saved' | 'mentions';

function Welcome({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo">R</div>
        <h1>Relay</h1>
        <p>Team chat where every premium feature is already on.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name.trim()); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
          <button className="send-btn" disabled={!name.trim()}>Enter workspace →</button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [identity, setIdentity] = useState(getIdentity);
  const { snap, typing, error, connected, send, clearError } = useRelay(identity);
  const { lastRead, markRead } = useLastRead();
  const unread = useUnread(snap, lastRead);
  const [active, setActive] = useState('general');
  const [view, setView] = useState<View>('channel');
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('relay.theme') ?? 'midnight');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('relay.theme', theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (snap && view === 'channel' && snap.channels[active]) markRead(active);
  }, [active, view, snap?.messages.length]);

  const channelMessages = useMemo(
    () => (snap ? snap.messages.filter((m) => m.channelId === active && !m.threadId) : []),
    [snap, active],
  );

  if (!identity) {
    return <Welcome onDone={(name) => setIdentity(saveIdentity(name))} />;
  }
  if (!snap) {
    return <div className="welcome"><p className="muted">{connected ? 'Loading workspace…' : 'Connecting to Relay server…'}</p></div>;
  }

  const me = snap.users[snap.me];
  const channels = Object.values(snap.channels);
  const joined = channels.filter((c) => c.kind !== 'dm' && c.members.includes(snap.me));
  const browse = channels.filter((c) => c.kind === 'public' && !c.members.includes(snap.me));
  const dms = channels.filter((c) => c.kind === 'dm');
  const people = Object.values(snap.users).filter((u) => u.id !== snap.me && !u.bot);
  const ch = snap.channels[active] ?? snap.channels.general ?? channels[0];
  const typingNow = Object.keys(typing[ch?.id] ?? {}).map((id) => snap.users[id]?.name).filter(Boolean);
  const isMember = ch?.members.includes(snap.me);
  const mentionTag = `<@${snap.me}>`;

  const openChannel = (id: string) => {
    setActive(id);
    setView('channel');
    setPanel(null);
  };
  const openThread = (id: string | null) => setPanel(id ? { kind: 'thread', id } : null);
  const togglePanel = (kind: 'canvas' | 'details') => setPanel(panel?.kind === kind ? null : { kind });

  const ctx = { snap, send, typing, openThread, openChannel };

  const dmWith = (userId: string) => {
    const existing = dms.find((d) => d.members.includes(userId));
    if (existing) openChannel(existing.id);
    else {
      send({ t: 'openDM', userId });
      setTimeout(() => openChannel(`dm-${[snap.me, userId].sort().join('-')}`), 150);
    }
  };

  const savedMessages = snap.messages.filter((m) => snap.saved.includes(m.id));
  const mentionMessages = snap.messages.filter((m) => m.text.includes(mentionTag) && !m.system);

  const sidebarItem = (c: (typeof channels)[number]) => {
    const u = unread[c.id];
    const label = channelLabel(c, snap.users, snap.me);
    const other = c.kind === 'dm' ? c.members.find((m) => m !== snap.me) ?? snap.me : '';
    return (
      <button key={c.id} className={`side-item ${view === 'channel' && c.id === ch?.id ? 'active' : ''} ${u ? 'unread' : ''}`} onClick={() => openChannel(c.id)}>
        <span className="hash">{c.kind === 'dm' ? <i className={`dot ${snap.online.includes(other) ? 'on' : ''}`} /> : c.kind === 'private' ? '🔒' : '#'}</span>
        <span className="label">{label}</span>
        {snap.huddles.some((h) => h.channelId === c.id) && <span title="Huddle live">🎧</span>}
        {u && u.mentions > 0 ? <span className="count">{u.mentions}</span> : u ? <span className="pip" /> : null}
      </button>
    );
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="rail">
          <div className="logo small" title="Relay HQ">R</div>
          <button className={`rail-btn ${view === 'channel' ? 'active' : ''}`} title="Home" onClick={() => setView('channel')}>🏠</button>
          <button className={`rail-btn ${view === 'mentions' ? 'active' : ''}`} title="Mentions" onClick={() => setView('mentions')}>@</button>
          <button className={`rail-btn ${view === 'saved' ? 'active' : ''}`} title="Saved" onClick={() => setView('saved')}>★</button>
          <button className="rail-btn" title="Workflows" onClick={() => setModal('workflows')}>⚡</button>
          <button className="rail-btn" title="Scheduled" onClick={() => setModal('scheduled')}>⏱{snap.scheduled.length > 0 && <b className="rail-badge">{snap.scheduled.length}</b>}</button>
          <span className="spacer" />
          <button className="rail-btn" title="Plan" onClick={() => setModal('plan')}>💎</button>
          <button className="rail-me" title="Profile" onClick={() => setModal('profile')}>
            <Avatar user={me} size={34} online={connected} />
          </button>
        </nav>

        <aside className="sidebar">
          <header>
            <h2>{snap.workspace.name}</h2>
            <span className="plan-pill">PREMIUM</span>
          </header>
          <button className="search-trigger" onClick={() => setModal('search')}>🔍 Search <kbd>⌘K</kbd></button>
          <div className="side-scroll">
            <div className="side-section">
              <span>Channels</span>
              <button title="Create channel" onClick={() => setModal('new')}>＋</button>
            </div>
            {joined.map(sidebarItem)}
            {browse.length > 0 && <div className="side-section"><span>Browse</span></div>}
            {browse.map(sidebarItem)}
            <div className="side-section"><span>Direct messages</span></div>
            {dms.map(sidebarItem)}
            {people.filter((u) => !dms.some((d) => d.members.includes(u.id))).map((u) => (
              <button key={u.id} className="side-item" onClick={() => dmWith(u.id)}>
                <span className="hash"><i className={`dot ${snap.online.includes(u.id) ? 'on' : ''}`} /></span>
                <span className="label">{u.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {!connected && <div className="banner">Reconnecting…</div>}
          {error && <div className="banner error" onClick={clearError}>{error} (click to dismiss)</div>}
          {view === 'saved' || view === 'mentions' ? (
            <>
              <header className="channel-head"><h2>{view === 'saved' ? '★ Saved items' : '@ Mentions'}</h2></header>
              <div className="feed">
                {(view === 'saved' ? savedMessages : mentionMessages).length === 0 && <p className="muted pad">Nothing here yet.</p>}
                {(view === 'saved' ? savedMessages : mentionMessages).slice().reverse().map((m) => (
                  <button key={m.id} className="feed-item" onClick={() => { openChannel(m.channelId); if (m.threadId) openThread(m.threadId); }}>
                    <small>{snap.users[m.userId]?.name} in {channelLabel(snap.channels[m.channelId], snap.users, snap.me)}</small>
                    <RichText text={m.text} users={snap.users} />
                  </button>
                ))}
              </div>
            </>
          ) : ch ? (
            <>
              <header className="channel-head">
                <div>
                  <h2>{ch.kind === 'dm' ? '' : ch.kind === 'private' ? '🔒 ' : '# '}{channelLabel(ch, snap.users, snap.me)}</h2>
                  {ch.topic && <p className="topic">{ch.topic}</p>}
                </div>
                <div className="head-actions">
                  <button className="ghost-btn" onClick={() => send({ t: 'huddle', channelId: ch.id, action: 'join' })}>🎧 Huddle</button>
                  <button className={`ghost-btn ${panel?.kind === 'canvas' ? 'on' : ''}`} onClick={() => togglePanel('canvas')}>📄 Canvas</button>
                  <button className="ghost-btn" onClick={() => send({ t: 'send', channelId: ch.id, text: '/summarize' })}>✨ Recap</button>
                  <button className={`ghost-btn ${panel?.kind === 'details' ? 'on' : ''}`} onClick={() => togglePanel('details')}>
                    👥 {ch.members.length}
                  </button>
                </div>
              </header>
              <HuddleBar channelId={ch.id} />
              {channelMessages.length === 0 ? (
                <div className="empty">
                  <h3>This is the start of {ch.kind === 'dm' ? 'your conversation' : `#${ch.name}`}</h3>
                  <p className="muted">Say hi, share a file, or try <code>/remind me stretch in 10m</code>.</p>
                </div>
              ) : (
                <MessageList messages={channelMessages} />
              )}
              <div className="typing">{typingNow.length > 0 && `${typingNow.join(', ')} ${typingNow.length > 1 ? 'are' : 'is'} typing…`}</div>
              {isMember || ch.kind === 'dm' ? (
                <Composer
                  channelId={ch.id}
                  placeholder={`Message ${ch.kind === 'dm' ? channelLabel(ch, snap.users, snap.me) : '#' + ch.name}`}
                  onSchedule={(text) => setModal({ schedule: text })}
                />
              ) : (
                <div className="join-bar">
                  <span>You're previewing #{ch.name}</span>
                  <button className="send-btn" onClick={() => send({ t: 'join', channelId: ch.id })}>Join channel</button>
                </div>
              )}
            </>
          ) : null}
        </main>

        {panel?.kind === 'thread' && <ThreadPanel parentId={panel.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'canvas' && ch && <CanvasPanel channelId={ch.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'details' && ch && <DetailsPanel channelId={ch.id} onClose={() => setPanel(null)} />}
      </div>

      {modal === 'search' && (
        <SearchPalette
          onClose={() => setModal(null)}
          onPick={(cid, tid) => {
            openChannel(cid);
            if (tid) setPanel({ kind: 'thread', id: tid });
            setModal(null);
          }}
        />
      )}
      {modal === 'new' && <NewChannelModal onClose={() => setModal(null)} />}
      {modal === 'profile' && <ProfileModal onClose={() => setModal(null)} theme={theme} setTheme={setTheme} />}
      {modal === 'plan' && <PlanModal onClose={() => setModal(null)} />}
      {modal === 'scheduled' && <ScheduledModal onClose={() => setModal(null)} />}
      {modal === 'workflows' && <WorkflowModal onClose={() => setModal(null)} />}
      {typeof modal === 'object' && modal && 'schedule' in modal && ch && (
        <SchedulePicker text={modal.schedule} channelId={ch.id} onClose={() => setModal(null)} />
      )}
    </Ctx.Provider>
  );
}
