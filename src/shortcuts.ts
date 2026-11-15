// The channel Alt+Up/Down moves to: the next (dir 1) or previous (dir -1) id after `current` in `ids`,
// wrapping round at either end. With unreadOnly, only channels with something unread count.
// null when there is nowhere else to go.
export function nextChannel(ids: string[], current: string, dir: 1 | -1, unreadOnly: boolean, unread: Record<string, number>): string | null {
  const n = ids.length;
  if (!n) return null;
  const at = ids.indexOf(current);
  // A current channel that isn't listed starts just outside the list, so the first step lands on an end.
  const start = at >= 0 ? at : dir === 1 ? -1 : n;
  for (let step = 1; step <= n; step++) {
    const id = ids[(((start + dir * step) % n) + n) % n];
    if (id === current) continue;
    if (unreadOnly && !(unread[id] > 0)) continue;
    return id;
  }
  return null;
}
