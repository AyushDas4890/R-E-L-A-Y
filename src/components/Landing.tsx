import { useEffect, useRef, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Icon } from './Icon.tsx';
import { FeaturePage } from './Features.tsx';
import { HelpPage } from './Help.tsx';
import { HeroDemo, PageDemo, ReminderDemo, SeatDemo, ThreadDemo } from './HomeDemos.tsx';
import { Mascot } from './SiteShots.tsx';
import { SiteFrame, SiteSection, scrollToHash, useRoute } from './Site.tsx';

interface Props {
  onGetStarted: () => void;
}

// The public site: the home page here, and one page per feature in the nav.
export function Landing({ onGetStarted }: Props) {
  const [route, go] = useRoute();
  // Keyed by route so each page mounts fresh, at the top.
  if (route === 'help') return <HelpPage key="help" go={go} onGetStarted={onGetStarted} signedIn={false} />;
  if (route !== 'home' && route !== 'reset') return <FeaturePage key={route} page={route} go={go} onGetStarted={onGetStarted} />;
  return <Home key="home" onGetStarted={onGetStarted} />;
}

// The home page tells one story in four screens: what Relay is (hero), what it does for you (proof),
// why it is different (free), and how to start. Told as one Monday. Type uses four sizes: display-1 for the headline,
// display-3 for every other heading, body, and small (type="supporting").

const PROOF: { when: string; tint: 'purple' | 'green' | 'yellow'; title: string; text: string; demo: ReactNode }[] = [
  { when: '9:02 AM', tint: 'purple', title: 'Someone asks a question. Everyone answers in one thread.', text: 'Replies fold away, so the channel stays readable for whoever was not there.', demo: <ThreadDemo /> },
  { when: '9:30 AM', tint: 'green', title: 'Someone forgets. Relay Bot does not.', text: 'Type /remind and your bot teammate nudges you at the right time. It also recaps and answers from your messages.', demo: <ReminderDemo /> },
  { when: '2:00 PM', tint: 'yellow', title: 'The decision lands where people can find it.', text: 'Every channel has a page for the plan, with a small database for who owns what.', demo: <PageDemo /> },
];

// Verifiable against the product: no seat limits and nothing gated (Modals.tsx, premium.ts), unlimited
// history, self-hosted, open source. The other column is how seat-priced chat tools generally work.
const COMPARE: { what: string; relay: string; other: string }[] = [
  { what: 'Price', relay: 'Free', other: 'Per seat, per month' },
  { what: 'Seat limits', relay: 'None', other: 'Set by the plan' },
  { what: 'Features', relay: 'All of them, on', other: 'Split across plans' },
  { what: 'Message history', relay: 'Unlimited', other: 'Depends on the plan' },
  { what: 'Your data', relay: 'On your own server', other: 'Usually on the vendor’s' },
];

const STEPS: [string, string][] = [
  ['Create the workspace', 'Sign in with email, Google, GitHub or Microsoft.'],
  ['Share the invite link', 'People join with one link.'],
  ['Say hello in #general', 'Channels, pages and Relay Bot are ready.'],
];

function Home({ onGetStarted }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
  useEffect(() => { scrollToHash(); }, []);
  // The timeline's line draws itself as the page scrolls: --p goes 0 to 1 across the section.
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current;
    const sc = document.querySelector<HTMLElement>('.astryx-layout-content');
    if (!el || !sc) return;
    const on = () => {
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      el.style.setProperty('--p', String(Math.min(1, Math.max(0, (vh * 0.65 - r.top) / r.height))));
    };
    on();
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  }, []);
  return (
    <SiteFrame route="home" onGetStarted={onGetStarted}>
      <VStack as="section" hAlign="center" className="site-hero">
        <div className="site-aurora" aria-hidden><i /><i /><i /></div>
        <SiteSection paddingBlockStart={10} paddingBlockEnd={10} gap={8}>
          <VStack gap={4} hAlign="center" className="site-rise">
            <span className="site-sticker" aria-hidden>$0 per seat</span>
            <Heading level={1} type="display-1" weight="semibold" justify="center" textWrap="balance">Chat so good, we <span className="site-mark">forgot to charge.</span></Heading>
            <Text justify="center" color="secondary" textWrap="balance">Relay is team chat with a bot teammate. Free for everyone: no seats, no tiers, no billing.</Text>
            <HStack gap={3} wrap="wrap" justify="center">
              <Button label="Get Relay free" variant="primary" size="lg" onClick={onGetStarted} />
              <Button label="Follow a day in Relay" variant="secondary" size="lg" onClick={() => scrollToHash('#proof', true)} />
            </HStack>
          </VStack>
          <HeroDemo />
        </SiteSection>
      </VStack>

      <SiteSection id="proof" gap={8} paddingBlockStart={10} paddingBlockEnd={10}>
        <VStack gap={2} hAlign="center">
          <Text type="supporting" justify="center">One ordinary Monday</Text>
          <Heading level={2} type="display-3" weight="semibold" justify="center" textWrap="balance">Here is what Relay does for your team</Heading>
        </VStack>
        <div className="site-timeline" ref={rail}>
          <div className="site-rail" aria-hidden><i /></div>
          {PROOF.map((p, k) => (
            <div key={p.title} className={`site-chapter tint-${p.tint}`}>
              <span className="site-dot" aria-hidden><Icon n="clock" size={14} /></span>
              <Grid columns={wide ? 2 : 1} gap={wide ? 10 : 6} align="center">
                <VStack gap={3} hAlign="start" className={wide && k % 2 ? 'site-order-2' : undefined}>
                  <span className="site-time-chip">{p.when}</span>
                  <Heading level={3} type="display-3" weight="semibold">{p.title}</Heading>
                  <Text color="secondary">{p.text}</Text>
                </VStack>
                {p.demo}
              </Grid>
            </div>
          ))}
        </div>
      </SiteSection>

      <VStack as="section" id="free" hAlign="center" justify="center" paddingInline={4} paddingBlock={10} className="site-section site-free">
        <VStack gap={8} width="100%" maxWidth={880}>
          <VStack gap={3} hAlign="center">
            <Text type="supporting" justify="center" className="site-on">The plot twist</Text>
            <Heading level={2} type="display-3" weight="semibold" justify="center" textWrap="balance" className="site-on">All of that. Zero dollars.</Heading>
            <Text justify="center" textWrap="balance" className="site-on">There is no catch to find. Relay is open source and runs on your own server, so there is no seat count to meter.</Text>
          </VStack>
          <Card padding={6} elevation="low"><SeatDemo /></Card>
          <Card padding={0} elevation="low">
            <VStack gap={0}>
              <Grid columns={3} gap={3} align="center" justify="start" className="site-row">
                <span />
                <Text weight="semibold">Relay</Text>
                <Text type="supporting">Seat-priced chat tools</Text>
              </Grid>
              {COMPARE.map((r) => (
                <VStack key={r.what} gap={0}>
                  <Divider />
                  <Grid columns={3} gap={3} align="center" justify="start" className="site-row">
                    <Text color="secondary">{r.what}</Text>
                    <HStack gap={2} vAlign="center"><Text color="accent"><Icon n="check" size={16} /></Text><Text weight="semibold">{r.relay}</Text></HStack>
                    <Text color="secondary">{r.other}</Text>
                  </Grid>
                </VStack>
              ))}
            </VStack>
          </Card>
        </VStack>
      </VStack>

      <SiteSection paddingBlockStart={10} paddingBlockEnd={10} gap={8}>
        <VStack gap={3} hAlign="center">
          <Text type="supporting" justify="center">Your turn</Text>
          <Heading level={2} type="display-3" weight="semibold" justify="center" textWrap="balance">Your Monday starts in three steps</Heading>
        </VStack>
        <Grid columns={wide ? 3 : 1} gap={wide ? 8 : 5}>
          {STEPS.map(([title, text], k) => (
            <VStack key={title} gap={2} hAlign="start">
              <Text type="supporting" hasTabularNumbers>Step {k + 1}</Text>
              <Text weight="semibold">{title}</Text>
              <Text color="secondary">{text}</Text>
            </VStack>
          ))}
        </Grid>
        <VStack hAlign="center" gap={4}>
          <Mascot say="See you in #general" />
          <Button label="Get Relay free" variant="primary" size="lg" onClick={onGetStarted} />
        </VStack>
      </SiteSection>
    </SiteFrame>
  );
}
