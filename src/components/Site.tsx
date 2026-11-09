import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';
import BouncyNavPill from './framer/BouncyNavPill.tsx';

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

const BOUNCY_MENU_ITEMS = [
  { label: 'Overview', link: '/overview', route: 'overview' as const },
  { label: 'Huddles', link: '/huddles', route: 'huddles' as const },
  { label: 'Workflows', link: '/workflows', route: 'workflows' as const },
  { label: 'Search', link: '/search', route: 'search' as const },
  { label: 'Help', link: '/help', route: 'help' as const },
];

export function SiteNav({ route, go, onGetStarted, signedIn }: { route: Route; go: (r: Route) => void; onGetStarted: () => void; signedIn?: boolean }) {
  const to = (r: Route) => { go(r); };

  const activeIndex = route === 'overview' ? 0
    : route === 'huddles' ? 1
    : route === 'workflows' ? 2
    : route === 'search' ? 3
    : route === 'help' ? 4
    : -1;

  return (
    <BouncyNavPill
      logo={{
        type: 'text',
        text: '✦ Relay',
        textColor: '#ffffff',
        link: '/',
        textFont: { fontSize: '20px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '1em' },
      }}
      menuItems={BOUNCY_MENU_ITEMS}
      menuStyle={{
        font: { fontSize: '15px', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: '1em' },
        itemPadding: '10px 18px',
        itemRadius: 999,
        itemGap: 4,
        dropdownRadius: 18,
        dropdownGap: 14,
        dropdownWidth: 200,
        dropdownItemTextColor: 'rgba(255, 255, 255, 0.7)',
        dropdownItemHoverTextColor: '#ffffff',
        dropdownItemHoverBackground: 'rgba(124, 58, 237, 0.25)',
      }}
      cta={{
        enabled: true,
        label: signedIn ? 'Open Relay' : 'Sign in',
        href: '#',
        font: { fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: '1em' },
        padding: '10px 22px',
        radius: 999,
      }}
      layout={{
        maxWidth: 1060,
        navbarPadding: '8px 10px 8px 22px',
        borderRadius: 999,
        shadow: true,
      }}
      colors={{
        navbarBackground: 'rgba(20, 14, 34, 0.92)',
        borderColor: 'rgba(124, 58, 237, 0.35)',
        textMuted: 'rgba(240, 235, 255, 0.78)',
        menuHoverBackground: '#7c3aed',
        menuHoverText: '#ffffff',
        ctaBackground: '#7c3aed',
        ctaHoverBackground: '#9055ff',
        ctaText: '#ffffff',
        ctaHoverText: '#ffffff',
      }}
      activePreviewIndex={activeIndex}
      sticky={true}
      stickyOffset={16}
      bounceStiffness={500}
      bounceDamping={24}
      onSelect={(item: any) => {
        if (item?.route) to(item.route);
        else if (item?.link) {
          const matched = PAGES.find(p => p.path === item.link);
          if (matched) to(matched.route);
        }
      }}
      onCtaClick={onGetStarted}
      onLogoClick={() => to('home')}
    />
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
