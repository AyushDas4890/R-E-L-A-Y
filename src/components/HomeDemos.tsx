// The home page's product demos, built from Astryx parts with scripted sample data. Four type sizes only
// (display and heading come from the page, body is the default Text, small is type="supporting").
// The hero demo loops one real workflow on its own and also answers what the visitor types. Relay Bot's
// robot lives in it as the bot's avatar: it turns to focus while the bot is typing and smiles on a reply.
// The proof demos play once when they scroll into view. Reduced motion shows every end state at once.
// Everything moves with transform and opacity only.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Slider } from '@astryxdesign/core/Slider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { LogoMark } from './LogoIntro.tsx';
import { Icon } from './Icon.tsx';
import { Robot } from './Robot.tsx';

export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

// True once the element has been at least a quarter on screen. Stays true: the proof demos play once.
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function Person({ name }: { name: string }) {
  return <Avatar name={name} size="sm" tooltip={false} />;
}

function Msg({ who, time, children, extra }: { who: string; time: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <HStack gap={2} vAlign="start">
      <Person name={who} />
      <VStack gap={0.5}>
        <HStack gap={2} vAlign="center"><Text weight="semibold">{who}</Text><Text type="supporting">{time}</Text></HStack>
        <Text>{children}</Text>
        {extra}
      </VStack>
    </HStack>
  );
}

// One entrance for everything that appears in a demo: it rises 8px and fades in. `at` is the beat (in
// 0.3s units) a step waits when the whole demo plays on a timer.
function Step({ show, at = 0, children, className }: { show: boolean; at?: number; children: ReactNode; className?: string }) {
  const style = { '--at': at } as CSSProperties;
  return <VStack className={`home-step${show ? ' is-on' : ''}${className ? ` ${className}` : ''}`} style={style}>{children}</VStack>;
}

// ---- Hero: a working day compressed to 14 seconds ----

// Beats of the loop, in ms from the start: message, thread reply, the /remind being typed, the bot
// thinking, the bot's answer, the recap.
const BEATS = [500, 2400, 4600, 7600, 8800, 10800] as const;
const LOOP = 14500;
const COMMAND = '/remind me send the Q3 deck in 2h';

// What the bot says to whatever a visitor types. Canned, drawn from what Relay Bot really answers.
const ANSWERS: [RegExp, string][] = [
  [/^\/?remind/i, 'Done. I will remind you in 2 hours.'],
  [/recap|summar/i, 'Recap: Ken sends the Q3 deck today, and a reminder is set.'],
  [/huddle|call/i, 'Hit Huddle in any channel. When it ends I post the notes back.'],
  [/price|cost|free|paid|plan|seat/i, 'Free. No seats, no tiers, no billing.'],
  [/help|what can you/i, 'I run reminders, recap channels, answer from your messages and start workflows.'],
];
const reply = (q: string) => ANSWERS.find(([re]) => re.test(q))?.[1] ?? 'Sign in and ask me in your workspace. I search your channels for the answer.';

interface Typed { id: number; who: string; text: string; bot?: boolean }

function BotRow({ children }: { children: ReactNode }) {
  return (
    <Card variant="purple" padding={3}>
      <HStack gap={2} vAlign="start">
        <Avatar name="Relay Bot" size="sm" tooltip={false} />
        <VStack gap={0.5}><Text weight="semibold">Relay Bot</Text><Text>{children}</Text></VStack>
      </HStack>
    </Card>
  );
}

function Dots() {
  return <span className="home-dots" aria-label="Relay Bot is typing"><i /><i /><i /></span>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Relay Bot's robot lives on the window's top edge. It crawls along the frame, stops, waves, peeks over the
// edge into the channel, looks at the cursor, and glances at each message as it lands. Its job: it is the
// bot teammate, so it turns to whatever the bot is about to answer. Reduced motion: it sits still.
function useBotWalker(stage: React.RefObject<HTMLElement | null>, reduce: boolean) {
  const lookAt = useRef<(x: number, y: number) => void>(() => {});
  const busyUntil = useRef(0);
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
  }, [stage, reduce]);
  // Glance at the newest message and hold the look a moment before the cursor wins again.
  return (el: HTMLElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    busyUntil.current = performance.now() + 1400;
    lookAt.current(r.left + r.width / 3, r.top + r.height / 2);
  };
}

export function HeroDemo() {
  const reduce = useReducedMotion();
  const narrow = useMediaQuery('(max-width: 720px)');
  const [beat, setBeat] = useState(reduce ? BEATS.length : 0);
  const [typed, setTyped] = useState(reduce ? COMMAND.length : 0);
  const [mine, setMine] = useState<Typed[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [taken, setTaken] = useState(false); // the visitor started typing: the script stops looping
  const id = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const glance = useBotWalker(stage, reduce);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [mine, thinking]);

  // The scripted loop. Each beat is one timeout; the typing is one interval during beat 3.
  useEffect(() => {
    if (reduce || taken) return;
    const timers: number[] = [];
    let iv = 0;
    const play = () => {
      setBeat(0); setTyped(0);
      BEATS.forEach((ms, k) => timers.push(window.setTimeout(() => {
        setBeat(k + 1);
        if (k === 2) {
          let n = 0;
          iv = window.setInterval(() => { n += 1; setTyped(n); if (n >= COMMAND.length) window.clearInterval(iv); }, 70);
        }
      }, ms)));
      timers.push(window.setTimeout(play, LOOP));
    };
    play();
    return () => { timers.forEach(window.clearTimeout); window.clearInterval(iv); };
  }, [reduce, taken]);

  const send = (text?: string) => {
    const q = (text ?? draft).trim();
    if (!q || thinking) return;
    setTaken(true);
    setBeat(BEATS.length);
    setTyped(COMMAND.length);
    setDraft('');
    setMine((l) => [...l, { id: id.current++, who: 'You', text: q }]);
    setThinking(true);
    window.setTimeout(() => {
      setMine((l) => [...l, { id: id.current++, who: 'Relay Bot', text: reply(q), bot: true }]);
      setThinking(false);
    }, 900);
  };

  useEffect(() => {
    if (reduce) return;
    const items = stage.current?.querySelectorAll<HTMLElement>('.home-step.is-on');
    glance(items?.[items.length - 1] ?? null);
  }, [beat, mine.length, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const typing = !taken && beat === 3 && typed < COMMAND.length;
  const botBusy = thinking || (!taken && beat === 4);
  const composer = typing ? COMMAND.slice(0, typed) : '';

  return (
    <div ref={stage} className="site-stage">
    <div className="site-bot" aria-hidden><Robot mood={botBusy ? 'focus' : 'happy'} /></div>
    <Card padding={0} elevation="high" className="home-window" aria-label="A live Relay demo: the #product-team channel">
      <HStack gap={2} vAlign="center" justify="between" paddingInline={3} paddingBlock={2} className="home-chrome">
        <HStack gap={2} vAlign="center"><LogoMark size={16} /><Text weight="semibold">Relay HQ</Text></HStack>
        <Text type="supporting"># product-team</Text>
      </HStack>
      <Divider />
      <HStack gap={0} vAlign="stretch" className="home-body">
        {!narrow && (
          <VStack gap={1} padding={3} width={200} className="home-side">
            <Text type="supporting">Channels</Text>
            <Text color="secondary"># general</Text>
            <Text weight="semibold"># product-team</Text>
            <Text color="secondary"># design-crit</Text>
            <Text type="supporting">Direct messages</Text>
            <HStack gap={2} vAlign="center"><Avatar name="Relay Bot" size="xsm" tooltip={false} /><Text color="secondary">Relay Bot</Text></HStack>
          </VStack>
        )}
        <StackItem size="fill">
          <VStack gap={0} height="100%">
            <VStack ref={feed} gap={4} padding={4} className="home-feed" aria-live="polite">
              <Step show={beat >= 1}><Msg who="Maya Chen" time="9:02 AM">Who is sending the Q3 deck to the client?</Msg></Step>
              <Step show={beat >= 2}>
                <Msg who="Ken Ito" time="9:04 AM" extra={<Text type="supporting" color="accent" weight="semibold">1 reply in thread</Text>}>I am. Before Friday.</Msg>
              </Step>
              <Step show={beat >= 4 || taken}><Msg who="Ken Ito" time="9:05 AM"><code className="home-code">{COMMAND}</code></Msg></Step>
              <Step show={botBusy && !taken}><Dots /></Step>
              <Step show={beat >= 5 || taken}><BotRow>Done. I will remind you at 11:05 AM.</BotRow></Step>
              <Step show={beat >= 6 || taken}><BotRow>Recap of today: Ken owns the Q3 deck. Reminder set.</BotRow></Step>
              {mine.map((m) => (
                <Step key={m.id} show>
                  {m.bot ? <BotRow>{m.text}</BotRow> : <Msg who="You" time="now">{m.text}</Msg>}
                </Step>
              ))}
              {thinking && <Dots />}
            </VStack>
            <HStack gap={2} wrap="wrap" paddingInline={3} paddingBlockStart={2}>
              {['Is it free?', 'What can you do?', '/remind me stretch in 10m'].map((q) => (
                <Button key={q} label={q} size="sm" variant="secondary" onClick={() => send(q)} />
              ))}
            </HStack>
            <HStack gap={3} vAlign="center" padding={3} className="home-compose">
              <StackItem size="fill">
                {typing
                  ? <Card padding={3}><Text>{composer}<span className="home-caret" /></Text></Card>
                  : <TextInput label="Ask Relay Bot" isLabelHidden placeholder="Try it: ask Relay Bot about huddles or price" value={draft} onChange={(v) => setDraft(v)}
                      onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />}
              </StackItem>
            </HStack>
          </VStack>
        </StackItem>
      </HStack>
    </Card>
    </div>
  );
}

// ---- Proof: three outcomes, each shown working ----

function Shell({ children, label }: { children: (on: boolean) => ReactNode; label: string }) {
  const reduce = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>();
  const [play, setPlay] = useState(true);
  const on = reduce || (seen && play);
  // Replay: hide every step, then let them rise again from the first beat.
  const replay = () => { setPlay(false); window.setTimeout(() => setPlay(true), 350); };
  return (
    <div ref={ref}>
      <VStack gap={2} hAlign="end">
        <Card padding={5} elevation="low" role="img" aria-label={label} inert width="100%">
          <VStack gap={4}>{children(on)}</VStack>
        </Card>
        {!reduce && <Button label="Replay" size="sm" variant="ghost" onClick={replay} />}
      </VStack>
    </div>
  );
}

// Replies fold into a thread, so the channel stays short.
export function ThreadDemo() {
  return (
    <Shell label="A message with replies folded into a thread, and the channel staying short">
      {(on) => (
        <>
          <Step show={on} at={0}><Msg who="Priya Nair" time="10:02 AM" extra={<Text type="supporting" color="accent" weight="semibold">3 replies · last at 10:09</Text>}>Can we cut step two from onboarding?</Msg></Step>
          <Step show={on} at={3} className="home-indent"><Msg who="Ken Ito" time="10:04 AM">Yes. Nobody uses it.</Msg></Step>
          <Step show={on} at={5} className="home-indent"><Msg who="Maya Chen" time="10:07 AM">Agreed. I will update the flow.</Msg></Step>
          <Divider />
          <Step show={on} at={8}><Msg who="Ken Ito" time="10:15 AM">Release notes are up in the channel page.</Msg></Step>
        </>
      )}
    </Shell>
  );
}

// You type a reminder; Relay Bot confirms it, then sends it when it is due.
export function ReminderDemo() {
  return (
    <Shell label="Typing a reminder, and Relay Bot confirming and then sending it">
      {(on) => (
        <>
          <Step show={on} at={0}><Msg who="Maya Chen" time="9:30 AM"><code className="home-code">/remind #launch ship notes in 2h</code></Msg></Step>
          <Step show={on} at={3}><BotRow>Done. I will post in #launch at 11:30 AM.</BotRow></Step>
          <Step show={on} at={7}>
            <HStack gap={2} vAlign="center"><Icon n="clock" size={16} /><Text type="supporting">Two hours later</Text></HStack>
          </Step>
          <Step show={on} at={9}><BotRow>Reminder: ship notes.</BotRow></Step>
        </>
      )}
    </Shell>
  );
}

const ROWS: [string, string, 'green' | 'yellow' | 'blue', string][] = [
  ['Final design review', 'Maya', 'green', 'Done'],
  ['Announcement post', 'Ken', 'green', 'Done'],
  ['Pricing page', 'Priya', 'yellow', 'In progress'],
];

// Decisions written on the channel page, next to the chat.
export function PageDemo() {
  return (
    <Shell label="A channel page with a launch plan and a small database of owners and status">
      {(on) => (
        <>
          <Step show={on} at={0}><Text weight="semibold">Launch plan</Text></Step>
          <Step show={on} at={2}><Text color="secondary">Decision: we keep the two-step invite.</Text></Step>
          <VStack gap={0}>
            {ROWS.map(([task, who, c, label], k) => (
              <Step key={task} show={on} at={4 + k * 2}>
                <Divider />
                <HStack gap={2} vAlign="center" justify="between" paddingBlock={2}>
                  <Text>{task}</Text>
                  <HStack gap={2} vAlign="center"><Text type="supporting">{who}</Text><Token size="sm" color={c} label={label} /></HStack>
                </HStack>
              </Step>
            ))}
          </VStack>
        </>
      )}
    </Shell>
  );
}

// "Pay for seats?" The slider adds people to the team; the bill stays at $0. People pop in.
export function SeatDemo() {
  const [n, setN] = useState(25);
  const shown = Math.min(n, 60);
  return (
    <VStack gap={4} hAlign="center" width="100%">
      <HStack gap={3} vAlign="center" justify="center" wrap="wrap">
        <Text weight="semibold">{n} {n === 1 ? 'person' : 'people'} on Relay</Text>
        <span className="site-bill" aria-live="polite">$0</span>
        <Text type="supporting">per month</Text>
      </HStack>
      <VStack width="100%" maxWidth={520}>
        <Slider label="Team size" value={n} onChange={(v: number) => setN(v)} min={1} max={500} step={1} />
      </VStack>
      <div className="site-crowd" aria-hidden>
        {Array.from({ length: shown }, (_, i) => <i key={i} style={{ '--k': i % 12 } as CSSProperties} />)}
      </div>
    </VStack>
  );
}
