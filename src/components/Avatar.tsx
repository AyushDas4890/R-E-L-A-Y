import type { User } from '../types.ts';
import { initials } from '../format.tsx';

export function Avatar({ user, size = 36, online }: { user?: User; size?: number; online?: boolean }) {
  const name = user?.name ?? '?';
  return (
    <span className="avatar" style={{ width: size, height: size, background: user?.color ?? '#555', fontSize: size * 0.38 }}>
      {user?.bot ? '⚡' : initials(name)}
      {online !== undefined && <i className={`dot ${online ? 'on' : ''}`} />}
    </span>
  );
}
