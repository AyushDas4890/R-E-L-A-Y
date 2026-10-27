import { useCallback, useEffect, useRef, useState } from 'react';
import { mentionsUser } from './premium.ts';
import type { Message, Snapshot } from './types.ts';

// Do Not Disturb is per-device: a timestamp until which alerts stay quiet (0 = off).
export function useDnd() {
  const [until, setUntilState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('relay.dndUntil')) || 0;
    } catch {
      return 0;
    }
  });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const left = until - Date.now();
    if (left <= 0) return;
    // Re-render when the snooze ends so the moon badge clears on its own.
    const t = setTimeout(() => tick((n) => n + 1), Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [until]);
  const setUntil = useCallback((ts: number) => {
    setUntilState(ts);
    try {
      localStorage.setItem('relay.dndUntil', String(ts));
    } catch {
      /* private mode: DND lasts for this tab only */
    }
  }, []);
  return { until, active: until > Date.now(), setUntil };
}

export function dndPresets(now = new Date()): { label: string; until: number }[] {
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(now.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return [
    { label: '30 minutes', until: now.getTime() + 30 * 60_000 },
    { label: '1 hour', until: now.getTime() + 60 * 60_000 },
    { label: '4 hours', until: now.getTime() + 4 * 60 * 60_000 },
    { label: 'Until tomorrow, 9:00', until: tomorrow9.getTime() },
  ];
}

// Slack's default: notify for DMs, mentions, and replies in threads you started.
export function shouldNotify(m: Message, snap: Snapshot): boolean {
  if (m.userId === snap.me || m.system) return false;
  const ch = snap.channels[m.channelId];
  if (!ch) return false;
  if (ch.kind === 'dm') return true;
  if (mentionsUser(m.text, snap.me, snap.groups)) return true;
  if (m.threadId) return snap.messages.some((x) => x.id === m.threadId && x.userId === snap.me);
  return false;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function useMessageAlerts(
  snap: Snapshot | null,
  activeChannel: string,
  dndActive: boolean,
  open: (channelId: string, threadId?: string) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    if (!snap) return;
    // The first snapshot is history, not news.
    if (!seen.current) {
      seen.current = new Set(snap.messages.map((m) => m.id));
      return;
    }
    const fresh = snap.messages.filter((m) => !seen.current!.has(m.id));
    for (const m of fresh) seen.current.add(m.id);
    if (dndActive || permission !== 'granted') return;
    for (const m of fresh) {
      const looking = !document.hidden && m.channelId === activeChannel && !m.threadId;
      if (looking || !shouldNotify(m, snap)) continue;
      const author = snap.users[m.userId]?.name ?? 'Someone';
      const ch = snap.channels[m.channelId];
      const where = ch.kind === 'dm' ? author : `${author} in #${ch.name}`;
      const n = new Notification(where, {
        body: m.text.replace(/<@[^>]+>/g, '@…').slice(0, 140) || (m.files?.length ? 'Shared a file' : ''),
        tag: m.id,
      });
      n.onclick = () => {
        window.focus();
        open(m.channelId, m.threadId);
        n.close();
      };
    }
  }, [snap?.messages, activeChannel, dndActive, permission]);

  const request = useCallback(async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  return { permission, request };
}
