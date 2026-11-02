import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';

// Public site routes. Each feature in the nav has its own page at a real path
// (Vercel rewrites every path to index.html, and Vite's dev server does the same).
export type FeatureRoute = 'overview' | 'huddles' | 'workflows' | 'search';
// The help center has its own pages under /help/<article>; it is one route here.
export type Route = 'home' | FeatureRoute | 'help';

export const PAGES: { route: Exclude<Route, 'home'>; label: string; path: string }[] = [
  { route: 'overview', label: 'Overview', path: '/overview' },
  { route: 'huddles', label: 'Huddles', path: '/huddles' },
  { route: 'workflows', label: 'Workflows', path: '/workflows' },
  { route: 'search', label: 'Search', path: '/search' },
  { route: 'help', label: 'Help', path: '/help' },
];

const routeFrom = (path: string): Route => (/^\/help(\/|$)/.test(path) ? 'help' : PAGES.find((p) => p.path === path.replace(/\/+$/, ''))?.route ?? 'home');
export const pathOf = (r: Route) => PAGES.find((p) => p.route === r)?.path ?? '/';

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFrom(location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeFrom(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (r: Route) => {
    const path = pathOf(r);
    if (path !== location.pathname) window.history.pushState(null, '', path + location.search);
    setRoute(r);
  };
  return [route, go];
}

// A plain link that changes route without reloading, so modifier-clicks still open new tabs.
export function RouteLink({ to, go, className, children }: { to: Route; go: (r: Route) => void; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
  return <a href={pathOf(to)} className={className} onClick={onClick}>{children}</a>;
}

export function SiteNav({ route, go, onGetStarted, signedIn }: { route: Route; go: (r: Route) => void; onGetStarted: () => void; signedIn?: boolean }) {
  const [menu, setMenu] = useState(false);
  const to = (r: Route) => { setMenu(false); go(r); };
  return (
    <header className="ap-nav">
      <RouteLink to="home" go={to} className="ap-brand"><LogoMark size={22} />Relay</RouteLink>
      <nav className={`ap-links ${menu ? 'open' : ''}`} aria-label="Product">
        {PAGES.map((p) => (
          <RouteLink key={p.route} to={p.route} go={to} className={route === p.route ? 'on' : undefined}>{p.label}</RouteLink>
        ))}
      </nav>
      <div className="ap-nav-end">
        {signedIn ? (
          <button className="ap-pill dark" onClick={onGetStarted}>Open Relay</button>
        ) : (
          <>
            <button className="ap-link-btn" onClick={onGetStarted}>Sign in</button>
            <button className="ap-pill dark" onClick={onGetStarted}>Get started</button>
          </>
        )}
        <button className="ap-menu" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon n="menu" size={18} /></button>
      </div>
    </header>
  );
}

export function SiteFooter({ go }: { go: (r: Route) => void }) {
  return (
    <footer className="ap-foot">
      <nav className="ap-foot-links" aria-label="Footer">
        {PAGES.map((p) => <RouteLink key={p.route} to={p.route} go={go}>{p.label}</RouteLink>)}
      </nav>
      <div className="ap-foot-meta">
        <span>Relay. Built from public product behavior only.</span>
        <span>Powered by Flo Studios</span>
      </div>
    </footer>
  );
}
