// Templates, imports and the conversion of channel canvases and lists into pages and databases.
import { useState } from 'react';
import { useRelayCtx } from '../../ctx.ts';
import { planCsv } from '../../csvImport.ts';
import { draftsToBlocks, parseMarkdown } from '../../editor.ts';
import { createWithBlocks } from '../../pageActions.ts';
import { DB_PRESETS, TEMPLATES } from '../../templates.ts';
import type { Channel, ListItem } from '../../types.ts';

interface Props {
  onOpen: (id: string) => void;
}

const CATEGORIES = ['Work', 'Team', 'Docs', 'Personal'] as const;

// The title of a canvas: its first heading or line.
const canvasTitle = (md: string, fallback: string): string => {
  const line = md.split('\n').find((l) => l.trim()) ?? '';
  return line.replace(/^#{1,6}\s*/, '').trim().slice(0, 80) || fallback;
};

export function LibraryView({ onOpen }: Props) {
  const ctx = useRelayCtx();
  const { snap, send } = ctx;
  const [note, setNote] = useState('');
  const sourceNodes = new Map(snap.pages.filter((n) => n.source).map((n) => [n.source!, n]));

  const make = (event: Parameters<typeof send>[0]) => createWithBlocks({ send, listen: ctx.listen }, event, [], onOpen);
  const useTemplate = (id: string, shared: boolean) => make({ t: 'pageCreate', parentId: null, template: id, ...(shared ? { teamspaceId: 'general', shared: true } : {}) });
  const useDb = (preset: string, shared: boolean) => make({ t: 'dbCreate', parentId: null, preset, title: DB_PRESETS.find((p) => p.id === preset)?.name ?? '', ...(shared ? { teamspaceId: 'general', shared: true } : {}) });
  const [shared, setShared] = useState(false);

  const importFile = async (file: File) => {
    if (file.size > 1_000_000) return setNote('That file is too large (limit 1 MB).');
    const text = await file.text();
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
    if (/\.csv$/i.test(file.name)) {
      const plan = planCsv(text);
      if (!plan) return setNote('That CSV has no columns.');
      make({ t: 'dbCreate', parentId: null, title: name, props: plan.props, rows: plan.rows, ...(shared ? { teamspaceId: 'general', shared: true } : {}) });
      setNote(`Importing ${plan.rows.length} rows${plan.skipped ? ` (the first 500 of ${plan.rows.length + plan.skipped})` : ''}.`);
    } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
      const blocks = draftsToBlocks(parseMarkdown(text));
      createWithBlocks({ send, listen: ctx.listen }, { t: 'pageCreate', parentId: null, title: name, ...(shared ? { teamspaceId: 'general', shared: true } : {}) }, blocks, onOpen);
      setNote(`Importing “${name}”.`);
    } else setNote('Import a Markdown (.md, .txt) or CSV file.');
  };

  // Channel content that can become pages. Private channels turn into private pages: sharing is the owner's call.
  const channels: Channel[] = Object.values(snap.channels).filter((c) => c.kind !== 'dm');
  const withCanvas = channels.filter((c) => (snap.canvases[c.id] ?? '').trim());
  const withList = channels.filter((c) => (snap.lists[c.id] ?? []).length > 0);

  const convertCanvas = (c: Channel) => {
    const md = snap.canvases[c.id] ?? '';
    const blocks = draftsToBlocks(parseMarkdown(md));
    createWithBlocks({ send, listen: ctx.listen }, { t: 'pageCreate', parentId: null, title: canvasTitle(md, `#${c.name} canvas`), icon: '📝', source: `canvas:${c.id}`, ...(c.kind === 'public' ? { teamspaceId: 'general', shared: true } : {}) }, blocks, onOpen);
  };
  const convertList = (c: Channel) => {
    const items: ListItem[] = snap.lists[c.id] ?? [];
    make({
      t: 'dbCreate', parentId: null, title: `#${c.name} list`, icon: '✅', preset: 'tasks', source: `list:${c.id}`, ...(c.kind === 'public' ? { teamspaceId: 'general', shared: true } : {}),
      rows: items.map((i) => ({
        Name: i.title,
        Status: i.status === 'done' || i.done ? 'Done' : i.status === 'doing' ? 'In progress' : 'Not started',
        ...(i.due && /^\d{4}-\d{2}-\d{2}$/.test(i.due) ? { Due: { start: i.due } } : {}),
      })) as never,
    });
  };

  return (
    <div className="home-view library">
      <h1>Templates</h1>
      <p className="muted">Start from something ready-made. New pages go to {shared ? 'the shared teamspace' : 'your Private pages'}.</p>
      <label className="db-check-row"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Create in the shared teamspace</label>
      {CATEGORIES.map((cat) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <div className="home-row wrap">
            {TEMPLATES.filter((t) => t.category === cat).map((t) => (
              <button key={t.id} className="home-card tpl" onClick={() => useTemplate(t.id, shared)}><span className="home-icon" aria-hidden>{t.icon}</span><b>{t.name}</b><small>{t.description}</small></button>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h2>Databases</h2>
        <div className="home-row wrap">
          {DB_PRESETS.map((p) => <button key={p.id} className="home-card tpl" onClick={() => useDb(p.id, shared)}><span className="home-icon" aria-hidden>{p.icon}</span><b>{p.name}</b><small>{p.description}</small></button>)}
        </div>
      </section>
      <section>
        <h2>Import</h2>
        <p className="muted">Bring in a Markdown file as a page, or a CSV file as a database.</p>
        <label className="db-file"><input type="file" accept=".md,.markdown,.txt,.csv,text/markdown,text/plain,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />Choose a file…</label>
        {note && <p role="status" className="muted">{note}</p>}
      </section>
      {(withCanvas.length > 0 || withList.length > 0) && (
        <section>
          <h2>Convert from channels</h2>
          <p className="muted">Canvases become pages and lists become databases. The original stays in the channel.</p>
          <ul className="home-list">
            {withCanvas.map((c) => {
              const done = sourceNodes.get(`canvas:${c.id}`);
              return <li key={`c${c.id}`}><span><b>#{c.name}</b> canvas</span>{done ? <button className="ghost-btn" onClick={() => onOpen(done.id)}>Open page</button> : <button className="ghost-btn" onClick={() => convertCanvas(c)}>Convert to a page</button>}</li>;
            })}
            {withList.map((c) => {
              const done = sourceNodes.get(`list:${c.id}`);
              return <li key={`l${c.id}`}><span><b>#{c.name}</b> list ({(snap.lists[c.id] ?? []).length} items)</span>{done ? <button className="ghost-btn" onClick={() => onOpen(done.id)}>Open database</button> : <button className="ghost-btn" onClick={() => convertList(c)}>Convert to a database</button>}</li>;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
