// A small floating panel anchored to an element. Closes on Escape and on a click outside; the
// focus moves in when it opens and back to the trigger when it closes.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  // The element the panel hangs from.
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  width?: number;
  align?: 'start' | 'end';
  className?: string;
}

export function Popover({ anchor, onClose, children, label, width = 280, align = 'start', className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ready = pos !== null;

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // Open upward when there is much more room above.
    if (below < 240 && above > below) setPos({ left, top: Math.max(8, r.top - 6), maxHeight: above - 4 });
    else setPos({ left, top: r.bottom + 6, maxHeight: Math.max(160, below) });
  }, [anchor, width, align]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      // A click inside another popover opened from this one stays open.
      if ((t as HTMLElement).closest?.('[data-popover]')) return;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    ref.current?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [anchor, ready]);

  if (!anchor || !pos) {
    // Measure first, then show.
    return null;
  }
  const upward = pos.top < anchor.getBoundingClientRect().top;
  return createPortal(
    <div
      ref={ref}
      data-popover
      role="dialog"
      aria-label={label}
      className={`popover ${className}`}
      style={{ left: pos.left, top: upward ? undefined : pos.top, bottom: upward ? window.innerHeight - pos.top : undefined, width, maxHeight: pos.maxHeight }}
    >
      {children}
    </div>,
    document.body,
  );
}

// A button that opens a popover under itself.
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    isOpen: anchor !== null,
    toggle: (e: { currentTarget: HTMLElement }) => setAnchor((a) => (a ? null : e.currentTarget)),
    openAt: (el: HTMLElement) => setAnchor(el),
    close: () => setAnchor(null),
  };
}
