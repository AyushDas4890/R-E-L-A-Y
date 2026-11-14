import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem, TopNavMenu } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { themes, defaultThemeSlug } from '../astryx-themes.ts';
import { LogoMark } from './LogoIntro.tsx';
import { Icon, type IconName } from './Icon.tsx';

// Public site routes. Each feature in the nav has its own page at a real path
// (Vercel rewrites every path to index.html, and Vite's dev server does the same).
export type FeatureRoute = 'overview' | 'huddles' | 'workflows' | 'search';
// The help center has its own pages under /help/<article>; it is one route here.
// 'reset' is the password reset page that Supabase's reset email links to; it is not in the nav.
export type Route = 'home' | FeatureRoute | 'help' | 'reset';

export const PAGES: { route: Exclude<Route, 'home' | 'reset'>; label: string; path: string; blurb: string; icon: IconName }[] = [
  { route: 'overview', label: 'Overview', path: '/overview', blurb: 'Channels, threads, mentions and recaps', icon: 'message' },
  { route: 'huddles', label: 'Huddles', path: '/huddles', blurb: 'Calls in any channel, notes afterwards', icon: 'headphones' },
  { route: 'workflows', label: 'Workflows', path: '/workflows', blurb: 'Welcomes, answers and reminders', icon: 'zap' },
  { route: 'search', label: 'Search', path: '/search', blurb: 'Ctrl K across every message and person', icon: 'search' },
  { route: 'help', label: 'Help', path: '/help', blurb: 'Guides for every part of Relay', icon: 'bookmark' },
];

const RESET_PATH = '/reset';
const routeFrom = (path: string): Route => {
  if (/^\/help(\/|$)/.test(path)) return 'help';
  const clean = path.replace(/\/+$/, '');
  if (clean === RESET_PATH) return 'reset';
  return PAGES.find((p) => p.path === clean)?.route ?? 'home';
};
export const pathOf = (r: Route) => (r === 'reset' ? RESET_PATH : PAGES.find((p) => p.route === r)?.path ?? '/');

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

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scrolls to the element a #hash names, once the page that holds it has rendered. Within a page the
// scroll glides; arriving on a new page it jumps, so late layout cannot cut a glide short.
export function scrollToHash(hash = location.hash, glide = false) {
  const id = hash.replace(/^#/, '');
  if (!id) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: glide && !reduceMotion() ? 'smooth' : 'auto', block: 'start' });
  }));
}

// Client-side navigation for any internal path. Every listener (App, Landing, the help center) follows
// popstate, and a popstate without the sign-in marker also closes the sign-in view.
export function navigate(href: string) {
  const url = new URL(href, location.href);
  if (url.pathname === location.pathname && url.hash) {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    scrollToHash(url.hash, true);
    return;
  }
  // The page that mounts scrolls to the hash itself (scrollToHash in its first effect).
  window.history.pushState(null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

// Plain clicks on internal links route without a reload; modifier clicks still open new tabs.
// Catching them on the frame covers Astryx links, nav items and the mobile drawer alike.
function interceptLinks(e: MouseEvent<HTMLElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
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

const FEATURES = PAGES.filter((p) => p.route !== 'help');

// The public nav: brand left, product links centred, Log in and Open Relay right. Below the md
// breakpoint AppShell folds the centre links into its menu drawer.
export function SiteNav({ route, onGetStarted, signedIn }: { route: Route; onGetStarted?: () => void; signedIn?: boolean }) {
  const narrow = useMediaQuery('(max-width: 767px)');
  return (
    <TopNav
      label="Relay"
      heading={<TopNavHeading logo={<LogoMark size={22} />} heading="Relay" headingHref="/" />}
      centerContent={
        <>
          <TopNavMenu label="Product" items={FEATURES.map((p) => ({ title: p.label, description: p.blurb, href: p.path, icon: <Icon n={p.icon} size={18} /> }))} />
          <TopNavMenu label="Resources" items={[
            { title: 'Help center', description: 'Guides for every part of Relay', href: '/help', icon: <Icon n="bookmark" size={18} /> },
            { title: 'Getting started', description: 'Sign in, join or create a workspace', href: '/help/sign-in', icon: <Icon n="user" size={18} /> },
            { title: 'Search tips', description: 'Find any message with Ctrl K', href: '/help/search', icon: <Icon n="command" size={18} /> },
          ]} />
          <TopNavItem label="Pricing" href="/overview#pricing" />
          <TopNavItem label="Request a demo" href="/help" isSelected={route === 'help'} />
        </>
      }
      endContent={onGetStarted && (
        <HStack gap={2} vAlign="center">
          {!signedIn && !narrow && <Button label="Log in" variant="ghost" size="sm" onClick={onGetStarted} />}
          <Button label="Open Relay" variant="primary" size="sm" onClick={onGetStarted} />
        </HStack>
      )}
    />
  );
}

const FOOTER: { title: string; links: [string, string][] }[] = [
  { title: 'Product', links: FEATURES.map((p) => [p.label, p.path]) },
  { title: 'Resources', links: [['Help center', '/help'], ['Getting started', '/help/sign-in'], ['Search tips', '/help/search'], ['Troubleshooting', '/help/slow-start']] },
  { title: 'Company', links: [['About Relay', '/overview'], ['Pricing', '/overview#pricing'], ['Request a demo', '/help']] },
  { title: 'Legal', links: [['What admins can see', '/help/what-admins-see'], ['Data retention', '/help/retention-export'], ['Delete your account', '/help/delete-account']] },
];

export function SiteFooter() {
  return (
    <VStack as="footer" hAlign="center" paddingBlock={10} paddingInline={4} style={{ background: 'var(--color-background-muted)' }}>
      <VStack gap={6} width="100%" maxWidth={1080}>
        <Grid columns={{ minWidth: 150, repeat: 'fit' }} gap={6}>
          {FOOTER.map((col) => (
            <VStack key={col.title} gap={2} hAlign="start">
              <Text type="label" weight="semibold">{col.title}</Text>
              {col.links.map(([label, href]) => <Link key={label} href={href} color="secondary" type="supporting">{label}</Link>)}
            </VStack>
          ))}
        </Grid>
        <Divider />
        <HStack gap={4} wrap="wrap" vAlign="center" justify="between">
          <HStack gap={2} vAlign="center"><LogoMark size={18} /><Text type="supporting">Relay. Built from public product behavior only.</Text></HStack>
          <Text type="supporting">Powered by Flo Studios</Text>
        </HStack>
      </VStack>
    </VStack>
  );
}

type Step = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10;

// One band of a public page: full width, content centred in a 1080px column.
export function SiteSection({ id, gap = 6, paddingBlockStart = 10, paddingBlockEnd = 10, children }: { id?: string; gap?: Step; paddingBlockStart?: Step; paddingBlockEnd?: Step; children: ReactNode }) {
  return (
    <VStack as="section" id={id} hAlign="center" paddingInline={4} paddingBlockStart={paddingBlockStart} paddingBlockEnd={paddingBlockEnd} className="site-section">
      <VStack gap={gap} width="100%" maxWidth={1080}>{children}</VStack>
    </VStack>
  );
}

// The frame every public page shares: always light (whatever the app theme is), the nav on top,
// the page in AppShell's scrolling main, and the footer under it.
export function SiteFrame({ route, onGetStarted, signedIn, footer = true, children }: { route: Route; onGetStarted?: () => void; signedIn?: boolean; footer?: boolean; children: ReactNode }) {
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <AppShell
        className="site"
        height="fill"
        variant="surface"
        topNav={<SiteNav route={route} onGetStarted={onGetStarted} signedIn={signedIn} />}
        onClickCapture={interceptLinks}
      >
        <VStack className="site-page">
          {children}
          {footer && <SiteFooter />}
        </VStack>
      </AppShell>
    </Theme>
  );
}
