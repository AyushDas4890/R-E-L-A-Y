// One motion language for every product scene on the public site (landing tiles, feature films,
// shelf covers): one entrance curve, one travel curve, short feedback, and loops that fade out to a
// clean reset instead of cutting. Only transform and opacity are animated.
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(CustomEase, TextPlugin);

// Entrances and things settling into place: fast start, long soft landing, no overshoot.
export const ENTER = 'relayEnter';
// The pointer travelling between targets, and panels that leave.
export const TRAVEL = 'power2.inOut';
export const EXIT = 'power2.in';
CustomEase.create(ENTER, '0.32,0.72,0,1');

export const T = { feedback: 0.14, enter: 0.6, panel: 0.7, travel: 0.75, exit: 0.35, reset: 0.45 };

export const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Q = (selector: string) => Element[];
type At = number | string;

// A message or row arriving: rises a few pixels and fades in.
export function arrive(tl: gsap.core.Timeline, targets: gsap.TweenTarget, at: At, stagger = 0.12) {
  return tl.fromTo(targets, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: T.enter, ease: ENTER, stagger }, at);
}

// Layout position of `el` inside `box`, ignoring transforms set by the timeline.
export function offsetIn(el: HTMLElement, box: HTMLElement) {
  let x = 0, y = 0;
  for (let n: HTMLElement | null = el; n && n !== box; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y };
}

// The pointer glides to an element inside `box`, then presses it. The pressed element dips for a
// moment, the way a real button answers a click.
export function pointAt(tl: gsap.core.Timeline, q: Q, box: string, target: string, at: At, opts: { dx?: number; dy?: number; press?: boolean } = {}) {
  const el = q(target)[0] as HTMLElement | undefined;
  const root = el?.closest(box) as HTMLElement | null;
  const cursor = q('.mo-cursor');
  if (!el || !root || !cursor.length) return tl;
  const o = offsetIn(el, root);
  const x = o.x + el.offsetWidth * (opts.dx ?? 0.5), y = o.y + el.offsetHeight * (opts.dy ?? 0.5);
  tl.to(cursor, { x, y, duration: T.travel, ease: TRAVEL }, at);
  if (opts.press === false) return tl;
  return tl
    .to(cursor, { scale: 0.86, duration: T.feedback / 2, ease: 'power1.out' })
    .to(el, { scale: 0.96, duration: T.feedback / 2, ease: 'power1.out' }, '<')
    .to(cursor, { scale: 1, duration: T.feedback, ease: ENTER })
    .to(el, { scale: 1, duration: T.feedback, ease: ENTER }, '<');
}

// Typed text. It is rendered by the timeline itself (not a callback), so it stays correct when the
// timeline is scrubbed, seeked or looped.
export function typeText(tl: gsap.core.Timeline, el: Element | undefined, text: string, at: At, duration = text.length * 0.05, from = '') {
  if (!el) return tl;
  return tl.fromTo(el, { text: from }, { text: { value: text }, duration, ease: 'none', immediateRender: false }, at);
}

// Swaps text at a point in time (and restores the earlier text when scrubbed back).
export function setText(tl: gsap.core.Timeline, el: Element | undefined, before: string, after: string, at: At) {
  if (!el) return tl;
  return tl.fromTo(el, { text: before }, { text: after, duration: 0.001, ease: 'none', immediateRender: false }, at);
}

// Typing indicator: the three dots light up in turn while someone composes, `cycles` times.
export function typing(tl: gsap.core.Timeline, dots: gsap.TweenTarget, at: At, cycles = 2) {
  return tl.fromTo(dots, { opacity: 0.3 }, { opacity: 1, duration: 0.2, ease: 'sine.inOut', yoyo: true, repeat: cycles * 2 - 1, stagger: 0.12 }, at);
}

// Keeps a scene playing while on screen. Each pass ends with the whole scene fading out; then
// either `onEnd` hands over to the next scene, or the timeline resets while invisible and the first
// frame fades back in, so nothing hard-cuts. `onProgress` reports 0..1 through the pass.
// Reduced motion shows the finished frame and never plays.
interface LoopOpts { hold?: number; rest?: number; threshold?: number; fadeIn?: boolean; onEnd?: () => void; onProgress?: (p: number) => void }
export function loopScene(root: HTMLElement, content: HTMLElement, build: () => gsap.core.Timeline, opts: LoopOpts = {}): () => void {
  const tl = build();
  // Render the whole timeline once and come back, so its opening state is on screen before it ever
  // plays (a paused timeline would otherwise leave the CSS default, the finished frame, showing).
  tl.pause().progress(1).progress(0);
  // Handle for inspecting a frame from the console: el._tl.pause(2.5)
  (root as HTMLElement & { _tl?: gsap.core.Timeline })._tl = tl;
  if (reduceMotion()) { tl.progress(1); opts.onProgress?.(1); return () => tl.kill(); }
  let visible = false;
  let waiting: gsap.core.Tween | null = null;
  const fadeIn = (delay: number) => {
    waiting = gsap.fromTo(content, { autoAlpha: 0 }, { autoAlpha: 1, duration: T.reset, ease: ENTER, delay, onComplete: () => { waiting = null; if (visible) tl.play(); } });
    if (!visible) waiting.pause();
  };
  const end = () => {
    waiting = gsap.to(content, { autoAlpha: 0, duration: T.reset, ease: EXIT, delay: opts.hold ?? 1.6, onComplete: () => {
      if (opts.onEnd) { waiting = null; opts.onEnd(); return; }
      tl.pause(0);
      fadeIn(opts.rest ?? 0.3);
    } });
    if (!visible) waiting.pause();
  };
  tl.eventCallback('onComplete', end);
  if (opts.onProgress) tl.eventCallback('onUpdate', () => opts.onProgress!(tl.progress()));
  if (opts.fadeIn) fadeIn(0);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { if (waiting) waiting.resume(); else tl.resume(); }
    else { tl.pause(); waiting?.pause(); }
  }, { threshold: opts.threshold ?? 0.25 });
  io.observe(root);
  return () => { io.disconnect(); waiting?.kill(); tl.kill(); gsap.set(content, { clearProps: 'opacity,visibility' }); };
}
