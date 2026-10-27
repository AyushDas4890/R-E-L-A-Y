import { useEffect, useRef, useState } from 'react';
import { useRelayCtx } from '../ctx.ts';
import { channelLabel } from '../format.tsx';
import { SPEAKING, useCallView } from '../huddle-call.ts';
import { MAX_HUDDLE } from '../types.ts';
import { Avatar } from './Avatar.tsx';

function ScreenTile({ stream, label, mine }: { stream: MediaStream; label: string; mine?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className={`screen-tile ${mine ? 'mine' : ''}`}>
      <video ref={ref} autoPlay playsInline muted />
      <figcaption>🖥 {label}</figcaption>
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
                {muted && <i className="huddle-muted" aria-label="muted">🔇</i>}
              </span>
            );
          })}
          <span>Huddle in <strong>{label}</strong> · {huddle.participants.length} here</span>
        </div>
        {inCall ? (
          <div className="huddle-controls">
            <span className="meter"><i style={{ transform: `scaleX(${inCall.muted ? 0 : Math.min(inCall.level * 8, 1)})` }} /></span>
            <button className="ghost-btn" onClick={() => calls.call?.setMuted(!inCall.muted)}>{inCall.muted ? '🔇 Unmute' : '🎙 Mute'}</button>
            <button className="ghost-btn" onClick={share}>{inCall.screen ? '🖥 Stop sharing' : '🖥 Share screen'}</button>
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
      {(screens.length > 0 || inCall?.screen) && (
        <div className="huddle-stage">
          {screens.map((s) => <ScreenTile key={s.key} stream={s.stream} label={s.label} />)}
          {inCall?.screen && <ScreenTile stream={inCall.screen} label="You’re sharing" mine />}
        </div>
      )}
    </div>
  );
}
