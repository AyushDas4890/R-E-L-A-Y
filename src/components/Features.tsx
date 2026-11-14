import { useEffect, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { Kbd } from '@astryxdesign/core/Kbd';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Film, Clip, Win, Msg, Bot, Cursor, typeInto, eraseText, type Build, type Chapter } from './Film.tsx';
import { ENTER, EXIT, T, arrive, pointAt, typing } from '../motion.ts';
import { Icon, type IconName } from './Icon.tsx';
import { RouteLink, SiteFrame, SiteSection, scrollToHash, type FeatureRoute, type Route } from './Site.tsx';
import { Mascot } from './SiteShots.tsx';
import '../features.css';

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

// ======================= Page content =======================

interface Detail { chapter: number; eyebrow: string; title: string; text: string; points: string[] }
interface Fact { icon: IconName; title: string; text: string }
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
      { icon: 'message', title: 'Nothing ages out', text: 'Scroll back to the very first message. It is still there, and still searchable.' },
      { icon: 'headphones', title: 'Talk it through', text: 'Voice and screen share, one click from any channel.' },
      { icon: 'file', title: 'A doc beside every chat', text: 'Plans live next to the conversation that made them.' },
      { icon: 'checkSquare', title: 'Work with an owner', text: 'Status, assignee and due date.' },
      { icon: 'zap', title: 'Teach the bot your routines', text: 'Triggers on a keyword, a join or the clock.' },
      { icon: 'clock', title: 'Never lose the follow-up', text: 'Scheduled messages, or just type /remind.' },
      { icon: 'search', title: 'Ask, don’t dig', text: 'Press Ctrl K, ask a question, get the message.' },
      { icon: 'lock', title: 'Doors that close', text: 'Private channels, guests and user groups.' },
      { icon: 'settings', title: 'You hold the keys', text: 'Roles, invites and moderation.' },
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

// What each page's closing mascot says.
const MASCOT_SAYS: Record<FeatureRoute, string> = {
  overview: 'Say hi in #general',
  huddles: 'Got five minutes?',
  workflows: 'I will take the busywork',
  search: 'Ask me with a question mark',
};
// Triggers for the workflow recipes, in the order of the workflow facts.
const RECIPE_CODES = ['!standup', 'Weekdays 9:30', '!incident', '!it', '!win', '/remind'];

type PageProps = { def: PageDef; page: FeatureRoute; wide: boolean; onGetStarted: () => void };

function FilmCard({ def, page }: { def: PageDef; page: FeatureRoute }) {
  const { Mock } = def.film;
  return (
    <Card id="film" padding={3} elevation="high" className="site-film">
      <Film key={page} label={def.film.label} chapters={def.film.chapters} build={def.film.build}><Mock /></Film>
    </Card>
  );
}

function Actions({ onGetStarted, center }: { onGetStarted: () => void; center?: boolean }) {
  return (
    <HStack gap={3} wrap="wrap" justify={center ? 'center' : 'start'}>
      <Button label="Try it free" variant="primary" size="lg" onClick={onGetStarted} />
      <Button label="Watch how it works" variant="secondary" size="lg" onClick={() => scrollToHash('#film', true)} />
    </HStack>
  );
}

// Overview and Search open centred over the film; Huddles and Workflows open as a split, the
// copy on the left and the four steps listed on the right like a table of contents.
function Hero({ def, page, wide, onGetStarted }: PageProps) {
  const centred = page === 'overview' || page === 'search';
  return (
    <SiteSection paddingBlockStart={10} paddingBlockEnd={6} gap={8}>
      {centred ? (
        <VStack gap={4} hAlign="center" className="site-rise">
          <Text color="secondary" weight="medium">{def.eyebrow}</Text>
          <Heading level={1} type="display-2" weight="semibold" justify="center" textWrap="balance">{def.title}</Heading>
          <Text type="large" color="secondary" justify="center" textWrap="balance">{def.lede}</Text>
          {page === 'search' && <HStack gap={2} vAlign="center"><Kbd keys="mod+k" /><Text type="supporting">from anywhere in Relay</Text></HStack>}
          <Actions onGetStarted={onGetStarted} center />
        </VStack>
      ) : (
        <Grid columns={wide ? 2 : 1} gap={wide ? 10 : 6} className="site-rise">
          <VStack gap={4} hAlign="start">
            <Text color="secondary" weight="medium">{def.eyebrow}</Text>
            <Heading level={1} type="display-2" weight="semibold" textWrap="balance">{def.title}</Heading>
            <Text type="large" color="secondary">{def.lede}</Text>
            <Actions onGetStarted={onGetStarted} />
          </VStack>
          <VStack gap={0} vAlign="center">
            {def.film.chapters.map((c, k) => (
              <VStack key={c.title} gap={0}>
                {k > 0 && <Divider />}
                <HStack gap={4} vAlign="start" paddingBlock={3}>
                  <Text color="secondary" hasTabularNumbers className="site-time">0{k + 1}</Text>
                  <VStack gap={0.5}><Text weight="medium">{c.title}</Text><Text type="supporting">{c.text}</Text></VStack>
                </HStack>
              </VStack>
            ))}
          </VStack>
        </Grid>
      )}
      <FilmCard def={def} page={page} />
    </SiteSection>
  );
}

function Points({ points }: { points: string[] }) {
  return (
    <VStack gap={1.5}>
      {points.map((pt) => <HStack key={pt} gap={2} vAlign="center"><Text color="secondary"><Icon n="check" size={14} /></Text><Text size="sm">{pt}</Text></HStack>)}
    </VStack>
  );
}

function StepClip({ def, page, d }: { def: PageDef; page: FeatureRoute; d: Detail }) {
  const { Mock } = def.film;
  return <Clip key={`${page}-${d.chapter}`} build={def.film.build} chapter={d.chapter} count={def.film.chapters.length}><Mock /></Clip>;
}

// The steps, laid out differently on each page: alternating rows (Overview), a two-by-two grid of
// cards (Huddles), a numbered run-sheet (Workflows) and a strip of four clips (Search).
function Steps({ def, page, wide }: PageProps) {
  const title = { overview: 'How Relay works, step by step', huddles: 'From a click to the notes', workflows: 'Build one in four moves', search: 'Four keystrokes to the answer' }[page];
  const head = <Heading level={2} type="display-3" weight="semibold">{title}</Heading>;
  if (page === 'overview') {
    return (
      <SiteSection gap={10}>
        {head}
        {def.details.map((d, k) => (
          <Grid key={d.title} columns={wide ? 2 : 1} gap={wide ? 10 : 4} align="center">
            <VStack gap={3} className={wide && k % 2 ? 'site-order-2' : undefined}>
              <Text type="supporting">{d.eyebrow}</Text>
              <Heading level={3}>{d.title}</Heading>
              <Text color="secondary">{d.text}</Text>
              <Points points={d.points} />
            </VStack>
            <Card variant="muted" padding={3}><StepClip def={def} page={page} d={d} /></Card>
          </Grid>
        ))}
      </SiteSection>
    );
  }
  if (page === 'huddles') {
    return (
      <SiteSection gap={6}>
        {head}
        <Grid columns={wide ? 2 : 1} gap={4}>
          {def.details.map((d) => (
            <Card key={d.title} variant="muted" padding={5}>
              <VStack gap={4}>
                <VStack gap={1}><Text type="supporting">{d.eyebrow}</Text><Heading level={3}>{d.title}</Heading></VStack>
                <Text color="secondary">{d.text}</Text>
                <StepClip def={def} page={page} d={d} />
              </VStack>
            </Card>
          ))}
        </Grid>
      </SiteSection>
    );
  }
  if (page === 'workflows') {
    return (
      <SiteSection gap={6}>
        {head}
        <VStack gap={0}>
          {def.details.map((d, k) => (
            <VStack key={d.title} gap={0}>
              <Divider />
              <Grid columns={wide ? 2 : 1} gap={wide ? 8 : 4} className="site-runsheet">
                <HStack gap={4} vAlign="start">
                  <Text type="large" color="secondary" hasTabularNumbers className="site-time">0{k + 1}</Text>
                  <VStack gap={3}>
                    <Heading level={3}>{d.title}</Heading>
                    <Text color="secondary">{d.text}</Text>
                    <Points points={d.points} />
                  </VStack>
                </HStack>
                <StepClip def={def} page={page} d={d} />
              </Grid>
            </VStack>
          ))}
        </VStack>
      </SiteSection>
    );
  }
  return (
    <SiteSection gap={6}>
      {head}
      <Grid columns={wide ? 4 : 1} gap={4}>
        {def.details.map((d) => (
          <VStack key={d.title} gap={3}>
            <Card variant="muted" padding={2}><StepClip def={def} page={page} d={d} /></Card>
            <Text weight="medium">{d.title}</Text>
            <Text type="supporting">{d.text}</Text>
          </VStack>
        ))}
      </Grid>
    </SiteSection>
  );
}

// The facts, also different per page: a full-bleed plan band (Overview, the #pricing anchor), a dense
// two-column table (Huddles), recipes with their triggers (Workflows) and shortcut cards (Search).
function Facts({ def, page, wide }: PageProps) {
  if (page === 'overview') {
    return (
      <VStack as="section" id="pricing" hAlign="center" paddingInline={4} paddingBlock={10} style={{ background: 'var(--color-background-muted)' }} className="site-section">
        <Grid columns={wide ? 3 : 1} gap={wide ? 10 : 6} width="100%" maxWidth={1080}>
          <VStack gap={3} hAlign="start">
            <Heading level={2} type="display-3" weight="semibold">One plan, all of it on</Heading>
            <Text color="secondary">Free for your organisation. There is no tier to climb and nothing held back for later.</Text>
          </VStack>
          {[def.facts.slice(0, 5), def.facts.slice(5)].map((col, c) => (
            <VStack key={c} gap={0}>
              {col.map((f, k) => (
                <VStack key={f.title} gap={0}>
                  {k > 0 && <Divider />}
                  <HStack gap={3} vAlign="start" paddingBlock={3}>
                    <Text color="secondary"><Icon n={f.icon} size={16} /></Text>
                    <VStack gap={0.5}><Text weight="medium">{f.title}</Text><Text type="supporting">{f.text}</Text></VStack>
                  </HStack>
                </VStack>
              ))}
            </VStack>
          ))}
        </Grid>
      </VStack>
    );
  }
  if (page === 'huddles') {
    return (
      <SiteSection gap={4}>
        <Heading level={2} type="display-3" weight="semibold">Huddles at a glance</Heading>
        <Grid columns={wide ? 2 : 1} columnGap={10} rowGap={0}>
          {def.facts.map((f) => (
            <VStack key={f.title} gap={0}>
              <Divider />
              <HStack gap={4} vAlign="center" justify="between" paddingBlock={3}>
                <Text weight="medium">{f.title}</Text>
                <Text type="supporting" justify="end">{f.text}</Text>
              </HStack>
            </VStack>
          ))}
        </Grid>
      </SiteSection>
    );
  }
  if (page === 'workflows') {
    return (
      <SiteSection gap={4}>
        <VStack gap={2}>
          <Heading level={2} type="display-3" weight="semibold">Recipes teams start with</Heading>
          <Text color="secondary">Each one is a trigger and a reply. Copy the trigger, change the words, save.</Text>
        </VStack>
        <Grid columns={wide ? 3 : 1} gap={3}>
          {def.facts.map((f, k) => (
            <Card key={f.title} padding={4} variant="muted">
              <VStack gap={2} hAlign="start">
                <Token size="sm" label={RECIPE_CODES[k] ?? f.title} />
                <Text weight="medium">{f.title}</Text>
                <Text type="supporting">{f.text}</Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      </SiteSection>
    );
  }
  const keys = ['mod+k', '', '', '?', '', ''];
  return (
    <SiteSection gap={4}>
      <Heading level={2} type="display-3" weight="semibold">Search at a glance</Heading>
      <Grid columns={wide ? 3 : 1} gap={3}>
        {def.facts.map((f, k) => (
          <Card key={f.title} padding={4}>
            <HStack gap={3} vAlign="start">
              {keys[k] ? <Kbd keys={keys[k]} /> : <Text color="secondary"><Icon n={f.icon} size={16} /></Text>}
              <VStack gap={0.5}><Text weight="medium">{f.title}</Text><Text type="supporting">{f.text}</Text></VStack>
            </HStack>
          </Card>
        ))}
      </Grid>
    </SiteSection>
  );
}

// A feature page in the public site's light frame. Each page shares the frame, the film and the
// closing card, and differs in how its hero, steps and facts are laid out.
export function FeaturePage({ page, go, onGetStarted }: { page: FeatureRoute; go: (r: Route) => void; onGetStarted: () => void }) {
  const def = PAGE_DEFS[page];
  const wide = useMediaQuery('(min-width: 860px)');
  useEffect(() => { scrollToHash(); }, [page]);
  const props = { def, page, wide, onGetStarted };

  return (
    <SiteFrame route={page} onGetStarted={onGetStarted}>
      <Hero {...props} />
      <Steps {...props} />
      <Facts {...props} />
      <SiteSection paddingBlockStart={8} gap={4}>
        <Card padding={8} className="site-cta">
          <HStack gap={8} vAlign="center" justify="between" wrap="wrap">
            <VStack gap={3} hAlign="start" maxWidth={520}>
              <Heading level={2} type="display-3" weight="semibold">Try it with your team</Heading>
              <Text color="secondary">Free to start, every feature on. Or keep reading about the next part of Relay.</Text>
              <HStack gap={4} wrap="wrap" vAlign="center">
                <Button label="Get Relay free" variant="primary" size="lg" onClick={onGetStarted} />
                <RouteLink to={def.next} go={go} className="site-next">Next: {NEXT_LABEL[def.next]} →</RouteLink>
              </HStack>
            </VStack>
            <Mascot say={MASCOT_SAYS[page]} />
          </HStack>
        </Card>
      </SiteSection>
    </SiteFrame>
  );
}
