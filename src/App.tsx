import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ctx } from './ctx.ts';
import { channelLabel, RichText } from './format.tsx';
import { getDevSession, saveDevSession, useAuthToken, useLastRead, useRelay, useUnread } from './store.ts';
import { authEnabled } from './supabase.ts';
import { Login } from './components/Login.tsx';
import { Landing } from './components/Landing.tsx';
import { gsap } from 'gsap';
import { pageTransition } from './transition.ts';
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
import { AdminModal, TermsGate } from './components/Admin.tsx';
import { ListPanel } from './components/Lists.tsx';
import { canPost, isAdmin, mentionsUser } from './premium.ts';
import { dndPresets, useDnd, useMessageAlerts } from './notify.ts';

type Modal = null | 'search' | 'new' | 'profile' | 'plan' | 'scheduled' | 'workflows' | 'admin' | { schedule: string };
type Panel = null | { kind: 'thread'; id: string } | { kind: 'canvas' } | { kind: 'list' } | { kind: 'details' };
type View = 'channel' | 'saved' | 'mentions';

const untilLabel = (ts: number) => new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const inviteFromUrl = () => new URLSearchParams(window.location.search).get('invite') ?? '';

export default function App() {
  const { token, ready, signOut } = useAuthToken();
  const [devSession, setDevSession] = useState(getDevSession);
  const [invite, setInvite] = useState(inviteFromUrl);
  const [showLogin, setShowLogin] = useState(() => !!inviteFromUrl());
  // In auth mode the token comes from Supabase; in dev mode from localStorage.
  const session = authEnabled ? (token ? { token, invite } : null) : devSession && { ...devSession, invite: invite || devSession.invite };
  const { snap, typing, error, authError, analytics, connected, send, clearError } = useRelay(session);
  const leave = () => {
    void signOut();
    setDevSession(null);
  };
  const { lastRead, markRead } = useLastRead();
  const unread = useUnread(snap, lastRead);
  const [active, setActive] = useState('general');
  const [view, setView] = useState<View>('channel');
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('relay.theme') ?? 'switchboard');
  // Phone layout: the channel list is its own screen, opened from the header or tab bar.
  const [navOpen, setNavOpen] = useState(false);
  const [dndMenu, setDndMenu] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const dnd = useDnd();
  const alerts = useMessageAlerts(snap, active, dnd.active, (channelId, threadId) => {
    setActive(channelId);
    setView('channel');
    setNavOpen(false);
    setPanel(threadId ? { kind: 'thread', id: threadId } : null);
  });

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

  const totalUnread = Object.values(unread).reduce((n, u) => n + (u.mentions || 0), 0);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) Relay` : 'Relay';
  }, [totalUnread]);

  const channelMessages = useMemo(
    () => (snap ? snap.messages.filter((m) => m.channelId === active && !m.threadId) : []),
    [snap, active],
  );

  // Workspace entrance: chrome slides in once, then each channel switch staggers its messages in.
  const inWorkspace = !!snap && !!session && !authError;
  useEffect(() => {
    if (!inWorkspace || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // clearProps hands transforms back to CSS when done; rail buttons and sidebar items have CSS
    // transform transitions that otherwise fight the tween and leave them stuck part-way.
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } });
    tl.from('.shell > header', { y: -30, opacity: 0, duration: 0.6 })
      .from('.rail > *', { x: -24, opacity: 0, duration: 0.5, stagger: 0.04 }, '-=0.4')
      .from('.sidebar', { x: -40, opacity: 0, duration: 0.6 }, '-=0.5')
      .from('.side-item, .side-section > *', { x: -16, opacity: 0, duration: 0.4, stagger: 0.02 }, '-=0.4')
      .from('.main', { y: 30, opacity: 0, duration: 0.7 }, '-=0.6');
    return () => { tl.revert(); };
  }, [inWorkspace]);
  useEffect(() => {
    if (!inWorkspace || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rows = gsap.utils.toArray<HTMLElement>('.main .message-list > *').slice(-30);
    const tween = gsap.fromTo(rows, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.025, ease: 'power3.out', clearProps: 'transform,opacity' });
    gsap.fromTo('.channel-head', { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out', clearProps: 'transform,opacity' });
    return () => { tween.kill(); };
  }, [inWorkspace, active, view]);

  if (!session || authError) {
    if (!ready) return <div className="welcome"><div className="logo">R</div></div>;
    if (!showLogin && !authError) return <Landing onGetStarted={() => pageTransition(() => setShowLogin(true))} />;
    return (
      <Login
        onBack={authError ? undefined : () => pageTransition(() => setShowLogin(false))}
        invite={invite}
        onInvite={setInvite}
        error={authError?.message}
        signedIn={!!session && authError?.code === 'invite-required'}
        onDevEnter={(tok, inv) => pageTransition(() => { setInvite(inv); setDevSession(saveDevSession(tok, inv)); })}
        onSignOut={leave}
      />
    );
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

  const openChannel = (id: string) => {
    setActive(id);
    setView('channel');
    setPanel(null);
    setNavOpen(false);
  };
  const showView = (v: View) => {
    setView(v);
    setNavOpen(false);
  };
  const section = (key: string, label: string, actions?: ReactNode) => (
    <div className="side-section">
      <button className={`side-toggle ${collapsed[key] ? 'closed' : ''}`} aria-expanded={!collapsed[key]} onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}>
        <i aria-hidden>▾</i> {label}
      </button>
      {actions && <span>{actions}</span>}
    </div>
  );
  const openThread = (id: string | null) => setPanel(id ? { kind: 'thread', id } : null);
  const togglePanel = (kind: 'canvas' | 'list' | 'details') => setPanel(panel?.kind === kind ? null : { kind });

  const ctx = { snap, send, typing, openThread, openChannel, analytics };
  const admin = isAdmin(me);
  const sectioned = new Set(snap.sections.flatMap((sec) => sec.channelIds));
  const addSection = () => {
    const name = prompt('Name the new sidebar section');
    if (name?.trim()) send({ t: 'sections', sections: [...snap.sections, { id: crypto.randomUUID(), name: name.trim(), channelIds: [] }] });
  };
  const removeSection = (id: string) => send({ t: 'sections', sections: snap.sections.filter((sec) => sec.id !== id) });

  const dmWith = (userId: string) => {
    const existing = dms.find((d) => d.members.includes(userId));
    if (existing) openChannel(existing.id);
    else {
      send({ t: 'openDM', userId });
      setTimeout(() => openChannel(`dm-${[snap.me, userId].sort().join('-')}`), 150);
    }
  };

  const savedMessages = snap.messages.filter((m) => snap.saved.includes(m.id));
  const mentionMessages = snap.messages.filter((m) => mentionsUser(m.text, snap.me, snap.groups) && !m.system);

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
      <div className={`shell ${navOpen ? 'nav-open' : ''} ${panel ? 'has-panel' : ''}`}>
        <header className="topbar">
          <button className="icon-btn nav-toggle" aria-label="Show channels" onClick={() => setNavOpen(!navOpen)}>☰</button>
          <button className="omnibar" onClick={() => setModal('search')}>
            <span aria-hidden>⌕</span>
            <span className="grow">Search {snap.workspace.name}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            {alerts.permission === 'default' && (
              <button className="chip-btn" onClick={() => void alerts.request()} title="Get alerts for DMs, mentions and replies">🔔 <span>Turn on alerts</span></button>
            )}
            <div className="menu-anchor">
              <button
                className={`icon-btn ${dnd.active ? 'lit' : ''}`}
                aria-label="Do not disturb"
                aria-expanded={dndMenu}
                title={dnd.active ? `Notifications paused until ${untilLabel(dnd.until)}` : 'Pause notifications'}
                onClick={() => setDndMenu(!dndMenu)}
              >
                {dnd.active ? '🌙' : '🔕'}
              </button>
              {dndMenu && (
                <div className="menu" role="menu">
                  <p className="menu-title">{dnd.active ? `Paused until ${untilLabel(dnd.until)}` : 'Pause notifications for…'}</p>
                  {dndPresets().map((p) => (
                    <button key={p.label} role="menuitem" onClick={() => { dnd.setUntil(p.until); setDndMenu(false); }}>{p.label}</button>
                  ))}
                  {dnd.active && <button role="menuitem" className="danger" onClick={() => { dnd.setUntil(0); setDndMenu(false); }}>Resume notifications</button>}
                  {alerts.permission === 'denied' && <p className="menu-note">Alerts are blocked in this browser. Allow them in site settings to get notified.</p>}
                </div>
              )}
            </div>
            <button className="rail-me" title="Profile" onClick={() => setModal('profile')}>
              <Avatar user={me} size={30} online={connected} />
              {dnd.active && <i className="dnd-badge" aria-hidden>🌙</i>}
            </button>
          </div>
        </header>

      <div className="app">
        <nav className="rail">
          <div className="logo small" title={snap.workspace.name}>R</div>
          <button className={`rail-btn ${view === 'channel' ? 'active' : ''}`} title="Home" onClick={() => showView('channel')}>🏠<span>Home</span></button>
          <button className={`rail-btn ${view === 'mentions' ? 'active' : ''}`} title="Mentions" onClick={() => showView('mentions')}>@<span>Activity</span></button>
          <button className={`rail-btn ${view === 'saved' ? 'active' : ''}`} title="Saved for later" onClick={() => showView('saved')}>★<span>Later</span></button>
          <button className="rail-btn" title="Workflows" onClick={() => setModal('workflows')}>⚡<span>Flows</span></button>
          <button className="rail-btn" title="Scheduled messages" onClick={() => setModal('scheduled')}>⏱<span>Queue</span>{snap.scheduled.length > 0 && <b className="rail-badge">{snap.scheduled.length}</b>}</button>
          <span className="spacer" />
          {admin && (
            <button className="rail-btn" title="Admin console" onClick={() => setModal('admin')}>
              🛡<span>Admin</span>{(snap.admin?.flags.length ?? 0) > 0 && <b className="rail-badge">{snap.admin?.flags.length}</b>}
            </button>
          )}
          <button className="rail-btn" title="Plan" onClick={() => setModal('plan')}>💎<span>Plan</span></button>
          <button className="rail-btn signout-btn" title="Sign out" onClick={leave}>⎋<span>Exit</span></button>
        </nav>

        <aside className="sidebar">
          <header>
            <h2>{snap.workspace.name}</h2>
            {me?.role && me.role !== 'member' && <span className="badge">{me.role}</span>}
            <span className="spacer" />
            <button className="icon-btn compose-btn" title="Create channel" onClick={() => setModal('new')}>✎</button>
          </header>
          <div className="side-quick">
            <button className={view === 'mentions' ? 'on' : ''} onClick={() => showView('mentions')}>@ Mentions</button>
            <button className={view === 'saved' ? 'on' : ''} onClick={() => showView('saved')}>★ Later</button>
            <button onClick={() => send({ t: 'send', channelId: ch?.id ?? 'general', text: '/recap' })}>📰 Recap</button>
          </div>
          <div className="side-scroll">
            {snap.sections.map((sec) => (
              <div key={sec.id}>
                {section(sec.id, sec.name, <button title="Remove section (channels move back to Channels)" onClick={() => removeSection(sec.id)}>×</button>)}
                {!collapsed[sec.id] && sec.channelIds.map((id) => snap.channels[id]).filter((c) => c && c.members.includes(snap.me)).map(sidebarItem)}
                {!collapsed[sec.id] && sec.channelIds.length === 0 && <p className="muted small side-hint">Move channels here from a channel's details.</p>}
              </div>
            ))}
            {section('channels', 'Channels', <>
              <button title="New sidebar section" onClick={addSection}>⊞</button>
              <button title="Create channel" onClick={() => setModal('new')}>＋</button>
            </>)}
            {!collapsed.channels && joined.filter((c) => !sectioned.has(c.id)).map(sidebarItem)}
            {browse.length > 0 && section('browse', 'Browse')}
            {!collapsed.browse && browse.map(sidebarItem)}
            {section('dms', 'Direct messages')}
            {!collapsed.dms && dms.map(sidebarItem)}
            {!collapsed.dms && people.filter((u) => !dms.some((d) => d.members.includes(u.id))).map((u) => (
              <button key={u.id} className="side-item" onClick={() => dmWith(u.id)}>
                <span className="hash"><i className={`dot ${snap.online.includes(u.id) ? 'on' : ''}`} /></span>
                <span className="label">{u.name}</span>
              </button>
            ))}
          </div>
        </aside>
        <button className="nav-scrim" aria-label="Close channels" tabIndex={-1} onClick={() => setNavOpen(false)} />

        <main className="main">
          <div className="main-bg" aria-hidden>
            <video src="/bg/silver-line-waves.mp4" poster="/bg/silver-line-waves.jpg" autoPlay muted loop playsInline preload="metadata" />
          </div>
          {!connected && <div className="banner">Reconnecting…</div>}
          {error && <div className="banner error" onClick={clearError}>{error} (click to dismiss)</div>}
          {view === 'saved' || view === 'mentions' ? (
            <>
              <header className="channel-head"><div className="channel-title"><h2>{view === 'saved' ? '★ Later' : '@ Mentions'}</h2></div></header>
              <div className="feed">
                {(view === 'saved' ? savedMessages : mentionMessages).length === 0 && (
                  <div className="empty">
                    <div className="empty-mark" aria-hidden>{view === 'saved' ? '★' : '@'}</div>
                    <h3>{view === 'saved' ? 'Nothing saved yet' : 'No mentions yet'}</h3>
                    <p className="muted">{view === 'saved' ? 'Hover a message and press ☆ to keep it here.' : 'When someone @mentions you, it lands here.'}</p>
                  </div>
                )}
                {(view === 'saved' ? savedMessages : mentionMessages).slice().reverse().map((m) => (
                  <button key={m.id} className="feed-item" onClick={() => { openChannel(m.channelId); if (m.threadId) openThread(m.threadId); }}>
                    <small>{snap.users[m.userId]?.name} in {channelLabel(snap.channels[m.channelId], snap.users, snap.me)}</small>
                    <RichText text={m.text} users={snap.users} groups={snap.groups} />
                  </button>
                ))}
              </div>
            </>
          ) : ch ? (
            <>
              <header className="channel-head">
                <div className="channel-title">
                  <h2>{ch.kind === 'dm' ? '' : ch.kind === 'private' ? '🔒 ' : '# '}{channelLabel(ch, snap.users, snap.me)}</h2>
                  {ch.topic && <p className="topic">{ch.topic}</p>}
                </div>
                <div className="head-actions">
                  <button className="huddle-btn" onClick={() => send({ t: 'huddle', channelId: ch.id, action: 'join' })}>🎧 <span>Huddle</span></button>
                  <button className="member-stack" title="Members" onClick={() => togglePanel('details')}>
                    {ch.members.slice(0, 3).map((id) => <Avatar key={id} user={snap.users[id]} size={22} />)}
                    <b>{ch.members.length}</b>
                  </button>
                </div>
                <nav className="channel-tabs" aria-label="Channel views">
                  <button className={!panel || panel.kind === 'thread' || panel.kind === 'details' ? 'on' : ''} onClick={() => setPanel(null)}>💬 Messages</button>
                  <button className={panel?.kind === 'canvas' ? 'on' : ''} onClick={() => togglePanel('canvas')}>📄 Canvas</button>
                  <button className={panel?.kind === 'list' ? 'on' : ''} onClick={() => togglePanel('list')}>☑ List</button>
                  <button onClick={() => send({ t: 'send', channelId: ch.id, text: '/summarize' })}>✨ Recap</button>
                </nav>
              </header>
              <HuddleBar channelId={ch.id} />
              {channelMessages.length === 0 ? (
                <div className="empty">
                  <div className="empty-mark" aria-hidden>{ch.kind === 'dm' ? '👋' : '#'}</div>
                  <h3>This is the very beginning of {ch.kind === 'dm' ? 'your conversation' : `#${ch.name}`}</h3>
                  <p className="muted">Say hi, share a file, or try <code>/remind me stretch in 10m</code>.</p>
                </div>
              ) : (
                <MessageList messages={channelMessages} />
              )}
              <div className="typing">
                {typingNow.length > 0 && (
                  <>
                    <i className="typing-dots" aria-hidden><b /><b /><b /></i>
                    {`${typingNow.join(', ')} ${typingNow.length > 1 ? 'are' : 'is'} typing`}
                  </>
                )}
              </div>
              {(isMember || ch.kind === 'dm') && !canPost(ch, me) ? (
                <div className="join-bar">
                  <span>📣 Only admins can post in #{ch.name}. You can still reply in threads.</span>
                </div>
              ) : isMember || ch.kind === 'dm' ? (
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
        {panel?.kind === 'list' && ch && <ListPanel channelId={ch.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'details' && ch && <DetailsPanel channelId={ch.id} onClose={() => setPanel(null)} />}
      </div>

        <nav className="tabbar" aria-label="Sections">
          <button className={navOpen ? 'on' : ''} onClick={() => setNavOpen(true)}>🏠<span>Home</span>{totalUnread > 0 && <b className="rail-badge">{totalUnread}</b>}</button>
          <button className={!navOpen && view === 'channel' ? 'on' : ''} onClick={() => showView('channel')}>💬<span>Chat</span></button>
          <button className={!navOpen && view === 'mentions' ? 'on' : ''} onClick={() => showView('mentions')}>@<span>Activity</span></button>
          <button className={!navOpen && view === 'saved' ? 'on' : ''} onClick={() => showView('saved')}>★<span>Later</span></button>
          <button onClick={() => setModal('profile')}>🙂<span>You</span></button>
        </nav>
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
      {modal === 'admin' && admin && <AdminModal onClose={() => setModal(null)} />}
      <TermsGate />
      {typeof modal === 'object' && modal && 'schedule' in modal && ch && (
        <SchedulePicker text={modal.schedule} channelId={ch.id} onClose={() => setModal(null)} />
      )}
    </Ctx.Provider>
  );
}
