// The landing hero: a curved shelf of features. The front cover plays a live loop of that feature.
import { useEffect, useRef } from 'react';
import { mountShelf } from '../featureShelf.ts';
import '../featureShelf.css';

export function FeatureShelf({ onGetStarted }: { onGetStarted: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = useRef(onGetStarted);
  go.current = onGetStarted;
  useEffect(() => (ref.current ? mountShelf(ref.current, () => go.current()) : undefined), []);
  return <div className="fs" ref={ref} />;
}
