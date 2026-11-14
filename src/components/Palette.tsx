import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchHit } from '../types.ts';
import { useRelayCtx } from '../ctx.ts';
import { channelLabel } from '../format.tsx';
import { searchAnswer } from '../premium.ts';
import { COMMANDS, rankCommands, type Command } from '../commands.ts';
import { readRecentEntries, recordRecent } from '../recent.ts';
import { Avatar } from './Avatar.tsx';
import { Icon, type IconName } from './Icon.tsx';

const COMMAND_ICONS: Record<Command['group'], IconName> = { Navigate: 'chevron', Create: 'plus', Preferences: 'settings', Admin: 'settings' };

// One rendered row. Every row in every section sits in a single flat list, so the arrow keys walk them in order.
interface Row {
  key: string;
  section: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  hint?: string;
  className?: string;
  run: () => void;
}

const optionId = (key: string) => `palette-opt-${key.replace(/[^\w-]/g, '-')}`;
const hitIcon = (h: SearchHit) => h.icon || (h.kind === 'database' ? '🗂️' : h.kind === 'row' ? '▫️' : '📄');

export interface SearchPaletteProps {
  onClose: () => void;
  onPick: (channelId: string, threadId?: string) => void;
  onOpenPage?: (id: string) => void;
  onCommand: (id: string) => void;
  onPerson: (userId: string) => void;
  isAdmin: boolean;
}

export function SearchPalette({ onClose, onPick, onOpenPage, onCommand, onPerson, isAdmin }: SearchPaletteProps) {
  const { snap, send, listen } = useRelayCtx();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pages, setPages] = useState<{ q: string; hits: SearchHit[] } | null>(null);
  // Read once per opening, so picking something does not reshuffle the list underneath the pointer.
  const [recent] = useState(readRecentEntries);
  const commandMode = q.trimStart().startsWith('>');
  const needle = (commandMode ? q.trimStart().slice(1) : q).trim();

  // Pages and database rows are searched on the server, so only what this person may open comes back.
  useEffect(
    () =>
      listen((ev) => {
        if (ev.t === 'searchResults') setPages({ q: ev.q, hits: ev.hits });
      }),
    [listen],
  );
  useEffect(() => {
    if (commandMode || needle.length < 2 || !onOpenPage) return;
    const t = setTimeout(() => send({ t: 'search', q: needle }), 180);
    return () => clearTimeout(t);
  }, [needle, commandMode, send, onOpenPage]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const lower = needle.toLowerCase();
    const allowed = rankCommands('', COMMANDS, isAdmin);
    const commandRow = (c: Command, section: string, key = `cmd-${c.id}`): Row => ({
      key, section, icon: <Icon n={COMMAND_ICONS[c.group]} />, title: c.label, hint: c.hint ?? c.group,
      run: () => {
        recordRecent(`cmd:${c.id}`);
        onClose(); // First, so a command that opens another modal is the one left open.
        onCommand(c.id);
      },
    });
    const channelIcon = (kind: string) => (kind === 'dm' ? '●' : kind === 'private' ? <Icon n="lock" size={14} /> : '#');
    const openChannel = (id: string) => () => {
      recordRecent(`ch:${id}`);
      onPick(id);
    };
    const openPerson = (id: string) => () => {
      recordRecent(`u:${id}`);
      onClose();
      onPerson(id);
    };
    const openPage = (id: string) => () => {
      onOpenPage?.(id); // App records the page as recent when it opens it.
      onClose();
    };

    if (commandMode) {
      for (const c of rankCommands(needle, COMMANDS, isAdmin)) out.push(commandRow(c, 'Commands'));
      return out;
    }

    if (!lower) {
      for (const r of recent) {
        if (out.length >= 8) break;
        const sep = r.id.indexOf(':');
        const kind = r.id.slice(0, sep);
        const id = r.id.slice(sep + 1);
        const key = `recent-${r.id}`;
        const c = kind === 'cmd' ? allowed.find((x) => x.id === id) : undefined;
        const ch = kind === 'ch' ? snap.channels[id] : undefined;
        const u = kind === 'u' && !snap.users[id]?.inactive ? snap.users[id] : undefined;
        const p = kind === 'p' && onOpenPage ? snap.pages.find((x) => x.id === id && !x.trashed) : undefined;
        if (c) out.push(commandRow(c, 'Recent', key));
        else if (ch) out.push({ key, section: 'Recent', icon: channelIcon(ch.kind), title: channelLabel(ch, snap.users, snap.me), hint: 'Channel', run: openChannel(id) });
        else if (u) out.push({ key, section: 'Recent', icon: <Avatar user={u} size={20} />, title: u.name, hint: 'Person', run: openPerson(id) });
        else if (p) out.push({ key, section: 'Recent', icon: <span aria-hidden>{p.icon || '📄'}</span>, title: p.title || 'Untitled', hint: 'Page', run: openPage(id) });
      }
    } else {
      for (const c of rankCommands(needle, COMMANDS, isAdmin).slice(0, 5)) out.push(commandRow(c, 'Commands'));
      const people = Object.values(snap.users)
        .filter((u) => !u.inactive && (u.name.toLowerCase().includes(lower) || (u.title ?? '').toLowerCase().includes(lower)))
        .slice(0, 5);
      for (const u of people) {
        out.push({ key: `u-${u.id}`, section: 'People', icon: <Avatar user={u} size={20} />, title: u.name, detail: u.title || undefined, run: openPerson(u.id) });
      }
    }

    const channels = Object.values(snap.channels)
      .map((c) => ({ c, label: channelLabel(c, snap.users, snap.me) }))
      .filter((x) => !lower || x.label.toLowerCase().includes(lower))
      .slice(0, 6);
    for (const { c, label } of channels) out.push({ key: `ch-${c.id}`, section: 'Channels', icon: channelIcon(c.kind), title: label, run: openChannel(c.id) });

    if (onOpenPage && pages && lower && pages.q === needle) {
      for (const h of pages.hits.slice(0, 8)) {
        out.push({ key: `p-${h.id}`, section: 'Pages', icon: <span aria-hidden>{hitIcon(h)}</span>, title: h.title, detail: h.snippet ? h.snippet.slice(0, 100) : undefined, run: openPage(h.id) });
      }
    }

    if (lower) {
      const messages = snap.messages.filter((m) => !m.system && m.text.toLowerCase().includes(lower)).slice(-8).reverse();
      for (const m of messages) {
        out.push({
          key: `m-${m.id}`, section: 'Messages', icon: <Icon n="message" />,
          title: <><strong>{snap.users[m.userId]?.name}</strong> in {channelLabel(snap.channels[m.channelId], snap.users, snap.me)}</>,
          detail: m.text.slice(0, 100), run: () => onPick(m.channelId, m.threadId ?? m.id),
        });
      }
    }

    const answer = /\?\s*$/.test(q) ? searchAnswer(q, snap.messages) : null;
    if (answer) {
      out.push({
        key: `a-${answer.id}`, section: 'Answer', className: 'answer', icon: <Icon n="sparkles" />,
        title: <><strong>Best answer</strong> from {snap.users[answer.userId]?.name} in {channelLabel(snap.channels[answer.channelId], snap.users, snap.me)}</>,
        detail: answer.text.slice(0, 200), run: () => onPick(answer.channelId, answer.threadId ?? answer.id),
      });
    }
    return out;
  }, [q, needle, commandMode, snap, pages, recent, isAdmin, onClose, onPick, onOpenPage, onCommand, onPerson]);

  // A new query starts at the top; a shrinking list never leaves the highlight past the end.
  useEffect(() => setActive(0), [q]);
  const current = rows.length ? Math.min(active, rows.length - 1) : -1;
  const activeId = current >= 0 ? optionId(rows[current].key) : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = rows.length;
    let next: number | null = null;
    if (e.key === 'Escape') onClose();
    else if (e.key === 'Enter' && current >= 0) rows[current].run();
    else if (!n) return;
    else if (e.key === 'ArrowDown') next = (current + 1) % n;
    else if (e.key === 'ArrowUp') next = (current - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    if (next !== null) setActive(next);
  };

  return (
    <div className="scrim top" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Search and commands" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          placeholder="Search, type > for commands, or ask a question ending in ?"
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="palette-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-results" role="listbox" id="palette-listbox" aria-label="Results">
          {rows.map((r, i) => (
            <div key={r.key} role="presentation">
              {(i === 0 || rows[i - 1].section !== r.section) && <div className="palette-section" aria-hidden>{r.section}</div>}
              <div
                id={optionId(r.key)}
                role="option"
                aria-selected={i === current}
                className={`palette-option${r.className ? ` ${r.className}` : ''}${i === current ? ' is-active' : ''}`}
                onMouseMove={() => i !== current && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={r.run}
              >
                <span className="palette-icon">{r.icon}</span>
                <div className="palette-text">
                  <span className="palette-title">{r.title}</span>
                  {r.detail && <small>{r.detail}</small>}
                </div>
                {r.hint && <span className="palette-hint">{r.hint}</span>}
              </div>
            </div>
          ))}
          {needle && rows.length === 0 && <p className="muted pad">No matches.</p>}
        </div>
      </div>
    </div>
  );
}
