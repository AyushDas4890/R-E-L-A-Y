import { useEffect, useRef, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Icon, type IconName } from './Icon.tsx';
import { FeaturePage } from './Features.tsx';
import { HelpPage } from './Help.tsx';
import { BoardDemo, HeroDemo, PageDemo, ReminderDemo, ThreadDemo } from './HomeDemos.tsx';
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

// The home page tells one story in four screens: what Relay is (a team management app), what it does
// on one ordinary Monday, how a team sets it up, and how to start. Type uses four sizes: display-1 for the
// headline, display-3 for every other heading, body, and small (type="supporting").

type Tint = 'purple' | 'green' | 'yellow' | 'blue';

// Every claim maps to something shipped: threads, lists (the channel task board), reminders and
// scheduled workflows (Relay Bot), and canvases and pages.
const PROOF: { when: string; tint: Tint; title: string; text: string; demo: ReactNode }[] = [
  { when: '9:02 AM', tint: 'purple', title: 'Standup runs itself in a thread.', text: 'Everyone posts three lines under one message, so the channel stays readable for whoever was not there.', demo: <ThreadDemo /> },
  { when: '9:30 AM', tint: 'green', title: 'Every task has an owner.', text: 'Each channel has a task board. Cards show who owns them and move across as work does.', demo: <BoardDemo /> },
  { when: '11:00 AM', tint: 'yellow', title: 'Follow-ups do not slip.', text: 'Type /remind and Relay Bot nudges you on time. It also recaps channels and answers from your messages.', demo: <ReminderDemo /> },
  { when: '2:00 PM', tint: 'blue', title: 'Decisions stay on the page.', text: 'Every channel has a page for the plan, with a small database for who owns what.', demo: <PageDemo /> },
];

// How a team can set Relay up. Channels, lists, canvases, user groups, reminders and workflows (keyword,
// join and weekday schedule) are all in the product; see help.ts.
const TEAMS: { team: string; tint: Tint; rows: { icon: IconName; label: string; text: string }[] }[] = [
  { team: 'Engineering', tint: 'purple', rows: [
    { icon: 'message', label: 'Channel', text: '#eng-standup, one thread a day. Everyone adds three lines.' },
    { icon: 'checkSquare', label: 'Board', text: 'To do, In progress, Done. Every card has an owner.' },
    { icon: 'zap', label: 'Relay Bot', text: 'A weekday workflow posts the standup prompt at 9:30.' } ] },
  { team: 'Design', tint: 'green', rows: [
    { icon: 'message', label: 'Channel', text: '#design-crit for feedback, with replies in threads.' },
    { icon: 'file', label: 'Page', text: 'A canvas holds the decision log beside the chat.' },
    { icon: 'users', label: 'User group', text: 'Mention @designers to reach the whole team in one go.' } ] },
  { team: 'People', tint: 'yellow', rows: [
    { icon: 'message', label: 'Channel', text: '#onboarding for every new starter.' },
    { icon: 'zap', label: 'Relay Bot', text: 'A join workflow welcomes each person to the channel.' },
    { icon: 'checkSquare', label: 'Board', text: 'An onboarding checklist with an owner on every step.' } ] },
  { team: 'Support', tint: 'blue', rows: [
    { icon: 'message', label: 'Channel', text: '#support-desk where requests land.' },
    { icon: 'zap', label: 'Relay Bot', text: 'A keyword workflow answers common questions at once.' },
    { icon: 'clock', label: 'Reminder', text: '/remind keeps a follow-up from being forgotten.' } ] },
];

const STEPS: [string, string][] = [
  ['Create the workspace', 'Sign in with email, Google, GitHub or Microsoft.'],
  ['Share the invite link', 'People join with one link.'],
  ['Say hello in #general', 'Channels, pages and Relay Bot are ready.'],
];

function Home({ onGetStarted }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
  const [team, setTeam] = useState(0);
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
        <SiteSection paddingBlockStart={10} paddingBlockEnd={10} gap={8}>
          <VStack gap={4} hAlign="center" className="site-rise">
            <Heading level={1} type="display-1" weight="semibold" justify="center" textWrap="balance">Team management, <span className="site-mark">minus the meetings.</span></Heading>
            <Text justify="center" color="secondary" textWrap="balance">Relay is a team management app: chat, tasks, calendar and pages in one place, with a bot that follows up.</Text>
            <HStack gap={3} wrap="wrap" justify="center">
              <Button label="Get started" variant="primary" size="lg" onClick={onGetStarted} />
              <Button label="Follow a day in Relay" variant="secondary" size="lg" onClick={() => scrollToHash('#proof', true)} />
            </HStack>
          </VStack>
          <HeroDemo />
        </SiteSection>
      </VStack>

      <SiteSection id="proof" gap={8} paddingBlockStart={10} paddingBlockEnd={10}>
        <VStack gap={2} hAlign="center">
          <Text type="supporting" justify="center">One ordinary Monday</Text>
          <Heading level={2} type="display-3" weight="semibold" justify="center" textWrap="balance">How a team runs on Relay</Heading>
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

      <SiteSection id="teams" gap={6} paddingBlockStart={10} paddingBlockEnd={10}>
        <VStack gap={2} hAlign="center">
          <Text type="supporting" justify="center">Set it up for your team</Text>
          <Heading level={2} type="display-3" weight="semibold" justify="center" textWrap="balance">Pick your team. Here is the setup.</Heading>
        </VStack>
        <HStack gap={2} wrap="wrap" justify="center">
          {TEAMS.map((t, k) => (
            <Button key={t.team} label={t.team} size="md" variant={k === team ? 'primary' : 'secondary'} onClick={() => setTeam(k)} />
          ))}
        </HStack>
        <div key={TEAMS[team].team} className={`site-chapter site-recipe tint-${TEAMS[team].tint}`}>
          <Grid columns={wide ? 3 : 1} gap={wide ? 8 : 5}>
            {TEAMS[team].rows.map((r, k) => (
              <VStack key={r.label} gap={2} hAlign="start" className="home-step is-on" style={{ '--at': k } as React.CSSProperties}>
                <span className="site-time-chip"><Icon n={r.icon} size={14} /> {r.label}</span>
                <Text>{r.text}</Text>
              </VStack>
            ))}
          </Grid>
        </div>
      </SiteSection>

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
          <Button label="Get started" variant="primary" size="lg" onClick={onGetStarted} />
        </VStack>
      </SiteSection>
    </SiteFrame>
  );
}
