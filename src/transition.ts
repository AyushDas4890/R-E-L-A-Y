import { gsap } from 'gsap';

// Page transition between the landing, sign-in and workspace views: staggered panels sweep up to
// cover the screen, the view swaps underneath, then the panels sweep off the top.

let busy = false;

function overlay() {
  let el = document.getElementById('pt-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'pt-overlay';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i></i><i></i><i></i><i></i><b>relay</b>';
  document.body.appendChild(el);
  return el;
}

export function pageTransition(swap: () => void) {
  // A second request mid-sweep (a double click, or Back pressed during the animation) still has
  // to land, or the view and the URL disagree; the swap just happens without its own sweep.
  if (busy) { swap(); return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
  busy = true;
  const el = overlay();
  const panels = el.querySelectorAll('i');
  const word = el.querySelector('b');
  gsap.set(el, { display: 'block' });
  gsap.timeline({ onComplete: () => { gsap.set(el, { display: 'none' }); busy = false; } })
    // y: 0 matters: GSAP reads the stylesheet's translateY(100%) as a pixel `y` and would add
    // yPercent on top, so the panels stopped a full screen short and never covered the swap.
    .fromTo(panels, { y: 0, yPercent: 100 }, { y: 0, yPercent: 0, duration: 0.55, stagger: 0.06, ease: 'power4.inOut' })
    .fromTo(word, { opacity: 0, y: 30, letterSpacing: '0.4em' }, { opacity: 1, y: 0, letterSpacing: '0.02em', duration: 0.5, ease: 'power3.out' }, '-=0.2')
    .add(() => swap())
    .to(word, { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, '+=0.25')
    .to(panels, { yPercent: -100, duration: 0.6, stagger: 0.06, ease: 'power4.inOut' }, '-=0.1');
}
