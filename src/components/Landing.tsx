import { useEffect, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Link } from '@astryxdesign/core/Link';
import { Avatar } from '@astryxdesign/core/Avatar';
import { StackItem } from '@astryxdesign/core/Layout';
import { Divider } from '@astryxdesign/core/Divider';
import { Icon, type IconName } from './Icon.tsx';
import { LogoMark } from './LogoIntro.tsx';
import { FeaturePage } from './Features.tsx';
import { HelpPage } from './Help.tsx';
import { ChannelsPreview, HuddlesPreview, Mascot, PagesPreview, HeroShot, TasksPreview } from './SiteShots.tsx';
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

// The hero's verb arrives like a message: the Relay mark is the sender, three typing dots show, then the
// word lands in a chat bubble (slides up and pops) in the display face. It cycles Chat, Decide, Ship,
// Plan; the pointer on the headline holds it; with reduced motion it stays on one calm word. The h1's
// label is the plain sentence, so screen readers hear it once and never the cycling.
const WORDS = ['Chat', 'Decide', 'Ship', 'Plan'];

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

function HeroHeadline() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [typing, setTyping] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (reduce || paused) return;
    let land = 0;
    const t = window.setInterval(() => {
      setTyping(true);
      land = window.setTimeout(() => { setI((n) => (n + 1) % WORDS.length); setTyping(false); }, 700);
    }, 2800);
    return () => { window.clearInterval(t); window.clearTimeout(land); setTyping(false); };
  }, [reduce, paused]);
  const word = reduce ? 'Flow' : WORDS[i];
  return (
    <Heading level={1} type="display-1" weight="semibold" justify="center" textWrap="balance" className="site-hero-title" aria-label="Where teams and work flow together."
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      Where teams and work{' '}
      <span className="site-say" aria-hidden aria-live="off">
        <span className="site-say-from"><LogoMark size={22} /></span>
        <span className={`site-say-bubble${typing ? ' is-typing' : ''}`}>
          {typing
            ? <span className="site-say-dots"><i /><i /><i /></span>
            : <span key={word} className="site-say-word">{word}</span>}
        </span>
      </span>
      {' '}together.
    </Heading>
  );
}

const FEATURES: { eyebrow: string; title: string; text: string; link: string; href: string; preview: ReactNode }[] = [
  { eyebrow: 'Channels and threads', title: 'Every team gets a room, every topic a thread', text: 'Post where the team already is. Replies fold into a thread, so the channel stays readable for the people who were not there.', link: 'How channels work', href: '/overview', preview: <ChannelsPreview /> },
  { eyebrow: 'Direct messages and huddles', title: 'Talk it through, then get back to work', text: 'Start a call from any conversation. When it ends, the notes land back in the chat.', link: 'How huddles work', href: '/huddles', preview: <HuddlesPreview /> },
  { eyebrow: 'Pages and databases', title: 'Decisions written down next to the chat', text: 'Every channel has a page for the plan, with a small database for who owns what.', link: 'Read about canvases', href: '/help/canvases', preview: <PagesPreview /> },
  { eyebrow: 'Tasks and calendar', title: 'Plan the week and see who owns what', text: 'Move work across a board and see the week at a glance, without leaving the workspace your team talks in.', link: 'Read about lists', href: '/help/lists', preview: <TasksPreview /> },
];

const DAY_ONE: { icon: IconName; title: string; detail: string; href: string }[] = [
  { icon: 'message', title: 'Run standups in a channel', detail: 'A thread a day, three lines each', href: '/overview' },
  { icon: 'file', title: 'Keep decisions in a page', detail: 'Written down where the talk happened', href: '/help/canvases' },
  { icon: 'layout', title: 'Track work on a board', detail: 'Status, owner and due date', href: '/help/lists' },
  { icon: 'calendar', title: 'Plan the week on the calendar', detail: 'Reviews, launches and leave in one view', href: '/overview' },
  { icon: 'search', title: 'Find anything with Ctrl K', detail: 'Every message, person and channel', href: '/search' },
];

// One working day, three teams: what Relay looks like at 9:30, 2:00 and 5:00.
const TIMELINE: { time: string; team: string; channel: string; who: string; text: string; note: string }[] = [
  { time: '09:30', team: 'Engineering', channel: '#eng-standup', who: 'Ken Ito', text: 'Yesterday: export fix. Today: release notes. Blockers: none.', note: 'Standup is a thread, not a meeting' },
  { time: '14:00', team: 'Design', channel: '#design-crit', who: 'Priya Nair', text: 'Decision: we keep the two-step invite. Notes are on the channel page.', note: 'The decision lives on the page beside the chat' },
  { time: '17:00', team: 'People', channel: '#onboarding', who: 'Relay Bot', text: 'Recap: 3 new starters set up, laptop order sent, buddy list updated.', note: 'Relay Bot writes the recap for whoever missed the day' },
];

const FACTS: { icon: IconName; text: string }[] = [
  { icon: 'clock', text: 'Unlimited message history' },
  { icon: 'users', text: 'A directory ready for 60k people' },
  { icon: 'lock', text: 'Email, Google, GitHub and Microsoft sign-in' },
  { icon: 'monitor', text: 'Works on phone and desktop' },
  { icon: 'star', text: 'Open source' },
];

const DEPARTMENTS = ['Engineering', 'Design', 'Sales', 'Support', 'People', 'Finance'];

function FeatureCard({ f, wide, flip }: { f: (typeof FEATURES)[number]; wide: boolean; flip?: boolean }) {
  const copy = (
    <VStack gap={3} hAlign="start" className={wide ? 'site-feature-copy' : undefined}>
      <Text type="supporting">{f.eyebrow}</Text>
      <Heading level={3}>{f.title}</Heading>
      <Text color="secondary">{f.text}</Text>
      <Link href={f.href} weight="medium">{f.link} →</Link>
    </VStack>
  );
  return (
    <Card variant="muted" padding={6} className="site-feature">
      {wide ? (
        <HStack gap={8} vAlign="center" className={flip ? 'site-flip' : undefined}>
          {copy}
          <StackItem size="fill">{f.preview}</StackItem>
        </HStack>
      ) : <VStack gap={6}>{copy}{f.preview}</VStack>}
    </Card>
  );
}

function Home({ onGetStarted }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
  useEffect(() => { scrollToHash(); }, []);
  return (
    <SiteFrame route="home" onGetStarted={onGetStarted}>
      <SiteSection paddingBlockStart={10} paddingBlockEnd={6} gap={10}>
        <VStack gap={5} hAlign="center" className="site-rise">
          <HeroHeadline />
          <Text type="large" color="secondary" justify="center" textWrap="balance">Channels, direct messages, pages and tasks for your whole organisation, in one calm place</Text>
          <HStack gap={3} wrap="wrap" justify="center">
            <Button label="Get Relay free" variant="primary" size="lg" onClick={onGetStarted} />
            <Button label="See how it works" variant="secondary" size="lg" onClick={() => scrollToHash('#features', true)} />
          </HStack>
        </VStack>
        <HeroShot />
      </SiteSection>

      <SiteSection paddingBlockStart={4} paddingBlockEnd={10} gap={3}>
        <Text type="supporting" justify="center">Built for every team in the organisation</Text>
        <HStack gap={2} wrap="wrap" justify="center" vAlign="center">
          {DEPARTMENTS.map((d, k) => (
            <HStack key={d} gap={2} vAlign="center">
              {k > 0 && <Text color="secondary" aria-hidden>·</Text>}
              <Text color="secondary" type="large">{d}</Text>
            </HStack>
          ))}
        </HStack>
      </SiteSection>

      <SiteSection id="features" gap={4}>
        <VStack gap={2} paddingBlockEnd={4} maxWidth={640}>
          <Heading level={2} type="display-2" weight="semibold">Everything your team does, in one place</Heading>
          <Text type="large" color="secondary">Four parts of the same workspace, sharing one search, one directory and one bot</Text>
        </VStack>
        <FeatureCard f={FEATURES[0]} wide={wide} />
        <Grid columns={wide ? 2 : 1} gap={4}>
          <FeatureCard f={FEATURES[1]} wide={false} />
          <FeatureCard f={FEATURES[2]} wide={false} />
        </Grid>
        <FeatureCard f={FEATURES[3]} wide={wide} flip />
      </SiteSection>

      <SiteSection gap={6}>
        <Grid columns={wide ? 2 : 1} gap={wide ? 10 : 6}>
          <VStack gap={3} hAlign="start">
            <Heading level={2} type="display-3" weight="semibold">Five things teams do on day one</Heading>
            <Text color="secondary">Nothing to configure first. Each of these works the moment someone creates the workspace and sends the invite link.</Text>
          </VStack>
          <VStack gap={0}>
            {DAY_ONE.map((u, k) => (
              <VStack key={u.title} gap={0}>
                {k > 0 && <Divider />}
                <ClickableCard label={u.title} href={u.href} padding={3} variant="transparent">
                  <HStack gap={3} vAlign="center">
                    <Text color="secondary"><Icon n={u.icon} size={18} /></Text>
                    <StackItem size="fill">
                      <VStack gap={0}><Text weight="medium">{u.title}</Text><Text type="supporting">{u.detail}</Text></VStack>
                    </StackItem>
                    <Text color="secondary" aria-hidden>→</Text>
                  </HStack>
                </ClickableCard>
              </VStack>
            ))}
          </VStack>
        </Grid>
      </SiteSection>

      <VStack as="section" hAlign="center" paddingInline={4} paddingBlock={10} style={{ background: 'var(--color-background-muted)' }} aria-labelledby="day-title">
        <VStack gap={8} width="100%" maxWidth={1080}>
          <VStack gap={2} maxWidth={640}>
            <Heading level={2} type="display-3" weight="semibold" id="day-title">One day, three teams</Heading>
            <Text color="secondary">How a working day moves through Relay, from the morning standup to the recap at five</Text>
          </VStack>
          <Grid columns={wide ? 3 : 1} gap={6}>
            {TIMELINE.map((t) => (
              <VStack key={t.time} gap={3}>
                <HStack gap={3} vAlign="center">
                  <Text weight="semibold" hasTabularNumbers className="site-time">{t.time}</Text>
                  <StackItem size="fill"><Divider /></StackItem>
                </HStack>
                <Text type="supporting">{t.team} · {t.channel}</Text>
                <Card padding={4} elevation="low" className="site-bubble">
                  <HStack gap={2} vAlign="start">
                    <Avatar name={t.who} size="sm" tooltip={false} />
                    <VStack gap={0.5}>
                      <Text weight="semibold" size="sm">{t.who}</Text>
                      <Text size="sm">{t.text}</Text>
                    </VStack>
                  </HStack>
                </Card>
                <Text color="secondary">{t.note}</Text>
              </VStack>
            ))}
          </Grid>
        </VStack>
      </VStack>

      <SiteSection paddingBlockStart={8} paddingBlockEnd={4} gap={4}>
        <HStack gap={6} wrap="wrap" justify="center">
          {FACTS.map((f) => (
            <HStack key={f.text} gap={2} vAlign="center"><Text color="secondary"><Icon n={f.icon} size={16} /></Text><Text type="supporting">{f.text}</Text></HStack>
          ))}
        </HStack>
      </SiteSection>

      <SiteSection paddingBlockStart={8} paddingBlockEnd={10}>
        <Card padding={8} className="site-cta">
          <HStack gap={8} vAlign="center" justify="between" wrap="wrap">
            <VStack gap={3} hAlign="start" maxWidth={520}>
              <Heading level={2} type="display-3" weight="semibold">Your team is one invite link away</Heading>
              <Text color="secondary">Free for your organisation, with every feature on. Create the workspace, share the link, and say hello in #general.</Text>
              <Button label="Get Relay free" variant="primary" size="lg" onClick={onGetStarted} />
            </VStack>
            <Mascot say="See you in #general" />
          </HStack>
        </Card>
      </SiteSection>
    </SiteFrame>
  );
}
