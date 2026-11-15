import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem, TopNavMenu } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { themes, defaultThemeSlug } from '../astryx-themes.ts';
import { landingUrl } from '../landing.ts';
import { LogoMark } from './LogoIntro.tsx';
import { Icon, type IconName } from './Icon.tsx';

// The public pages moved to their own site (RELAY-Landing-page). What stays here is the frame around the
// sign-in and password-reset pages, whose nav now links out to that site, and the one route the app owns:
// '/reset', where Supabase's reset email lands.
export type Route = 'home' | 'reset';

const RESET_PATH = '/reset';
const routeFrom = (path: string): Route => (path.replace(/\/+$/, '') === RESET_PATH ? 'reset' : 'home');

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFrom(location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeFrom(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (r: Route) => {
    const path = r === 'reset' ? RESET_PATH : '/';
    if (path !== location.pathname) window.history.pushState(null, '', path + location.search);
    setRoute(r);
  };
  return [route, go];
}

const FEATURES: { label: string; path: string; blurb: string; icon: IconName }[] = [
  { label: 'Overview', path: '/overview', blurb: 'Channels, threads, mentions and recaps', icon: 'message' },
  { label: 'Huddles', path: '/huddles', blurb: 'Calls in any channel, notes afterwards', icon: 'headphones' },
  { label: 'Workflows', path: '/workflows', blurb: 'Welcomes, answers and reminders', icon: 'zap' },
  { label: 'Search', path: '/search', blurb: 'Ctrl K across every message and person', icon: 'search' },
];

function SiteNav() {
  return (
    <TopNav
      label="Relay"
      heading={<TopNavHeading logo={<LogoMark size={22} />} heading="Relay" headingHref={landingUrl('/')} />}
      centerContent={
        <>
          <TopNavMenu label="Product" items={FEATURES.map((p) => ({ title: p.label, description: p.blurb, href: landingUrl(p.path), icon: <Icon n={p.icon} size={18} /> }))} />
          <TopNavItem label="For teams" href={landingUrl('/#teams')} />
          <TopNavItem label="Help" href={landingUrl('/help')} />
        </>
      }
    />
  );
}

// The frame around the sign-in and reset pages: always light (whatever the app theme is), the nav on top,
// the page in AppShell's scrolling main.
export function SiteFrame({ children }: { children: ReactNode }) {
  // The nav gains a hairline and a soft shadow once the page scrolls under it (class on .site).
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.site-page');
    let el: HTMLElement | null = page;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    const host = document.querySelector<HTMLElement>('.site');
    if (!el || !host) return;
    const scroller = el;
    const on = () => host.classList.toggle('is-scrolled', scroller.scrollTop > 8);
    on();
    scroller.addEventListener('scroll', on, { passive: true });
    return () => scroller.removeEventListener('scroll', on);
  }, []);
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <AppShell className="site" height="fill" variant="surface" topNav={<SiteNav />}>
        <VStack className="site-page">
          <div className="site-aurora" aria-hidden><i /><i /><i /></div>
          {children}
        </VStack>
      </AppShell>
    </Theme>
  );
}
