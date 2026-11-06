import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';
import DynamicIslandNav from './framer/DynamicIslandNav.tsx';
import LightBulbButton from './framer/LightBulbButton.tsx';

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

const ISLAND_ITEMS = [
  { label: 'Overview', icon: 'grid', link: '/overview', route: 'overview' as const },
  { label: 'Huddles', icon: 'headphones', link: '/huddles', route: 'huddles' as const },
  { label: 'Workflows', icon: 'sparkle', link: '/workflows', route: 'workflows' as const },
  { label: 'Search', icon: 'search', link: '/search', route: 'search' as const },
  { label: 'Help', icon: 'book', link: '/help', route: 'help' as const },
];

export function SiteNav({ route, go, onGetStarted, signedIn }: { route: Route; go: (r: Route) => void; onGetStarted: () => void; signedIn?: boolean }) {
  const to = (r: Route) => { go(r); };

  const active = route === 'overview' ? 1
    : route === 'huddles' ? 2
    : route === 'workflows' ? 3
    : route === 'search' ? 4
    : route === 'help' ? 5
    : 0;

  return (
    <header className="ap-nav ap-nav-island">
      <RouteLink to="home" go={to} className="ap-brand"><LogoMark size={22} />Relay</RouteLink>
      <div className="ap-island-wrap">
        <DynamicIslandNav
          items={ISLAND_ITEMS}
          active={active}
          theme="Dark"
          colors={{
            fill: 'rgba(28, 24, 37, 0.82)',
            border: 'rgba(255, 255, 255, 0.1)',
            pill: 'rgba(154, 107, 255, 0.22)',
            icon: 'rgba(236, 232, 243, 0.65)',
            active: '#ffffff',
            divider: 'rgba(255, 255, 255, 0.1)',
            focus: '#9a6bff',
            shadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
          compact={true}
          labels="Active"
          margin={[0, 0, 0, 0]}
          padding={[4, 6, 4, 6]}
          itemSize={36}
          iconSize={18}
          radius="999px"
          onSelect={(i: number) => {
            const it = ISLAND_ITEMS[i];
            if (it) to(it.route);
          }}
        />
      </div>
      <div className="ap-nav-end">
        <LightBulbButton
          onClick={onGetStarted}
          lightColor={signedIn ? '#3ccf7c' : '#b3ff00'}
          buttonColor="#181522"
          substrateColor="#09080e"
          height={38}
        >
          {signedIn ? 'Open Relay' : 'Sign in'}
        </LightBulbButton>
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
