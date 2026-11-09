// The sidebar's page tree: Favorites, each teamspace, pages shared with me, Private pages and the Trash.
import { useMemo, useState, type ReactNode } from 'react';
import type { ClientEvent, PageNode, Teamspace } from '../../types.ts';
import { DB_PRESETS } from '../../templates.ts';
import { Icon } from '../Icon.tsx';
import { Popover, usePopover } from '../ui/Popover.tsx';

const loadOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem('relay.pageOpen') ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

// What a "+" can make.
export interface NewPageOptions { db?: string | true; template?: string }

interface Props {
  nodes: PageNode[];
  favorites: string[];
  teamspaces: Teamspace[];
  me: string;
  current: string | null;
  send: (ev: ClientEvent) => void;
  onOpen: (id: string) => void;
  // Make a page or database (inside a parent, or at the top level of a teamspace; `space` null = Private) and open it.
  onCreate: (parentId: string | null, space: string | null, options?: NewPageOptions) => void;
  onLibrary: () => void;
  onManageSpaces: () => void;
}

type Drop = { id: string; where: 'before' | 'inside' | 'after' } | null;
export const iconOf = (n: PageNode): ReactNode => {
  if (n.icon) {
    if (n.icon === '📄') return <i className="fa-solid fa-file-lines" aria-hidden="true" />;
    if (n.icon === '📁') return <i className="fa-solid fa-folder" style={{ color: '#f59e0b' }} aria-hidden="true" />;
    if (n.icon === '🗂️') return <i className="fa-solid fa-database" style={{ color: '#38bdf8' }} aria-hidden="true" />;
    if (n.icon === '🏠') return <i className="fa-solid fa-house" style={{ color: '#a855f7' }} aria-hidden="true" />;
    return n.icon;
  }
  return n.kind === 'database'
    ? <i className="fa-solid fa-database" style={{ color: '#38bdf8' }} aria-hidden="true" />
    : <i className="fa-solid fa-file-lines" aria-hidden="true" />;
};

// The menu behind a "+": a page, a database, or a ready-made one.
function NewMenu({ anchor, onClose, onPick, withTemplates }: { anchor: HTMLElement | null; onClose: () => void; onPick: (o: NewPageOptions) => void; withTemplates: boolean }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={240} label="New">
      <button className="db-opt" onClick={() => { onClose(); onPick({}); }}><Icon n="file" /> Page</button>
      <button className="db-opt" onClick={() => { onClose(); onPick({ db: true }); }}><Icon n="database" /> Database</button>
      <p className="db-group-label">Ready-made databases</p>
      {DB_PRESETS.map((p) => <button key={p.id} className="db-opt" onClick={() => { onClose(); onPick({ db: p.id }); }}>{p.icon} {p.name}</button>)}
      {withTemplates && <><hr style={{ border: 0, borderTop: '1px solid var(--line)' }} /><button className="db-opt" onClick={() => { onClose(); onPick({ template: '*' }); }}><Icon n="layout" /> More templates…</button></>}
    </Popover>
  );
}

export function PageTree({ nodes, favorites, teamspaces, me, current, send, onOpen, onCreate, onLibrary, onManageSpaces }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const plus = usePopover();
  const [plusFor, setPlusFor] = useState<{ parentId: string | null; space: string | null } | null>(null);

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
  // Pages that are mine and private, plus anything shared with me by name (no teamspace, someone else's).
  const mine = live.filter((n) => n.teamspaceId === null && n.createdBy === me);
  const shared = live.filter((n) => n.teamspaceId === null && n.createdBy !== me);
  const trashed = nodes.filter((n) => n.trashed).sort((a, b) => b.editedAt - a.editedAt);
  const favs = favorites.map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed);
  const spaceIds = new Set(teamspaces.map((s) => s.id));
  // Pages in a teamspace I can't list (e.g. shared with me by name from a private one) still show up, under Shared.
  const orphans = live.filter((n) => n.teamspaceId !== null && !spaceIds.has(n.teamspaceId));

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
      send({ t: 'pageMove', id: drag, parentId: target.parentId, teamspaceId: target.teamspaceId ?? undefined, shared: target.teamspaceId !== null, after });
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
          {renaming === n.id ? (
            <div className="pt-main" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
              <span className="hash pt-icon" aria-hidden>{iconOf(n)}</span>
              <input
                autoFocus
                className="pt-rename-input"
                defaultValue={n.title || ''}
                placeholder="Untitled"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid #7c3aed',
                  borderRadius: 6,
                  color: 'inherit',
                  fontSize: 13,
                  padding: '2px 8px',
                  width: '100%',
                  outline: 'none',
                }}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  send({ t: 'pageUpdate', id: n.id, patch: { title: val } });
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value.trim();
                    send({ t: 'pageUpdate', id: n.id, patch: { title: val } });
                    setRenaming(null);
                  } else if (e.key === 'Escape') {
                    setRenaming(null);
                  }
                }}
              />
            </div>
          ) : (
            <button className="pt-main" onClick={() => onOpen(n.id)} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(n.id); }} title={`${n.title || 'Untitled'} (double-click to rename)`}>
              <span className="hash pt-icon" aria-hidden>{iconOf(n)}</span>
              <span className="label">{n.title || 'Untitled'}</span>
              {n.published && <span className="pt-pub" title="Published to the web" aria-label="Published"><Icon n="globe" size={14} /></span>}
            </button>
          )}
          <span className="pt-tools">
            {(n.level === 'edit' || n.level === 'full' || n.createdBy === me) && (
              <button
                className="icon-btn"
                title="Delete page"
                aria-label="Delete page"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Move "${n.title || 'Untitled'}" to trash?`)) {
                    send({ t: 'pageTrash', id: n.id });
                  }
                }}
              >
                <Icon n="trash" size={13} />
              </button>
            )}
            <button className="icon-btn" aria-label="Page options" onClick={() => setMenu(menu === n.id ? null : n.id)}><Icon n="more" size={14} /></button>
            {(n.level === 'edit' || n.level === 'full') && <button className="icon-btn" aria-label="Add a page inside" onClick={(e) => { if (!isOpen) toggle(n.id); setPlusFor({ parentId: n.id, space: null }); plus.toggle(e); }}><Icon n="plus" size={14} /></button>}
          </span>
          {menu === n.id && (
            <div className="menu pt-menu" role="menu" onMouseLeave={() => setMenu(null)}>
              <button role="menuitem" onClick={() => { setRenaming(n.id); setMenu(null); }}><Icon n="pencil" size={13} /> Rename</button>
              <button role="menuitem" onClick={() => { send({ t: 'pageFavorite', id: n.id, on: !favorites.includes(n.id) }); setMenu(null); }}>{favorites.includes(n.id) ? 'Remove from favorites' : 'Add to favorites'}</button>
              <button role="menuitem" onClick={() => { send({ t: 'pageDuplicate', id: n.id }); setMenu(null); }}>Duplicate</button>
              <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/?p=${n.id}`); setMenu(null); }}>Copy link</button>
              {(n.level === 'edit' || n.level === 'full' || n.createdBy === me) && (
                <button role="menuitem" className="danger" onClick={() => { send({ t: 'pageTrash', id: n.id }); setMenu(null); }}><Icon n="trash" size={13} /> Move to trash</button>
              )}
            </div>
          )}
        </div>
        {isOpen && sub.map((k) => row(k, depth + 1, next))}
        {isOpen && sub.length === 0 && <p className="side-hint muted" style={{ paddingLeft: 30 + depth * 14 }}>No pages inside</p>}
      </div>
    );
  };

  const head = (key: string, label: ReactNode, add?: (el: HTMLElement) => void, onDropHere?: () => void, extra?: ReactNode) => (
    <div className="side-section" onDragOver={(e) => { if (drag && onDropHere) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onDropHere?.(); setDrag(null); }}>
      <button className={`side-toggle ${sections[key] ? 'closed' : ''}`} aria-expanded={!sections[key]} onClick={() => setSections((s) => ({ ...s, [key]: !s[key] }))}><i aria-hidden>▾</i> {label}</button>
      <span>
        {extra}
        {add && <button title="New page" aria-label="New page" onClick={(e) => add(e.currentTarget)}>+</button>}
      </span>
    </div>
  );

  const openPlus = (parentId: string | null, space: string | null) => (el: HTMLElement) => {
    setPlusFor({ parentId, space });
    plus.openAt(el);
  };

  return (
    <>
      {favs.length > 0 && (
        <>
          {head('pfav', 'Favorites')}
          {!sections.pfav && favs.map((n) => (
            <button key={n.id} className={`side-item ${current === n.id ? 'active' : ''}`} onClick={() => onOpen(n.id)}>
              <span className="hash pt-icon" aria-hidden>{iconOf(n)}</span><span className="label">{n.title || 'Untitled'}</span>
            </button>
          ))}
        </>
      )}
      {teamspaces.map((s) => {
        const pages = live.filter((n) => n.teamspaceId === s.id);
        const iconNode = s.icon === '🏠' || s.icon === '🏢' || s.id === 'general' ? (
          <i className="fa-solid fa-house" style={{ color: '#a855f7', marginRight: 6, fontSize: 13 }} aria-hidden="true" />
        ) : (
          <span style={{ marginRight: 6 }}>{s.icon}</span>
        );
        return (
          <div key={s.id}>
            {head(
              `ts-${s.id}`,
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                {iconNode}
                <span>{s.name}</span>
              </span>,
              openPlus(null, s.id),
              () => drag && send({ t: 'pageMove', id: drag, parentId: null, teamspaceId: s.id, shared: true, after: null })
            )}
            {!sections[`ts-${s.id}`] && pages.map((n) => row(n, 0, new Set()))}
            {!sections[`ts-${s.id}`] && pages.length === 0 && <p className="side-hint muted">{s.id === 'general' ? 'Pages everyone in the workspace can edit.' : 'Nothing here yet.'}</p>}
          </div>
        );
      })}
      {(shared.length > 0 || orphans.length > 0) && (
        <>
          {head('pshared', 'Shared')}
          {!sections.pshared && [...shared, ...orphans].map((n) => row(n, 0, new Set()))}
        </>
      )}
      {head('ppriv', 'Private', openPlus(null, null), () => drag && send({ t: 'pageMove', id: drag, parentId: null, shared: false, after: null }))}
      {!sections.ppriv && mine.map((n) => row(n, 0, new Set()))}
      {!sections.ppriv && mine.length === 0 && <p className="side-hint muted">Only you can see pages here.</p>}
      <div className="side-section pt-more">
        <button className="side-toggle" onClick={onManageSpaces}><i aria-hidden>＋</i> Teamspaces</button>
        <button className="side-toggle" onClick={onLibrary}><i aria-hidden>▤</i> Templates</button>
      </div>
      {trashed.length > 0 && (
        <>
          {head('ptrash', `Trash (${trashed.length})`)}
          {!sections.ptrash && trashed.map((n) => (
            <div key={n.id} className="side-item pt-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="pt-main" onClick={() => onOpen(n.id)} title={n.title || 'Untitled'}>
                <span className="hash pt-icon" aria-hidden><Icon n="trash" size={14} /></span>
                <span className="label" style={{ opacity: 0.7 }}>{n.title || 'Untitled'}</span>
              </button>
              <span className="pt-tools" style={{ display: 'flex', gap: 4 }}>
                <button
                  className="icon-btn"
                  title="Restore page"
                  aria-label="Restore page"
                  onClick={(e) => {
                    e.stopPropagation();
                    send({ t: 'pageRestore', id: n.id });
                  }}
                >
                  <Icon n="back" size={12} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete permanently"
                  aria-label="Delete permanently"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Permanently delete "${n.title || 'Untitled'}"? This cannot be undone.`)) {
                      send({ t: 'pageDelete', id: n.id });
                    }
                  }}
                >
                  <Icon n="trash" size={12} />
                </button>
              </span>
            </div>
          ))}
        </>
      )}
      {plus.isOpen && plusFor && (
        <NewMenu
          anchor={plus.anchor}
          onClose={plus.close}
          withTemplates={plusFor.parentId === null}
          onPick={(o) => (o.template === '*' ? onLibrary() : onCreate(plusFor.parentId, plusFor.space, o))}
        />
      )}
    </>
  );
}
