// The sidebar's page tree: Favorites, the team space, Private pages and the Trash.
import { useMemo, useState, type ReactNode } from 'react';
import type { ClientEvent, PageNode } from '../../types.ts';
import { Icon } from '../Icon.tsx';

const loadOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem('relay.pageOpen') ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

interface Props {
  nodes: PageNode[];
  favorites: string[];
  me: string;
  current: string | null;
  send: (ev: ClientEvent) => void;
  onOpen: (id: string) => void;
  // Make a page (in a parent, or at the top level) and open it.
  onCreate: (parentId: string | null, shared: boolean) => void;
}

type Drop = { id: string; where: 'before' | 'inside' | 'after' } | null;

export function PageTree({ nodes, favorites, me, current, send, onOpen, onCreate }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const kids = useMemo(() => {
    const m = new Map<string | null, PageNode[]>();
    for (const n of nodes) {
      // A page whose parent I can't see is shown at the top level of where it lives.
      const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
      const list = m.get(key);
      if (list) list.push(n);
      else m.set(key, [n]);
    }
    for (const list of m.values()) list.sort((a, b) => a.order - b.order);
    return m;
  }, [nodes, byId]);

  const toggle = (id: string) => {
    const next = { ...open, [id]: !open[id] };
    setOpen(next);
    try {
      localStorage.setItem('relay.pageOpen', JSON.stringify(next));
    } catch { /* not saved */ }
  };

  const top = kids.get(null) ?? [];
  const live = top.filter((n) => !n.trashed);
  const team = live.filter((n) => n.teamspaceId !== null);
  // Pages that are mine and private, plus anything shared with me by name (no teamspace, someone else's).
  const mine = live.filter((n) => n.teamspaceId === null && n.createdBy === me);
  const shared = live.filter((n) => n.teamspaceId === null && n.createdBy !== me);
  const trashed = nodes.filter((n) => n.trashed).sort((a, b) => b.editedAt - a.editedAt);
  const favs = favorites.map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed);

  const dropOn = (target: PageNode) => {
    if (!drag || drag === target.id) return;
    const d = drop?.id === target.id ? drop.where : 'inside';
    const dragged = byId.get(drag);
    if (!dragged) return;
    if (d === 'inside') send({ t: 'pageMove', id: drag, parentId: target.id, after: null });
    else {
      const sibs = (kids.get(target.parentId && byId.has(target.parentId) ? target.parentId : null) ?? []).filter((n) => n.id !== drag);
      const i = sibs.findIndex((n) => n.id === target.id);
      const after = d === 'after' ? target.id : i > 0 ? sibs[i - 1].id : null;
      send({ t: 'pageMove', id: drag, parentId: target.parentId, shared: target.teamspaceId !== null, after });
    }
    setDrag(null);
    setDrop(null);
  };

  const row = (n: PageNode, depth: number, seen: Set<string>): ReactNode => {
    if (seen.has(n.id)) return null;
    const sub = (kids.get(n.id) ?? []).filter((k) => !k.trashed);
    const isOpen = !!open[n.id];
    const next = new Set(seen).add(n.id);
    return (
      <div key={n.id} className="pt-node">
        <div
          className={`side-item pt-row ${current === n.id ? 'active' : ''} ${drop?.id === n.id ? `drop-${drop.where}` : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={n.level === 'full'}
          onDragStart={(e) => { setDrag(n.id); e.dataTransfer.setData('text/plain', n.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDrag(null); setDrop(null); }}
          onDragOver={(e) => {
            if (!drag || drag === n.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            setDrop({ id: n.id, where: y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside' });
          }}
          onDrop={(e) => { e.preventDefault(); dropOn(n); }}
        >
          <button className={`pt-arrow ${isOpen ? 'open' : ''} ${sub.length ? '' : 'none'}`} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen} onClick={() => toggle(n.id)}><Icon n="chevron" size={12} /></button>
          <button className="pt-main" onClick={() => onOpen(n.id)} title={n.title || 'Untitled'}>
            <span className="hash pt-icon" aria-hidden>{n.icon || '📄'}</span>
            <span className="label">{n.title || 'Untitled'}</span>
          </button>
          <span className="pt-tools">
            <button className="icon-btn" aria-label="Page options" onClick={() => setMenu(menu === n.id ? null : n.id)}><Icon n="more" size={14} /></button>
            {(n.level === 'edit' || n.level === 'full') && <button className="icon-btn" aria-label="Add a page inside" onClick={() => { if (!isOpen) toggle(n.id); onCreate(n.id, false); }}><Icon n="plus" size={14} /></button>}
          </span>
          {menu === n.id && (
            <div className="menu pt-menu" role="menu" onMouseLeave={() => setMenu(null)}>
              <button role="menuitem" onClick={() => { send({ t: 'pageFavorite', id: n.id, on: !favorites.includes(n.id) }); setMenu(null); }}>{favorites.includes(n.id) ? 'Remove from favorites' : 'Add to favorites'}</button>
              <button role="menuitem" onClick={() => { send({ t: 'pageDuplicate', id: n.id }); setMenu(null); }}>Duplicate</button>
              <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/?p=${n.id}`); setMenu(null); }}>Copy link</button>
              {n.level === 'full' && <button role="menuitem" className="danger" onClick={() => { send({ t: 'pageTrash', id: n.id }); setMenu(null); }}>Move to trash</button>}
            </div>
          )}
        </div>
        {isOpen && sub.map((k) => row(k, depth + 1, next))}
        {isOpen && sub.length === 0 && <p className="side-hint muted" style={{ paddingLeft: 30 + depth * 14 }}>No pages inside</p>}
      </div>
    );
  };

  const head = (key: string, label: string, add?: () => void, onDropHere?: () => void) => (
    <div className="side-section" onDragOver={(e) => { if (drag && onDropHere) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onDropHere?.(); setDrag(null); }}>
      <button className={`side-toggle ${sections[key] ? 'closed' : ''}`} aria-expanded={!sections[key]} onClick={() => setSections((s) => ({ ...s, [key]: !s[key] }))}><i aria-hidden>▾</i> {label}</button>
      {add && <span><button title={`New page in ${label}`} aria-label={`New page in ${label}`} onClick={add}>+</button></span>}
    </div>
  );

  return (
    <>
      {favs.length > 0 && (
        <>
          {head('pfav', 'Favorites')}
          {!sections.pfav && favs.map((n) => (
            <button key={n.id} className={`side-item ${current === n.id ? 'active' : ''}`} onClick={() => onOpen(n.id)}>
              <span className="hash pt-icon" aria-hidden>{n.icon || '📄'}</span><span className="label">{n.title || 'Untitled'}</span>
            </button>
          ))}
        </>
      )}
      {head('pteam', 'Teamspace', () => onCreate(null, true), () => drag && send({ t: 'pageMove', id: drag, parentId: null, shared: true, after: null }))}
      {!sections.pteam && team.map((n) => row(n, 0, new Set()))}
      {!sections.pteam && team.length === 0 && <p className="side-hint muted">Pages everyone in the workspace can edit.</p>}
      {shared.length > 0 && (
        <>
          {head('pshared', 'Shared')}
          {!sections.pshared && shared.map((n) => row(n, 0, new Set()))}
        </>
      )}
      {head('ppriv', 'Private', () => onCreate(null, false), () => drag && send({ t: 'pageMove', id: drag, parentId: null, shared: false, after: null }))}
      {!sections.ppriv && mine.map((n) => row(n, 0, new Set()))}
      {!sections.ppriv && mine.length === 0 && <p className="side-hint muted">Only you can see pages here.</p>}
      {trashed.length > 0 && (
        <>
          {head('ptrash', `Trash (${trashed.length})`)}
          {!sections.ptrash && trashed.map((n) => (
            <button key={n.id} className={`side-item ${current === n.id ? 'active' : ''}`} onClick={() => onOpen(n.id)}>
              <span className="hash pt-icon" aria-hidden>🗑️</span><span className="label">{n.title || 'Untitled'}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}
