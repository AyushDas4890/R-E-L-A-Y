// Touch of Apple for the public pages: buttons lean toward the cursor, big cards rise a little and catch a
// soft light that follows the pointer. Everything runs on critically damped springs (no overshoot) that
// always start from the value on screen, so moving the pointer mid-motion never jumps. Nothing runs on touch
// screens or when the visitor prefers reduced motion.

const RESPONSE = 0.35; // seconds: how quickly a spring reaches its target (not a fixed duration)
const OMEGA = (2 * Math.PI) / RESPONSE;

// Critically damped spring (damping ratio 1): smooth settle, no bounce.
class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(x = 0) { this.x = x; this.target = x; }
  step(dt: number): void {
    const a = OMEGA * OMEGA * (this.target - this.x) - 2 * OMEGA * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  get settled(): boolean { return Math.abs(this.target - this.x) < 0.002 && Math.abs(this.v) < 0.002; }
}

interface PillState { el: HTMLElement; sx: Spring; sy: Spring }
interface CardState { el: HTMLElement; sheen: HTMLElement; scale: Spring; light: Spring }

const CARDS = '.ap-tile, .ap-window, .ap-si-card';
const PILLS = '.ap-pill, .ap-link-btn';
const REACH = 90; // px around a button where it starts to lean
const LEAN = 0.2; // how far toward the cursor, as a fraction of the distance
const MAX_LEAN = 7; // px

export function attachPublicMotion(root: HTMLElement): () => void {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches;
  if (calm) return () => {};

  const pills = new Map<HTMLElement, PillState>();
  const cards = new Map<HTMLElement, CardState>();
  let raf = 0;
  let last = 0;

  const pillOf = (el: HTMLElement): PillState => {
    let s = pills.get(el);
    if (!s) { s = { el, sx: new Spring(), sy: new Spring() }; pills.set(el, s); }
    return s;
  };
  const cardOf = (el: HTMLElement): CardState => {
    let s = cards.get(el);
    if (!s) {
      const sheen = document.createElement('i');
      sheen.className = 'ap-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      el.appendChild(sheen);
      s = { el, sheen, scale: new Spring(1), light: new Spring(0) };
      cards.set(el, s);
    }
    return s;
  };

  const tick = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    let busy = false;
    for (const p of pills.values()) {
      p.sx.step(dt); p.sy.step(dt);
      p.el.style.translate = `${p.sx.x.toFixed(2)}px ${p.sy.x.toFixed(2)}px`;
      if (!p.sx.settled || !p.sy.settled) busy = true; else if (p.sx.target === 0 && p.sy.target === 0) p.el.style.translate = '';
    }
    for (const c of cards.values()) {
      c.scale.step(dt); c.light.step(dt);
      c.el.style.scale = c.scale.x.toFixed(4);
      c.sheen.style.opacity = Math.max(0, Math.min(1, c.light.x)).toFixed(3);
      if (!c.scale.settled || !c.light.settled) busy = true; else if (c.scale.target === 1) c.el.style.scale = '';
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const hit = (e.target as HTMLElement | null)?.closest<HTMLElement>(CARDS) ?? null;
    root.querySelectorAll<HTMLElement>(PILLS).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.hypot(Math.max(0, Math.abs(dx) - r.width / 2), Math.max(0, Math.abs(dy) - r.height / 2)) < REACH;
      const p = pillOf(el);
      p.sx.target = near ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, dx * LEAN)) : 0;
      p.sy.target = near ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, dy * LEAN)) : 0;
    });
    for (const c of cards.values()) if (c.el !== hit) { c.scale.target = 1; c.light.target = 0; }
    if (hit) {
      const c = cardOf(hit);
      const r = hit.getBoundingClientRect();
      hit.style.setProperty('--mx', `${e.clientX - r.left}px`);
      hit.style.setProperty('--my', `${e.clientY - r.top}px`);
      // Bigger cards rise less, so a wide window does not swell.
      c.scale.target = 1 + Math.min(0.012, 6 / Math.max(r.width, 1));
      c.light.target = 1;
    }
    wake();
  };
  const onLeave = () => {
    pills.forEach((p) => { p.sx.target = 0; p.sy.target = 0; });
    cards.forEach((c) => { c.scale.target = 1; c.light.target = 0; });
    wake();
  };

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  return () => {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    cancelAnimationFrame(raf);
    pills.forEach((p) => { p.el.style.translate = ''; });
    cards.forEach((c) => { c.el.style.scale = ''; c.sheen.remove(); });
  };
}
