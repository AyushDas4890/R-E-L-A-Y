// What the command palette can do, and the small pure helpers behind it. No React, no storage.

export interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  group: 'Navigate' | 'Create' | 'Preferences' | 'Admin';
  adminOnly?: boolean;
}

export const GROUP_ORDER: Command['group'][] = ['Navigate', 'Create', 'Preferences', 'Admin'];

export const COMMANDS: Command[] = [
  { id: 'go-home', label: 'Go to channels', keywords: ['home', 'channel'], group: 'Navigate' },
  { id: 'go-dms', label: 'Go to direct messages', keywords: ['dm', 'dms', 'messages', 'inbox'], group: 'Navigate' },
  { id: 'go-activity', label: 'Go to activity', keywords: ['mentions', 'notifications', 'reactions'], group: 'Navigate' },
  { id: 'go-saved', label: 'Go to saved items', keywords: ['later', 'bookmarks', 'saved'], group: 'Navigate' },
  { id: 'go-people', label: 'Go to people', keywords: ['directory', 'members', 'team'], group: 'Navigate' },
  { id: 'go-calendar', label: 'Go to calendar', keywords: ['events', 'schedule', 'meetings'], group: 'Navigate' },
  { id: 'go-pages', label: 'Go to pages', keywords: ['docs', 'wiki', 'notes'], group: 'Navigate' },
  { id: 'new-channel', label: 'Create a channel', keywords: ['new', 'add'], group: 'Create' },
  { id: 'new-dm', label: 'New direct message', keywords: ['dm', 'message', 'chat'], group: 'Create' },
  { id: 'invite-people', label: 'Invite people', keywords: ['add', 'members', 'teammates'], group: 'Create' },
  { id: 'set-status', label: 'Set your status', keywords: ['profile', 'away', 'emoji'], group: 'Preferences' },
  { id: 'toggle-density', label: 'Toggle compact layout', keywords: ['density', 'compact', 'comfortable', 'spacing'], group: 'Preferences' },
  { id: 'theme-dark', label: 'Switch to dark theme', keywords: ['theme', 'night', 'appearance'], group: 'Preferences' },
  { id: 'theme-light', label: 'Switch to light theme', keywords: ['theme', 'day', 'appearance'], group: 'Preferences' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', keywords: ['keys', 'hotkeys', 'help'], group: 'Preferences' },
  { id: 'admin-console', label: 'Open the admin console', keywords: ['admin', 'settings', 'manage'], group: 'Admin', adminOnly: true },
];

const byGroup = (a: Command, b: Command) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);

// Empty query: everything this person may run, in group order. Otherwise a case-insensitive substring
// match on the label or a keyword, with label matches first; group order holds within each tier.
export function rankCommands(q: string, cmds: Command[], isAdmin: boolean): Command[] {
  const allowed = cmds.filter((c) => isAdmin || !c.adminOnly).sort(byGroup);
  const needle = q.trim().toLowerCase();
  if (!needle) return allowed;
  const labelHits = allowed.filter((c) => c.label.toLowerCase().includes(needle));
  const keywordHits = allowed.filter((c) => !labelHits.includes(c) && (c.keywords ?? []).some((k) => k.toLowerCase().includes(needle)));
  return [...labelHits, ...keywordHits];
}

export interface Recent {
  id: string;
  ts: number;
}

// Moves `id` to the front with a fresh timestamp, drops its older copy and keeps at most `max`.
export function pushRecent(list: Recent[], id: string, now: number, max = 8): Recent[] {
  return [{ id, ts: now }, ...list.filter((r) => r.id !== id)].slice(0, max);
}

// The kind of a recent entry is the part of its id before the first `:` (`p`, `ch`, `u`, `cmd`).
export const recentKind = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : '');

// Keeps at most `perKind` entries of each kind and `max` overall, dropping the oldest (the list is newest first),
// so a burst of one kind never evicts another.
export function trimRecent(list: Recent[], perKind = 12, max = 48): Recent[] {
  const seen = new Map<string, number>();
  const out: Recent[] = [];
  for (const r of list) {
    const k = recentKind(r.id);
    const n = seen.get(k) ?? 0;
    if (n >= perKind) continue;
    seen.set(k, n + 1);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
