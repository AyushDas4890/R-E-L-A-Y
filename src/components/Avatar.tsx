import { useState } from 'react';
import type { User } from '../types.ts';
import { initials } from '../format.tsx';

// Shows the profile picture from the sign-in provider when there is one; initials otherwise,
// including when the picture fails to load.
export function Avatar({ user, size = 36, online }: { user?: User; size?: number; online?: boolean }) {
  const name = user?.name ?? '?';
  const [broken, setBroken] = useState(false);
  const photo = !user?.bot && user?.avatarUrl && !broken ? user.avatarUrl : null;
  return (
    <span className={`avatar ${photo ? 'has-photo' : ''}`} style={{ width: size, height: size, background: user?.color ?? '#555', fontSize: size * 0.38 }} title={name}>
      {photo ? (
        <img src={photo} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />
      ) : user?.bot ? '⚡' : initials(name)}
      {online !== undefined && <i className={`dot ${online ? 'on' : ''}`} />}
    </span>
  );
}
