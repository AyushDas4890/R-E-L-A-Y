import { useEffect, useRef, useState } from 'react';
import { useRelayCtx } from '../ctx.ts';
import { channelLabel } from '../format.tsx';
import { Avatar } from './Avatar.tsx';

export function HuddleBar({ channelId }: { channelId: string }) {
  const { snap, send } = useRelayCtx();
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [micError, setMicError] = useState('');
  const huddle = snap.huddles.find((h) => h.channelId === channelId);
  const joined = !!huddle?.participants.includes(snap.me);

  useEffect(() => {
    if (!joined) return;
    let raf = 0;
    let ctx: AudioContext | undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          setLevel(data.reduce((a, b) => a + b, 0) / data.length / 128);
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((err: Error) => setMicError(`Mic unavailable: ${err.message}`));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [joined]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  if (!huddle) return null;
  const label = channelLabel(snap.channels[channelId], snap.users, snap.me);

  return (
    <div className="huddle">
      <div className="huddle-people">
        {huddle.participants.map((id) => (
          <Avatar key={id} user={snap.users[id]} size={30} />
        ))}
        <span>Huddle in <strong>{label}</strong> · {huddle.participants.length} here</span>
      </div>
      {joined ? (
        <div className="huddle-controls">
          <span className="meter"><i style={{ transform: `scaleX(${muted ? 0 : Math.min(level, 1)})` }} /></span>
          <button className="ghost-btn" onClick={() => setMuted(!muted)}>{muted ? '🔇 Unmute' : '🎙 Mute'}</button>
          <button className="ghost-btn" onClick={() => setSharing(!sharing)}>{sharing ? '🖥 Stop sharing' : '🖥 Share screen'}</button>
          <button className="send-btn danger" onClick={() => send({ t: 'huddle', channelId, action: 'leave' })}>Leave</button>
        </div>
      ) : (
        <button className="send-btn" onClick={() => send({ t: 'huddle', channelId, action: 'join' })}>Join huddle</button>
      )}
      {micError && <span className="field-error">{micError}</span>}
    </div>
  );
}
