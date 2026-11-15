// The living backdrop for the main page of the website: drifting dots joined by faint threads, a few glowing nodes with
// small "relay" packets hopping between them, dots that lean away from the cursor, and a ripple on click.
// It is pure decoration (hidden from assistive tech, never catches the pointer) and holds still when the
// visitor prefers reduced motion. The ink colour is the canvas's CSS `color`, so it suits light or dark pages.
import { useEffect, useRef } from 'react';

type RGB = [number, number, number];
const GLOWS: RGB[] = [[79, 140, 255], [229, 82, 127], [31, 184, 166], [245, 165, 11], [154, 107, 255]];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// z is how far the dot sits behind the page: deeper dots follow the scroll less, which gives the sky depth.
interface Dot { x: number; y: number; vx: number; vy: number; r: number; z: number }
interface Node { ax: number; ay: number; x: number; y: number; r: number; col: RGB; phase: number; orbit: number }
interface Packet { from: number; to: number; t: number; speed: number }
interface Ripple { x: number; y: number; t: number; col: RGB }

export function LiveStarfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, raf = 0;
    const mouse = { x: -9999, y: -9999, on: false };
    let ink: RGB = [29, 29, 31];
    let dots: Dot[] = [];
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let ripples: Ripple[] = [];

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(getComputedStyle(canvas).color);
      if (m) ink = [Number(m[1]), Number(m[2]), Number(m[3])];
      const count = Math.round(Math.min(90, Math.max(26, (w * h) / 14000)));
      dots = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: 0.8 + Math.random() * 1.5, z: 0.06 + Math.random() * 0.3 }));
      // Glowing nodes sit toward the edges so they frame the page copy instead of sitting under it.
      const wide = w > 700;
      const spots: [number, number][] = wide
        ? [[0.08, 0.22], [0.92, 0.2], [0.15, 0.72], [0.86, 0.66], [0.5, 0.9]]
        : [[0.12, 0.16], [0.88, 0.3], [0.14, 0.76], [0.86, 0.88]];
      nodes = spots.map(([fx, fy], i) => ({ ax: fx * w, ay: fy * h, x: fx * w, y: fy * h, r: 9 + (i % 3) * 3, col: GLOWS[i % GLOWS.length], phase: i * 2.1, orbit: 12 + (i % 3) * 6 }));
      packets = [];
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      const sec = time / 1000;

      // Dots ride the scroll at their own depth, wrapping around so the sky never runs out.
      const sy = 0;
      const scrY = (d: Dot) => { const m = (d.y - sy * d.z) % h; return m < 0 ? m + h : m; };
      for (const d of dots) {
        if (still) break;
        const dx = d.x - mouse.x, dy = scrY(d) - mouse.y, dist = Math.hypot(dx, dy);
        if (mouse.on && dist < 130 && dist > 0.1) { const f = (1 - dist / 130) * 0.9; d.vx += (dx / dist) * f * 0.12; d.vy += (dy / dist) * f * 0.12; }
        d.vx *= 0.985; d.vy *= 0.985;
        d.x += d.vx; d.y += d.vy;
        if (d.x < -10) d.x = w + 10; else if (d.x > w + 10) d.x = -10;
      }
      const pts = dots.map((d) => ({ x: d.x, y: scrY(d) }));
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (dist < 110) { ctx.strokeStyle = rgba(ink, (1 - dist / 110) * 0.16); ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
        }
      }
      for (let i = 0; i < pts.length; i++) { ctx.fillStyle = rgba(ink, 0.4); ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, dots[i].r, 0, Math.PI * 2); ctx.fill(); }
      // Near the cursor the sky answers: a soft light and threads to the closest dots, like a constellation forming.
      if (mouse.on && !still) {
        const glow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 170);
        glow.addColorStop(0, 'rgba(79,140,255,0.13)'); glow.addColorStop(1, 'rgba(79,140,255,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 170, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < pts.length; i++) {
          const dist = Math.hypot(pts[i].x - mouse.x, pts[i].y - mouse.y);
          if (dist < 140) { ctx.strokeStyle = `rgba(79,140,255,${(1 - dist / 140) * 0.4})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
        }
      }

      nodes.forEach((nd) => {
        if (!still) { nd.x = nd.ax + Math.cos(sec * 0.35 + nd.phase) * nd.orbit; nd.y = nd.ay + Math.sin(sec * 0.28 + nd.phase * 1.3) * nd.orbit * 0.7; }
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(w, h) * 0.62) continue;
          const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          g.addColorStop(0, rgba(a.col, 0.32)); g.addColorStop(1, rgba(b.col, 0.32));
          ctx.strokeStyle = g; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (!still) {
        if (Math.random() < 0.012 && packets.length < 5 && nodes.length > 1) {
          const from = Math.floor(Math.random() * nodes.length);
          packets.push({ from, to: (from + 1 + Math.floor(Math.random() * (nodes.length - 1))) % nodes.length, t: 0, speed: 0.004 + Math.random() * 0.004 });
        }
        packets = packets.filter((p) => (p.t += p.speed) < 1);
        for (const p of packets) {
          const a = nodes[p.from], b = nodes[p.to];
          const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
          const col = a.col.map((v, k) => Math.round(v + (b.col[k] - v) * p.t)) as RGB;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
          glow.addColorStop(0, rgba(col, 0.85)); glow.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      nodes.forEach((nd) => {
        const pulse = still ? 0 : (Math.sin(sec * 1.4 + nd.phase) + 1) / 2;
        const halo = ctx.createRadialGradient(nd.x, nd.y, nd.r * 0.4, nd.x, nd.y, nd.r * 3.4);
        halo.addColorStop(0, rgba(nd.col, 0.4)); halo.addColorStop(1, rgba(nd.col, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(nd.col, 0.45 - pulse * 0.3); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r + 6 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(nd.col, 0.95); ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2); ctx.fill();
      });

      ripples = ripples.filter((r) => (r.t += 0.018) < 1);
      for (const r of ripples) { ctx.strokeStyle = rgba(r.col, (1 - r.t) * 0.6); ctx.lineWidth = 2 * (1 - r.t) + 0.5; ctx.beginPath(); ctx.arc(r.x, r.y, 8 + r.t * 150, 0, Math.PI * 2); ctx.stroke(); }
    };

    const frame = (t: number) => { draw(t); raf = requestAnimationFrame(frame); };
    layout();
    if (still) draw(0); else raf = requestAnimationFrame(frame);

    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, in: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
    const onMove = (e: PointerEvent) => { const p = local(e); mouse.x = p.x; mouse.y = p.y; mouse.on = p.in; };
    const onLeave = () => { mouse.on = false; mouse.x = mouse.y = -9999; };
    // A ripple where you click, except on controls: the page's buttons stay the star of the show.
    const onDown = (e: PointerEvent) => {
      if (still || (e.target as HTMLElement | null)?.closest('button, a, input, textarea, select, label')) return;
      const p = local(e);
      if (p.in) ripples.push({ x: p.x, y: p.y, t: 0, col: GLOWS[Math.floor(Math.random() * GLOWS.length)] });
    };
    const ro = new ResizeObserver(() => { layout(); if (still) draw(0); });
    ro.observe(canvas);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} className="ap-stars" aria-hidden="true" />;
}
