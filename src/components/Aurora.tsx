import { useEffect, useRef } from 'react';

// The motion backdrop for the public pages, the boot screen and sign-in: soft violet aurora bands
// drifting over deep indigo, with glowing message-bubble motes rising through them. Two canvases:
// the aurora is drawn small and scaled up (which blurs it for free), the motes are drawn crisp.
// The whole thing leans toward the pointer. Pauses when off screen or hidden; honours reduced motion.

const BLOBS = [
  { c: [167, 139, 250], r: 0.55, sx: 0.00021, sy: 0.00017, px: 0.2, py: 0.3, a: 0.55 },
  { c: [124, 58, 237], r: 0.6, sx: 0.00015, sy: 0.00023, px: 0.75, py: 0.35, a: 0.5 },
  { c: [96, 165, 250], r: 0.45, sx: 0.00026, sy: 0.00013, px: 0.5, py: 0.7, a: 0.35 },
  { c: [221, 214, 254], r: 0.35, sx: 0.00019, sy: 0.00029, px: 0.3, py: 0.8, a: 0.3 },
  { c: [192, 132, 252], r: 0.5, sx: 0.00012, sy: 0.0002, px: 0.85, py: 0.8, a: 0.4 },
];

interface Mote { x: number; y: number; r: number; v: number; w: number; p: number; k: number }

export function Aurora({ intensity = 1, motes = 28, className = '' }: { intensity?: number; motes?: number; className?: string }) {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const b = back.current, f = front.current;
    const bc = b?.getContext('2d'), fc = f?.getContext('2d');
    if (!b || !f || !bc || !fc) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, visible = true, alive = true;
    let mx = 0, my = 0, cx = 0, cy = 0;
    const SCALE = 0.12; // the aurora canvas is drawn at 12% size
    const list: Mote[] = [];
    const seed = () => { list.length = 0; for (let i = 0; i < motes; i++) list.push({ x: Math.random(), y: Math.random(), r: 2 + Math.random() * 4, v: 0.00004 + Math.random() * 0.00008, w: Math.random() * 6.28, p: Math.random() * 6.28, k: Math.random() < 0.3 ? 1 : 0 }); };
    const size = () => {
      const r = f.getBoundingClientRect(); w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      b.width = Math.max(1, Math.round(w * SCALE)); b.height = Math.max(1, Math.round(h * SCALE));
      f.width = Math.round(w * dpr); f.height = Math.round(h * dpr); fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const bubble = (x: number, y: number, r: number) => {
      fc.beginPath(); fc.moveTo(x - r, y); fc.arcTo(x - r, y - r, x, y - r, r * 0.9); fc.arcTo(x + r, y - r, x + r, y, r * 0.9); fc.arcTo(x + r, y + r * 0.6, x, y + r * 0.6, r * 0.9);
      fc.lineTo(x - r * 0.2, y + r * 0.6); fc.lineTo(x - r * 0.6, y + r * 1.1); fc.lineTo(x - r * 0.55, y + r * 0.6); fc.arcTo(x - r, y + r * 0.6, x - r, y, r * 0.9); fc.closePath();
    };
    const draw = (t: number) => {
      raf = 0; if (!alive || !visible) return;
      cx += (mx - cx) * 0.04; cy += (my - cy) * 0.04;
      // Aurora: additive blobs wandering on slow sine paths.
      const bw = b.width, bh = b.height;
      bc.globalCompositeOperation = 'source-over';
      bc.fillStyle = '#0b0618'; bc.fillRect(0, 0, bw, bh);
      bc.globalCompositeOperation = 'lighter';
      for (let i = 0; i < BLOBS.length; i++) {
        const o = BLOBS[i];
        const x = (o.px + Math.sin(t * o.sx + i) * 0.22 + cx * 0.06) * bw, y = (o.py + Math.cos(t * o.sy + i * 1.7) * 0.18 + cy * 0.05) * bh;
        const r = o.r * Math.max(bw, bh) * (0.85 + Math.sin(t * 0.0003 + i) * 0.15);
        const g = bc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${(o.a * intensity).toFixed(3)})`);
        g.addColorStop(1, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},0)`);
        bc.fillStyle = g; bc.beginPath(); bc.arc(x, y, r, 0, 6.2832); bc.fill();
      }
      // Motes: rising, wobbling, breathing. A few are little chat bubbles.
      fc.clearRect(0, 0, w, h);
      for (const m of list) {
        m.y -= m.v * 16; m.w += 0.004;
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        const x = (m.x + Math.sin(m.w) * 0.02 + cx * 0.015) * w, y = (m.y + cy * 0.01) * h;
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.002 + m.p));
        fc.fillStyle = `rgba(221,214,254,${a.toFixed(3)})`;
        fc.shadowColor = 'rgba(167,139,250,.9)'; fc.shadowBlur = m.r * 3;
        if (m.k) bubble(x, y, m.r * 1.8); else { fc.beginPath(); fc.arc(x, y, m.r * 0.6, 0, 6.2832); }
        fc.fill();
      }
      fc.shadowBlur = 0;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    const wake = () => { if (!raf && alive && visible) raf = requestAnimationFrame(draw); };
    const onMove = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting && !document.hidden; wake(); });
    const onVis = () => { visible = !document.hidden; wake(); };
    const ro = new ResizeObserver(() => { size(); wake(); });
    seed(); size(); io.observe(f); ro.observe(f);
    window.addEventListener('pointermove', onMove); document.addEventListener('visibilitychange', onVis);
    draw(performance.now());
    return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); window.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis); };
  }, [intensity, motes]);

  return (
    <div className={`au ${className}`} aria-hidden>
      <canvas className="au-back" ref={back} />
      <canvas className="au-front" ref={front} />
    </div>
  );
}
