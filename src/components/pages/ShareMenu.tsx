// Sharing a page: who can open it, and the public link.
import { useEffect, useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import type { PageLevel, PageMeta, PageShare } from '../../types.ts';
import { Popover } from '../ui/Popover.tsx';

type Level = Exclude<PageLevel, 'none'>;
const LEVELS: [Level, string][] = [['view', 'Can view'], ['comment', 'Can comment'], ['edit', 'Can edit'], ['full', 'Full access']];
const levelLabel = (l: PageLevel): string => (l === 'none' ? 'No access' : LEVELS.find(([id]) => id === l)?.[1] ?? l);

interface Props {
  pageId: string;
  meta: PageMeta;
  level: PageLevel;
  anchor: HTMLElement | null;
  onClose: () => void;
}

export function ShareMenu({ pageId, meta, level, anchor, onClose }: Props) {
  const { snap, send, listen } = useRelayCtx();
  const full = level === 'full';
  const [access, setAccess] = useState<{ entries: PageShare[]; restricted?: boolean } | null>(null);
  const [tab, setTab] = useState<'share' | 'publish'>('share');
  const [who, setWho] = useState('');
  const [add, setAdd] = useState<Level>('edit');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!full) return;
    const off = listen((ev) => {
      if (ev.t === 'pageAccess' && ev.id === pageId) setAccess(ev.access);
    });
    send({ t: 'pageAccess', id: pageId });
    return off;
  }, [pageId, full, listen, send]);

  const entries = access?.entries ?? [];
  const save = (next: PageShare[], restricted = !!access?.restricted) => {
    setAccess({ entries: next, restricted });
    send({ t: 'pageShare', id: pageId, entries: next, restricted });
  };
  const same = (a: PageShare['who'], b: PageShare['who']) => a.kind === b.kind && (a.kind === 'workspace' || (a as { id: string }).id === (b as { id: string }).id);
  const setLevel = (target: PageShare['who'], l: Level | 'none') => {
    const rest = entries.filter((e) => !same(e.who, target));
    save(l === 'none' ? rest : [...rest, { who: target, level: l }]);
  };
  const workspace = entries.find((e) => e.who.kind === 'workspace');
  const people = Object.values(snap.users).filter((u) => !u.bot && !u.inactive && u.id !== meta.createdBy && !entries.some((e) => e.who.kind === 'user' && e.who.id === u.id));
  const groups = snap.groups.filter((g) => !entries.some((e) => e.who.kind === 'group' && e.who.id === g.id));
  const link = `${location.origin}/?p=${pageId}`;
  const publicUrl = meta.publish ? `${location.origin}/p/${meta.publish.token}` : '';
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <Popover anchor={anchor} onClose={onClose} label="Share" width={380} align="end" className="share-menu">
      <div className="db-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'share'} className={`db-tab ${tab === 'share' ? 'on' : ''}`} onClick={() => setTab('share')}>Share</button>
        <button role="tab" aria-selected={tab === 'publish'} className={`db-tab ${tab === 'publish' ? 'on' : ''}`} onClick={() => setTab('publish')}>Publish</button>
      </div>
      {tab === 'share' && (
        <>
          {!full && <p className="muted db-note">You have <b>{levelLabel(level).toLowerCase()}</b> on this page. Only people with full access can change who else can open it.</p>}
          {full && (
            <>
              <div className="share-add">
                <select aria-label="Person or group" value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Add people or groups…</option>
                  {people.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}{u.role === 'guest' ? ' (guest)' : ''}</option>)}
                  {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>@{g.handle} (group)</option>)}
                </select>
                <select aria-label="Access" value={add} onChange={(e) => setAdd(e.target.value as Level)}>{LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <button className="primary" disabled={!who} onClick={() => { const [kind, id] = who.split(':'); save([...entries, { who: { kind: kind as 'user' | 'group', id }, level: add }]); setWho(''); }}>Invite</button>
              </div>
              <ul className="share-list">
                <li><span><b>{snap.users[meta.createdBy]?.name ?? 'Owner'}</b><small>Created this page</small></span><span className="muted">Full access</span></li>
                <li>
                  <span><b>Everyone in {snap.workspace.name}</b><small>Not guests</small></span>
                  <select aria-label="Workspace access" value={workspace?.level ?? 'none'} onChange={(e) => setLevel({ kind: 'workspace' }, e.target.value as Level | 'none')}>
                    <option value="none">No access</option>{LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </li>
                {entries.filter((e) => e.who.kind !== 'workspace').map((e) => {
                  const name = e.who.kind === 'user' ? snap.users[e.who.id]?.name ?? 'Someone' : `@${snap.groups.find((g) => g.id === (e.who as { id: string }).id)?.handle ?? 'group'}`;
                  return (
                    <li key={`${e.who.kind}${(e.who as { id: string }).id}`}>
                      <span><b>{name}</b>{e.who.kind === 'user' && snap.users[e.who.id]?.role === 'guest' && <small>Guest</small>}</span>
                      <select aria-label={`Access for ${name}`} value={e.level} onChange={(ev) => setLevel(e.who, ev.target.value as Level | 'none')}>
                        {LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="none">Remove</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
              {meta.parentId && (
                <label className="db-switch"><span>Stop sharing with the parent page’s people<small className="share-hint">Only the people above can open this page.</small></span><input type="checkbox" checked={!!access?.restricted} onChange={(e) => save(entries, e.target.checked)} /></label>
              )}
            </>
          )}
          <div className="db-row-btns"><button onClick={() => void copy(link)}>{copied ? 'Copied' : 'Copy link'}</button></div>
        </>
      )}
      {tab === 'publish' && (
        <>
          {!full ? <p className="muted db-note">Only people with full access can publish a page.</p> : (
            <>
              <label className="db-switch"><span>Publish to the web<small className="share-hint">Anyone with the link can read this page, without signing in. They can’t edit it or see who you are.</small></span><input type="checkbox" checked={!!meta.publish} onChange={(e) => send({ t: 'pagePublish', id: pageId, on: e.target.checked })} /></label>
              {meta.publish && (
                <>
                  <input readOnly className="share-url" aria-label="Public link" value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
                  <div className="db-row-btns"><button onClick={() => void copy(publicUrl)}>{copied ? 'Copied' : 'Copy public link'}</button><a className="ghost-btn" href={publicUrl} target="_blank" rel="noopener noreferrer">Open</a></div>
                  <p className="muted db-note">Sub-pages that are also published are linked. Comments, people’s names and the page history are never shown.</p>
                </>
              )}
            </>
          )}
        </>
      )}
    </Popover>
  );
}
