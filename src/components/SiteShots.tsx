// Renders of the Relay workspace for the public pages: the hero window (with the robot on its frame)
// and the small previews inside the feature cards. Built from Astryx parts with seeded sample data,
// inert and non-interactive, always light (they sit inside the public site's light Theme).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Avatar } from '@astryxdesign/core/Avatar';
import { AvatarGroup } from '@astryxdesign/core/AvatarGroup';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { LogoMark } from './LogoIntro.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Robot } from './Robot.tsx';

const muted: CSSProperties = { background: 'var(--color-background-muted)' };
const clip: CSSProperties = { overflow: 'hidden' };

function Person({ name, size = 'sm' }: { name: string; size?: 'xsm' | 'sm' }) {
  return <Avatar name={name} size={size} tooltip={false} />;
}

function Message({ who, time, children, extra }: { who: string; time: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <HStack gap={2} vAlign="start">
      <Person name={who} />
      <VStack gap={0.5}>
        <HStack gap={2} vAlign="center"><Text weight="semibold" size="sm">{who}</Text><Text type="supporting" size="xsm">{time}</Text></HStack>
        <Text size="sm">{children}</Text>
        {extra}
      </VStack>
    </HStack>
  );
}

function SideRow({ icon, label, on }: { icon?: IconName; label: string; on?: boolean }) {
  return (
    <HStack gap={2} vAlign="center" paddingInline={2} paddingBlock={1} style={on ? { background: 'var(--color-background-card)', borderRadius: 'var(--radius-element)', boxShadow: 'var(--shadow-low)' } : undefined}>
      {icon ? <Icon n={icon} size={14} /> : <Text color="secondary" size="sm">#</Text>}
      <Text size="sm" weight={on ? 'semibold' : 'normal'} color={on ? 'primary' : 'secondary'}>{label}</Text>
    </HStack>
  );
}

// One working day in #product-team, as it lands in the hero window. Messages arrive one by one on a loop.
const DAY: { who: string; time: string; text: string; extra?: 'thread' | 'react' }[] = [
  { who: 'Maya Chen', time: '9:02 AM', text: 'Morning! Standup thread is up. Add your three lines before 9:30.', extra: 'thread' },
  { who: 'Ken Ito', time: '9:14 AM', text: 'Yesterday: fixed the CSV export bug. Today: release notes. Blockers: none.' },
  { who: 'Priya Nair', time: '11:40 AM', text: 'Design review moved to 2 PM. Notes go on the channel page.', extra: 'react' },
];

function DayMessage({ m }: { m: (typeof DAY)[number] }) {
  return (
    <Message who={m.who} time={m.time} extra={
      m.extra === 'thread' ? <Text color="accent" size="xsm" weight="semibold">5 replies · last at 9:28</Text>
      : m.extra === 'react' ? <HStack gap={1}><Token size="sm" label="👍 4" /><Token size="sm" label="👀 2" /></HStack>
      : undefined
    }>{m.text}</Message>
  );
}

// The workspace as it looks inside the app: the Relay title bar, a sidebar of channels and people, and
// #product-team open with the day's messages landing. `shown` is how many of the day's messages are in.
function ProductShot({ shown }: { shown: number }) {
  const narrow = useMediaQuery('(max-width: 720px)');
  return (
    <Card padding={0} elevation="high" role="img" aria-label="The Relay workspace: the #product-team channel with a standup thread, updates and a recap from Relay Bot" inert style={clip} className="site-shot">
      <HStack gap={2} vAlign="center" justify="between" paddingInline={3} paddingBlock={2} style={muted}>
        <HStack gap={2} vAlign="center"><LogoMark size={16} /><Text size="sm" weight="semibold">Relay</Text></HStack>
        <Text type="supporting" size="xsm">Relay HQ · #product-team</Text>
      </HStack>
      <Divider />
      <HStack gap={0} vAlign="stretch" height={narrow ? 400 : 470}>
        {!narrow && (
          <VStack gap={0.5} padding={3} width={220} style={muted}>
            <HStack gap={2} vAlign="center" paddingInline={2} paddingBlockEnd={2}><Text weight="bold">Relay HQ</Text></HStack>
            <SideRow icon="home" label="Home" />
            <SideRow icon="inbox" label="Activity" />
            <SideRow icon="file" label="Pages" />
            <SideRow icon="checkSquare" label="Tasks" />
            <SideRow icon="calendar" label="Calendar" />
            <Text type="supporting" size="xsm">&nbsp;</Text>
            <Text type="supporting" size="xsm">Channels</Text>
            <SideRow label="general" />
            <SideRow label="product-team" on />
            <SideRow label="design-crit" />
            <SideRow label="support-desk" />
            <Text type="supporting" size="xsm">&nbsp;</Text>
            <Text type="supporting" size="xsm">Direct messages</Text>
            {['Maya Chen', 'Ken Ito', 'Priya Nair'].map((n) => (
              <HStack key={n} gap={2} vAlign="center" paddingInline={2} paddingBlock={1}><Person name={n} size="xsm" /><Text size="sm" color="secondary">{n}</Text></HStack>
            ))}
          </VStack>
        )}
        <StackItem size="fill">
          <VStack gap={0} height="100%">
            <HStack gap={3} vAlign="center" justify="between" paddingInline={4} paddingBlock={3}>
              <VStack gap={0}>
                <Heading level={3}># product-team</Heading>
                <Text type="supporting" size="xsm">Shipping v2.4 this week · 9 members</Text>
              </VStack>
              <HStack gap={2} vAlign="center">
                <AvatarGroup size="xsm">{['Maya Chen', 'Ken Ito', 'Priya Nair'].map((n) => <Avatar key={n} name={n} tooltip={false} />)}</AvatarGroup>
                <Token size="sm" label="Huddle" icon={<Icon n="headphones" size={12} />} />
              </HStack>
            </HStack>
            <Divider />
            <StackItem size="fill" style={clip}>
              <VStack gap={4} padding={4}>
                {DAY.slice(0, shown).map((m) => <VStack key={m.time} className="site-msg"><DayMessage m={m} /></VStack>)}
                {shown > DAY.length && (
                  <VStack className="site-msg">
                    <Card variant="purple" padding={3}>
                      <HStack gap={2} vAlign="start">
                        <Avatar name="Relay Bot" size="sm" tooltip={false} />
                        <VStack gap={0.5}>
                          <Text weight="semibold" size="sm">Relay Bot · Recap of today</Text>
                          <Text size="sm" color="secondary">Export bug fixed, release notes drafted, design review at 2 PM.</Text>
                        </VStack>
                      </HStack>
                    </Card>
                  </VStack>
                )}
              </VStack>
            </StackItem>
            <VStack padding={3}>
              <Card padding={3}><Text color="placeholder" size="sm">Message #product-team</Text></Card>
            </VStack>
          </VStack>
        </StackItem>
      </HStack>
    </Card>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The hero: the workspace window with Relay's robot living on its top edge. The robot crawls along the
// frame, stops, looks at the cursor, waves, peeks over the edge into the channel, and glances at each
// message as it lands. With reduced motion it sits still on the frame's corner and every message is in.
export function HeroShot() {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [shown, setShown] = useState(reduce ? DAY.length + 1 : 1);
  const stage = useRef<HTMLElement>(null);
  const lookAt = useRef<(x: number, y: number) => void>(() => {});
  const busyUntil = useRef(0);

  // The day's messages tick in, then the day starts over.
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setShown((n) => (n > DAY.length ? 1 : n + 1)), 2600);
    return () => window.clearInterval(t);
  }, [reduce]);

  // The robot glances at the newest message and holds that look a moment before the cursor wins again.
  useEffect(() => {
    if (reduce) return;
    const msgs = stage.current?.querySelectorAll<HTMLElement>('.site-msg');
    const last = msgs?.[msgs.length - 1];
    if (!last) return;
    const r = last.getBoundingClientRect();
    busyUntil.current = performance.now() + 1400;
    lookAt.current(r.left + r.width / 3, r.top + r.height / 2);
  }, [shown, reduce]);

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root || reduce) return;
    const bot = root.querySelector<HTMLElement>('.site-bot')!;
    const head = root.querySelector<HTMLElement>('.site-bot .nx-bot-head')!;
    const face = root.querySelector<HTMLElement>('.site-bot .nx-face')!;
    const turn = gsap.quickTo(head, 'rotation', { duration: 0.5, ease: 'power3.out' });
    const fx = gsap.quickTo(face, 'x', { duration: 0.4, ease: 'power3.out' });
    const fy = gsap.quickTo(face, 'y', { duration: 0.4, ease: 'power3.out' });
    lookAt.current = (x, y) => {
      const h = head.getBoundingClientRect();
      const dx = x - (h.left + h.width / 2), dy = y - (h.top + h.height / 2);
      // The walker flips horizontally on the way back; keep the gaze in screen space.
      const flip = Number(gsap.getProperty(bot, 'scaleX')) < 0 ? -1 : 1;
      turn(clamp((dx / 25) * flip, -16, 16));
      fx(clamp((dx / 40) * flip, -6, 6));
      fy(clamp(dy / 40, -3, 5));
    };
    const onMove = (e: PointerEvent) => { if (performance.now() > busyUntil.current) lookAt.current(e.clientX, e.clientY); };
    window.addEventListener('pointermove', onMove);

    let tl: gsap.core.Timeline | null = null;
    let width = -1;
    const build = () => {
      if (root.clientWidth === width) return;
      width = root.clientWidth;
      tl?.kill();
      bot.classList.remove('is-waving');
      const span = Math.max(0, width - bot.offsetWidth - 24);
      const steps = 9, stride = span / steps;
      const wave = (on: boolean) => () => { bot.classList.toggle('is-waving', on); };
      const t = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });
      t.set(bot, { x: 12, y: 0, rotation: 0, scaleX: 1 });
      const walk = (dir: 1 | -1) => {
        t.set(bot, { scaleX: dir });
        for (let i = 0; i < steps; i++) {
          t.to(bot, { x: `+=${dir * stride}`, duration: 0.8, ease: 'power1.inOut' })
            .to(bot, { y: -6, duration: 0.3, ease: 'power1.out' }, '<')
            .to(bot, { y: 0, duration: 0.45, ease: 'bounce.out' }, '>');
        }
      };
      walk(1);
      t.set(bot, { scaleX: 1 })
        .call(wave(true), [], '+=0.3')
        .to({}, { duration: 2.2 })
        .call(wave(false))
        // Peek over the edge into the channel, then climb back up.
        .to(bot, { y: 34, rotation: -8, duration: 0.7, ease: 'back.out(1.6)' }, '+=0.2')
        .to({}, { duration: 1.6 })
        .to(bot, { y: 0, rotation: 0, duration: 0.6, ease: 'power2.inOut' });
      walk(-1);
      t.set(bot, { scaleX: 1 }).to({}, { duration: 1.2 });
      tl = t;
    };
    build();
    const idle = gsap.to(root.querySelector('.site-bot .nx-bot-inner'), { y: -3, duration: 1.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    const ro = new ResizeObserver(() => build());
    ro.observe(root);
    return () => { ro.disconnect(); tl?.kill(); idle.kill(); bot.classList.remove('is-waving'); window.removeEventListener('pointermove', onMove); lookAt.current = () => {}; };
  }, [reduce]);

  return (
    <VStack ref={stage} className="site-stage">
      <VStack className="site-bot" aria-hidden><Robot mood={shown > DAY.length ? 'happy' : 'focus'} /></VStack>
      <ProductShot shown={shown} />
    </VStack>
  );
}

// ---- Small previews for the home page's feature cards ----

function Preview({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Card padding={4} elevation="low" role="img" aria-label={label} inert minHeight={180} style={clip}>
      <VStack gap={3}>{children}</VStack>
    </Card>
  );
}

export function ChannelsPreview() {
  return (
    <Preview label="A channel with a threaded reply">
      <HStack gap={2} vAlign="center"><Heading level={4}># design</Heading><Text type="supporting" size="xsm">Product and brand design</Text></HStack>
      <Message who="Maya Chen" time="10:02">Can we look at the onboarding flow together?</Message>
      <Message who="Ken Ito" time="10:05" extra={<Text color="accent" size="xsm" weight="semibold">2 replies · last at 10:09</Text>}>Step 2 copy needs a pass.</Message>
    </Preview>
  );
}

export function HuddlesPreview() {
  return (
    <Preview label="A direct message and a live huddle">
      <HStack gap={2} vAlign="center"><Person name="Ken Ito" size="xsm" /><Heading level={4}>Ken Ito</Heading></HStack>
      <Message who="Ken Ito" time="2:14">Got five minutes to walk through the deck?</Message>
      <Card variant="green" padding={3}>
        <HStack gap={3} vAlign="center" justify="between">
          <HStack gap={2} vAlign="center"><Icon n="headphones" size={16} /><Text weight="semibold" size="sm">Huddle · 04:12</Text></HStack>
          <AvatarGroup size="xsm">{['Ken Ito', 'Maya Chen', 'Priya Nair'].map((n) => <Avatar key={n} name={n} tooltip={false} />)}</AvatarGroup>
        </HStack>
      </Card>
    </Preview>
  );
}

const ROWS: [string, string, 'green' | 'yellow' | 'blue'][] = [
  ['Final design review', 'Maya', 'green'],
  ['Announcement post', 'Ken', 'yellow'],
  ['Pricing page', 'Priya', 'blue'],
];
const STATUS = { green: 'Done', yellow: 'In progress', blue: 'To do' } as const;

export function PagesPreview() {
  return (
    <Preview label="A page with a small database of launch work">
      <Heading level={4}>Launch plan</Heading>
      <Text size="sm" color="secondary">Everything that ships on Friday, with an owner for each.</Text>
      <VStack gap={0}>
        {ROWS.map(([task, who, c]) => (
          <VStack key={task} gap={0}>
            <Divider />
            <HStack gap={2} vAlign="center" justify="between" paddingBlock={1.5}>
              <Text size="sm">{task}</Text>
              <HStack gap={2} vAlign="center"><Text type="supporting" size="xsm">{who}</Text><Token size="sm" color={c} label={STATUS[c]} /></HStack>
            </HStack>
          </VStack>
        ))}
      </VStack>
    </Preview>
  );
}

export function TasksPreview() {
  const cols: [string, string[]][] = [['To do', ['Pricing page', 'Press kit']], ['In progress', ['QA on mobile']], ['Done', ['Copy review']]];
  return (
    <Preview label="A task board and this week's calendar">
      <HStack gap={2} vAlign="start">
        {cols.map(([title, cards]) => (
          <StackItem key={title} size="fill">
            <VStack gap={1.5}>
              <Text type="supporting" size="xsm" weight="semibold">{title}</Text>
              {cards.map((t) => <Card key={t} padding={2} variant="muted"><Text size="xsm">{t}</Text></Card>)}
            </VStack>
          </StackItem>
        ))}
      </HStack>
      <HStack gap={1.5}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
          <StackItem key={d} size="fill">
            <Card padding={2} variant={i === 3 ? 'purple' : 'muted'}>
              <VStack gap={0.5}><Text type="supporting" size="xsm">{d}</Text><Text size="xsm" weight="semibold">{i === 3 ? 'Launch' : i === 1 ? 'Review' : '·'}</Text></VStack>
            </Card>
          </StackItem>
        ))}
      </HStack>
    </Preview>
  );
}

// The mascot at rest with one line to say: the recurring Relay Bot on inner pages. Decorative.
export function Mascot({ say }: { say: string }) {
  return (
    <VStack hAlign="center" gap={2} className="site-mascot" aria-hidden>
      <Card padding={2} elevation="low" className="site-mascot-say"><Text size="sm" weight="medium">{say}</Text></Card>
      <Robot mood="happy" />
    </VStack>
  );
}
