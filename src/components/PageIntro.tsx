import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform, useMotionValue, animate } from 'framer-motion';

/**
 * PageIntro – scroll-zoom reveal on first page load.
 *
 * Shows a small pill in the centre of the screen, animates it to fill the full
 * viewport (mimicking the Framer scroll-zoom-reveal component) and then fades
 * the whole overlay out so the actual landing page appears.
 *
 * The overlay is skipped for users who prefer reduced motion.
 */
export function PageIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'expand' | 'done'>('intro');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Skip entirely for reduced-motion users
  useEffect(() => {
    if (reduce) {
      onDone();
    }
  }, [reduce, onDone]);

  // Spring physics – pill grows from 15vw × 5vh pill to full 100vw × 100vh
  const progress = useMotionValue(0);
  const springProgress = useSpring(progress, { stiffness: 90, damping: 25, mass: 0.6 });

  const width = useTransform(springProgress, [0, 1], ['14vw', '100vw']);
  const height = useTransform(springProgress, [0, 1], ['5vh', '100vh']);
  const borderRadius = useTransform(springProgress, [0, 1], [50, 0]);
  const overlayOpacity = useTransform(springProgress, [0.85, 1], [1, 0]);
  const textOpacity = useTransform(springProgress, [0, 0.3], [1, 0]);

  // Phase 1 → 2: wait a tick, then animate pill to fullscreen
  useEffect(() => {
    if (reduce) return;
    const t1 = setTimeout(() => {
      setPhase('expand');
      void animate(progress, 1, { duration: 1.1, ease: [0.33, 1, 0.68, 1] });
    }, 600);
    return () => clearTimeout(t1);
  }, [reduce]);

  // Phase 2 → done: after the spring settles, let the opacity spring finish then unmount
  useEffect(() => {
    if (phase !== 'expand') return;
    const t = setTimeout(() => {
      setPhase('done');
      onDone();
    }, 1900);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  if (phase === 'done' || reduce) return null;

  return (
    <motion.div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a12',
        opacity: overlayOpacity,
        pointerEvents: phase === 'expand' ? 'none' : 'auto',
      }}
    >
      {/* The pill that grows to fill the screen */}
      <motion.div
        style={{
          width,
          height,
          borderRadius,
          overflow: 'hidden',
          position: 'relative',
          background: '#0d0d1a',
          boxShadow: '0 0 60px rgba(120,80,255,0.25)',
        }}
      >
        {/* Background gradient / image */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 60% 50%, #1a0a3d 0%, #0a0a18 55%, #000 100%)',
          }}
        />
        {/* Animated gradient shimmer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.4, delay: 0.2 }}
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'conic-gradient(from 180deg at 50% 50%, #6025f5 0deg, #a855f7 90deg, #3b82f6 180deg, #6025f5 360deg)',
            opacity: 0.15,
          }}
        />

        {/* Centre label — fades out as pill expands */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            opacity: textOpacity,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: 'clamp(14px, 2vw, 22px)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            Relay
          </span>
          {/* Play triangle */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'relative',
                left: 2,
                borderStyle: 'solid',
                borderWidth: '7px 0 7px 13px',
                borderColor: 'transparent transparent transparent #fff',
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
