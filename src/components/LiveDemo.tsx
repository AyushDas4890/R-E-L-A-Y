// "See the workspace work": scripted, looping scenes of what people actually do in Relay, with a
// pointer that moves, clicks and drags. The database scenes run the real table, board, calendar and
// chart components on sample data; the rest are built from the same controls. Nothing here talks
// to a server.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ctx, type RelayCtx } from '../ctx.ts';
import { newView, presetDb } from '../../server/databases.ts';
import type { DatabaseApi } from '../db-store.ts';
import { actionItems, summarize } from '../localAi.ts';
import type { Block, DbData, PropValue, Row, View } from '../types.ts';
import { CalendarView, ChartView } from './db/CalendarViews.tsx';
import { BoardView, TableView, type ViewProps } from './db/Views.tsx';
import '../live-demo.css';

const reduced = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- The pointer ----

interface Aim { (selector: string, opts?: { click?: boolean; label?: string; at?: [number, number] }): void; hide: () => void }
const AimCtx = createContext<Aim | null>(null);
const useAim = (): Aim => useContext(AimCtx)!;

function Pointer({ x, y, clicks, label, show }: { x: number; y: number; clicks: number; label: string; show: boolean }) {
  return (
    <div className={`ld-ptr ${show ? 'on' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden>
      {label && <span className="ld-ghost">{label}</span>}
      <svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.7 L9.6 11.8 L15.5 11.5 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      {clicks > 0 && <i key={clicks} className="ld-ripple" />}
    </div>
  );
}

// Moves through the stages one after another while `run` is true. Reduced motion jumps to the end.
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

// Runs `fn` after `ms` whenever the stage changes to `stage`; cleans up if it moves on.
function useAt(stage: number, s: number, ms: number, fn: () => void, run: boolean): void {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (!run || s !== stage || reduced()) return;
    const t = setTimeout(() => f.current(), ms);
    return () => clearTimeout(t);
  }, [s, stage, ms, run]);
}

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

const Cursor = ({ show }: { show: boolean }) => (show ? <i className="ld-caret" aria-hidden /> : null);
const Av = ({ id, size = 22 }: { id: keyof typeof PEOPLE; size?: number }) => (
  <i className="ld-av" style={{ background: PEOPLE[id].color, width: size, height: size, fontSize: size * 0.5 }} aria-hidden>{PEOPLE[id].name[0]}</i>
);

// ---- 1. Pages ----

const PAGE_STAGES = [1900, 2000, 2700, 2000, 2600, 2800];
const PAGE_CAPTIONS = [
  'Start a page and give it a title.',
  'Write like a document. Format as you type.',
  'Press / to turn a line into any block.',
  'Blocks turn into a checklist in one keystroke.',
  'Check things off and @mention a teammate.',
  'Headings, lists, tables, code, images, toggles, columns, callouts and more.',
];

function PagesDemo({ run, onEnd, onStage }: SceneProps) {
  const aim = useAim();
  const s = useStages(PAGE_STAGES, run, onEnd, onStage);
  const title = useTyped('Launch plan', s === 0, 70);
  const intro = useTyped('Everything we need to ship v2 on Friday.', s === 1, 32);
  const slash = useTyped('/to', s === 2, 170);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (s === 0 && !reduced()) aim('.ld-title', { at: [0.2, 0.6] });
    if (s === 5) aim.hide();
  }, [s, aim]);
  useAt(2, s, 1500, () => aim('.ld-menu .on', { click: true, at: [0.3, 0.5] }), run);
  useAt(4, s, 300, () => aim('.ld-todos li:first-child .ck', { at: [0.5, 0.5] }), run);
  useAt(4, s, 1200, () => { aim('.ld-todos li:first-child .ck', { click: true }); setChecked(true); }, run);
  useEffect(() => { if (s < 4) setChecked(false); else if (reduced()) setChecked(true); }, [s]);
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
          <li className={checked ? 'done' : ''}><b className={checked ? 'ck on' : 'ck'} />Final copy review</li>
          <li><b className="ck" />QA on mobile</li>
          <li><b className="ck" />Send the announcement</li>
          {checked && <li className="ld-pop"><b className="ck" />Review pricing page <span className="ld-mention">@Maya</span></li>}
        </ul>
      )}
      {s >= 5 && <div className="ld-callout"><span>💡</span> Anyone can open this page, comment on a line, or ask the assistant about it.</div>}
    </div>
  );
}

// ---- 2. Databases (the real views, on sample data) ----

const DB_STAGES = [2600, 3200, 3200, 3800, 3000, 3000];
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
  const aim = useAim();
  const s = useStages(DB_STAGES, run, onEnd, onStage);
  const sample = useMemo(sampleDb, []);
  const [rows, setRows] = useState<Row[]>(sample.db.rows);
  const [shown, setShown] = useState(0);
  const { db, ids, opt } = sample;
  const set = (rowId: string, status: string) => setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, props: { ...r.props, [ids.Status]: opt[status] as PropValue } } : r)));
  const tab = (i: number) => `.ld-db .db-tab:nth-child(${i + 1})`;
  const switchTo = (i: number) => {
    aim(tab(i), { click: true, at: [0.5, 0.5] });
    setTimeout(() => setShown(i), 450);
  };

  // Stage 1: click a status cell, it becomes Done.
  useAt(1, s, 500, () => aim('.ld-db .db-row .db-select', { at: [0.3, 0.5] }), run);
  useAt(1, s, 1500, () => { aim('.ld-db .db-row .db-select', { click: true, at: [0.3, 0.5] }); set('r1', 'Done'); }, run);
  // Stage 2: switch to the board.
  useAt(2, s, 300, () => switchTo(1), run);
  // Stage 3: drag a card to the Done column.
  useAt(3, s, 500, () => aim('.ld-db .db-card:nth-of-type(1) .db-card-main', { at: [0.2, 0.5] }), run);
  useAt(3, s, 1500, () => aim('.ld-db .db-col:nth-child(3)', { label: 'QA on mobile', at: [0.5, 0.35] }), run);
  useAt(3, s, 2700, () => { set('r2', 'Done'); aim('.ld-db .db-col:nth-child(3)', { click: true, at: [0.5, 0.2] }); }, run);
  // Stage 4/5: calendar and chart.
  useAt(4, s, 300, () => switchTo(2), run);
  useAt(5, s, 300, () => { switchTo(3); }, run);
  useEffect(() => {
    if (s === 0 && !reduced()) aim('.ld-db .db-table', { at: [0.55, 0.35] });
    if (s === 0) setShown(0);
    if (s === 5 || s === 4) setTimeout(() => aim.hide(), 1500);
    if (reduced()) setShown(s >= 5 ? 3 : s === 4 ? 2 : s >= 2 ? 1 : 0);
  }, [s, aim]);

  const live: DbData = { ...db, rows };
  const view: View = db.views[shown];
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
        <h4 className="ld-dbtitle">✅ Launch tasks</h4>
        <div className="db-tabs">
          {db.views.map((v) => <span key={v.id} className={`db-tab ${v.id === view.id ? 'on' : ''}`}>{v.name}</span>)}
        </div>
        <div key={view.id} className="ld-fade db db-body">{body}</div>
      </div>
    </Ctx.Provider>
  );
}

// ---- 3. Share, comment, publish ----

const COLLAB_STAGES = [3000, 3000, 3600, 3200, 3800];
const COLLAB_CAPTIONS = [
  'Share a page with people, groups or the whole workspace.',
  'Pick a level: view, comment, edit or full access.',
  'Comment on any line and @mention people. They get it in their inbox.',
  'Edit together. You see who is on the page, and changes land line by line.',
  'Publish a page to the web with one switch.',
];

function CollabDemo({ run, onEnd, onStage }: SceneProps) {
  const aim = useAim();
  const s = useStages(COLLAB_STAGES, run, onEnd, onStage);
  const comment = useTyped('@Ken can you check the pricing line?', s === 2, 36);
  const [open, setOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const [published, setPublished] = useState(false);
  useEffect(() => {
    if (s === 0) { setOpen(false); setInvited(false); setPublished(false); if (!reduced()) aim('.ld-share', { at: [0.5, 0.5] }); }
    if (reduced()) { setOpen(s <= 1); setInvited(s >= 1); setPublished(s >= 4); }
  }, [s, aim]);
  useAt(0, s, 1300, () => { aim('.ld-share', { click: true }); setOpen(true); }, run);
  useAt(1, s, 400, () => aim('.ld-invite .ld-btn', { at: [0.5, 0.5] }), run);
  useAt(1, s, 1400, () => { aim('.ld-invite .ld-btn', { click: true }); setInvited(true); }, run);
  useAt(2, s, 200, () => aim('.ld-line.cm', { at: [0.7, 0.5] }), run);
  useEffect(() => { if (s === 3) aim.hide(); }, [s, aim]);
  useAt(4, s, 500, () => aim('.ld-switch i', { at: [0.5, 0.5] }), run);
  useAt(4, s, 1400, () => { aim('.ld-switch i', { click: true }); setPublished(true); }, run);
  return (
    <div className="ld-collab" aria-hidden>
      <div className="ld-doc">
        <div className="ld-docbar">
          <span>🚀 Launch plan</span>
          <span className="ld-avs"><Av id="maya" /><Av id="ken" />{s >= 3 && <Av id="bob" />}</span>
          <span className={`ld-share ${open && s <= 1 ? 'hot' : ''}`}>Share</span>
        </div>
        <p className="ld-line">Everything we need to ship v2 on Friday.</p>
        <p className={`ld-line cm ${s >= 2 ? 'hl' : ''}`}>Pricing stays the same for existing teams.{s >= 2 && <span className="ld-badge">1</span>}</p>
        <p className="ld-line">{s >= 3 ? <>Adding the announcement draft<span className="ld-peer" style={{ background: PEOPLE.bob.color }}>Bob</span></> : 'Announcement draft'}</p>
        {s >= 3 && <p className="ld-line ld-bobtext ld-fade">Bob: pricing table updated to the new tiers.</p>}
      </div>
      {open && s <= 1 && (
        <div className="ld-pop-share">
          <div className="ld-tabs"><b>Share</b><span>Publish</span></div>
          <div className="ld-invite"><span>{invited ? 'Add people or groups…' : 'Bob'}</span><span className="ld-sel">Can edit</span><span className="ld-btn">Invite</span></div>
          <ul>
            <li><span><b>Maya</b><small>Created this page</small></span><span>Full access</span></li>
            <li><span><b>Everyone in Flo Studios</b></span><span>Can view</span></li>
            {invited && <li className="ld-pop"><span><b>Bob</b></span><span>Can edit</span></li>}
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
          <h5>Inbox <span className="ld-count">1</span></h5>
          <div className="ld-cm ld-pop"><Av id="maya" /><div><b>Maya</b> mentioned you in <b>Launch plan</b><p>@Ken can you check the pricing line?</p></div></div>
          <div className="ld-cm ld-fade"><Av id="bob" /><div><b>Bob</b> is editing <b>Launch plan</b></div></div>
        </div>
      )}
      {s === 4 && (
        <div className="ld-side wide">
          <div className="ld-switch"><span>Publish to the web</span><i className={published ? 'on' : ''} /></div>
          {published && <div className="ld-url">relay.app/p/hq.x8Kq…</div>}
          {published && <div className="ld-browser"><div className="ld-bbar"><i /><i /><i /><span>Launch plan</span></div><h4>🚀 Launch plan</h4><p>Everything we need to ship v2 on Friday.</p><p className="ld-pill">Published · read only</p></div>}
        </div>
      )}
    </div>
  );
}

// ---- 4. Search and the assistant ----

const FIND_STAGES = [2800, 3200, 4600, 4000];
const FIND_CAPTIONS = [
  'Search pages, database rows and messages in one place.',
  'Results only include what you are allowed to open.',
  'The assistant summarizes a page and pulls out action items. It runs in your browser.',
  'Ask a question and get the answer with its source.',
];
const DEMO_TEXT = 'Our launch is planned for Friday. The launch needs a final design review. Marketing will prepare the announcement by Thursday. Legal should confirm the terms before we publish. The pricing page covers the team plan and the free tier.';

function FindDemo({ run, onEnd, onStage }: SceneProps) {
  const aim = useAim();
  const s = useStages(FIND_STAGES, run, onEnd, onStage);
  const q = useTyped('launch', s === 0, 150);
  const blocks: Block[] = DEMO_TEXT.split('. ').map((t, i) => ({ id: `b${i}`, type: 'text', text: [{ t: `${t}.` }], children: [], rev: 1 }));
  const summary = useMemo(() => summarize(DEMO_TEXT, 2), []);
  const actions = useMemo(() => actionItems(blocks), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = useTyped('When do we launch?', s === 3, 55);
  const [did, setDid] = useState<'' | 'sum' | 'act'>('');
  useEffect(() => {
    if (s < 2) setDid('');
    if (s === 0 || s === 1) aim.hide();
    if (reduced() && s >= 2) setDid('act');
  }, [s, aim]);
  useAt(2, s, 600, () => aim('.ld-ai-btns button:nth-child(1)', { at: [0.5, 0.5] }), run);
  useAt(2, s, 1300, () => { aim('.ld-ai-btns button:nth-child(1)', { click: true }); setDid('sum'); }, run);
  useAt(2, s, 2500, () => aim('.ld-ai-btns button:nth-child(2)', { at: [0.5, 0.5] }), run);
  useAt(2, s, 3200, () => { aim('.ld-ai-btns button:nth-child(2)', { click: true }); setDid('act'); }, run);
  useAt(3, s, 300, () => aim('.ld-ask', { at: [0.4, 0.5] }), run);
  return (
    <div className="ld-find" aria-hidden>
      {s <= 1 && (
        <div className="ld-palette">
          <div className="ld-query"><span className="ld-keys"><kbd className={s === 0 && q.length === 0 ? 'down' : ''}>Ctrl</kbd><kbd className={s === 0 && q.length === 0 ? 'down' : ''}>K</kbd></span><span>⌕</span> <span>{s === 0 ? q : 'launch'}</span><Cursor show={s === 0} /></div>
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
              <div className="ld-ai-btns"><button type="button" className={did ? 'on' : ''}>Summarize</button><button type="button" className={did === 'act' ? 'on' : ''}>Action items</button></div>
              {did !== '' && <div className="ld-out ld-pop"><b>Summary</b><ul>{summary.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {did === 'act' && <div className="ld-out ld-pop"><b>Action items</b><ul>{actions.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></div>}
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

const SCENES: { id: string; label: string; captions: string[]; Scene: (p: SceneProps) => ReactNode; active: string }[] = [
  { id: 'pages', label: 'Pages', captions: PAGE_CAPTIONS, Scene: PagesDemo, active: 'Launch plan' },
  { id: 'databases', label: 'Databases', captions: DB_CAPTIONS, Scene: DbDemo, active: 'Launch tasks' },
  { id: 'collab', label: 'Share and comment', captions: COLLAB_CAPTIONS, Scene: CollabDemo, active: 'Launch plan' },
  { id: 'find', label: 'Search and assistant', captions: FIND_CAPTIONS, Scene: FindDemo, active: '' },
];

export function LiveDemo() {
  const [scene, setScene] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState(0);
  const [ptr, setPtr] = useState({ x: 80, y: 120, clicks: 0, label: '', show: false });
  const root = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const aim = useMemo<Aim>(() => {
    const fn = ((selector: string, opts: { click?: boolean; label?: string; at?: [number, number] } = {}) => {
      const st = stageEl.current;
      const el = st?.querySelector(selector);
      if (!st || !el) return;
      const a = st.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const [fx, fy] = opts.at ?? [0.5, 0.5];
      setPtr((p) => ({ x: b.left - a.left + b.width * fx, y: b.top - a.top + b.height * fy, clicks: opts.click ? p.clicks + 1 : p.clicks, label: opts.label ?? (opts.click ? '' : p.label), show: true }));
    }) as Aim;
    fn.hide = () => setPtr((p) => ({ ...p, show: false, label: '' }));
    return fn;
  }, []);

  const cur = SCENES[scene];
  const go = useCallback((i: number) => {
    setScene(i);
    setCycle((c) => c + 1);
    setStage(0);
    setPtr((p) => ({ ...p, show: false, label: '' }));
  }, []);
  const side = [['🚀', 'Launch plan'], ['✅', 'Launch tasks'], ['📝', 'Meeting notes'], ['📚', 'Team wiki']];
  return (
    <div className="ld" ref={root} data-theme="notion">
      <div className="ld-tabs-bar" role="tablist" aria-label="What you can do in Relay">
        {SCENES.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === scene} className={i === scene ? 'on' : ''} onClick={() => go(i)}>{x.label}</button>
        ))}
        <button className="ld-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
      </div>
      <div className="ld-frame">
        <div className="ld-chrome" aria-hidden><i /><i /><i /><span>Relay — Flo Studios</span></div>
        <div className="ld-app">
          <aside className="ld-nav" aria-hidden>
            <b className="ld-ws"><i>F</i>Flo Studios</b>
            <span>⌕ Search</span><span>⌂ Home</span>
            <span>▤ Inbox{scene === 2 && stage >= 3 && <em className="ld-count">1</em>}</span>
            <small>Teamspace</small>
            {side.map(([i, t]) => <span key={t} className={t === cur.active ? 'on' : ''}>{i} {t}</span>)}
            <small>Channels</small>
            <span># launch</span><span># design</span>
          </aside>
          <div className="ld-stage" ref={stageEl}>
            <AimCtx.Provider value={aim}>
              <div key={`${scene}:${cycle}`} className="ld-scene"><cur.Scene run={visible && !paused} onEnd={() => go((scene + 1) % SCENES.length)} onStage={setStage} /></div>
            </AimCtx.Provider>
            <Pointer x={ptr.x} y={ptr.y} clicks={ptr.clicks} label={ptr.label} show={ptr.show} />
          </div>
        </div>
      </div>
      <div className="ld-progress" aria-hidden>{cur.captions.map((_, i) => <i key={i} className={i <= stage ? 'on' : ''} />)}</div>
      <p className="ld-caption" role="status" aria-live="polite">{cur.captions[Math.min(stage, cur.captions.length - 1)]}</p>
    </div>
  );
}
