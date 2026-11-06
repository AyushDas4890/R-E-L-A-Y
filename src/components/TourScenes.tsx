// Landing page feature tiles: each one is a small, true-to-life piece of Relay doing one job, on a
// loop. Markup is the real interface vocabulary (channel header, messages, thread panel, huddle bar,
// list rows, workflow steps, the Ctrl K palette); the timelines below explain one action each.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Icon } from './Icon.tsx';
import { ENTER, EXIT, T, arrive, loopScene, pointAt, reduceMotion, typeText, setText, typing } from '../motion.ts';

type Q = (s: string) => Element[];

const PEOPLE = {
  M: { name: 'Maya', c: '#c8705a' },
  K: { name: 'Ken', c: '#3c9a8f' },
  P: { name: 'Priya', c: '#7d68c4' },
  S: { name: 'Sam', c: '#c08a3e' },
} as const;
type Who = keyof typeof PEOPLE;

const Av = ({ w, round }: { w: Who; round?: boolean }) => (
  <i className={`ms-av ${round ? 'round' : ''}`} style={{ background: PEOPLE[w].c }}>{w}</i>
);

function Msg({ w, time, text, className = '', children }: { w: Who; time: string; text?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`ms-msg ${className}`}>
      <Av w={w} />
      <div className="ms-body"><span className="ms-who"><b>{PEOPLE[w].name}</b><time>{time}</time></span>{text && <p>{text}</p>}{children}</div>
    </div>
  );
}

const BotMsg = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`ms-msg ${className}`}>
    <i className="ms-av bot"><Icon n="bot" size={15} /></i>
    <div className="ms-body"><span className="ms-who"><b>Relay Bot</b><em>App</em></span>{children}</div>
  </div>
);

const Dots = ({ className = '' }: { className?: string }) => <span className={`ms-dots ${className}`}><i /><i /><i /></span>;

const Pointer = () => (
  <svg className="mo-cursor" width="18" height="20" viewBox="0 0 18 20" aria-hidden>
    <path d="M2 1.5v14.2l3.9-3.5 2.7 6.1 2.6-1.1-2.6-6h5.6z" fill="#1d1d1f" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

function Head({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <header className="ms-head"><div><b>{title}</b>{sub && <small>{sub}</small>}</div>{children}</header>;
}

// ---------------- Markup ----------------

function Channels() {
  return (
    <div className="ms-win ms-chan">
      <Head title="# launch" sub="Launch prep for v2"><span className="ms-btn ghost"><Icon n="headphones" size={14} /></span></Head>
      <div className="ms-feed">
        <Msg className="c-m1" w="M" time="10:02" text="Launch copy is ready for review" />
        <Msg className="c-m2" w="K" time="10:04" text="Looks good. One question on pricing">
          <span className="ms-replies c-replies"><span className="ms-faces"><Av w="M" /><Av w="K" /></span>2 replies</span>
        </Msg>
        <Msg className="c-m3" w="P" time="10:06">
          <span className="ms-swap"><Dots className="c-dots" /><p className="c-text">We ship at 4 if QA passes by 3</p></span>
        </Msg>
      </div>
      <div className="ms-composer">Message #launch</div>
      <aside className="ms-thread c-thread">
        <Head title="Thread" sub="# launch" />
        <div className="ms-feed top">
          <Msg w="K" time="10:04" text="Looks good. One question on pricing" />
          <div className="ms-rule">2 replies</div>
          <Msg className="c-r1" w="M" time="10:05" text="Pricing stays the same as v1" />
          <Msg className="c-r2" w="K" time="10:05" text="Perfect, thanks" />
        </div>
      </aside>
    </div>
  );
}

function Huddles() {
  return (
    <div className="ms-win ms-hud">
      <Head title="# design"><span className="ms-btn h-start"><Icon n="headphones" size={14} />Huddle</span></Head>
      <div className="ms-feed">
        <Msg w="M" time="2:14" text="Can we walk through onboarding?" />
        <Msg w="K" time="2:15" text="Sure, starting a huddle" />
        <BotMsg className="h-notes"><div className="ms-card"><b>Huddle ended · 12 min</b><span>Ken, Maya and Priya joined</span><span>Ken updates the step 2 copy today</span></div></BotMsg>
      </div>
      <div className="ms-composer">Message #design</div>
      <div className="ms-huddle h-bar">
        <div className="ms-people">
          <i className="ms-ring h-ring" />
          {(['K', 'M', 'P'] as Who[]).map((w, i) => <span key={w} className={`ms-person h-p${i}`}><Av w={w} round /><small>{PEOPLE[w].name}</small></span>)}
        </div>
        <div className="ms-ctls"><span className="ms-ctl"><Icon n="mic" size={14} /></span><span className="ms-ctl leave h-leave">Leave</span></div>
      </div>
    </div>
  );
}

const TASKS: [string, Who, string][] = [['Copy review', 'M', 'In progress'], ['QA on mobile', 'K', 'In progress'], ['Pricing page', 'P', 'To do']];

function Canvas() {
  return (
    <div className="ms-win ms-cv">
      <section className="ms-doc">
        <Head title="Launch plan" sub="Canvas" />
        <div className="ms-doc-body">
          <p className="ms-lead">Ship v2 on Friday.</p>
          {TASKS.map(([t], i) => (
            <div key={t} className={`ms-todo k-t${i}`}>
              <span className="ms-box"><i className="ms-box-on" /><svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg></span>
              <span className="ms-todo-t">{t}<i className="ms-strike" /></span>
            </div>
          ))}
        </div>
      </section>
      <section className="ms-list">
        <Head title="Launch tasks" />
        {TASKS.map(([t, w, st], i) => (
          <div key={t} className={`ms-row k-r${i}`}>
            <i className="ms-flash" />
            <Av w={w} round />
            <span className="ms-row-t">{t}</span>
            <span className="ms-status"><span className="ms-pill">{st}</span><span className="ms-pill done">Done</span></span>
          </div>
        ))}
        <small className="ms-count k-count">0 of 3 done</small>
      </section>
    </div>
  );
}

function Workflows() {
  return (
    <div className="ms-win ms-wf">
      <Head title="New member welcome" sub="Workflow"><span className="ms-on">On</span></Head>
      <div className="ms-steps">
        <div className="ms-step w-s0"><span className="ms-ico"><Icon n="users" size={15} /></span><div><small>When</small><b>Someone joins #general</b></div><span className="ms-tick"><Icon n="check" size={12} /></span></div>
        <div className="ms-wire"><i className="w-fill" /></div>
        <div className="ms-step w-s1"><span className="ms-ico"><Icon n="message" size={15} /></span><div><small>Then</small><b>Post a welcome message</b></div><span className="ms-tick"><Icon n="check" size={12} /></span></div>
      </div>
      <div className="ms-feed ms-mini">
        <div className="ms-sys w-join"><Av w="S" /><span><b>Sam</b> joined #general</span></div>
        <BotMsg className="w-bot"><p>Welcome, Sam. Start with #launch and the Launch plan canvas.</p></BotMsg>
      </div>
    </div>
  );
}

function Search() {
  return (
    <div className="ms-win ms-sr">
      <div className="ms-keys s-keys"><kbd className="s-k0">Ctrl</kbd><kbd className="s-k1">K</kbd></div>
      <div className="ms-pal s-pal">
        <div className="ms-q"><Icon n="search" size={16} /><span className="s-q" /><i className="ms-caret" /><span className="ms-esc">esc</span></div>
        <div className="ms-res">
          <i className="ms-sel s-sel" />
          <div className="ms-r s-ans tall"><span className="ms-r-ico blue"><Icon n="message" size={14} /></span><span><small>Answer from Ken in #launch</small><b>Pricing stays the same as v1</b></span></div>
          <div className="ms-r s-a"><span className="ms-r-ico">#</span><span><b>launch</b><small>Channel</small></span></div>
          <div className="ms-r s-b"><span className="ms-r-ico"><Icon n="message" size={14} /></span><span><b>Launch copy is ready for review</b><small>Maya in #launch</small></span></div>
          <div className="ms-r s-c"><Av w="P" round /><span><b><u>Pri</u>ya</b><small>Person</small></span></div>
          <div className="ms-r s-d"><span className="ms-r-ico">#</span><span><b><u>pri</u>cing</b><small>Channel</small></span></div>
          <div className="ms-r s-e"><span className="ms-r-ico"><Icon n="message" size={14} /></span><span><b><u>Pri</u>cing stays the same as v1</b><small>Ken in #launch</small></span></div>
        </div>
      </div>
    </div>
  );
}

const MARKUP: Record<string, () => ReactNode> = { channels: Channels, huddles: Huddles, canvas: Canvas, workflows: Workflows, search: Search };

// ---------------- Timelines ----------------

const BOX = '.ms';
const startCursor = (tl: gsap.core.Timeline, q: Q, el: HTMLElement, fx = 0.82, fy = 0.92) =>
  tl.set(q('.mo-cursor'), { x: el.clientWidth * fx, y: el.clientHeight * fy, scale: 1, autoAlpha: 0 });
const showCursor = (tl: gsap.core.Timeline, q: Q, at: number | string) => tl.to(q('.mo-cursor'), { autoAlpha: 1, duration: 0.25, ease: ENTER }, at);
const hideCursor = (tl: gsap.core.Timeline, q: Q, at: number | string) => tl.to(q('.mo-cursor'), { autoAlpha: 0, duration: 0.25, ease: EXIT }, at);

function channels(q: Q, el: HTMLElement) {
  const tl = gsap.timeline();
  startCursor(tl, q, el);
  tl.set(q('.c-m1, .c-m2, .c-m3, .c-replies, .c-r1, .c-r2, .c-text'), { autoAlpha: 0 })
    .set(q('.c-dots'), { autoAlpha: 1 })
    .set(q('.c-thread'), { xPercent: 101 });
  arrive(tl, q('.c-m1'), 0.2);
  arrive(tl, q('.c-m2'), 1.1);
  // Priya is typing: the dots resolve into her reply in the same spot.
  arrive(tl, q('.c-m3'), 2.0);
  typing(tl, q('.c-dots i'), 2.3, 2);
  tl.to(q('.c-dots'), { autoAlpha: 0, duration: 0.2, ease: EXIT }, 3.4)
    .fromTo(q('.c-text'), { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: T.enter, ease: ENTER }, 3.45);
  // Replies collect under Ken's message; opening them slides the thread in beside the channel.
  arrive(tl, q('.c-replies'), 4.1);
  showCursor(tl, q, 4.5);
  pointAt(tl, q, BOX, '.c-replies', 4.5, { dx: 0.6 });
  tl.to(q('.c-thread'), { xPercent: 0, duration: T.panel, ease: ENTER });
  arrive(tl, q('.c-r1'), '-=0.2');
  hideCursor(tl, q, '<');
  arrive(tl, q('.c-r2'), '+=0.5');
  return tl.to({}, { duration: 1.4 });
}

function huddles(q: Q, el: HTMLElement) {
  const tl = gsap.timeline();
  startCursor(tl, q, el, 0.5, 0.6);
  tl.set(q('.h-bar'), { autoAlpha: 0, y: 16 })
    .set(q('.h-p0, .h-p1, .h-p2, .h-ring, .h-notes'), { autoAlpha: 0 });
  const people = q('.ms-person') as HTMLElement[];
  const ringX = (i: number) => (people[i] ? people[i].offsetLeft + people[i].offsetWidth / 2 - 22 : 0);
  tl.set(q('.h-ring'), { x: ringX(0) });
  showCursor(tl, q, 0.3);
  pointAt(tl, q, BOX, '.h-start', 0.3);
  tl.to(q('.h-bar'), { autoAlpha: 1, y: 0, duration: T.panel, ease: ENTER }, '+=0.05');
  hideCursor(tl, q, '<');
  tl.fromTo(q('.h-p0'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: T.enter, ease: ENTER }, '<0.2')
    .fromTo(q('.h-p1, .h-p2'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: T.enter, ease: ENTER, stagger: 0.6 }, '+=0.3')
    // The speaking ring follows whoever is talking.
    .to(q('.h-ring'), { autoAlpha: 1, duration: 0.25, ease: ENTER }, '+=0.2')
    .to(q('.h-ring'), { x: ringX(1), duration: 0.55, ease: ENTER }, '+=1.0')
    .to(q('.h-ring'), { x: ringX(2), duration: 0.55, ease: ENTER }, '+=1.0')
    .to(q('.h-ring'), { x: ringX(0), duration: 0.55, ease: ENTER }, '+=0.9');
  showCursor(tl, q, '+=0.3');
  pointAt(tl, q, BOX, '.h-leave', '<');
  tl.to(q('.h-bar'), { autoAlpha: 0, y: 12, duration: T.exit, ease: EXIT }, '+=0.05');
  hideCursor(tl, q, '<');
  arrive(tl, q('.h-notes'), '+=0.25');
  return tl.to({}, { duration: 1.4 });
}

function canvas(q: Q, el: HTMLElement) {
  const tl = gsap.timeline();
  startCursor(tl, q, el, 0.5, 0.95);
  tl.set(q('.ms-box-on, .ms-box svg, .ms-pill.done, .ms-flash'), { autoAlpha: 0 })
    .set(q('.ms-strike'), { scaleX: 0 });
  const count = q('.k-count')[0];
  const check = (i: number, at: number | string) => {
    pointAt(tl, q, BOX, `.k-t${i} .ms-box`, at);
    tl.to(q(`.k-t${i} .ms-box-on`), { autoAlpha: 1, duration: T.feedback, ease: ENTER }, '-=0.1')
      .fromTo(q(`.k-t${i} .ms-box svg`), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: ENTER }, '<')
      .to(q(`.k-t${i} .ms-strike`), { scaleX: 1, duration: 0.4, ease: ENTER }, '<0.05')
      .to(q(`.k-t${i} .ms-todo-t`), { opacity: 0.45, duration: 0.4, ease: ENTER }, '<')
      // The same task updates in the list, for everyone.
      .to(q(`.k-r${i} .ms-flash`), { autoAlpha: 1, duration: 0.2, ease: ENTER }, '+=0.15')
      .to(q(`.k-r${i} .ms-pill:not(.done)`), { autoAlpha: 0, duration: 0.25, ease: EXIT }, '<')
      .fromTo(q(`.k-r${i} .ms-pill.done`), { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: ENTER }, '<0.1');
    setText(tl, count, `${i} of 3 done`, `${i + 1} of 3 done`, '<');
    tl.to(q(`.k-r${i} .ms-flash`), { autoAlpha: 0, duration: 0.8, ease: 'power1.out' }, '+=0.5');
  };
  showCursor(tl, q, 0.4);
  check(0, 0.4);
  check(1, '+=0.3');
  hideCursor(tl, q, '+=0.1');
  return tl.to({}, { duration: 1.2 });
}

function workflows(q: Q) {
  const tl = gsap.timeline();
  tl.set(q('.w-join, .w-bot, .ms-tick'), { autoAlpha: 0 })
    .set(q('.w-fill'), { scaleY: 0 });
  // Someone joins: the trigger fires, the wire fills, the action runs and its message posts.
  arrive(tl, q('.w-join'), 0.6);
  tl.fromTo(q('.w-s0 .ms-tick'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: ENTER }, '+=0.4')
    .to(q('.w-fill'), { scaleY: 1, duration: 0.5, ease: 'power1.inOut' }, '+=0.1')
    .fromTo(q('.w-s1 .ms-tick'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: ENTER });
  arrive(tl, q('.w-bot'), '+=0.15');
  return tl.to({}, { duration: 2 });
}

function search(q: Q) {
  const tl = gsap.timeline();
  const row = 46, ansH = 64;
  const rows: Record<string, string> = { a: '.s-a', b: '.s-b', c: '.s-c', d: '.s-d', e: '.s-e', ans: '.s-ans' };
  tl.set(q('.s-pal'), { autoAlpha: 0, scale: 0.98, y: -6 })
    .set(q('.s-keys'), { autoAlpha: 1 })
    .set(Object.values(rows).map((s) => q(s)[0]), { autoAlpha: 0, y: 0 })
    .set(q('.s-sel'), { autoAlpha: 0, y: 0, height: row });
  // Ctrl K: the keys press, then the palette opens with recent items.
  tl.to(q('.s-k0'), { y: 2, duration: T.feedback, ease: 'power1.out' }, 0.5)
    .to(q('.s-k1'), { y: 2, duration: T.feedback, ease: 'power1.out' }, 0.62)
    .to(q('.s-k0, .s-k1'), { y: 0, duration: 0.2, ease: ENTER }, 0.9)
    .to(q('.s-keys'), { autoAlpha: 0, y: -4, duration: 0.25, ease: EXIT }, 1.0)
    .to(q('.s-pal'), { autoAlpha: 1, scale: 1, y: 0, duration: T.enter, ease: ENTER }, 1.05);
  const place = (sel: string, slot: number, at: number | string) => tl.fromTo(q(sel), { autoAlpha: 0, y: slot * row + 6 }, { autoAlpha: 1, y: slot * row, duration: 0.45, ease: ENTER }, at);
  place(rows.a, 0, 1.25); place(rows.b, 1, 1.33); place(rows.c, 2, 1.41);
  tl.to(q('.s-sel'), { autoAlpha: 1, duration: 0.2 }, 1.5);
  // Typing narrows the list: what no longer matches fades, what does slides up into place.
  typeText(tl, q('.s-q')[0], 'pri', 2.2, 0.36);
  tl.to(q(`${rows.a}, ${rows.b}`), { autoAlpha: 0, duration: 0.2, ease: EXIT }, 2.35)
    .to(q(rows.c), { y: 0, duration: 0.5, ease: ENTER }, 2.45);
  place(rows.d, 1, 2.55); place(rows.e, 2, 2.63);
  // Finishing the question puts the answer on top.
  typeText(tl, q('.s-q')[0], 'pricing?', 3.6, 0.5, 'pri');
  tl.to(q(rows.c), { autoAlpha: 0, duration: 0.2, ease: EXIT }, 4.15)
    .to(q('.s-sel'), { height: ansH, duration: 0.45, ease: ENTER }, 4.2)
    .fromTo(q(rows.ans), { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: ENTER }, 4.25)
    .to(q(rows.d), { y: ansH, duration: 0.5, ease: ENTER }, 4.25)
    .to(q(rows.e), { y: ansH + row, duration: 0.5, ease: ENTER }, 4.25);
  return tl.to({}, { duration: 2.2 });
}

const BUILD: Record<string, (q: Q, el: HTMLElement) => gsap.core.Timeline> = { channels, huddles, canvas, workflows, search };

// One scene on the stage. It fades in, plays one pass, fades out and asks for the next one.
function TourScene({ id, onEnd, onProgress }: { id: string; onEnd: () => void; onProgress: (p: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const cb = useRef({ onEnd, onProgress });
  cb.current = { onEnd, onProgress };
  useLayoutEffect(() => {
    const el = root.current!;
    const content = el.querySelector<HTMLElement>('.ms-win')!;
    let stop = () => {};
    let width = el.clientWidth;
    // Positions are measured, so the scene is rebuilt when its width changes.
    const start = () => {
      stop();
      gsap.set(el.querySelectorAll('*'), { clearProps: 'transform,opacity,visibility,height' });
      stop = loopScene(el, content, () => BUILD[id](gsap.utils.selector(el), el), {
        fadeIn: true, hold: 1.4, threshold: 0.4, onEnd: () => cb.current.onEnd(), onProgress: (p) => cb.current.onProgress(p),
      });
    };
    start();
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - width) > 1) { width = el.clientWidth; start(); } });
    ro.observe(el);
    return () => { ro.disconnect(); stop(); };
  }, [id]);
  const Markup = MARKUP[id];
  return <div className={`ms ms-${id}`} ref={root} aria-hidden><Markup />{id !== 'workflows' && id !== 'search' && <Pointer />}</div>;
}

export interface TourStep { id: string; title: string; text: string }

// "A closer look": the features as a list beside one large stage. The stage plays the selected
// feature, a hairline under its name fills while it runs, and then it moves on to the next.
export function Tour({ steps, more }: { steps: TourStep[]; more: (s: TourStep) => ReactNode }) {
  const [active, setActive] = useState(0);
  const bars = useRef<(HTMLElement | null)[]>([]);
  const step = steps[active];
  const progress = (p: number) => { const b = bars.current[active]; if (b) b.style.transform = `scaleX(${p})`; };
  useLayoutEffect(() => { bars.current.forEach((b, i) => { if (b) b.style.transform = `scaleX(${i === active && reduceMotion() ? 1 : 0})`; }); }, [active]);
  return (
    <div className="tr">
      <div className="tr-stage"><TourScene key={step.id} id={step.id} onEnd={() => setActive((a) => (a + 1) % steps.length)} onProgress={progress} /></div>
      <div className="tr-side">
        <ol className="tr-list" role="tablist" aria-label="Relay features">
          {steps.map((s, i) => (
            <li key={s.id} id={s.id}>
              <button role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                {s.title}
                <span className="tr-bar" aria-hidden><i ref={(el) => { bars.current[i] = el; }} /></span>
              </button>
            </li>
          ))}
        </ol>
        <div key={step.id} className="tr-copy" role="tabpanel">
          <p>{step.text}</p>
          {more(step)}
        </div>
      </div>
    </div>
  );
}
