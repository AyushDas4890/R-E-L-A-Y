import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ctx } from './ctx.ts';
import { channelLabel } from './format.tsx';
import { getDevSession, readKey, saveDevSession, useAuthToken, useLastRead, useRelay, useUnread } from './store.ts';
import { authEnabled } from './supabase.ts';
import { Login } from './components/Login.tsx';
import { Landing } from './components/Landing.tsx';
import { gsap } from 'gsap';
import { pageTransition } from './transition.ts';
import { Avatar } from './components/Avatar.tsx';
import { Composer } from './components/Composer.tsx';
import { HuddleBar } from './components/Huddle.tsx';
import { useHuddleCalls } from './huddle-call.ts';
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
import { ActivityView, DirectoryView, DmsView, HuddlesView, SavedView } from './components/Views.tsx';
import { CreateWorkspaceModal, FindWorkspacesModal, InviteModal, WorkspacePicker, WorkspaceSwitcher, WorkspaceTile } from './components/Workspaces.tsx';
import { canPost, isAdmin } from './premium.ts';
import { dndPresets, useChannelLevels, useDnd, useMessageAlerts, type ChannelLevel } from './notify.ts';
import { useAppearance } from './appearance.ts';
import { Backdrop } from './components/Appearance.tsx';

type Modal = null | 'search' | 'new' | 'profile' | 'plan' | 'scheduled' | 'workflows' | 'admin' | 'invite' | 'createWs' | 'findWs' | { schedule: string };
type Panel = null | { kind: 'thread'; id: string } | { kind: 'canvas' } | { kind: 'list' } | { kind: 'details' };
type View = 'channel' | 'activity' | 'dms' | 'saved' | 'directory' | 'huddles';
type Menu = null | 'workspace' | 'more' | 'create' | 'dnd' | 'bell' | 'addTab' | 'addChannel';
interface Place { view: View; channel: string }

const untilLabel = (ts: number) => new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const params = new URLSearchParams(window.location.search);
const inviteFromUrl = () => params.get('invite') ?? '';
// ?ws=<id> links open a specific (open) workspace; remember it before the socket connects.
if (params.get('ws')) try { localStorage.setItem('relay.workspace', params.get('ws')!); } catch { /* ignore */ }
const LEVEL_LABEL: Record<ChannelLevel, string> = { all: 'All new posts', mentions: 'Just mentions', mute: 'Mute' };

export default function App() {
  const { token, ready, signOut } = useAuthToken();
  const [devSession, setDevSession] = useState(getDevSession);
  const [invite, setInvite] = useState(inviteFromUrl);
  const [showLogin, setShowLogin] = useState(() => !!inviteFromUrl() || window.history.state?.relay === 'signin');
  // Sign-in is its own history entry, so the browser's Back button returns to the landing page
  // instead of leaving the site. (`history` below is the in-app channel history, hence window.history.)
  const showLoginRef = useRef(showLogin);
  showLoginRef.current = showLogin;
  const openLogin = () => {
    if (window.history.state?.relay !== 'signin') window.history.pushState({ relay: 'signin' }, '', location.pathname + location.search);
    pageTransition(() => setShowLogin(true));
  };
  const closeLogin = () => {
    if (window.history.state?.relay === 'signin') window.history.back();
    else pageTransition(() => setShowLogin(false));
  };
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const want = e.state?.relay === 'signin';
      if (showLoginRef.current !== want) pageTransition(() => setShowLogin(want));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // In auth mode the token comes from Supabase; in dev mode from localStorage.
  const session = authEnabled ? (token ? { token, invite } : null) : devSession && { ...devSession, invite: invite || devSession.invite };
  const { snap, typing, error, authError, analytics, workspaces, connected, send, listen, clearError, switchWorkspace } = useRelay(session);
  const calls = useHuddleCalls(send, listen, connected);
  const leave = () => {
    void signOut();
    setDevSession(null);
  };
  const { lastRead, markRead } = useLastRead();
  const unread = useUnread(snap, lastRead);
  // Navigation history, so the top bar's back and forward buttons work like a browser.
  const [history, setHistory] = useState<{ stack: Place[]; at: number }>({ stack: [{ view: 'channel', channel: 'general' }], at: 0 });
  const place = history.stack[history.at];
  const active = place.channel;
  const view = place.view;
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const appearance = useAppearance();
  // Phone layout: the channel list is its own screen, opened from the header or tab bar.
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showBrowse, setShowBrowse] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(() => localStorage.getItem('relay.alertBanner') === 'hidden');
  const dnd = useDnd();
  const levels = useChannelLevels(snap?.workspace.id);

  const go = (to: Partial<Place>) => {
    setHistory(({ stack, at }) => {
      const next = { ...stack[at], ...to };
      if (next.view === stack[at].view && next.channel === stack[at].channel) return { stack, at };
      const kept = stack.slice(0, at + 1).concat(next).slice(-50);
      return { stack: kept, at: kept.length - 1 };
    });
    setNavOpen(false);
    setMenu(null);
  };
  const alerts = useMessageAlerts(snap, active, dnd.active, (channelId, threadId) => {
    go({ view: 'channel', channel: channelId });
    setPanel(threadId ? { kind: 'thread', id: threadId } : null);
  }, levels.levelOf);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal('search');
      }
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new workspace starts at #general with a clean history.
  useEffect(() => {
    if (!snap) return;
    setHistory({ stack: [{ view: 'channel', channel: 'general' }], at: 0 });
    setPanel(null);
  }, [snap?.workspace.id]);

  useEffect(() => {
    if (snap && view === 'channel' && snap.channels[active]) markRead(readKey(snap.workspace.id, active));
  }, [active, view, snap?.messages.length, snap?.workspace.id]);

  const totalUnread = Object.entries(unread).reduce((n, [cid, u]) => n + (levels.levelOf(cid) === 'mute' ? 0 : u.mentions || 0), 0);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) Relay` : snap ? `${snap.workspace.name} · Relay` : 'Relay';
  }, [totalUnread, snap?.workspace.name]);

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
  }, [inWorkspace, snap?.workspace.id]);
  useEffect(() => {
    if (!inWorkspace || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rows = gsap.utils.toArray<HTMLElement>('.main .message-list > *').slice(-30);
    const tween = gsap.fromTo(rows, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.025, ease: 'power3.out', clearProps: 'transform,opacity' });
    gsap.fromTo('.channel-head', { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out', clearProps: 'transform,opacity' });
    return () => { tween.kill(); };
  }, [inWorkspace, active, view]);

  const createWorkspace = (name: string) => {
    send({ t: 'createWorkspace', name });
    setModal(null);
  };

  if (!session || (authError && authError.code === 'auth-required')) {
    if (!ready) return <div className="welcome"><div className="logo">R</div></div>;
    if (!showLogin && !authError) return <Landing onGetStarted={openLogin} />;
    return (
      <Login
        onBack={authError ? undefined : closeLogin}
        invite={invite}
        onInvite={setInvite}
        error={authError?.message}
        signedIn={false}
        onDevEnter={(tok, inv) => pageTransition(() => { setInvite(inv); setDevSession(saveDevSession(tok, inv)); })}
        onSignOut={leave}
      />
    );
  }
  // Signed in, but no workspace we can open: pick one, join with a code, or create one.
  if (authError) {
    return (
      <WorkspacePicker
        message={authError.message}
        mine={workspaces.mine}
        discover={workspaces.discover}
        onSwitch={switchWorkspace}
        onCreate={createWorkspace}
        onInvite={setInvite}
        onSignOut={leave}
      />
    );
  }
  if (!snap) {
    return (
      <div className="welcome">
        <p className="muted">{connected ? 'Loading workspace…' : 'Connecting to Relay server…'}</p>
        {!connected && <p className="muted"><small>The server sleeps when idle and can take up to a minute to wake. This page keeps retrying on its own.</small></p>}
      </div>
    );
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
  const starred = snap.starred.map((id) => snap.channels[id]).filter(Boolean);
  const starredIds = new Set(snap.starred);
  const level = ch ? levels.levelOf(ch.id) : 'mentions';

  const openChannel = (id: string) => {
    go({ view: 'channel', channel: id });
    setPanel(null);
  };
  const showView = (v: View) => go({ view: v });
  const toggleMenu = (m: Menu) => setMenu(menu === m ? null : m);
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

  const ctx = { snap, send, typing, openThread, openChannel, analytics, calls };
  const admin = isAdmin(me);
  const sectioned = new Set(snap.sections.flatMap((sec) => sec.channelIds));
  const addSection = () => {
    const name = prompt('Name the new sidebar section');
    if (name?.trim()) send({ t: 'sections', sections: [...snap.sections, { id: crypto.randomUUID(), name: name.trim(), channelIds: [] }] });
  };
  const removeSection = (id: string) => send({ t: 'sections', sections: snap.sections.filter((sec) => sec.id !== id) });
  const renameWorkspace = () => {
    const name = prompt('Rename this workspace', snap.workspace.name);
    if (name?.trim()) send({ t: 'renameWorkspace', name: name.trim() });
  };

  const dmWith = (userId: string) => {
    const existing = dms.find((d) => d.members.includes(userId) && d.members.length === (userId === snap.me ? 1 : 2));
    if (existing) openChannel(existing.id);
    else {
      send({ t: 'openDM', userId });
      setTimeout(() => openChannel(`dm-${[snap.me, userId].sort().join('-')}`), 150);
    }
  };

  const sidebarItem = (c: (typeof channels)[number]) => {
    const muted = levels.levelOf(c.id) === 'mute';
    const u = muted ? undefined : unread[c.id];
    const label = channelLabel(c, snap.users, snap.me);
    const other = c.kind === 'dm' ? c.members.find((m) => m !== snap.me) ?? snap.me : '';
    return (
      <button key={c.id} className={`side-item ${view === 'channel' && c.id === ch?.id ? 'active' : ''} ${u ? 'unread' : ''} ${muted ? 'muted' : ''}`} onClick={() => openChannel(c.id)}>
        <span className="hash">{c.kind === 'dm' ? <Avatar user={snap.users[other]} size={18} online={snap.online.includes(other)} /> : c.kind === 'private' ? '🔒' : '#'}</span>
        <span className="label">{label}</span>
        {snap.huddles.some((h) => h.channelId === c.id) && <span title="Huddle live">🎧</span>}
        {muted && <span className="side-muted" title="Muted">🔕</span>}
        {u && u.mentions > 0 ? <span className="count">{u.mentions}</span> : u ? <span className="pip" /> : null}
      </button>
    );
  };
  const navItem = (v: View, icon: string, label: string) => (
    <button className={`side-item nav ${view === v ? 'active' : ''}`} onClick={() => showView(v)}>
      <span className="hash" aria-hidden>{icon}</span><span className="label">{label}</span>
      {v === 'huddles' && snap.huddles.length > 0 && <span className="count live">{snap.huddles.length}</span>}
    </button>
  );
  const channelEmpty = channelMessages.filter((m) => !m.system && m.userId !== 'relaybot').length === 0;

  return (
    <Ctx.Provider value={ctx}>
      <div className={`shell ${navOpen ? 'nav-open' : ''} ${panel ? 'has-panel' : ''}`} onClick={() => menu && setMenu(null)}>
        <header className="topbar">
          <button className="icon-btn nav-toggle" aria-label="Show channels" onClick={() => setNavOpen(!navOpen)}>☰</button>
          <div className="history-nav">
            <button className="icon-btn" aria-label="Back" disabled={history.at === 0} onClick={() => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))}>←</button>
            <button className="icon-btn" aria-label="Forward" disabled={history.at >= history.stack.length - 1} onClick={() => setHistory((h) => ({ ...h, at: Math.min(h.stack.length - 1, h.at + 1) }))}>→</button>
          </div>
          <button className="omnibar" onClick={() => setModal('search')}>
            <span aria-hidden>⌕</span>
            <span className="grow">Search {snap.workspace.name}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions" onClick={(e) => e.stopPropagation()}>
            <div className="menu-anchor">
              <button
                className={`icon-btn ${dnd.active ? 'lit' : ''}`}
                aria-label="Do not disturb"
                aria-expanded={menu === 'dnd'}
                title={dnd.active ? `Notifications paused until ${untilLabel(dnd.until)}` : 'Pause notifications'}
                onClick={() => toggleMenu('dnd')}
              >
                {dnd.active ? '🌙' : '🔕'}
              </button>
              {menu === 'dnd' && (
                <div className="menu" role="menu">
                  <p className="menu-title">{dnd.active ? `Paused until ${untilLabel(dnd.until)}` : 'Pause notifications for…'}</p>
                  {dndPresets().map((p) => (
                    <button key={p.label} role="menuitem" onClick={() => { dnd.setUntil(p.until); setMenu(null); }}>{p.label}</button>
                  ))}
                  {dnd.active && <button role="menuitem" className="danger" onClick={() => { dnd.setUntil(0); setMenu(null); }}>Resume notifications</button>}
                  {alerts.permission === 'denied' && <p className="menu-note">Alerts are blocked in this browser. Allow them in site settings to get notified.</p>}
                </div>
              )}
            </div>
          </div>
        </header>

      <div className="app">
        <nav className="rail" onClick={(e) => e.stopPropagation()}>
          <WorkspaceSwitcher current={snap.workspace} mine={workspaces.mine} onSwitch={switchWorkspace} onCreate={() => setModal('createWs')} onFind={() => setModal('findWs')} />
          <span className="rail-divider" />
          <button className={`rail-btn ${view === 'channel' ? 'active' : ''}`} title="Home" onClick={() => showView('channel')}>⌂<span>Home</span></button>
          <button className={`rail-btn ${view === 'dms' ? 'active' : ''}`} title="Direct messages" onClick={() => showView('dms')}>💬<span>DMs</span></button>
          <button className={`rail-btn ${view === 'activity' ? 'active' : ''}`} title="Activity" onClick={() => showView('activity')}>🔔<span>Activity</span>{totalUnread > 0 && <b className="rail-badge">{totalUnread}</b>}</button>
          <button className={`rail-btn ${view === 'saved' ? 'active' : ''}`} title="Saved for later" onClick={() => showView('saved')}>🔖<span>Later</span></button>
          <div className="menu-anchor">
            <button className="rail-btn" title="More" aria-expanded={menu === 'more'} onClick={() => toggleMenu('more')}>⋯<span>More</span>{snap.scheduled.length > 0 && <b className="rail-badge">{snap.scheduled.length}</b>}</button>
            {menu === 'more' && (
              <div className="menu side" role="menu">
                <button role="menuitem" onClick={() => { setModal('workflows'); setMenu(null); }}>⚡ Workflows</button>
                <button role="menuitem" onClick={() => { setModal('scheduled'); setMenu(null); }}>⏱ Scheduled messages{snap.scheduled.length ? ` (${snap.scheduled.length})` : ''}</button>
                <button role="menuitem" onClick={() => showView('huddles')}>🎧 Huddles</button>
                <button role="menuitem" onClick={() => showView('directory')}>👥 People</button>
                <button role="menuitem" onClick={() => { setModal('plan'); setMenu(null); }}>💎 Plan</button>
              </div>
            )}
          </div>
          {admin && (
            <button className="rail-btn" title="Admin console" onClick={() => setModal('admin')}>
              ⚙<span>Admin</span>{(snap.admin?.flags.length ?? 0) > 0 && <b className="rail-badge">{snap.admin?.flags.length}</b>}
            </button>
          )}
          <span className="spacer" />
          <div className="menu-anchor">
            <button className="rail-create" title="Create" aria-label="Create" aria-expanded={menu === 'create'} onClick={() => toggleMenu('create')}>＋</button>
            {menu === 'create' && (
              <div className="menu side up" role="menu">
                <button role="menuitem" onClick={() => { setModal('new'); setMenu(null); }}># New channel</button>
                <button role="menuitem" onClick={() => showView('directory')}>💬 New message</button>
                <button role="menuitem" onClick={() => { setModal('invite'); setMenu(null); }}>➕ Invite people</button>
                <button role="menuitem" onClick={() => { setModal('createWs'); setMenu(null); }}>🏢 New workspace</button>
              </div>
            )}
          </div>
          <button className="rail-me" title="Profile and preferences" onClick={() => setModal('profile')}>
            <Avatar user={me} size={34} online={connected} />
            {dnd.active && <i className="dnd-badge" aria-hidden>🌙</i>}
          </button>
        </nav>

        <aside className="sidebar" onClick={(e) => e.stopPropagation()}>
          <header>
            <div className="menu-anchor ws-name">
              <button className="ws-menu-btn" aria-expanded={menu === 'workspace'} onClick={() => toggleMenu('workspace')}>
                <h2>{snap.workspace.name}</h2><i aria-hidden>▾</i>
              </button>
              {menu === 'workspace' && (
                <div className="menu ws-menu" role="menu">
                  <div className="menu-head"><WorkspaceTile ws={snap.workspace} size={36} /><div><strong>{snap.workspace.name}</strong><small className="muted">{snap.settings.inviteOnly ? 'Invite-only' : 'Open to anyone who signs in'}</small></div></div>
                  <button role="menuitem" onClick={() => { setModal('invite'); setMenu(null); }}>Invite people to {snap.workspace.name}</button>
                  <button role="menuitem" onClick={() => { setModal('profile'); setMenu(null); }}>Preferences</button>
                  {admin && <button role="menuitem" onClick={() => { setModal('admin'); setMenu(null); }}>Admin console</button>}
                  {admin && <button role="menuitem" onClick={() => { renameWorkspace(); setMenu(null); }}>Rename workspace</button>}
                  {workspaces.mine.length > 1 && <p className="menu-title">Switch workspace</p>}
                  {workspaces.mine.filter((w) => w.id !== snap.workspace.id).map((w) => (
                    <button key={w.id} role="menuitem" className="ws-item" onClick={() => { switchWorkspace(w.id); setMenu(null); }}><WorkspaceTile ws={w} size={22} /> {w.name}</button>
                  ))}
                  <button role="menuitem" onClick={() => { setModal('createWs'); setMenu(null); }}>Create a new workspace</button>
                  <button role="menuitem" className="danger" onClick={leave}>Sign out</button>
                </div>
              )}
            </div>
            <span className="spacer" />
            <button className="icon-btn side-head-btn" title="New sidebar section" onClick={addSection}>⊞</button>
            <button className="icon-btn side-head-btn compose-btn" title="New channel" onClick={() => setModal('new')}>✎</button>
          </header>
          <div className="side-scroll">
            {navItem('huddles', '🎧', 'Huddles')}
            {navItem('directory', '👥', 'People')}
            {navItem('activity', '@', 'Mentions & reactions')}
            {navItem('saved', '🔖', 'Later')}

            {section('starred', 'Starred')}
            {!collapsed.starred && starred.map(sidebarItem)}
            {!collapsed.starred && starred.length === 0 && <p className="muted small side-hint">Star a channel with ☆ in its header to pin it here.</p>}

            {snap.sections.map((sec) => (
              <div key={sec.id}>
                {section(sec.id, sec.name, <button title="Remove section (channels move back to Channels)" onClick={() => removeSection(sec.id)}>×</button>)}
                {!collapsed[sec.id] && sec.channelIds.map((id) => snap.channels[id]).filter((c) => c && c.members.includes(snap.me) && !starredIds.has(c.id)).map(sidebarItem)}
                {!collapsed[sec.id] && sec.channelIds.length === 0 && <p className="muted small side-hint">Move channels here from a channel's details.</p>}
              </div>
            ))}
            {section('channels', 'Channels')}
            {!collapsed.channels && joined.filter((c) => !sectioned.has(c.id) && !starredIds.has(c.id)).map(sidebarItem)}
            {!collapsed.channels && (
              <div className="menu-anchor">
                <button className="side-item add" onClick={() => toggleMenu('addChannel')}><span className="hash">＋</span><span className="label">Add channels</span></button>
                {menu === 'addChannel' && (
                  <div className="menu inline" role="menu">
                    <button role="menuitem" onClick={() => { setModal('new'); setMenu(null); }}>Create a new channel</button>
                    <button role="menuitem" onClick={() => { setShowBrowse((b) => !b); setMenu(null); }}>{showBrowse ? 'Hide' : 'Browse'} channels{browse.length ? ` (${browse.length})` : ''}</button>
                  </div>
                )}
              </div>
            )}
            {!collapsed.channels && showBrowse && browse.map(sidebarItem)}

            {section('dms', 'Direct messages')}
            {!collapsed.dms && dms.filter((c) => !starredIds.has(c.id)).map(sidebarItem)}
            {!collapsed.dms && people.filter((u) => !dms.some((d) => d.members.includes(u.id))).slice(0, 8).map((u) => (
              <button key={u.id} className="side-item" onClick={() => dmWith(u.id)}>
                <span className="hash"><Avatar user={u} size={18} online={snap.online.includes(u.id)} /></span>
                <span className="label">{u.name}</span>
              </button>
            ))}
            {!collapsed.dms && <button className="side-item add" onClick={() => setModal('invite')}><span className="hash">＋</span><span className="label">Invite people</span></button>}

            {section('apps', 'Apps')}
            {!collapsed.apps && (
              <button className="side-item" onClick={() => dmWith('relaybot')}>
                <span className="hash"><Avatar user={snap.users.relaybot} size={18} /></span><span className="label">Relay Bot</span>
              </button>
            )}
          </div>
        </aside>
        <button className="nav-scrim" aria-label="Close channels" tabIndex={-1} onClick={() => setNavOpen(false)} />

        <main className="main">
          <Backdrop bg={appearance.background} dim={appearance.dim} />
          {!connected && <div className="banner">Reconnecting…</div>}
          {error && <div className="banner error" onClick={clearError}>{error} (click to dismiss)</div>}
          {view === 'activity' ? <ActivityView />
            : view === 'saved' ? <SavedView />
            : view === 'dms' ? <DmsView onNew={() => showView('directory')} />
            : view === 'directory' ? <DirectoryView onMessage={dmWith} />
            : view === 'huddles' ? <HuddlesView />
            : ch ? (
            <>
              <header className="channel-head">
                <div className="channel-title">
                  <h2>
                    {ch.kind !== 'dm' && (
                      <button className={`star-btn ${starredIds.has(ch.id) ? 'on' : ''}`} aria-label={starredIds.has(ch.id) ? 'Unstar channel' : 'Star channel'} aria-pressed={starredIds.has(ch.id)} onClick={() => send({ t: 'star', channelId: ch.id })}>{starredIds.has(ch.id) ? '★' : '☆'}</button>
                    )}
                    <button className="title-btn" onClick={() => togglePanel('details')}>{ch.kind === 'dm' ? '' : ch.kind === 'private' ? '🔒 ' : '# '}{channelLabel(ch, snap.users, snap.me)}</button>
                  </h2>
                  {ch.topic && <p className="topic">{ch.topic}</p>}
                </div>
                <div className="head-actions" onClick={(e) => e.stopPropagation()}>
                  {ch.kind !== 'dm' && <button className="ghost-btn invite-btn" onClick={() => setModal('invite')}>👤 <span>Invite teammates</span></button>}
                  <button className="member-stack" title="Members" onClick={() => togglePanel('details')}>
                    {ch.members.slice(0, 3).map((id) => <Avatar key={id} user={snap.users[id]} size={22} />)}
                    <b>{ch.members.length}</b>
                  </button>
                  <button className="icon-btn head-icon" title="Start a huddle" aria-label="Start a huddle" onClick={() => send({ t: 'huddle', channelId: ch.id, action: 'join' })}>🎧</button>
                  <div className="menu-anchor">
                    <button className={`icon-btn head-icon ${level !== 'mentions' ? 'lit' : ''}`} title={`Notifications: ${LEVEL_LABEL[level]}`} aria-label="Channel notifications" aria-expanded={menu === 'bell'} onClick={() => toggleMenu('bell')}>{level === 'mute' ? '🔕' : '🔔'}</button>
                    {menu === 'bell' && (
                      <div className="menu" role="menu">
                        <p className="menu-title">Notify me about…</p>
                        {(['all', 'mentions', 'mute'] as ChannelLevel[]).map((l) => (
                          <button key={l} role="menuitemradio" aria-checked={level === l} className={level === l ? 'checked' : ''} onClick={() => { levels.setLevel(ch.id, l); setMenu(null); }}>{level === l ? '✓ ' : ''}{LEVEL_LABEL[l]}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="icon-btn head-icon" title="Search" aria-label="Search" onClick={() => setModal('search')}>⌕</button>
                  <button className="icon-btn head-icon" title="Channel details" aria-label="Channel details" onClick={() => togglePanel('details')}>⋮</button>
                </div>
                <nav className="channel-tabs" aria-label="Channel views" onClick={(e) => e.stopPropagation()}>
                  <button className={!panel || panel.kind === 'thread' || panel.kind === 'details' ? 'on' : ''} onClick={() => setPanel(null)}>💬 Messages</button>
                  <button className={panel?.kind === 'canvas' ? 'on' : ''} onClick={() => togglePanel('canvas')}>📄 Canvas</button>
                  <button className={panel?.kind === 'list' ? 'on' : ''} onClick={() => togglePanel('list')}>☑ List</button>
                  <button onClick={() => send({ t: 'send', channelId: ch.id, text: '/summarize' })}>✨ Recap</button>
                  <div className="menu-anchor">
                    <button className="tab-add" aria-label="Add a tab" aria-expanded={menu === 'addTab'} onClick={() => toggleMenu('addTab')}>＋</button>
                    {menu === 'addTab' && (
                      <div className="menu" role="menu">
                        <button role="menuitem" onClick={() => { setPanel({ kind: 'canvas' }); setMenu(null); }}>📄 Canvas</button>
                        <button role="menuitem" onClick={() => { setPanel({ kind: 'list' }); setMenu(null); }}>☑ List</button>
                        <button role="menuitem" onClick={() => { setModal('workflows'); setMenu(null); }}>⚡ Workflow</button>
                      </div>
                    )}
                  </div>
                </nav>
              </header>
              <HuddleBar channelId={ch.id} />
              {channelEmpty && ch.kind !== 'dm' && (
                <div className="starter">
                  <div className="starter-head">
                    <h3>👋 Welcome to #{ch.name}</h3>
                    <p className="muted">{ch.topic ? ch.topic.replace(/[.!?]?$/, '.') : 'This is the very beginning of the channel.'} Here are a few ways to get it going.</p>
                  </div>
                  <div className="starter-cards">
                    <button className="starter-card c1" onClick={() => setPanel({ kind: 'canvas' })}>
                      <strong>Write a canvas</strong><small>A shared doc for plans and notes</small>
                      <span className="starter-art" aria-hidden><i /><i /><i /></span>
                    </button>
                    <button className="starter-card c2" onClick={() => setModal('workflows')}>
                      <strong>Start from a template</strong><small>Standups, triage, help desk and more</small>
                      <span className="starter-art" aria-hidden><i /><i /><i /></span>
                    </button>
                    <button className="starter-card c3" onClick={() => setModal('invite')}>
                      <strong>Invite teammates</strong><small>Bring your whole team in</small>
                      <span className="starter-art people" aria-hidden><i /><i /><i /></span>
                    </button>
                  </div>
                </div>
              )}
              {channelMessages.length === 0 && ch.kind === 'dm' ? (
                <div className="empty">
                  <div className="empty-mark" aria-hidden>👋</div>
                  <h3>This is the very beginning of your conversation</h3>
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
          {alerts.permission === 'default' && !bannerHidden && (
            <div className="alert-banner" role="status">
              <span>🔔 Relay needs your permission to send notifications.</span>
              <button className="link-btn" onClick={() => void alerts.request()}>Enable notifications</button>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => { setBannerHidden(true); localStorage.setItem('relay.alertBanner', 'hidden'); }}>×</button>
            </div>
          )}
        </main>

        {panel?.kind === 'thread' && <ThreadPanel parentId={panel.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'canvas' && ch && <CanvasPanel channelId={ch.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'list' && ch && <ListPanel channelId={ch.id} onClose={() => setPanel(null)} />}
        {panel?.kind === 'details' && ch && <DetailsPanel channelId={ch.id} onClose={() => setPanel(null)} />}
      </div>

        <nav className="tabbar" aria-label="Sections">
          <button className={navOpen ? 'on' : ''} onClick={() => setNavOpen(true)}>⌂<span>Home</span></button>
          <button className={!navOpen && view === 'dms' ? 'on' : ''} onClick={() => showView('dms')}>💬<span>DMs</span></button>
          <button className={!navOpen && view === 'activity' ? 'on' : ''} onClick={() => showView('activity')}>🔔<span>Activity</span>{totalUnread > 0 && <b className="rail-badge">{totalUnread}</b>}</button>
          <button className={!navOpen && view === 'saved' ? 'on' : ''} onClick={() => showView('saved')}>🔖<span>Later</span></button>
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
      {modal === 'profile' && <ProfileModal onClose={() => setModal(null)} appearance={appearance} />}
      {modal === 'plan' && <PlanModal onClose={() => setModal(null)} />}
      {modal === 'scheduled' && <ScheduledModal onClose={() => setModal(null)} />}
      {modal === 'workflows' && <WorkflowModal onClose={() => setModal(null)} />}
      {modal === 'admin' && admin && <AdminModal onClose={() => setModal(null)} />}
      {modal === 'invite' && <InviteModal snap={snap} send={send} onClose={() => setModal(null)} />}
      {modal === 'createWs' && <CreateWorkspaceModal onClose={() => setModal(null)} onCreate={createWorkspace} />}
      {modal === 'findWs' && <FindWorkspacesModal discover={workspaces.discover} onClose={() => setModal(null)} onJoin={(id) => { switchWorkspace(id); setModal(null); }} />}
      <TermsGate />
      {typeof modal === 'object' && modal && 'schedule' in modal && ch && (
        <SchedulePicker text={modal.schedule} channelId={ch.id} onClose={() => setModal(null)} />
      )}
    </Ctx.Provider>
  );
}
