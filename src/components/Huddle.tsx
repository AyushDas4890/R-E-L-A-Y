import { useEffect, useRef, useState } from 'react';
import { useRelayCtx } from '../ctx.ts';
import { channelLabel } from '../format.tsx';
import { SPEAKING, useCallView } from '../huddle-call.ts';
import { MAX_HUDDLE } from '../types.ts';
import { Avatar } from './Avatar.tsx';
import { Icon } from './Icon.tsx';

function ScreenTile({ stream, label, mine }: { stream: MediaStream; label: string; mine?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className={`screen-tile ${mine ? 'mine' : ''}`}>
      <video ref={ref} autoPlay playsInline muted />
      <figcaption><Icon n="monitor" /> {label}</figcaption>
    </figure>
  );
}

export function HuddleBar({ channelId }: { channelId: string }) {
  const { snap, send, calls } = useRelayCtx();
  const view = useCallView(calls);
  const [shareError, setShareError] = useState('');
  const huddle = snap.huddles.find((h) => h.channelId === channelId);
  if (!huddle) return null;

  const inCall = view?.channelId === channelId ? view : null;
  // The user can be in this huddle from another tab; then this tab has no media.
  const elsewhere = !inCall && huddle.participants.includes(snap.me);
  const full = !inCall && !elsewhere && huddle.participants.length >= MAX_HUDDLE;
  const label = channelLabel(snap.channels[channelId], snap.users, snap.me);
  const peerOf = (userId: string) => inCall?.peers.find((p) => p.userId === userId);
  const name = (userId: string) => snap.users[userId]?.name ?? 'Someone';

  const share = () => {
    setShareError('');
    if (!calls.call) return;
    if (inCall?.screen) calls.call.stopShare();
    else calls.call.share().catch((err: Error) => {
      if (err.name !== 'NotAllowedError') setShareError(`Can’t share screen: ${err.message}`);
    });
  };

  const screens = inCall
    ? inCall.peers.filter((p) => p.screen).map((p) => ({ key: p.id, stream: p.screen!, label: `${name(p.userId)}’s screen` }))
    : [];

  return (
    <div className="huddle-wrap">
      <div className="huddle">
        <div className="huddle-people">
          {huddle.participants.map((id) => {
            const me = id === snap.me;
            const peer = peerOf(id);
            const muted = me ? !!inCall?.muted : !!peer?.muted;
            const speaking = !muted && (me ? (inCall?.level ?? 0) > SPEAKING : (peer?.level ?? 0) > SPEAKING);
            const connecting = !!inCall && !me && peer?.state !== 'connected';
            const status = connecting ? 'connecting' : muted ? 'muted' : speaking ? 'speaking' : '';
            return (
              <span key={id} className={`huddle-avatar ${speaking ? 'speaking' : ''} ${connecting ? 'connecting' : ''}`} title={`${name(id)}${status ? ` · ${status}` : ''}`}>
                <Avatar user={snap.users[id]} size={30} />
                {muted && <i className="huddle-muted" aria-label="muted"><Icon n="micOff" size={14} /></i>}
              </span>
            );
          })}
          <span>Huddle in <strong>{label}</strong> · {huddle.participants.length} here</span>
        </div>
        {inCall ? (
          <div className="huddle-controls">
            <span className="meter"><i style={{ transform: `scaleX(${inCall.muted ? 0 : Math.min(inCall.level * 8, 1)})` }} /></span>
            <button className="ghost-btn" onClick={() => calls.call?.setMuted(!inCall.muted)}>{inCall.muted ? <><Icon n="micOff" /> Unmute</> : <><Icon n="mic" /> Mute</>}</button>
            <button className="ghost-btn" onClick={share}><Icon n="monitor" /> {inCall.screen ? 'Stop sharing' : 'Share screen'}</button>
            <button className="send-btn danger" onClick={() => calls.leave()}>Leave</button>
          </div>
        ) : (
          <button className="send-btn" disabled={full} onClick={() => send({ t: 'huddle', channelId, action: 'join' })}>
            {full ? `Full (${MAX_HUDDLE} max)` : elsewhere ? 'Join from this tab' : 'Join huddle'}
          </button>
        )}
        {inCall?.micError && <span className="field-error">{inCall.micError}</span>}
        {shareError && <span className="field-error">{shareError}</span>}
      </div>
    </div>
  );
}

type Shown = { key: string; stream: MediaStream; label: string; mine?: boolean };

// Screens from the call, shown YouTube/Discord style: big and centred while you watch, or a small
// floating player that stays up (and can be dragged) while you carry on in other channels.
export function ScreenOverlay() {
  const { snap, calls } = useRelayCtx();
  const view = useCallView(calls);
  const [mode, setMode] = useState<'max' | 'mini'>('max');
  const [pick, setPick] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const name = (userId: string) => snap.users[userId]?.name ?? 'Someone';

  const shown: Shown[] = view
    ? [
        ...view.peers.filter((p) => p.screen).map((p) => ({ key: p.id, stream: p.screen!, label: `${name(p.userId)}’s screen` })),
        ...(view.screen ? [{ key: 'me', stream: view.screen, label: 'You’re sharing', mine: true }] : []),
      ]
    : [];
  const count = shown.length;
  const current = shown.find((s) => s.key === pick) ?? shown[0];

  // A screen appearing after none were up opens big again.
  const had = useRef(0);
  useEffect(() => {
    if (had.current === 0 && count > 0) setMode('max');
    had.current = count;
  }, [count]);

  useEffect(() => {
    if (mode !== 'max' || !current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMode('mini'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, current]);

  if (!view || !current) return null;

  const controls = (
    <>
      <button className="ghost-btn" onClick={() => calls.call?.setMuted(!view.muted)}>{view.muted ? <><Icon n="micOff" /> Unmute</> : <><Icon n="mic" /> Mute</>}</button>
      {view.screen && <button className="ghost-btn" onClick={() => calls.call?.stopShare()}><Icon n="monitor" /> Stop sharing</button>}
      <button className="send-btn danger" onClick={() => calls.leave()}>Leave</button>
    </>
  );

  if (mode === 'max') {
    return (
      <div className="screen-max" role="dialog" aria-label="Screen share" onClick={(e) => { if (e.target === e.currentTarget) setMode('mini'); }}>
        <div className="screen-max-card">
          <div className="screen-max-top">
            <strong><Icon n="monitor" /> {current.label}</strong>
            <button className="icon-btn" title="Minimize (Esc)" aria-label="Minimize" onClick={() => setMode('mini')}><Icon n="minimize" /></button>
          </div>
          <ScreenTile key={current.key} stream={current.stream} label={current.label} mine={current.mine} />
          <div className="screen-max-bar">
            {count > 1 && (
              <div className="screen-max-tabs">
                {shown.map((s) => (
                  <button key={s.key} className={s.key === current.key ? 'on' : ''} onClick={() => setPick(s.key)}>{s.label}</button>
                ))}
              </div>
            )}
            <div className="huddle-controls">
              {controls}
              <button className="ghost-btn" onClick={() => setMode('mini')}><Icon n="pip" /> Minimize</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - r.width);
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - r.height);
    setPos({ x, y });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setMode('max');
  };

  return (
    <div className="screen-mini" style={style} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} aria-label="Screen share, minimized">
      <ScreenTile key={current.key} stream={current.stream} label={current.label} mine={current.mine} />
      <div className="screen-mini-actions">
        <button className="icon-btn" title={view.muted ? 'Unmute' : 'Mute'} aria-label={view.muted ? 'Unmute' : 'Mute'} onClick={() => calls.call?.setMuted(!view.muted)}><Icon n={view.muted ? 'micOff' : 'mic'} /></button>
        <button className="icon-btn" title="Expand" aria-label="Expand" onClick={() => setMode('max')}><Icon n="maximize" /></button>
      </div>
    </div>
  );
}
