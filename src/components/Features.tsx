import { Aurora } from './Aurora.tsx';
import { useGlow } from '../glow.ts';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Film, Clip, Win, Msg, Bot, Cursor, typeInto, eraseText, type Build, type Chapter } from './Film.tsx';
import { ENTER, EXIT, T, arrive, pointAt, typing } from '../motion.ts';
import { Icon, type IconName } from './Icon.tsx';
import { RouteLink, SiteFooter, SiteNav, type FeatureRoute, type Route } from './Site.tsx';
import FlexibleAccordion from './framer/FlexibleAccordion.tsx';
import { InteractiveNodeDiagram } from './InteractiveNodeDiagram.tsx';
import '../apple.css';
import '../features.css';

gsap.registerPlugin(ScrollTrigger);

// Point at an element on the canvas: the cursor glides there, then presses it.
const clickAt = (tl: gsap.core.Timeline, q: (s: string) => Element[], target: string, at: number | string, dx = 0.5, dy = 0.5) =>
  pointAt(tl, q, '.fm-canvas', target, at, { dx, dy });
const hold = (tl: gsap.core.Timeline, s: number) => tl.to({}, { duration: s });

// ======================= Overview =======================

const OVERVIEW_CHAPTERS: Chapter[] = [
  { title: 'Post in a channel', text: 'Every team and project gets a channel. Messages land in order, with names and times, for everyone in it.' },
  { title: 'Branch into a thread', text: 'Reply to one message and the side conversation folds into a thread, so the channel stays readable.' },
  { title: 'Mention a teammate', text: 'Type @ and a name. That person gets notified, and the mention stands out in the message.' },
  { title: 'Get the recap', text: 'Press Recap and Relay Bot sums up who said what, so anyone catching up reads one message instead of fifty.' },
];

function OverviewMock() {
  return (
    <>
      <Win channel="launch" topic="Launch prep for v2" actions={<><span className="fm-icon-btn"><Icon n="headphones" /></span><span className="fm-chip-btn ov-recap"><Icon n="clock" size={14} /> Recap</span></>}>
        <div className="fm-feed">
          <Msg className="ov-m1" who="Maya" c="#c8705a" l="M" text="Launch copy is ready for review" />
          <Msg className="ov-m2" who="Ken" c="#3c9a8f" l="K" text="Looks great. One question on pricing">
            <span className="fm-replies ov-replies"><Icon n="message" size={14} /> 2 replies</span>
          </Msg>
          <Msg className="ov-m3" who="Priya" c="#7d68c4" l="P" text="We ship at 4 PM if QA passes" />
          <Msg className="ov-m4" who="You" c="#0071e3" l="Y" text={<><span className="fm-mention">@Priya</span> can you confirm QA by 3?</>} />
          <Bot className="ov-recap-msg">
            <p className="fm-recap"><b>Recap of #launch</b><span>Copy is approved, pricing stays the same, Priya owns QA, ship at 4 PM.</span></p>
          </Bot>
          <div className="fm-typing ov-typing"><i /><i /><i /></div>
        </div>
        <div className="fm-composer"><span className="ov-draft" /><i className="fm-caret" /></div>
        <aside className="fm-thread ov-thread">
          <header><b>Thread</b><small># launch</small></header>
          <Msg who="Ken" c="#3c9a8f" l="K" text="Looks great. One question on pricing" />
          <div className="fm-thread-rule">2 replies</div>
          <Msg className="ov-r1" who="Maya" c="#c8705a" l="M" text="Pricing stays the same as v1" />
          <Msg className="ov-r2" who="Ken" c="#3c9a8f" l="K" text="Perfect, thanks" />
        </aside>
      </Win>
      <Cursor />
    </>
  );
}

const overviewBuild: Build = (q) => {
  const tl = gsap.timeline();
  tl.set(q('.fm-cursor'), { x: 720, y: 470, scale: 1 })
    .set(q('.ov-m4, .ov-recap-msg, .ov-typing, .ov-r1, .ov-r2'), { autoAlpha: 0 })
    .set(q('.ov-thread'), { xPercent: 101 });
  // Messages arrive in order.
  tl.addLabel('c0', 0);
  arrive(tl, q('.ov-m1, .ov-m2, .ov-m3'), 0.3, 0.7);
  hold(tl, 1);
  // Opening the replies slides the thread in beside the channel.
  tl.addLabel('c1');
  clickAt(tl, q, '.ov-replies', 'c1');
  tl.to(q('.ov-thread'), { xPercent: 0, duration: T.panel, ease: ENTER });
  arrive(tl, q('.ov-r1, .ov-r2'), '-=0.2', 0.6);
  hold(tl, 1.4);
  tl.to(q('.ov-thread'), { xPercent: 101, duration: T.exit + 0.1, ease: EXIT });
  // A mention is typed, sent, and lands in the channel.
  tl.addLabel('c2');
  clickAt(tl, q, '.fm-composer', 'c2', 0.2);
  typeInto(tl, q('.ov-draft')[0], '@Priya can you confirm QA by 3?', '>');
  eraseText(tl, q('.ov-draft')[0], '@Priya can you confirm QA by 3?', '+=0.35');
  arrive(tl, q('.ov-m4'), '<');
  hold(tl, 1.2);
  // Recap: the bot types, then its summary takes the same place.
  tl.addLabel('c3');
  clickAt(tl, q, '.ov-recap', 'c3');
  tl.to(q('.ov-typing'), { autoAlpha: 1, duration: 0.2, ease: ENTER });
  typing(tl, q('.ov-typing i'), '<', 2);
  tl.to(q('.ov-typing'), { autoAlpha: 0, duration: 0.2, ease: EXIT }, '>');
  arrive(tl, q('.ov-recap-msg'), '<');
  hold(tl, 2.4);
  return tl;
};

// ======================= Huddles =======================

const HUDDLE_CHAPTERS: Chapter[] = [
  { title: 'Start a huddle', text: 'Press the headphones in any channel header, or type /huddle. You are live in that channel straight away.' },
  { title: 'Teammates join', text: 'Anyone in the channel can hop in. Each person lights up while they speak, up to six at a time.' },
  { title: 'Share your screen', text: 'One click puts your screen in front of everyone, so you can walk through the work instead of describing it.' },
  { title: 'Notes land in the channel', text: 'When the huddle ends, Relay Bot posts how long it ran, who joined, and any action items said in the chat.' },
];

function HuddleMock() {
  return (
    <>
      <Win channel="design" topic="Product and brand design" actions={<span className="fm-chip-btn hd-start"><Icon n="headphones" size={14} /> Huddle</span>}>
        <div className="fm-feed">
          <Msg who="Maya" c="#c8705a" l="M" text="Can we look at the onboarding flow together?" />
          <Msg who="Ken" c="#3c9a8f" l="K" text="Sure, starting a huddle" />
          <Msg className="hd-ken" who="Ken" c="#3c9a8f" l="K" text="I will update the step 2 copy today" />
          <Bot className="hd-note">
            <p className="fm-recap"><b>Huddle notes · 18 min with Ken, Maya, Priya</b><span>1 message shared during the huddle.</span><span>Action items: Ken: I will update the step 2 copy today</span></p>
          </Bot>
        </div>
        <div className="fm-composer"><span className="fm-placeholder">Message #design</span></div>
        <div className="fm-screen hd-screen">
          <div className="fm-screen-label"><Icon n="monitor" size={14} /> Ken is sharing</div>
          <div className="fm-screen-doc">
            <small>Onboarding · Step 2 of 4</small>
            <b>Invite your team</b>
            <span className="fm-screen-field" />
            <span className="fm-screen-field short" />
            <span className="fm-screen-btn">Send invites</span>
          </div>
        </div>
        <div className="fm-huddle hd-bar">
          <div className="fm-huddle-people">
            <i className="fm-ring hd-ring" />
            {[['#3c9a8f', 'K', 'hd-p1', 'Ken'], ['#c8705a', 'M', 'hd-p2', 'Maya'], ['#7d68c4', 'P', 'hd-p3', 'Priya']].map(([c, l, k, n]) => (
              <span key={k} className={`fm-person ${k}`}><i style={{ background: c }}>{l}</i><small>{n}</small></span>
            ))}
          </div>
          <div className="fm-huddle-controls">
            <span className="fm-ctl"><Icon n="mic" size={14} /> Mute</span>
            <span className="fm-ctl hd-share"><Icon n="monitor" size={14} /> Share screen</span>
            <span className="fm-ctl leave hd-leave">Leave</span>
          </div>
        </div>
      </Win>
      <Cursor />
    </>
  );
}

const huddleBuild: Build = (q) => {
  const tl = gsap.timeline();
  const people = q('.fm-person') as HTMLElement[];
  const ringX = (i: number) => (people[i] ? people[i].offsetLeft + people[i].offsetWidth / 2 - 26 : 0);
  tl.set(q('.fm-cursor'), { x: 520, y: 300, scale: 1 })
    .set(q('.hd-bar'), { autoAlpha: 0, y: 24 })
    .set(q('.hd-p1, .hd-p2, .hd-p3, .hd-ken, .hd-note, .hd-ring'), { autoAlpha: 0 })
    .set(q('.hd-ring'), { x: ringX(0) })
    .set(q('.hd-screen'), { autoAlpha: 0, scale: 0.98, y: 8 });
  // One click and the huddle bar rises with you in it.
  tl.addLabel('c0', 0);
  clickAt(tl, q, '.hd-start', 0.3);
  tl.to(q('.hd-bar'), { autoAlpha: 1, y: 0, duration: T.panel, ease: ENTER })
    .fromTo(q('.hd-p1'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: T.enter, ease: ENTER }, '<0.15');
  hold(tl, 1);
  // Teammates join; the speaking ring moves to whoever is talking.
  tl.addLabel('c1')
    .fromTo(q('.hd-p2, .hd-p3'), { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: T.enter, ease: ENTER, stagger: 0.6 }, 'c1+=0.2')
    .to(q('.hd-ring'), { autoAlpha: 1, duration: 0.25, ease: ENTER }, '+=0.2')
    .to(q('.hd-ring'), { x: ringX(1), duration: 0.55, ease: ENTER }, '+=0.9')
    .to(q('.hd-ring'), { x: ringX(2), duration: 0.55, ease: ENTER }, '+=0.9');
  hold(tl, 0.6);
  // Screen share opens in a large tile above the call.
  tl.addLabel('c2')
    .to(q('.hd-ring'), { x: ringX(0), duration: 0.55, ease: ENTER }, 'c2');
  clickAt(tl, q, '.hd-share', 'c2+=0.1');
  tl.to(q('.hd-screen'), { autoAlpha: 1, scale: 1, y: 0, duration: T.panel, ease: ENTER })
    .set(q('.hd-ken'), { autoAlpha: 1 }, '+=0.4');
  hold(tl, 1.6);
  // Leaving ends the call and the notes post in the channel.
  tl.addLabel('c3');
  clickAt(tl, q, '.hd-leave', 'c3');
  tl.to(q('.hd-screen'), { autoAlpha: 0, scale: 0.98, duration: T.exit, ease: EXIT })
    .to(q('.hd-bar'), { autoAlpha: 0, y: 16, duration: T.exit, ease: EXIT }, '<');
  arrive(tl, q('.hd-note'), '+=0.2');
  hold(tl, 2.4);
  return tl;
};

// ======================= Workflows =======================

const WORKFLOW_CHAPTERS: Chapter[] = [
  { title: 'Pick a trigger', text: 'A workflow starts on a keyword like !incident, when someone joins a channel, or on a schedule such as weekdays at 9:30.' },
  { title: 'Write the reply', text: 'Say what Relay Bot should post when it fires. It replies in the same channel, in a thread people can answer.' },
  { title: 'Add a branch', text: 'Give one condition a different answer. If the message contains sev1, the bot escalates instead.' },
  { title: 'Watch it run', text: 'Someone types the keyword and the bot answers in a second, every time, without anyone on call to copy and paste.' },
];

function WorkflowMock() {
  return (
    <>
      <Win channel="incidents" topic="Production issues and on-call" actions={<span className="fm-chip-btn"><Icon n="zap" size={14} /> Workflows</span>}>
        <div className="fm-feed">
          <Msg who="Priya" c="#7d68c4" l="P" text="Reminder: on-call this week is Ken" />
          <Msg className="wf-trigger" who="Ken" c="#3c9a8f" l="K" text={<><span className="fm-kw">!incident</span> sev1 checkout is down</>} />
          <Bot className="wf-reply" text="SEV1 declared. Page the on-call now and open a huddle in this channel." />
        </div>
        <div className="fm-composer"><span className="wf-draft" /><i className="fm-caret" /></div>
      </Win>
      <div className="fm-scrim wf-scrim" />
      <div className="fm-modal wf-modal">
        <h4>New workflow</h4>
        <div className="fm-row"><label>Name</label><span className="fm-input wf-name" /></div>
        <div className="fm-row"><label>Trigger</label>
          <div className="fm-seg"><i className="fm-seg-fill wf-kwfill" /><span className="wf-kw">Keyword</span><span>Someone joins</span><span>Schedule</span></div>
        </div>
        <div className="fm-row"><label>Keyword</label><span className="fm-input mono wf-key" /></div>
        <div className="fm-row top"><label>Reply</label><span className="fm-input area wf-text" /></div>
        <div className="fm-branch wf-branch">
          <div><b>If the message contains</b><span className="fm-input mono sm wf-cond" /></div>
          <div><b>reply</b><span className="fm-input area sm wf-alt" /></div>
        </div>
        <div className="fm-modal-foot"><span className="fm-chip-btn">Cancel</span><span className="fm-chip-btn primary wf-save">Save workflow</span></div>
      </div>
      <Cursor />
    </>
  );
}

const workflowBuild: Build = (q) => {
  const tl = gsap.timeline();
  tl.set(q('.fm-cursor'), { x: 700, y: 120, scale: 1 })
    .set(q('.wf-trigger, .wf-reply'), { autoAlpha: 0 })
    .set(q('.wf-branch'), { autoAlpha: 0, y: 8 })
    .set(q('.wf-kwfill'), { xPercent: 100 });
  // The builder opens over the channel; the trigger segment slides to Keyword.
  tl.addLabel('c0', 0)
    .fromTo(q('.wf-scrim'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: ENTER }, 0)
    .fromTo(q('.wf-modal'), { autoAlpha: 0, y: 16, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: T.panel, ease: ENTER }, 0.1);
  typeInto(tl, q('.wf-name')[0], 'Incident triage', 0.8);
  clickAt(tl, q, '.wf-kw', '>');
  tl.to(q('.wf-kwfill'), { xPercent: 0, duration: 0.4, ease: ENTER }, '-=0.1');
  typeInto(tl, q('.wf-key')[0], '!incident', '>+0.2');
  hold(tl, 0.6);
  tl.addLabel('c1');
  typeInto(tl, q('.wf-text')[0], 'Incident logged. Post impact, start time and owner in this thread.', 'c1+=0.2', 2);
  hold(tl, 0.8);
  // A branch gives sev1 its own answer.
  tl.addLabel('c2')
    .to(q('.wf-branch'), { autoAlpha: 1, y: 0, duration: T.enter, ease: ENTER }, 'c2+=0.1');
  typeInto(tl, q('.wf-cond')[0], 'sev1', '>');
  typeInto(tl, q('.wf-alt')[0], 'SEV1 declared. Page the on-call now and open a huddle.', '>+0.2', 1.6);
  clickAt(tl, q, '.wf-save', '>+0.3');
  tl.to(q('.wf-modal'), { autoAlpha: 0, y: 8, scale: 0.98, duration: T.exit, ease: EXIT })
    .to(q('.wf-scrim'), { autoAlpha: 0, duration: T.exit, ease: EXIT }, '<');
  // Someone types the keyword; the bot answers a moment later.
  tl.addLabel('c3');
  clickAt(tl, q, '.fm-composer', 'c3', 0.2);
  typeInto(tl, q('.wf-draft')[0], '!incident sev1 checkout is down', '>');
  eraseText(tl, q('.wf-draft')[0], '!incident sev1 checkout is down', '+=0.35');
  arrive(tl, q('.wf-trigger'), '<');
  arrive(tl, q('.wf-reply'), '+=0.8');
  hold(tl, 2.4);
  return tl;
};

// ======================= Search =======================

const SEARCH_CHAPTERS: Chapter[] = [
  { title: 'Press Ctrl K', text: 'From anywhere in Relay, Ctrl K (⌘K on a Mac) opens search over everything you can see.' },
  { title: 'Type to filter', text: 'Channels, people and messages narrow down with every letter you type. No filters to set.' },
  { title: 'Ask a question', text: 'End your search with a question mark and Relay picks the message that best answers it.' },
  { title: 'Jump to the message', text: 'Pick a result and Relay opens the channel or thread right at that message.' },
];

function SearchMock() {
  return (
    <>
      <Win channel="launch" topic="Launch prep for v2">
        <div className="fm-feed">
          <Msg who="Maya" c="#c8705a" l="M" text="Launch copy is ready for review" />
          <Msg who="Ken" c="#3c9a8f" l="K" text="Pricing stays the same as v1" />
          <Msg className="sr-target" who="Priya" c="#7d68c4" l="P" text="We ship at 4 PM if QA passes"><i className="fm-hl sr-hl" /></Msg>
          <Msg who="Maya" c="#c8705a" l="M" text="Press kit goes out tomorrow morning" />
        </div>
        <div className="fm-composer"><span className="fm-placeholder">Message #launch</span></div>
      </Win>
      <div className="fm-scrim sr-scrim" />
      <div className="fm-keys sr-keys"><kbd className="sr-k1">Ctrl</kbd><kbd className="sr-k2">K</kbd></div>
      <div className="fm-palette sr-palette">
        <div className="fm-palette-input"><Icon n="search" /><span className="sr-q" /><i className="fm-caret" /></div>
        <div className="fm-palette-list sr-list">
          <small>Channels</small>
          <div className="fm-res"><span className="fm-res-ico">#</span>launch</div>
          <small>Messages</small>
          <div className="fm-res"><span className="fm-res-ico"><Icon n="message" size={14} /></span><span><b>Maya</b> in #launch: <mark>Launch</mark> copy is ready for review</span></div>
          <div className="fm-res"><span className="fm-res-ico"><Icon n="message" size={14} /></span><span><b>Ken</b> in #general: <mark>Launch</mark> retro on Friday</span></div>
        </div>
        <div className="fm-palette-list sr-answer">
          <div className="fm-res best"><span className="fm-res-ico blue"><Icon n="message" size={14} /></span><span><b>Best answer</b> from Priya in #launch<em>We ship at 4 PM if QA passes</em></span></div>
          <small>Messages</small>
          <div className="fm-res"><span className="fm-res-ico"><Icon n="message" size={14} /></span><span><b>Ken</b> in #launch: when do we freeze copy?</span></div>
        </div>
      </div>
      <Cursor />
    </>
  );
}

const searchBuild: Build = (q) => {
  const tl = gsap.timeline();
  tl.set(q('.fm-cursor'), { x: 760, y: 470, scale: 1 })
    .set(q('.sr-scrim, .sr-palette, .sr-keys, .sr-answer, .sr-hl'), { autoAlpha: 0 })
    .set(q('.sr-list .fm-res, .sr-list small'), { autoAlpha: 0 });
  // Ctrl K: the keys press, the palette opens over the channel.
  tl.addLabel('c0', 0)
    .fromTo(q('.sr-keys'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: T.enter, ease: ENTER }, 0.3)
    .to(q('.sr-k1'), { y: 3, duration: T.feedback, ease: 'power1.out' }, '+=0.3')
    .to(q('.sr-k2'), { y: 3, duration: T.feedback, ease: 'power1.out' }, '+=0.12')
    .to(q('.sr-k1, .sr-k2'), { y: 0, duration: 0.2, ease: ENTER }, '+=0.2')
    .to(q('.sr-keys'), { autoAlpha: 0, y: 8, duration: 0.25, ease: EXIT }, '+=0.1')
    .to(q('.sr-scrim'), { autoAlpha: 1, duration: 0.3, ease: ENTER }, '<')
    .fromTo(q('.sr-palette'), { autoAlpha: 0, y: -8, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: T.enter, ease: ENTER }, '<');
  hold(tl, 0.6);
  // Results narrow as the word is typed.
  tl.addLabel('c1');
  typeInto(tl, q('.sr-q')[0], 'launch', 'c1+=0.2', 0.6);
  arrive(tl, q('.sr-list small, .sr-list .fm-res'), '<0.2', 0.08);
  hold(tl, 1.2);
  // A question puts the best answer on top.
  tl.addLabel('c2')
    .to(q('.sr-list'), { autoAlpha: 0, duration: 0.25, ease: EXIT }, 'c2');
  typeInto(tl, q('.sr-q')[0], 'When do we ship?', 'c2+=0.2', 0.9);
  arrive(tl, q('.sr-answer'), '>+0.1');
  hold(tl, 1.2);
  // Choosing it opens the channel at that message, briefly marked.
  tl.addLabel('c3');
  clickAt(tl, q, '.sr-answer .best', 'c3');
  tl.to(q('.sr-palette'), { autoAlpha: 0, y: -6, duration: T.exit, ease: EXIT })
    .to(q('.sr-scrim'), { autoAlpha: 0, duration: T.exit, ease: EXIT }, '<')
    .to(q('.sr-hl'), { autoAlpha: 1, duration: 0.3, ease: ENTER })
    .to(q('.sr-hl'), { autoAlpha: 0, duration: 1.2, ease: 'power1.in' }, '+=1');
  hold(tl, 0.8);
  return tl;
};

// Small drawn pictures for the overview tiles: each one is the feature, not an icon of it.
function FactArt({ kind }: { kind: string }) {
  switch (kind) {
    case 'history': return <div className="fa fa-history" aria-hidden><b>∞</b><span>messages kept</span></div>;
    case 'huddle': return <div className="fa fa-huddle" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 900}ms` }} />)}</div>;
    case 'canvas': return <div className="fa fa-canvas" aria-hidden><i /><i /><i /><i className="caret" /></div>;
    case 'list': return <div className="fa fa-list" aria-hidden><span><em className="done" />Ship notes<u>Done</u></span><span><em className="doing" />Review copy<u>Doing</u></span><span><em />Book venue<u>To do</u></span></div>;
    case 'flow': return <div className="fa fa-flow" aria-hidden><code>!standup</code><span /><b>Relay Bot replies</b></div>;
    case 'remind': return <div className="fa fa-remind" aria-hidden><code>/remind me stretch in 10m</code></div>;
    case 'search': return <div className="fa fa-search" aria-hidden><kbd>Ctrl</kbd><kbd>K</kbd></div>;
    case 'private': return <div className="fa fa-private" aria-hidden><Icon n="lock" size={16} /><code>design-leads</code></div>;
    case 'admin': return <div className="fa fa-admin" aria-hidden><span>Owner</span><span>Admin</span><span>Member</span><span>Guest</span></div>;
    default: return null;
  }
}

// ======================= Page content =======================

interface Detail { chapter: number; eyebrow: string; title: string; text: string; points: string[] }
interface Fact { icon: IconName; title: string; text: string; art?: string }
interface PageDef {
  eyebrow: string;
  title: ReactNode;
  lede: string;
  film: { label: string; chapters: Chapter[]; build: Build; Mock: () => ReactNode };
  details: Detail[];
  facts: Fact[];
  next: FeatureRoute;
}

const PAGE_DEFS: Record<FeatureRoute, PageDef> = {
  overview: {
    eyebrow: 'Overview',
    title: <>Every conversation,<br />in one calm place</>,
    lede: 'Relay is team chat built around channels, with threads, huddles, canvases and a bot teammate that keeps the follow-ups from slipping.',
    film: { label: 'A morning in #launch', chapters: OVERVIEW_CHAPTERS, build: overviewBuild, Mock: OverviewMock },
    details: [
      { chapter: 0, eyebrow: 'Channels', title: 'One room per team, project or topic', text: 'Public channels anyone can find, private channels for the few who need them, and direct messages for everything in between.', points: ['Public and private channels', 'Direct messages and group DMs', 'Starred channels and custom sidebar sections'] },
      { chapter: 1, eyebrow: 'Threads', title: 'Side conversations stay on the side', text: 'Reply to any message to start a thread. The channel shows a reply count, and the full discussion opens in a panel beside it.', points: ['Reply counts on the parent message', 'Thread panel next to the channel', 'Pin and save any message'] },
      { chapter: 2, eyebrow: 'Mentions', title: 'Reach the right person', text: 'An @mention notifies that teammate and shows up in their Activity view, so a question never gets lost in the scroll.', points: ['@mentions and reactions in Activity', 'Per-channel notification levels', 'Do not disturb with a schedule'] },
      { chapter: 3, eyebrow: 'Relay Bot', title: 'Catch up in one message', text: 'Recap summarises a channel in seconds. The same bot answers questions, sends reminders and posts huddle notes.', points: ['Channel recaps and thread summaries', 'Daily recaps and file summaries', 'Answers from your own messages'] },
    ],
    facts: [
      { icon: 'message', art: 'history', title: 'Nothing ages out', text: 'Scroll back to the very first message. It is still there, and still searchable.' },
      { icon: 'headphones', art: 'huddle', title: 'Talk it through', text: 'Voice and screen share, one click from any channel.' },
      { icon: 'file', art: 'canvas', title: 'A doc beside every chat', text: 'Plans live next to the conversation that made them.' },
      { icon: 'checkSquare', art: 'list', title: 'Work with an owner', text: 'Status, assignee and due date.' },
      { icon: 'zap', art: 'flow', title: 'Teach the bot your routines', text: 'Triggers on a keyword, a join or the clock.' },
      { icon: 'clock', art: 'remind', title: 'Never lose the follow-up', text: 'Scheduled messages, or just type /remind.' },
      { icon: 'search', art: 'search', title: 'Ask, don’t dig', text: 'Press Ctrl K, ask a question, get the message.' },
      { icon: 'lock', art: 'private', title: 'Doors that close', text: 'Private channels, guests and user groups.' },
      { icon: 'settings', art: 'admin', title: 'You hold the keys', text: 'Roles, invites and moderation.' },
    ],
    next: 'huddles',
  },
  huddles: {
    eyebrow: 'Huddles',
    title: <>Talk it through<br />without leaving the channel</>,
    lede: 'A huddle is a quick voice call that lives inside a channel. Start one in a click, share your screen, and the notes post themselves when you hang up.',
    film: { label: 'A huddle in #design', chapters: HUDDLE_CHAPTERS, build: huddleBuild, Mock: HuddleMock },
    details: [
      { chapter: 0, eyebrow: 'Start', title: 'One click from any conversation', text: 'The headphones button sits in every channel header. Typing /huddle in the composer does the same. The channel shows a live indicator in the sidebar so others know where to find you.', points: ['Headphones button in the channel header', '/huddle from the message composer', 'Live indicator in the sidebar and the Huddles view'] },
      { chapter: 1, eyebrow: 'Join', title: 'Up to six voices, peer to peer', text: 'Audio travels directly between browsers over WebRTC, so a huddle starts fast and stays clear. Speaking rings and level meters show who is talking.', points: ['Up to 6 people in a huddle', 'Direct browser-to-browser audio', 'Mute and unmute in one click'] },
      { chapter: 2, eyebrow: 'Share', title: 'Show the work instead of describing it', text: 'Share your screen and everyone in the huddle sees it in a large tile, with your name on it. Stop sharing any time without leaving.', points: ['Full screen, window or tab', 'Shown to everyone in the huddle', 'Stop sharing without hanging up'] },
      { chapter: 3, eyebrow: 'Notes', title: 'The conversation leaves a trace', text: 'When a huddle that ran longer than 30 seconds ends, Relay Bot posts its length, who joined, and any message from the huddle that reads like an action item.', points: ['Duration and participants', 'Messages shared during the huddle', 'Action items picked from the chat'] },
    ],
    facts: [
      { icon: 'users', title: 'Up to 6 people', text: 'Room for a working session, not a town hall.' },
      { icon: 'headphones', title: 'Peer to peer', text: 'WebRTC audio straight between browsers.' },
      { icon: 'monitor', title: 'Screen share', text: 'One click, visible to everyone in the call.' },
      { icon: 'micOff', title: 'Quick mute', text: 'A muted badge shows on your tile.' },
      { icon: 'message', title: 'Chat alongside', text: 'The channel keeps working during the call.' },
      { icon: 'file', title: 'Automatic notes', text: 'Posted when a huddle over 30 seconds ends.' },
    ],
    next: 'workflows',
  },
  workflows: {
    eyebrow: 'Workflows',
    title: <>Hand the busywork<br />to Relay Bot</>,
    lede: 'Workflows let the bot welcome people, run standups, triage incidents and answer the same question for the hundredth time, while your team does the actual work.',
    film: { label: 'Building an incident workflow', chapters: WORKFLOW_CHAPTERS, build: workflowBuild, Mock: WorkflowMock },
    details: [
      { chapter: 0, eyebrow: 'Triggers', title: 'Three ways to start', text: 'Fire on a keyword in any channel or one channel, when someone joins a channel, or at a set time, with an option for weekdays only.', points: ['Keyword, like !standup or !it', 'Someone joins a channel', 'Schedule, such as weekdays at 9:30'] },
      { chapter: 1, eyebrow: 'Reply', title: 'Say it once, post it forever', text: 'Write the message the bot should send. It answers in the channel where the trigger happened, so people reply right there.', points: ['Posted by Relay Bot in the channel', 'Turn any workflow on or off', 'Edit or delete from the Workflow Builder'] },
      { chapter: 2, eyebrow: 'Branches', title: 'A different answer when it matters', text: 'Add a condition and a second reply. If the triggering message contains a word, like sev1 or password, the bot sends that reply instead.', points: ['One condition per workflow', 'Matches words in the message', 'Escalate, route or redirect'] },
      { chapter: 3, eyebrow: 'Run', title: 'Answers in a second, every time', text: 'Once saved, the workflow runs for everyone. Nobody has to remember the template, the on-call rota or the reset link.', points: ['Runs for the whole workspace', 'Works in threads and channels', 'Pairs with /remind and scheduled messages'] },
    ],
    facts: [
      { icon: 'zap', title: 'Standup check-in', text: 'Keyword !standup asks the three standup questions.' },
      { icon: 'clock', title: 'Daily standup', text: 'Weekdays at 9:30 in #general.' },
      { icon: 'flag', title: 'Incident triage', text: '!incident, with a sev1 branch that escalates.' },
      { icon: 'settings', title: 'IT help desk', text: '!it, with a branch for password resets.' },
      { icon: 'star', title: 'Celebrate wins', text: '!win logs it to the wins board.' },
      { icon: 'bell', title: 'Reminders', text: '/remind me stretch in 10m, and scheduled messages.' },
    ],
    next: 'search',
  },
  search: {
    eyebrow: 'Search',
    title: <>Find anything<br />in a keystroke</>,
    lede: 'One shortcut searches every channel, person and message you can see, and when you ask a question, Relay points you to the answer.',
    film: { label: 'Searching #launch', chapters: SEARCH_CHAPTERS, build: searchBuild, Mock: SearchMock },
    details: [
      { chapter: 0, eyebrow: 'Shortcut', title: 'Always one shortcut away', text: 'Ctrl K on Windows and Linux, ⌘K on a Mac, or the search bar at the top of the app. It opens over whatever you are doing and closes with Escape.', points: ['Ctrl K or ⌘K from anywhere', 'Search bar in the top bar', 'Escape to close'] },
      { chapter: 1, eyebrow: 'Results', title: 'Channels, people and messages together', text: 'Results narrow with every letter. Channels and direct messages come first, then the most recent matching messages across the workspace.', points: ['Channels and DMs by name', 'Messages by their text', 'Newest matches first'] },
      { chapter: 2, eyebrow: 'Answers', title: 'Ask, and get the message that answers', text: 'End a search with a question mark. Relay compares your question with what people have said and puts the best answer at the top.', points: ['Works on any question ending in ?', 'Answers from your own conversations', 'Shows who said it and where'] },
      { chapter: 3, eyebrow: 'Jump', title: 'Straight to the moment', text: 'Pick any result and Relay opens that channel or thread at the message, so you see it with the conversation around it.', points: ['Opens threads in place', 'Keeps the surrounding context', 'Save messages for later with the star'] },
    ],
    facts: [
      { icon: 'command', title: 'Ctrl K / ⌘K', text: 'Opens from anywhere in the app.' },
      { icon: 'users', title: 'People and channels', text: 'Jump to a DM or channel by name.' },
      { icon: 'message', title: 'Every message', text: 'Full history, nothing ages out.' },
      { icon: 'search', title: 'Best answer', text: 'Ask with a question mark.' },
      { icon: 'bookmark', title: 'Saved for later', text: 'Star a message to keep it in Later.' },
      { icon: 'pin', title: 'Pinned messages', text: 'Keep the important ones at hand.' },
    ],
    next: 'overview',
  },
};

const NEXT_LABEL: Record<FeatureRoute, string> = { overview: 'Overview', huddles: 'Huddles', workflows: 'Workflows', search: 'Search' };

const FEATURE_ACCORDION_IMAGES: Record<FeatureRoute, string[]> = {
  overview: [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=90',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=90',
    'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1800&q=90',
  ],
  huddles: [
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=1800&q=80',
  ],
  workflows: [
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1800&q=80',
  ],
  search: [
    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1800&q=80',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1800&q=80',
  ],
};

export function FeaturePage({ page, go, onGetStarted }: { page: FeatureRoute; go: (r: Route) => void; onGetStarted: () => void }) {
  const def = PAGE_DEFS[page];
  const root = useRef<HTMLDivElement>(null);
  useGlow(root);
  const { Mock } = def.film;

  const accordionItems = def.details.map((d, i) => ({
    tab: d.eyebrow || `0${i + 1}`,
    eyebrow: `${def.eyebrow} · ${d.eyebrow}`,
    title: d.title,
    description: d.text,
    primaryLabel: 'Try in Relay',
    primaryLink: '#',
    secondaryLabel: 'Watch demo',
    secondaryLink: '#film',
    image: {
      src: FEATURE_ACCORDION_IMAGES[page]?.[i] || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1800&q=80',
      alt: d.title,
    },
  }));

  useLayoutEffect(() => {
    const scroller = root.current!;
    scroller.scrollTop = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: ENTER } })
        .from('.ap-nav', { y: -12, opacity: 0, duration: 0.8 })
        .from('.fp-eyebrow, .fp-title, .fp-lede, .fp-actions', { y: 16, opacity: 0, duration: 0.9, stagger: 0.07 }, 0.1)
        .from('.fp-film', { y: 32, opacity: 0, duration: 1.1 }, 0.3);
      gsap.utils.toArray<HTMLElement>('.ap-reveal').forEach((el) => {
        gsap.from(el, { y: 24, opacity: 0, duration: 0.9, ease: ENTER, scrollTrigger: { trigger: el, scroller, start: 'top 90%' } });
      });
    }, root);
    return () => ctx.revert();
  }, [page]);

  return (
    <div className="ap fp" ref={root}>
      <div className="ap-stars-wrap" aria-hidden><Aurora /></div>
      <section className="ap-hero fp-hero">
        <div className="ap-sky" aria-hidden />
        <SiteNav route={page} go={go} onGetStarted={onGetStarted} />
        <div className="fp-head">
          <p className="fp-eyebrow">{def.eyebrow}</p>
          <h1 className="fp-title">{def.title}</h1>
          <p className="fp-lede">{def.lede}</p>
          <div className="fp-actions">
            <button className="ap-pill blue" onClick={onGetStarted}>Try it free</button>
            <a className="ap-more" href="#film">Watch how it works <Icon n="chevron" size={14} /></a>
          </div>
        </div>
        <div className="fp-film" id="film">
          <Film key={page} label={def.film.label} chapters={def.film.chapters} build={def.film.build}><Mock /></Film>
        </div>
      </section>

      <section className="fp-accordion-section ap-reveal" style={{ maxWidth: 1040, margin: '60px auto 30px', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <p className="fp-eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9a6bff', fontSize: 13, fontWeight: 600 }}>Interactive Feature Explorer</p>
          <h2 style={{ fontSize: '32px', margin: '6px 0', fontFamily: 'var(--display)' }}>Explore {def.eyebrow}</h2>
          <p style={{ color: '#a79eb6', maxWidth: 540, margin: '0 auto', fontSize: 15 }}>Click through each capability to explore how {def.eyebrow.toLowerCase()} works inside Relay.</p>
        </div>
        <FlexibleAccordion
          items={accordionItems}
          cardBackground="#1c1825"
          textColor="#ece8f3"
          mutedTextColor="#a79eb6"
          tabColor="rgba(236, 232, 243, 0.45)"
          activeTabColor="#9a6bff"
          primaryBackground="#9a6bff"
          primaryTextColor="#ffffff"
          secondaryColor="#c3a6ff"
          arrowBackground="#9a6bff"
          arrowColor="#ffffff"
          cardRadius={22}
          imageRadius={20}
          onPrimaryClick={onGetStarted}
        />
      </section>

      <section className="fp-details">
        {def.details.map((d, i) => (
          <article key={d.title} className={`fp-detail ap-reveal ${i % 2 ? 'flip' : ''}`}>
            <div className="fp-detail-copy">
              <p className="fp-eyebrow">{d.eyebrow}</p>
              <h2>{d.title}</h2>
              <p>{d.text}</p>
              <ul>{d.points.map((pt) => <li key={pt}><Icon n="check" size={16} />{pt}</li>)}</ul>
            </div>
            <div className="fp-detail-media">
              <Clip key={`${page}-${d.chapter}`} build={def.film.build} chapter={d.chapter} count={def.film.chapters.length}><Mock /></Clip>
              <p className="fp-clip-caption">{def.film.chapters[d.chapter].title}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="fp-facts ap-reveal">
        <h2>{page === 'overview' ? <>One plan.<br />All of it, unlocked.</> : `${def.eyebrow} at a glance`}</h2>
        {page === 'overview' && <p className="fp-facts-sub">There is no tier to climb and nothing held back for later.</p>}
        {page === 'overview' ? (
          <div className="fp-bento">
            {def.facts.map((f) => (
              <div key={f.title} className={`fp-fact ${f.art ? `art-${f.art}` : ''}`}>
                {f.art ? <FactArt kind={f.art} /> : <Icon n={f.icon} size={22} />}
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <InteractiveNodeDiagram
            category={page}
            title={`${def.eyebrow} at a glance`}
            subtitle="Interactive Node Architecture"
            nodes={def.facts}
          />
        )}
      </section>

      <section className="ap-final ap-reveal">
        <div className="ap-cta">
        <h2>Ready when your team is</h2>
        <p>Free to start. Every feature unlocked.</p>
        <div className="fp-final-actions">
          <button className="ap-pill blue" onClick={onGetStarted}>Get started free</button>
          <RouteLink to={def.next} go={go} className="ap-more">Next: {NEXT_LABEL[def.next]} <Icon n="chevron" size={14} /></RouteLink>
        </div>
        </div>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}
