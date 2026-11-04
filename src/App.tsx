import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Ctx } from './ctx.ts';
import { channelLabel } from './format.tsx';
import { getDevSession, saveDevSession, useAuthToken, useLastRead, useOlderHistory, useRelay, useUnread } from './store.ts';
import { authEnabled } from './supabase.ts';
import { Login } from './components/Login.tsx';
import { Landing } from './components/Landing.tsx';
import { HelpPage } from './components/Help.tsx';
import { useRoute } from './components/Site.tsx';
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
import { HomeScreen } from './components/HomeScreen.tsx';
import { CreateWorkspaceModal, FindWorkspacesModal, InviteModal, WorkspacePicker, WorkspaceSwitcher, WorkspaceTile } from './components/Workspaces.tsx';
import { canPost, isAdmin } from './premium.ts';
import { INTERNAL } from './dnd.ts';
import './dnd.css';
import { dndPresets, useChannelLevels, useDnd, useMessageAlerts, usePrefsMigration, type ChannelLevel } from './notify.ts';
import { clampSide, SIDE_DEFAULT, useAppearance } from './appearance.ts';
import { Backdrop } from './components/Appearance.tsx';
import { Icon } from './components/Icon.tsx';
import { PageTree, type NewPageOptions } from './components/pages/PageTree.tsx';
import { CalendarApp } from './components/pages/CalendarApp.tsx';
import { HomeView } from './components/pages/HomeView.tsx';
import { InboxView } from './components/pages/InboxView.tsx';
import { LibraryView } from './components/pages/LibraryView.tsx';
import { TeamspaceModal } from './components/pages/TeamspaceModal.tsx';
import { pushRecent } from './recent.ts';
import { PageView } from './components/pages/PageView.tsx';

type Modal = null | 'spaces' | 'search' | 'new' | 'profile' | 'plan' | 'scheduled' | 'workflows' | 'admin' | 'invite' | 'createWs' | 'findWs' | { schedule: string };
type Panel = null | { kind: 'thread'; id: string } | { kind: 'canvas' } | { kind: 'list' } | { kind: 'details' };
type View = 'channel' | 'activity' | 'dms' | 'saved' | 'directory' | 'huddles' | 'page' | 'home' | 'calendar' | 'library';
type Menu = null | 'workspace' | 'more' | 'create' | 'dnd' | 'bell' | 'addTab' | 'addChannel';
interface Place { view: View; channel: string; page?: string }

const untilLabel = (ts: number) => new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const params = new URLSearchParams(window.location.search);
const inviteFromUrl = () => params.get('invite') ?? '';
// ?ws=<id> links open a specific (open) workspace; remember it before the socket connects.
if (params.get('ws')) try { localStorage.setItem('relay.workspace', params.get('ws')!); } catch { /* ignore */ }
// The landing page scrolls itself (ScrollSmoother); the browser restoring an old scroll offset on
// Back would drop the visitor mid-page, on a section they didn't ask for.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const LEVEL_LABEL: Record<ChannelLevel, string> = { all: 'All new posts', mentions: 'Just mentions', mute: 'Mute' };
const VIEW_LABEL: Record<Exclude<View, 'channel' | 'page'>, string> = { activity: 'Inbox', dms: 'Direct messages', saved: 'Later', directory: 'People', huddles: 'Huddles', home: 'Home', calendar: 'Calendar', library: 'Templates' };
const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the setting just won't persist */ }
};
const recall = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export default function App() {
  const { token, ready, signOut } = useAuthToken();
  const [devSession, setDevSession] = useState(getDevSession);
  const [invite, setInvite] = useState(inviteFromUrl);
  // Help pages are public and also open for signed-in people, so they are decided before anything else.
  const [siteRoute, goSite] = useRoute();
  const [showLogin, setShowLogin] = useState(() => !!inviteFromUrl() || window.history.state?.relay === 'signin');
  // Sign-in is its own history entry, so the browser's Back button returns to the landing page
  // instead of leaving the site. (`history` below is the in-app channel history, hence window.history.)
  const showLoginRef = useRef(showLogin);
  showLoginRef.current = showLogin;
  const openLogin = () => {
    if (window.history.state?.relay !== 'signin') {
      // Coming back from sign-in should land on the top of the home page, not on whichever
      // section (#workflows, #tour…) was last in the address bar.
      window.history.replaceState(window.history.state, '', location.pathname + location.search);
      window.history.pushState({ relay: 'signin' }, '', location.pathname + location.search);
    }
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
  const { snap, typing, error, authError, analytics, workspaces, atHome, home, lastWorkspace, connected, send, listen, clearError, switchWorkspace, goHome } = useRelay(session);
  const calls = useHuddleCalls(send, listen, connected);
  const leave = () => {
    void signOut();
    setDevSession(null);
  };
  const { lastRead, markRead } = useLastRead(snap, send);
  const loadOlder = useOlderHistory(snap, send, connected);
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
  // The Notion look keeps its sidebar open or closed (Ctrl+\) and lets people drag its edge.
  const notion = /^(notion|apple)/.test(appearance.theme);
  const [sideCollapsed, setSideCollapsed] = useState(() => recall('relay.sideCollapsed') === '1');
  const [sideW, setSideW] = useState(() => clampSide(Number(recall('relay.sideW'))));
  const [resizing, setResizing] = useState(false);
  useEffect(() => remember('relay.sideCollapsed', sideCollapsed ? '1' : '0'), [sideCollapsed]);
  useEffect(() => remember('relay.sideW', String(sideW)), [sideW]);
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const onMove = (ev: PointerEvent) => setSideW(clampSide(ev.clientX));
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  // Phone layout: the channel list is its own screen, opened from the header or tab bar.
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Dragging a channel in the sidebar: which one, and which header or channel it is hovering over.
  const [dragCh, setDragCh] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  // A page I just asked for opens as soon as the server says it exists.
  const openAfterCreate = useRef(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(() => localStorage.getItem('relay.alertBanner') === 'hidden');
  const dnd = useDnd(snap, send);
  const levels = useChannelLevels(snap, send);
  usePrefsMigration(snap, send);

  const go = (to: Partial<Place>) => {
    setHistory(({ stack, at }) => {
      const next = { ...stack[at], ...to };
      if (next.view === stack[at].view && next.channel === stack[at].channel && next.page === stack[at].page) return { stack, at };
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
      if ((e.metaKey || e.ctrlKey) && e.key === '\\' && /^(notion|apple)/.test(document.documentElement.dataset.theme ?? '')) {
        e.preventDefault();
        setSideCollapsed((c) => !c);
      }
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () =>
      listen((ev) => {
        if (ev.t === 'pageCreated' && openAfterCreate.current) {
          openAfterCreate.current = false;
          go({ view: 'page', page: ev.id });
        }
      }),
    [listen],
  );
  // ?p=<page id> links open that page once the workspace has loaded.
  const deepLink = useRef(params.get('p'));
  useEffect(() => {
    if (!snap || !deepLink.current) return;
    const id = deepLink.current;
    deepLink.current = null;
    // After the effect below that resets history for a new workspace.
    setTimeout(() => go({ view: 'page', page: id }), 0);
  }, [snap?.workspace.id]);

  // A new workspace opens on its Home page (channel stays #general for when you go to Messages), with a clean history.
  useEffect(() => {
    if (!snap) return;
    setHistory({ stack: [{ view: 'home', channel: 'general' }], at: 0 });
    setPanel(null);
  }, [snap?.workspace.id]);

  useEffect(() => {
    if (snap && view === 'channel' && snap.channels[active]) markRead(active);
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

  if (siteRoute === 'help') {
    return <HelpPage go={goSite} signedIn={!!session && !authError} onGetStarted={() => (session ? goSite('home') : openLogin())} />;
  }
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
  // Opening the app lands here: your own page, with the workspaces you can enter on the side.
  if (atHome && !snap) {
    if (!connected && !home.name && !workspaces.mine.length) return <div className="welcome"><p className="muted">Connecting to Relay server…</p><p className="muted"><small>The server sleeps when idle and can take up to a minute to wake. This page keeps retrying on its own.</small></p></div>;
    return (
      <>
        {error && <div className="banner error" onClick={clearError}>{error} (click to dismiss)</div>}
        <HomeScreen name={home.name} items={home.items} mine={workspaces.mine} lastWorkspace={lastWorkspace} send={send} onEnter={switchWorkspace} onCreate={() => setModal('createWs')} onFind={() => setModal('findWs')} onSignOut={leave} />
        {modal === 'createWs' && <CreateWorkspaceModal onClose={() => setModal(null)} onCreate={createWorkspace} />}
        {modal === 'findWs' && <FindWorkspacesModal discover={workspaces.discover} onClose={() => setModal(null)} onJoin={(id) => { switchWorkspace(id); setModal(null); }} />}
      </>
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
  const people = Object.values(snap.users).filter((u) => u.id !== snap.me && !u.bot && !u.inactive);
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
  const openPage = (id: string) => {
    pushRecent(id.split('.')[0]);
    go({ view: 'page', page: id });
  };
  const createPage = (parentId: string | null, space: string | null, options: NewPageOptions = {}) => {
    openAfterCreate.current = true;
    const where = space ? { teamspaceId: space, shared: true } : {};
    if (options.db) send({ t: 'dbCreate', parentId, ...where, title: '', ...(typeof options.db === 'string' ? { preset: options.db } : {}) });
    else send({ t: 'pageCreate', parentId, ...where, ...(options.template ? { template: options.template } : {}) });
  };
  const toggleMenu = (m: Menu) => setMenu(menu === m ? null : m);
  type ChannelTarget = { to: 'starred' } | { to: 'channels' } | { to: 'section'; id: string; before?: string };
  // Dropping a channel on Starred stars it, on Channels returns it to the main list, on a section files it there
  // (before the channel it landed on, if any). Leaving Starred un-stars it, since a starred channel shows only there.
  const moveChannel = (id: string, target: ChannelTarget) => {
    const isStarred = starredIds.has(id);
    if (target.to === 'starred') {
      if (!isStarred) send({ t: 'star', channelId: id });
      return;
    }
    if (isStarred) send({ t: 'star', channelId: id });
    const next = snap.sections.map((sec) => {
      const ids = sec.channelIds.filter((x) => x !== id);
      if (target.to !== 'section' || sec.id !== target.id) return { ...sec, channelIds: ids };
      const at = target.before ? ids.indexOf(target.before) : -1;
      return { ...sec, channelIds: at < 0 ? [...ids, id] : [...ids.slice(0, at), id, ...ids.slice(at)] };
    });
    if (JSON.stringify(next) !== JSON.stringify(snap.sections)) send({ t: 'sections', sections: next });
  };
  const dropProps = (key: string, target: ChannelTarget) => ({
    onDragOver: (e: DragEvent) => { if (dragCh) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dropKey !== key) setDropKey(key); } },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropKey === key) setDropKey(null); },
    onDrop: (e: DragEvent) => { if (!dragCh) return; e.preventDefault(); e.stopPropagation(); moveChannel(dragCh, target); setDragCh(null); setDropKey(null); },
  });
  const section = (key: string, label: string, actions?: ReactNode) => (
    <div
      className={`side-section ${dragCh && dropKey === `head:${key}` ? 'dnd-over' : ''}`}
      {...(key === 'starred' ? dropProps(`head:${key}`, { to: 'starred' }) : key === 'channels' ? dropProps(`head:${key}`, { to: 'channels' }) : snap.sections.some((sec) => sec.id === key) ? dropProps(`head:${key}`, { to: 'section', id: key }) : {})}
    >
      <button className={`side-toggle ${collapsed[key] ? 'closed' : ''}`} aria-expanded={!collapsed[key]} onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}>
        <i aria-hidden>▾</i> {label}
      </button>
      {actions && <span>{actions}</span>}
    </div>
  );
  const openThread = (id: string | null) => setPanel(id ? { kind: 'thread', id } : null);
  const togglePanel = (kind: 'canvas' | 'list' | 'details') => setPanel(panel?.kind === kind ? null : { kind });

  const ctx = { snap, send, typing, openThread, openChannel, analytics, calls, listen };
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

  // `zone` says where in the sidebar the item sits ('starred', 'channels', 'dms' or a section id), so a drop on it knows where to put the dragged channel.
  const sidebarItem = (c: (typeof channels)[number], zone?: string) => {
    const muted = levels.levelOf(c.id) === 'mute';
    const u = muted ? undefined : unread[c.id];
    const label = channelLabel(c, snap.users, snap.me);
    const other = c.kind === 'dm' ? c.members.find((m) => m !== snap.me) ?? snap.me : '';
    return (
      <button
        key={c.id}
        className={`side-item ${view === 'channel' && c.id === ch?.id ? 'active' : ''} ${u ? 'unread' : ''} ${muted ? 'muted' : ''} ${dragCh === c.id ? 'dnd-dragging' : ''} ${dragCh && dragCh !== c.id && dropKey === `item:${c.id}` ? 'dnd-over' : ''}`}
        onClick={() => openChannel(c.id)}
        {...(zone && c.members.includes(snap.me)
          ? {
              draggable: true,
              onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(INTERNAL, c.id); e.dataTransfer.setData('text/plain', ''); setDragCh(c.id); },
              onDragEnd: () => { setDragCh(null); setDropKey(null); },
              ...dropProps(`item:${c.id}`, zone === 'starred' ? { to: 'starred' } : zone === 'channels' || zone === 'dms' ? { to: 'channels' } : { to: 'section', id: zone, before: c.id }),
            }
          : {})}
      >
        <span className="hash">{c.kind === 'dm' ? <Avatar user={snap.users[other]} size={18} online={snap.online.includes(other)} /> : c.kind === 'private' ? <Icon n="lock" size={14} /> : '#'}</span>
        <span className="label">{label}</span>
        {snap.huddles.some((h) => h.channelId === c.id) && <span title="Huddle live"><Icon n="headphones" size={14} /></span>}
        {muted && <span className="side-muted" title="Muted"><Icon n="bellOff" size={14} /></span>}
        {u && u.mentions > 0 ? <span className="count">{u.mentions}</span> : u ? <span className="pip" /> : null}
      </button>
    );
  };
  const navItem = (v: View, icon: ReactNode, label: string) => (
    <button className={`side-item nav ${view === v ? 'active' : ''}`} onClick={() => showView(v)}>
      <span className="hash" aria-hidden>{icon}</span><span className="label">{label}</span>
      {v === 'huddles' && snap.huddles.length > 0 && <span className="count live">{snap.huddles.length}</span>}
    </button>
  );
  const channelEmpty = channelMessages.filter((m) => !m.system && m.userId !== 'relaybot').length === 0;

  return (
    <Ctx.Provider value={ctx}>
      <div
        className={`shell ${navOpen ? 'nav-open' : ''} ${panel ? 'has-panel' : ''} ${notion && sideCollapsed ? 'side-collapsed' : ''}`}
        style={notion ? ({ '--side': `${sideW}px` } as CSSProperties) : undefined}
        onClick={() => menu && setMenu(null)}
      >
        <header className="topbar">
          <button className="icon-btn nav-toggle" aria-label="Show channels" onClick={() => setNavOpen(!navOpen)}><Icon n="menu" /></button>
          <button className="icon-btn side-toggle-top notion-only" aria-label="Open sidebar" title="Open sidebar (Ctrl+\)" onClick={() => setSideCollapsed(false)}><Icon n="panelLeft" /></button>
          <div className="history-nav">
            <button className="icon-btn" aria-label="Back" disabled={history.at === 0} onClick={() => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))}>←</button>
            <button className="icon-btn" aria-label="Forward" disabled={history.at >= history.stack.length - 1} onClick={() => setHistory((h) => ({ ...h, at: Math.min(h.stack.length - 1, h.at + 1) }))}>→</button>
          </div>
          <nav className="crumbs notion-only" aria-label="Where you are">
            <span>{snap.workspace.name}</span><i aria-hidden>/</i>
            <span>{view === 'page' ? (() => { const pn = snap.pages.find((x) => x.id === place.page); return pn ? `${pn.icon || '📄'} ${pn.title || 'Untitled'}` : 'Page'; })() : view === 'channel' ? (ch ? `${ch.kind === 'dm' ? '' : '# '}${channelLabel(ch, snap.users, snap.me)}` : '') : VIEW_LABEL[view]}</span>
          </nav>
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
                {dnd.active ? <Icon n="moon" /> : <Icon n="bellOff" />}
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
          <WorkspaceSwitcher current={snap.workspace} mine={workspaces.mine} onSwitch={switchWorkspace} onHome={goHome} onCreate={() => setModal('createWs')} onFind={() => setModal('findWs')} />
          <span className="rail-divider" />
          <button className={`rail-btn ${view === 'channel' ? 'active' : ''}`} title="Home" onClick={() => showView('channel')}><Icon n="home" size={20} /><span>Home</span></button>
          <button className={`rail-btn ${view === 'dms' ? 'active' : ''}`} title="Direct messages" onClick={() => showView('dms')}><Icon n="message" size={20} /><span>DMs</span></button>
          <button className={`rail-btn ${view === 'activity' ? 'active' : ''}`} title="Activity" onClick={() => showView('activity')}><Icon n="bell" size={20} /><span>Activity</span>{totalUnread > 0 && <b className="rail-badge">{totalUnread}</b>}</button>
          <button className={`rail-btn ${view === 'saved' ? 'active' : ''}`} title="Saved for later" onClick={() => showView('saved')}><Icon n="bookmark" size={20} /><span>Later</span></button>
          <div className="menu-anchor">
            <button className="rail-btn" title="More" aria-expanded={menu === 'more'} onClick={() => toggleMenu('more')}><Icon n="more" size={20} /><span>More</span>{snap.scheduled.length > 0 && <b className="rail-badge">{snap.scheduled.length}</b>}</button>
            {menu === 'more' && (
              <div className="menu side" role="menu">
                <button role="menuitem" onClick={() => { setModal('workflows'); setMenu(null); }}><Icon n="zap" /> Workflows</button>
                <button role="menuitem" onClick={() => { setModal('scheduled'); setMenu(null); }}><Icon n="clock" /> Scheduled messages{snap.scheduled.length ? ` (${snap.scheduled.length})` : ''}</button>
                <button role="menuitem" onClick={() => showView('huddles')}><Icon n="headphones" /> Huddles</button>
                <button role="menuitem" onClick={() => showView('directory')}><Icon n="users" /> People</button>
                <button role="menuitem" onClick={() => { setModal('plan'); setMenu(null); }}><Icon n="gem" /> Plan</button>
              </div>
            )}
          </div>
          {admin && (
            <button className="rail-btn" title="Admin console" onClick={() => setModal('admin')}>
              <Icon n="settings" size={20} /><span>Admin</span>{(snap.admin?.flags.length ?? 0) > 0 && <b className="rail-badge">{snap.admin?.flags.length}</b>}
            </button>
          )}
          <span className="spacer" />
          <div className="menu-anchor">
            <button className="rail-create" title="Create" aria-label="Create" aria-expanded={menu === 'create'} onClick={() => toggleMenu('create')}><Icon n="plus" size={20} /></button>
            {menu === 'create' && (
              <div className="menu side up" role="menu">
                <button role="menuitem" onClick={() => { setModal('new'); setMenu(null); }}># New channel</button>
                <button role="menuitem" onClick={() => showView('directory')}><Icon n="message" /> New message</button>
                <button role="menuitem" onClick={() => { setModal('invite'); setMenu(null); }}><Icon n="plus" /> Invite people</button>
                <button role="menuitem" onClick={() => { setModal('createWs'); setMenu(null); }}><Icon n="building" /> New workspace</button>
              </div>
            )}
          </div>
          <button className="rail-btn" title="Sign out" onClick={leave}><Icon n="logout" size={20} /><span>Sign out</span></button>
          <button className="rail-me" title="Profile and preferences" onClick={() => setModal('profile')}>
            <Avatar user={me} size={34} online={connected} />
            {dnd.active && <i className="dnd-badge" aria-hidden><Icon n="moon" size={12} /></i>}
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
                  <button role="menuitem" onClick={() => { goHome(); setMenu(null); }}>Back to Home</button>
                  <button role="menuitem" onClick={() => { setModal('invite'); setMenu(null); }}>Invite people to {snap.workspace.name}</button>
                  <button role="menuitem" onClick={() => { setModal('profile'); setMenu(null); }}>Preferences</button>
                  <button role="menuitem" onClick={() => { window.open('/help', '_blank', 'noopener'); setMenu(null); }}>Help center</button>
                  {admin && <button role="menuitem" onClick={() => { setModal('admin'); setMenu(null); }}>Admin console</button>}
                  {admin && <button role="menuitem" onClick={() => { renameWorkspace(); setMenu(null); }}>Rename workspace</button>}
                  {workspaces.mine.length > 1 && <p className="menu-title">Switch workspace</p>}
                  {workspaces.mine.filter((w) => w.id !== snap.workspace.id).map((w) => (
                    <button key={w.id} role="menuitem" className="ws-item" onClick={() => { switchWorkspace(w.id); setMenu(null); }}><WorkspaceTile ws={w} size={22} /> {w.name}</button>
                  ))}
                  <button role="menuitem" onClick={() => { setModal('createWs'); setMenu(null); }}>Create a new workspace</button>
                  <button role="menuitem" className="danger" onClick={() => { if (confirm(`Leave ${snap.workspace.name}? You can rejoin later if it is open or you have an invite.`)) send({ t: 'leaveWorkspace' }); setMenu(null); }}>Leave workspace</button>
                  <button role="menuitem" className="danger" onClick={() => { if (confirm(`Delete your account in ${snap.workspace.name}? Your messages stay but show "Deleted user", and your saved items, reminders and settings here are erased. This cannot be undone.`)) send({ t: 'deleteMyAccount' }); setMenu(null); }}>Delete my account</button>
                  <button role="menuitem" className="danger" onClick={leave}>Sign out</button>
                </div>
              )}
            </div>
            <span className="spacer" />
            <button className="icon-btn side-head-btn notion-only" aria-label="Close sidebar" title="Close sidebar (Ctrl+\)" onClick={() => setSideCollapsed(true)}><Icon n="panelLeft" /></button>
            <button className="icon-btn side-head-btn" title="New sidebar section" onClick={addSection}><Icon n="grid" /></button>
            <button className="icon-btn side-head-btn compose-btn" title="New channel" onClick={() => setModal('new')}><Icon n="pencil" /></button>
          </header>
          <div className="side-top notion-only">
            <button className="side-item" onClick={() => setModal('search')}><span className="hash"><Icon n="search" /></span><span className="label">Search</span></button>
            <button className={`side-item ${view === 'home' ? 'active' : ''}`} onClick={() => showView('home')}><span className="hash"><Icon n="home" /></span><span className="label">Home</span></button>
            <button className={`side-item ${view === 'activity' ? 'active' : ''}`} onClick={() => showView('activity')}>
              <span className="hash"><Icon n="inbox" /></span><span className="label">Inbox</span>
              {totalUnread + snap.inbox.filter((i) => !i.read).length > 0 && <span className="count">{totalUnread + snap.inbox.filter((i) => !i.read).length}</span>}
            </button>
            <button className={`side-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => showView('calendar')}><span className="hash"><Icon n="clock" /></span><span className="label">Calendar</span></button>
          </div>
          <div className="side-scroll">
            {navItem('huddles', <Icon n="headphones" />, 'Huddles')}
            {navItem('directory', <Icon n="users" />, 'People')}
            {!notion && navItem('activity', '@', 'Mentions & reactions')}
            {navItem('saved', <Icon n="bookmark" />, 'Later')}

            <PageTree nodes={snap.pages} favorites={snap.pageFavorites} teamspaces={snap.teamspaces} me={snap.me} current={view === 'page' ? place.page ?? null : null} send={send} onOpen={openPage} onCreate={createPage} onLibrary={() => showView('library')} onManageSpaces={() => setModal('spaces')} />

            {section('starred', notion ? 'Favorites' : 'Starred')}
            {!collapsed.starred && starred.map((c) => sidebarItem(c, 'starred'))}
            {!collapsed.starred && starred.length === 0 && <p className="muted small side-hint">Star a channel from its header, or drag one here, to pin it.</p>}

            {snap.sections.map((sec) => (
              <div key={sec.id}>
                {section(sec.id, sec.name, <button title="Remove section (channels move back to Channels)" onClick={() => removeSection(sec.id)}>×</button>)}
                {!collapsed[sec.id] && sec.channelIds.map((id) => snap.channels[id]).filter((c) => c && c.members.includes(snap.me) && !starredIds.has(c.id)).map((c) => sidebarItem(c, sec.id))}
                {!collapsed[sec.id] && sec.channelIds.length === 0 && <p className="muted small side-hint">Drag channels onto this section's name, or move them from a channel's details.</p>}
              </div>
            ))}
            {section('channels', 'Channels')}
            {!collapsed.channels && joined.filter((c) => !sectioned.has(c.id) && !starredIds.has(c.id)).map((c) => sidebarItem(c, 'channels'))}
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
            {!collapsed.channels && showBrowse && browse.map((c) => sidebarItem(c))}

            {section('dms', 'Direct messages')}
            {!collapsed.dms && dms.filter((c) => !starredIds.has(c.id)).map((c) => sidebarItem(c, 'dms'))}
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
          <div className="side-bottom notion-only">
            <button className="side-item" onClick={() => setModal('workflows')}><span className="hash"><Icon n="zap" /></span><span className="label">Workflows</span></button>
            <button className="side-item" onClick={() => setModal('scheduled')}><span className="hash"><Icon n="clock" /></span><span className="label">Scheduled messages</span>{snap.scheduled.length > 0 && <span className="count">{snap.scheduled.length}</span>}</button>
            {admin && <button className="side-item" onClick={() => setModal('admin')}><span className="hash"><Icon n="settings" /></span><span className="label">Admin console</span>{(snap.admin?.flags.length ?? 0) > 0 && <span className="count">{snap.admin?.flags.length}</span>}</button>}
            <button className="side-item" onClick={() => setModal('plan')}><span className="hash"><Icon n="gem" /></span><span className="label">Plan</span></button>
            <button className="side-item" onClick={() => setModal('profile')}><span className="hash"><Icon n="user" /></span><span className="label">Preferences</span></button>
          </div>
          <div className={`side-resize notion-only ${resizing ? 'drag' : ''}`} role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={startResize} onDoubleClick={() => setSideW(SIDE_DEFAULT)} />
        </aside>
        <button className="nav-scrim" aria-label="Close channels" tabIndex={-1} onClick={() => setNavOpen(false)} />

        <main className="main">
          <Backdrop bg={appearance.background} dim={appearance.dim} />
          {!connected && <div className="banner">Reconnecting…</div>}
          {error && <div className="banner error" onClick={clearError}>{error} (click to dismiss)</div>}
          {view === 'page' && place.page ? <PageView key={place.page} pageId={place.page} onOpen={openPage} onGone={() => go({ view: 'channel' })} />
            : view === 'home' ? <HomeView onChannel={openChannel} onOpen={openPage} onNew={(db) => createPage(null, null, db ? { db: true } : {})} onLibrary={() => showView('library')} onCalendar={() => showView('calendar')} />
            : view === 'calendar' ? <CalendarApp onOpen={openPage} />
            : view === 'library' ? <LibraryView onOpen={openPage} />
            : view === 'activity' ? (notion ? <InboxView onOpen={openPage} /> : <ActivityView />)
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
                      <button className={`star-btn ${starredIds.has(ch.id) ? 'on' : ''}`} aria-label={starredIds.has(ch.id) ? 'Unstar channel' : 'Star channel'} aria-pressed={starredIds.has(ch.id)} onClick={() => send({ t: 'star', channelId: ch.id })}><Icon n="star" fill={starredIds.has(ch.id)} /></button>
                    )}
                    <button className="title-btn" onClick={() => togglePanel('details')}>{ch.kind === 'dm' ? '' : ch.kind === 'private' ? <><Icon n="lock" size={14} />{' '}</> : '# '}{channelLabel(ch, snap.users, snap.me)}</button>
                  </h2>
                  {ch.topic && <p className="topic">{ch.topic}</p>}
                </div>
                <div className="head-actions" onClick={(e) => e.stopPropagation()}>
                  {ch.kind !== 'dm' && <button className="ghost-btn invite-btn" onClick={() => setModal('invite')}><Icon n="user" /> <span>Invite teammates</span></button>}
                  <button className="member-stack" title="Members" onClick={() => togglePanel('details')}>
                    {ch.members.slice(0, 3).map((id) => <Avatar key={id} user={snap.users[id]} size={22} />)}
                    <b>{ch.members.length}</b>
                  </button>
                  <button className="icon-btn head-icon" title="Start a huddle" aria-label="Start a huddle" onClick={() => send({ t: 'huddle', channelId: ch.id, action: 'join' })}><Icon n="headphones" /></button>
                  <div className="menu-anchor">
                    <button className={`icon-btn head-icon ${level !== 'mentions' ? 'lit' : ''}`} title={`Notifications: ${LEVEL_LABEL[level]}`} aria-label="Channel notifications" aria-expanded={menu === 'bell'} onClick={() => toggleMenu('bell')}>{level === 'mute' ? <Icon n="bellOff" /> : <Icon n="bell" />}</button>
                    {menu === 'bell' && (
                      <div className="menu" role="menu">
                        <p className="menu-title">Notify me about…</p>
                        {(['all', 'mentions', 'mute'] as ChannelLevel[]).map((l) => (
                          <button key={l} role="menuitemradio" aria-checked={level === l} className={level === l ? 'checked' : ''} onClick={() => { levels.setLevel(ch.id, l); setMenu(null); }}>{level === l && <Icon n="check" />} {LEVEL_LABEL[l]}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="icon-btn head-icon" title="Search" aria-label="Search" onClick={() => setModal('search')}>⌕</button>
                  <button className="icon-btn head-icon" title="Channel details" aria-label="Channel details" onClick={() => togglePanel('details')}>⋮</button>
                </div>
                <nav className="channel-tabs" aria-label="Channel views" onClick={(e) => e.stopPropagation()}>
                  <button className={!panel || panel.kind === 'thread' || panel.kind === 'details' ? 'on' : ''} onClick={() => setPanel(null)}><Icon n="message" /> Messages</button>
                  <button className={panel?.kind === 'canvas' ? 'on' : ''} onClick={() => togglePanel('canvas')}><Icon n="file" /> Canvas</button>
                  <button className={panel?.kind === 'list' ? 'on' : ''} onClick={() => togglePanel('list')}><Icon n="checkSquare" /> List</button>
                  <button onClick={() => send({ t: 'send', channelId: ch.id, text: '/summarize' })}><Icon n="sparkles" /> Recap</button>
                  <div className="menu-anchor">
                    <button className="tab-add" aria-label="Add a tab" aria-expanded={menu === 'addTab'} onClick={() => toggleMenu('addTab')}>＋</button>
                    {menu === 'addTab' && (
                      <div className="menu" role="menu">
                        <button role="menuitem" onClick={() => { setPanel({ kind: 'canvas' }); setMenu(null); }}><Icon n="file" /> Canvas</button>
                        <button role="menuitem" onClick={() => { setPanel({ kind: 'list' }); setMenu(null); }}><Icon n="checkSquare" /> List</button>
                        <button role="menuitem" onClick={() => { setModal('workflows'); setMenu(null); }}><Icon n="zap" /> Workflow</button>
                      </div>
                    )}
                  </div>
                </nav>
              </header>
              <HuddleBar channelId={ch.id} />
              {channelEmpty && ch.kind !== 'dm' && (
                <div className="starter">
                  <div className="starter-head">
                    <h3>Welcome to #{ch.name}</h3>
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
                  <div className="empty-mark" aria-hidden><Icon n="message" size={28} /></div>
                  <h3>This is the very beginning of your conversation</h3>
                  <p className="muted">Say hi, share a file, or try <code>/remind me stretch in 10m</code>.</p>
                </div>
              ) : (
                <MessageList messages={channelMessages} onOlder={snap.history[active] ? () => loadOlder(active) : undefined} />
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
                  <span><Icon n="megaphone" /> Only admins can post in #{ch.name}. You can still reply in threads.</span>
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
              <span><Icon n="bell" /> Relay needs your permission to send notifications.</span>
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
          <button className={navOpen ? 'on' : ''} onClick={() => setNavOpen(true)}><Icon n="home" size={20} /><span>Home</span></button>
          <button className={!navOpen && view === 'dms' ? 'on' : ''} onClick={() => showView('dms')}><Icon n="message" size={20} /><span>DMs</span></button>
          <button className={!navOpen && view === 'activity' ? 'on' : ''} onClick={() => showView('activity')}><Icon n="bell" size={20} /><span>Activity</span>{totalUnread > 0 && <b className="rail-badge">{totalUnread}</b>}</button>
          <button className={!navOpen && view === 'saved' ? 'on' : ''} onClick={() => showView('saved')}><Icon n="bookmark" size={20} /><span>Later</span></button>
          <button onClick={() => setModal('profile')}><Icon n="user" size={20} /><span>You</span></button>
        </nav>
      </div>

      {modal === 'search' && (
        <SearchPalette
          onClose={() => setModal(null)}
          onOpenPage={openPage}
          onPick={(cid, tid) => {
            openChannel(cid);
            if (tid) setPanel({ kind: 'thread', id: tid });
            setModal(null);
          }}
        />
      )}
      {modal === 'spaces' && <TeamspaceModal onClose={() => setModal(null)} />}
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
