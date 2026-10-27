import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ClientEvent, HuddlePeer, RtcSignal, ServerEvent } from './types.ts';

// Huddle media is a WebRTC mesh: each tab in a huddle holds one RTCPeerConnection per other tab,
// sends its mic (and screen, while sharing) on each, and plays what comes back. The server only
// relays the offers, answers and ICE candidates between tabs in the same huddle.

// STUN lets each browser learn its public address. Browsers behind strict NATs (some office and
// mobile networks) can't reach each other directly and need a TURN relay, set with VITE_TURN_*.
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const { VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL } = import.meta.env;
  if (VITE_TURN_URL) {
    servers.push({ urls: VITE_TURN_URL.split(',').map((u) => u.trim()), username: VITE_TURN_USERNAME, credential: VITE_TURN_CREDENTIAL });
  }
  return servers;
}

// Audio level (0 to 1) above which someone counts as speaking.
export const SPEAKING = 0.02;

interface Peer {
  id: string;
  userId: string;
  pc: RTCPeerConnection;
  // Perfect negotiation: on an offer collision the polite side yields, the impolite side ignores.
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  // Signals are applied one at a time, in order, after the mic is ready.
  queue: Promise<void>;
  audio: HTMLAudioElement;
  mic?: RTCRtpSender;
  screenTx?: RTCRtpTransceiver;
  screenIn: MediaStream | null;
  muted: boolean;
  sharing: boolean;
  level: number;
  state: RTCPeerConnectionState;
}

export interface CallPeerView {
  id: string;
  userId: string;
  muted: boolean;
  level: number;
  screen: MediaStream | null;
  state: RTCPeerConnectionState;
}

export interface CallView {
  channelId: string | null;
  muted: boolean;
  screen: MediaStream | null;
  micError: string;
  level: number;
  peers: CallPeerView[];
}

export class MeshCall {
  self = '';
  readonly peers = new Map<string, Peer>();
  mic: MediaStream | null = null;
  screen: MediaStream | null = null;
  muted = false;
  micError = '';
  level = 0;
  private closed = false;
  private readonly ready: Promise<void>;
  private readonly timer: ReturnType<typeof setInterval>;
  private audioCtx?: AudioContext;
  private analyser?: AnalyserNode;
  readonly channelId: string;
  private readonly signal: (to: string, s: RtcSignal) => void;
  private readonly changed: () => void;

  constructor(channelId: string, signal: (to: string, s: RtcSignal) => void, changed: () => void) {
    this.channelId = channelId;
    this.signal = signal;
    this.changed = changed;
    this.ready = Promise.resolve()
      .then(() => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }))
      .then((stream) => {
        if (this.closed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.mic = stream;
        this.audioCtx = new AudioContext();
        this.analyser = this.audioCtx.createAnalyser();
        this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
      })
      .catch((err: Error) => {
        this.micError = `Mic unavailable (${err.message}). You can still listen.`;
      })
      .finally(this.changed);
    this.timer = setInterval(() => this.measure(), 200);
  }

  // The server's list of the other tabs in this huddle: connect to new ones, drop departed ones.
  sync(self: string, list: HuddlePeer[]): void {
    this.self = self;
    const ids = new Set(list.map((p) => p.id));
    for (const id of this.peers.keys()) if (!ids.has(id)) this.drop(id);
    for (const info of list) if (!this.peers.has(info.id)) this.connect(info);
    this.changed();
  }

  receive(from: string, s: RtcSignal): void {
    const p = this.peers.get(from);
    if (!p) return;
    p.queue = p.queue.then(() => this.apply(p, s)).catch((err) => console.warn('huddle signal failed', err));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    // Swapping the track out stops audio packets entirely, rather than sending silence.
    const track = this.mic?.getAudioTracks()[0] ?? null;
    for (const p of this.peers.values()) void p.mic?.replaceTrack(muted ? null : track);
    this.broadcastState();
    this.changed();
  }

  // Must run straight from a click: browsers only open the screen picker on a user gesture.
  async share(): Promise<void> {
    if (this.screen) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.screen = stream;
    const [track] = stream.getVideoTracks();
    track.contentHint = 'detail';
    // The browser's own "Stop sharing" button ends the track.
    track.onended = () => this.stopShare();
    for (const p of this.peers.values()) this.attachScreen(p);
    this.broadcastState();
    this.changed();
  }

  stopShare(): void {
    if (!this.screen) return;
    this.screen.getTracks().forEach((t) => t.stop());
    this.screen = null;
    // Keep the transceiver for the next share; going recvonly renegotiates the video off.
    for (const p of this.peers.values()) {
      if (!p.screenTx) continue;
      void p.screenTx.sender.replaceTrack(null);
      p.screenTx.direction = 'recvonly';
    }
    this.broadcastState();
    this.changed();
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.screen?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close();
  }

  view(): CallView {
    return {
      channelId: this.channelId,
      muted: this.muted,
      screen: this.screen,
      micError: this.micError,
      level: this.level,
      peers: [...this.peers.values()].map((p) => ({
        id: p.id,
        userId: p.userId,
        muted: p.muted,
        level: p.level,
        screen: p.sharing ? p.screenIn : null,
        state: p.state,
      })),
    };
  }

  // Bytes and frames per peer, for checking that media actually flows (window.relayHuddle.stats()).
  async stats() {
    return Promise.all([...this.peers.values()].map(async (p) => {
      const rows = [...(await p.pc.getStats()).values()] as Record<string, unknown>[];
      const pick = (type: string) => rows.filter((r) => r.type === type).map((r) => ({
        kind: r.kind, bytes: r.bytesReceived ?? r.bytesSent, packets: r.packetsReceived ?? r.packetsSent, frames: r.framesDecoded ?? r.framesEncoded,
      }));
      return { userId: p.userId, state: p.pc.connectionState, inbound: pick('inbound-rtp'), outbound: pick('outbound-rtp') };
    }));
  }

  private connect(info: HuddlePeer): void {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = new Audio();
    audio.autoplay = true;
    const p: Peer = {
      ...info,
      pc,
      polite: this.self > info.id,
      makingOffer: false,
      ignoreOffer: false,
      queue: Promise.resolve(),
      audio,
      screenIn: null,
      muted: false,
      sharing: false,
      level: 0,
      state: pc.connectionState,
    };
    this.peers.set(info.id, p);

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(p.id, { kind: 'description', description: pc.localDescription!.toJSON() });
      } catch (err) {
        console.warn('huddle offer failed', err);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(p.id, { kind: 'candidate', candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ track, streams }) => {
      if (track.kind === 'audio') {
        audio.srcObject = streams[0] ?? new MediaStream([track]);
        void audio.play().catch((err) => console.warn('huddle audio blocked', err));
      } else {
        // The receiving track outlives stop/start cycles; whether to show it follows the peer's state.
        p.screenIn = new MediaStream([track]);
      }
      this.changed();
    };
    pc.onconnectionstatechange = () => {
      p.state = pc.connectionState;
      if (p.state === 'failed') pc.restartIce();
      this.changed();
    };

    p.queue = this.ready.then(() => {
      if (this.closed || pc.signalingState === 'closed') return;
      const track = this.mic?.getAudioTracks()[0];
      if (track) {
        p.mic = pc.addTrack(track, this.mic!);
        if (this.muted) void p.mic.replaceTrack(null);
      } else {
        // No mic: still negotiate, so this tab hears everyone else.
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
      if (this.screen) this.attachScreen(p);
      this.signal(p.id, this.state());
    });
  }

  private async apply(p: Peer, s: RtcSignal): Promise<void> {
    if (p.pc.signalingState === 'closed') return;
    if (s.kind === 'state') {
      p.muted = s.muted;
      p.sharing = s.sharing;
      this.changed();
      return;
    }
    if (s.kind === 'candidate') {
      try {
        await p.pc.addIceCandidate(s.candidate);
      } catch (err) {
        if (!p.ignoreOffer) throw err;
      }
      return;
    }
    const d = s.description;
    const collision = d.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
    p.ignoreOffer = !p.polite && collision;
    if (p.ignoreOffer) return;
    await p.pc.setRemoteDescription(d);
    if (d.type === 'offer') {
      await p.pc.setLocalDescription();
      this.signal(p.id, { kind: 'description', description: p.pc.localDescription!.toJSON() });
    }
  }

  private attachScreen(p: Peer): void {
    const track = this.screen?.getVideoTracks()[0];
    if (!track || p.pc.signalingState === 'closed') return;
    if (p.screenTx) {
      if (p.screenTx.sender.track === track) return;
      void p.screenTx.sender.replaceTrack(track);
      p.screenTx.sender.setStreams(this.screen!);
      p.screenTx.direction = 'sendrecv';
      return;
    }
    // addTrack reuses the peer's video transceiver if they shared first, so both share one m-line.
    const sender = p.pc.addTrack(track, this.screen!);
    p.screenTx = p.pc.getTransceivers().find((t) => t.sender === sender);
  }

  private state(): RtcSignal {
    return { kind: 'state', muted: this.muted, sharing: !!this.screen };
  }

  private broadcastState(): void {
    for (const p of this.peers.values()) this.signal(p.id, this.state());
  }

  private drop(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    this.peers.delete(id);
  }

  private measure(): void {
    if (this.analyser) {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
      this.level = this.muted ? 0 : rms;
    }
    for (const p of this.peers.values()) {
      const levels = p.pc.getReceivers()
        .filter((r) => r.track.kind === 'audio')
        .map((r) => r.getSynchronizationSources()[0]?.audioLevel ?? 0);
      p.level = p.muted ? 0 : Math.max(0, ...levels);
    }
    this.changed();
  }
}

// Holds this tab's call (at most one) and lets components subscribe without re-rendering the app.
export class HuddleCalls {
  call: MeshCall | null = null;
  private version = 0;
  private readonly subs = new Set<() => void>();

  send: (ev: ClientEvent) => void;

  constructor(send: (ev: ClientEvent) => void) {
    this.send = send;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };

  getVersion = (): number => this.version;

  private changed = (): void => {
    this.version += 1;
    this.subs.forEach((fn) => fn());
  };

  handle(ev: ServerEvent): void {
    if (ev.t === 'rtc') {
      this.call?.receive(ev.from, ev.signal);
      return;
    }
    if (ev.t !== 'huddleCall') return;
    if (!ev.channelId || this.call?.channelId !== ev.channelId) this.end();
    if (!ev.channelId) return;
    if (!this.call) {
      this.call = new MeshCall(ev.channelId, (to, signal) => this.send({ t: 'rtc', to, signal }), this.changed);
      // Exposed for debugging: `await relayHuddle.stats()` in the console shows bytes per peer.
      (window as unknown as { relayHuddle?: MeshCall }).relayHuddle = this.call;
    }
    this.call.sync(ev.self, ev.peers);
  }

  leave(): void {
    const channelId = this.call?.channelId;
    this.end();
    if (channelId) this.send({ t: 'huddle', channelId, action: 'leave' });
  }

  end(): void {
    if (!this.call) return;
    this.call.close();
    this.call = null;
    this.changed();
  }

  view(): CallView | null {
    return this.call?.view() ?? null;
  }
}

export function useHuddleCalls(
  send: (ev: ClientEvent) => void,
  listen: (fn: (ev: ServerEvent) => void) => () => void,
  connected: boolean,
): HuddleCalls {
  const [calls] = useState(() => new HuddleCalls(send));
  calls.send = send;
  useEffect(() => listen((ev) => calls.handle(ev)), [listen]);
  // A dropped socket has already left the huddle on the server.
  useEffect(() => {
    if (!connected) calls.end();
  }, [connected]);
  useEffect(() => {
    const bye = () => calls.end();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      calls.end();
    };
  }, []);
  return calls;
}

export function useCallView(calls: HuddleCalls): CallView | null {
  useSyncExternalStore(calls.subscribe, calls.getVersion);
  return calls.view();
}
