// "See the workspace work": scripted, looping scenes of what people actually do in Relay. The database
// scenes run the real table, board, calendar and chart components on sample data; the rest are
// built from the same controls. Nothing here talks to a server.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ctx, type RelayCtx } from '../ctx.ts';
import { newView, presetDb } from '../../server/databases.ts';
import type { DatabaseApi } from '../db-store.ts';
import { actionItems, summarize } from '../localAi.ts';
import type { Block, DbData, PropValue, Row, View } from '../types.ts';
import { CalendarView, ChartView } from './db/CalendarViews.tsx';
import { BoardView, TableView, type ViewProps } from './db/Views.tsx';
import '../live-demo.css';

const reduced = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Goes through the stages, one after another, while `run` is true. Reduced motion jumps to the end.
function useStages(durations: number[], run: boolean, onEnd: () => void, onStage: (n: number) => void): number {
  const [i, setI] = useState(0);
  const end = useRef(onEnd);
  end.current = onEnd;
  const report = useRef(onStage);
  report.current = onStage;
  useEffect(() => report.current(i), [i]);
  useEffect(() => {
    if (!run) return;
    if (reduced()) {
      setI(durations.length - 1);
      return;
    }
    const t = setTimeout(() => (i + 1 < durations.length ? setI(i + 1) : end.current()), durations[i]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, run]);
  return i;
}

// Text that types itself once `go` is true.
function useTyped(text: string, go: boolean, ms = 38): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!go) return setN(0);
    if (reduced()) return setN(text.length);
    const t = setInterval(() => setN((x) => (x < text.length ? x + 1 : x)), ms);
    return () => clearInterval(t);
  }, [go, text, ms]);
  return text.slice(0, n);
}

const PEOPLE = {
  maya: { id: 'maya', name: 'Maya', color: '#d7765a' },
  ken: { id: 'ken', name: 'Ken', color: '#3aa79b' },
  priya: { id: 'priya', name: 'Priya', color: '#8a6bd8' },
  bob: { id: 'bob', name: 'Bob', color: '#5b6cf0' },
} as const;

const demoCtx = { snap: { me: 'maya', users: PEOPLE, pages: [], groups: [] }, send: () => undefined, listen: () => () => undefined } as unknown as RelayCtx;

interface SceneProps { run: boolean; onEnd: () => void; onStage: (n: number) => void }

// ---- Shared pieces ----

const Cursor = ({ show }: { show: boolean }) => (show ? <i className="ld-caret" aria-hidden /> : null);
const Av = ({ id, size = 22 }: { id: keyof typeof PEOPLE; size?: number }) => (
  <i className="ld-av" style={{ background: PEOPLE[id].color, width: size, height: size, fontSize: size * 0.5 }} aria-hidden>{PEOPLE[id].name[0]}</i>
);

// ---- 1. Pages ----

const PAGE_STAGES = [1500, 1700, 1700, 1800, 1900, 2400];
const PAGE_CAPTIONS = [
  'Start a page and give it a title.',
  'Write like a document. Format as you type.',
  'Press / to turn a line into any block.',
  'Blocks turn into a checklist in one keystroke.',
  'Check things off and @mention a teammate.',
  'Headings, lists, tables, code, images, toggles, columns, callouts and more.',
];

function PagesDemo({ run, onEnd, onStage }: SceneProps) {
  const s = useStages(PAGE_STAGES, run, onEnd, onStage);
  const title = useTyped('Launch plan', s === 0, 55);
  const intro = useTyped('Everything we need to ship v2 on Friday.', s === 1, 28);
  const slash = useTyped('/to', s === 2, 140);
  return (
    <div className="ld-page" aria-hidden>
      <div className="ld-icon">🚀</div>
      <h4 className="ld-title">{s === 0 ? title : 'Launch plan'}<Cursor show={s === 0} /></h4>
      {s >= 1 && <p className="ld-line">{s === 1 ? intro : 'Everything we need to ship v2 on Friday.'}<Cursor show={s === 1} /></p>}
      {s === 2 && (
        <div className="ld-slash-wrap">
          <p className="ld-line">{slash}<Cursor show /></p>
          <div className="ld-menu">
            <span className="on">☑ To-do list <small>Track tasks with checkboxes</small></span>
            <span>▸ Toggle list <small>Hide and show content</small></span>
            <span>☰ Table of contents <small>Links to your headings</small></span>
          </div>
        </div>
      )}
      {s >= 3 && (
        <ul className="ld-todos">
          <li className={s >= 4 ? 'done' : ''}><b className={s >= 4 ? 'ck on' : 'ck'} />Final copy review</li>
          <li><b className="ck" />QA on mobile</li>
          <li><b className="ck" />Send the announcement</li>
          {s >= 4 && <li className="ld-pop"><b className="ck" />Review pricing page <span className="ld-mention">@Maya</span></li>}
        </ul>
      )}
      {s >= 5 && <div className="ld-callout"><span>💡</span> Anyone can open this page, comment on a line, or ask the assistant about it.</div>}
    </div>
  );
}

// ---- 2. Databases (the real views, on sample data) ----

const DB_STAGES = [2300, 2200, 2400, 2600, 2600, 2600];
const DB_CAPTIONS = [
  'A database is a table of pages: every row has properties and its own page.',
  'Change a status in place. Filters, sorts and formulas work the way you expect.',
  'The same rows as a board, grouped by status.',
  'Drag a card to change its status. Everyone sees it move.',
  'Or see them on a calendar by due date.',
  'And chart them. Also: gallery, list, timeline, relations, rollups, forms and automations.',
];

let nextId = 0;
const uid = () => `d${++nextId}`;

function sampleDb(): { db: DbData; ids: Record<string, string>; opt: Record<string, string> } {
  const db = presetDb('tasks', uid);
  db.views.push(newView('chart', db.props, uid(), 'Chart'));
  const id = Object.fromEntries(db.props.map((p) => [p.name, p.id]));
  const status = db.props.find((p) => p.name === 'Status')!;
  const opt = Object.fromEntries(status.options!.map((o) => [o.name, o.id]));
  const now = new Date();
  const day = (n: number) => new Date(Date.UTC(now.getFullYear(), now.getMonth(), Math.min(28, Math.max(1, now.getDate() + n)))).toISOString().slice(0, 10);
  const mk = (n: number, title: string, st: string, who: string, due: number, pri: string): Row => ({
    id: `r${n}`, order: n, createdBy: 'maya', createdAt: 0, editedBy: 'maya', editedAt: 0,
    props: {
      [id.Name]: title, [id.Status]: opt[st], [id.Assignee]: [who], [id.Due]: { start: day(due) },
      [id.Priority]: db.props.find((p) => p.name === 'Priority')!.options!.find((o) => o.name === pri)!.id,
    },
  });
  db.rows = [
    mk(1, 'Write launch copy', 'In progress', 'maya', 1, 'High'),
    mk(2, 'QA on mobile', 'In progress', 'ken', 2, 'High'),
    mk(3, 'Design the pricing page', 'Not started', 'priya', 4, 'Medium'),
    mk(4, 'Book the launch call', 'Not started', 'maya', 6, 'Low'),
    mk(5, 'Brief the support team', 'Done', 'ken', -1, 'Medium'),
    mk(6, 'Update the changelog', 'Done', 'priya', -2, 'Low'),
  ];
  return { db, ids: id, opt };
}

function DbDemo({ run, onEnd, onStage }: SceneProps) {
  const s = useStages(DB_STAGES, run, onEnd, onStage);
  const sample = useMemo(sampleDb, []);
  const [rows, setRows] = useState<Row[]>(sample.db.rows);
  const { db, ids, opt } = sample;
  const set = (rowId: string, status: string) => setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, props: { ...r.props, [ids.Status]: opt[status] as PropValue } } : r)));
  useEffect(() => {
    if (s === 1) {
      const t = setTimeout(() => set('r1', 'Done'), 900);
      return () => clearTimeout(t);
    }
    if (s === 3) {
      const t = setTimeout(() => set('r2', 'Done'), 1000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const live: DbData = { ...db, rows };
  const view: View = db.views[s <= 1 ? 0 : s <= 3 ? 1 : s === 4 ? 2 : 3];
  const api = useMemo(
    () => ({
      db: live, meta: { title: 'Launch tasks', icon: '✅' }, state: 'ready', level: 'view', canEdit: false, canDesign: false, canManage: false,
      ctx: { now: Date.now(), related: () => undefined, userName: (u: string) => PEOPLE[u as keyof typeof PEOPLE]?.name ?? u },
      related: () => undefined, updateRow: () => undefined, createRow: () => undefined, moveRow: () => undefined, removeRow: () => undefined,
      schema: () => undefined, view: () => undefined, setIcon: () => undefined, pressButton: () => undefined,
    }) as unknown as DatabaseApi,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const props: ViewProps = { api, db: live, view, rows, onOpen: () => undefined, addRow: () => undefined, onEditProp: () => undefined, patch: () => undefined, readOnly: true };
  const body = view.layout === 'board' ? <BoardView {...props} /> : view.layout === 'calendar' ? <CalendarView {...props} /> : view.layout === 'chart' ? <ChartView {...props} /> : <TableView {...props} />;
  return (
    <Ctx.Provider value={demoCtx}>
      <div className="ld-db" aria-hidden>
        <div className="db-tabs">
          {db.views.map((v) => <span key={v.id} className={`db-tab ${v.id === view.id ? 'on' : ''}`}>{v.name}</span>)}
        </div>
        <div key={view.id} className="ld-fade db db-body">{body}</div>
      </div>
    </Ctx.Provider>
  );
}

// ---- 3. Share, comment, publish ----

const COLLAB_STAGES = [1500, 2000, 2300, 2100, 2600];
const COLLAB_CAPTIONS = [
  'Share a page with people, groups or the whole workspace.',
  'Pick a level: view, comment, edit or full access.',
  'Comment on any line and @mention people. They get it in their inbox.',
  'Edit together. You see who is on the page, and changes land line by line.',
  'Publish a page to the web with one switch.',
];

function CollabDemo({ run, onEnd, onStage }: SceneProps) {
  const s = useStages(COLLAB_STAGES, run, onEnd, onStage);
  const comment = useTyped('@Ken can you check the pricing line?', s === 2, 32);
  return (
    <div className="ld-collab" aria-hidden>
      <div className="ld-doc">
        <div className="ld-docbar">
          <span>🚀 Launch plan</span>
          <span className="ld-avs"><Av id="maya" /><Av id="ken" />{s >= 3 && <Av id="bob" />}</span>
          <span className={`ld-share ${s <= 1 ? 'hot' : ''}`}>Share</span>
        </div>
        <p className="ld-line">Everything we need to ship v2 on Friday.</p>
        <p className={`ld-line ${s >= 2 ? 'hl' : ''}`}>Pricing stays the same for existing teams.{s >= 2 && <span className="ld-badge">1</span>}</p>
        <p className="ld-line">{s >= 3 ? <>Adding the announcement draft<span className="ld-peer" style={{ background: PEOPLE.bob.color }}>Bob</span></> : 'Announcement draft'}</p>
      </div>
      {s <= 1 && (
        <div className="ld-pop-share">
          <div className="ld-tabs"><b>Share</b><span>Publish</span></div>
          <div className="ld-invite"><span>{s === 0 ? 'Add people or groups…' : 'Bob'}</span><span className="ld-sel">{s === 0 ? 'Can edit' : 'Can edit'}</span><span className="ld-btn">Invite</span></div>
          <ul>
            <li><span><b>Maya</b><small>Created this page</small></span><span>Full access</span></li>
            <li><span><b>Everyone in Flo Studios</b></span><span>Can view</span></li>
            {s === 1 && <li className="ld-pop"><span><b>Bob</b></span><span>Can edit</span></li>}
          </ul>
        </div>
      )}
      {s === 2 && (
        <div className="ld-side">
          <h5>Comments</h5>
          <div className="ld-cm"><Av id="maya" /><div><b>Maya</b><p>{comment}<Cursor show={comment.length < 36} /></p></div></div>
        </div>
      )}
      {s === 3 && (
        <div className="ld-side">
          <h5>Inbox</h5>
          <div className="ld-cm"><Av id="maya" /><div><b>Maya</b> mentioned you in <b>Launch plan</b><p>@Ken can you check the pricing line?</p></div></div>
          <div className="ld-cm"><Av id="bob" /><div><b>Bob</b> is editing <b>Launch plan</b></div></div>
        </div>
      )}
      {s === 4 && (
        <div className="ld-side wide">
          <div className="ld-switch"><span>Publish to the web</span><i className="on" /></div>
          <div className="ld-url">relay.app/p/hq.x8Kq…</div>
          <div className="ld-browser"><div className="ld-bbar"><i /><i /><i /><span>Launch plan</span></div><h4>🚀 Launch plan</h4><p>Everything we need to ship v2 on Friday.</p></div>
        </div>
      )}
    </div>
  );
}

// ---- 4. Search and the assistant ----

const FIND_STAGES = [1800, 2200, 2800, 2600];
const FIND_CAPTIONS = [
  'Search pages, database rows and messages in one place.',
  'Results only include what you are allowed to open.',
  'The assistant summarizes a page and pulls out action items. It runs in your browser.',
  'Ask a question and get the answer with its source.',
];
const DEMO_TEXT = 'Our launch is planned for Friday. The launch needs a final design review. Marketing will prepare the announcement by Thursday. Legal should confirm the terms before we publish. The pricing page covers the team plan and the free tier.';

function FindDemo({ run, onEnd, onStage }: SceneProps) {
  const s = useStages(FIND_STAGES, run, onEnd, onStage);
  const q = useTyped('launch', s === 0, 120);
  const blocks: Block[] = DEMO_TEXT.split('. ').map((t, i) => ({ id: `b${i}`, type: 'text', text: [{ t: `${t}.` }], children: [], rev: 1 }));
  const summary = useMemo(() => summarize(DEMO_TEXT, 2), []);
  const actions = useMemo(() => actionItems(blocks), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = useTyped('When do we launch?', s === 3, 45);
  return (
    <div className="ld-find" aria-hidden>
      {s <= 1 && (
        <div className="ld-palette">
          <div className="ld-query">⌕ <span>{s === 0 ? q : 'launch'}</span><Cursor show={s === 0} /></div>
          {s === 1 && (
            <ul className="ld-results ld-fade">
              <li><span>🚀</span><div><b>Launch plan</b><small>Page · Everything we need to ship v2 on Friday</small></div></li>
              <li><span>▫️</span><div><b>Update launch checklist</b><small>Row in Launch tasks</small></div></li>
              <li><span>✅</span><div><b>Launch tasks</b><small>Database</small></div></li>
              <li><span>💬</span><div><b>Priya in #launch</b><small>Shipping at 4 on Friday</small></div></li>
            </ul>
          )}
        </div>
      )}
      {s >= 2 && (
        <div className="ld-assist ld-fade">
          <h5>✨ Assistant</h5>
          {s === 2 && (
            <>
              <div className="ld-out"><b>Summary</b><ul>{summary.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div className="ld-out"><b>Action items</b><ul>{actions.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></div>
            </>
          )}
          {s === 3 && (
            <>
              <div className="ld-ask">{ask}<Cursor show={ask.length < 18} /></div>
              {ask.length >= 18 && <div className="ld-out ld-pop"><b>From your workspace</b><p>Our launch is planned for Friday. <span className="ld-cite">Launch plan</span></p></div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- The section ----

const SCENES: { id: string; label: string; stages: number; captions: string[]; Scene: (p: SceneProps) => ReactNode }[] = [
  { id: 'pages', label: 'Pages', stages: PAGE_STAGES.length, captions: PAGE_CAPTIONS, Scene: PagesDemo },
  { id: 'databases', label: 'Databases', stages: DB_STAGES.length, captions: DB_CAPTIONS, Scene: DbDemo },
  { id: 'collab', label: 'Share and comment', stages: COLLAB_STAGES.length, captions: COLLAB_CAPTIONS, Scene: CollabDemo },
  { id: 'find', label: 'Search and assistant', stages: FIND_STAGES.length, captions: FIND_CAPTIONS, Scene: FindDemo },
];

export function LiveDemo() {
  const [scene, setScene] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cur = SCENES[scene];
  const [stage, setStage] = useState(0);
  const go = (i: number) => {
    setScene(i);
    setCycle((c) => c + 1);
    setStage(0);
  };
  return (
    <div className="ld" ref={root}>
      <div className="ld-tabs-bar" role="tablist" aria-label="What you can do in Relay">
        {SCENES.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === scene} className={i === scene ? 'on' : ''} onClick={() => go(i)}>{x.label}</button>
        ))}
        <button className="ld-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
      </div>
      <div className="ld-frame">
        <div className="ld-chrome" aria-hidden><i /><i /><i /><span>Relay — {cur.label}</span></div>
        <div className="ld-stage">
          <Staged key={`${scene}:${cycle}`} scene={cur} run={visible && !paused} onEnd={() => go((scene + 1) % SCENES.length)} onStage={setStage} />
        </div>
      </div>
      <p className="ld-caption" role="status" aria-live="polite">{cur.captions[Math.min(stage, cur.captions.length - 1)]}</p>
    </div>
  );
}

function Staged({ scene, run, onEnd, onStage }: { scene: (typeof SCENES)[number]; run: boolean; onEnd: () => void; onStage: (n: number) => void }) {
  const Scene = scene.Scene;
  return <div className="ld-scene"><Scene run={run} onEnd={onEnd} onStage={onStage} /></div>;
}
