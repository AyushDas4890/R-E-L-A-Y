import { useState } from 'react';
import LightBulbButton from './framer/LightBulbButton.tsx';
import { supabase } from '../supabase.ts';
import { updatePassword } from '../auth.ts';

// The page Supabase's reset email links to: choose a new password, then carry on into Relay.
// Rendered inside the sign-in stage (SignInStage in Login.tsx).
export function ResetPassword({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const result = await updatePassword(supabase, password);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setPassword('');
    setConfirm('');
    setDone(true);
  }

  if (done) {
    return (
      <>
        <h1>Password updated</h1>
        <p className="ap-si-sub" role="status">Your new password is set. Use it the next time you sign in.</p>
        <LightBulbButton onClick={onDone} lightColor="#9a6bff" buttonColor="#241838" substrateColor="#0e0717" width="100%" height={46}>
          Continue
        </LightBulbButton>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <p className="ap-si-sub">Pick something at least 8 characters long.</p>
      {error && <p className="ap-si-error" role="alert">{error}</p>}
      <form className="ap-si-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="ap-si-field">
          New password
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} maxLength={128} required autoFocus />
        </label>
        <label className="ap-si-field">
          Confirm password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" maxLength={128} required />
        </label>
        <LightBulbButton type="submit" disabled={busy} lightColor="#9a6bff" buttonColor="#241838" substrateColor="#0e0717" width="100%" height={46}>
          {busy ? 'Saving…' : 'Update password'}
        </LightBulbButton>
      </form>
      <p className="si-switch"><button type="button" onClick={onCancel}>Back to sign in</button></p>
    </>
  );
}
