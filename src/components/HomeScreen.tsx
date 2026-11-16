// Home: the page you land on before choosing a workspace. A greeting, your own notes, to-do lists and
// links (they belong to you, not to any workspace), and a sidebar of the workspaces you can enter.
// Built on Astryx. Responsive contract:
//   >760px  LayoutPanel (workspaces, 264) | LayoutContent (greeting, actions, cards)
//   <=760px the workspace list swaps into the header slot above the content (useMediaQuery)
//   cards   Grid {minWidth: 260, repeat: 'fit'} reflows to one column on a phone
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon as AxIcon } from '@astryxdesign/core/Icon';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import type { ClientEvent, HomeItem, HomeKind, HomeTask, WorkspaceSummary } from '../types.ts';
import { progress } from '../home.ts';
import { LogoMark } from './LogoIntro.tsx';
import { WorkspaceTile } from './Workspaces.tsx';
import { Icon } from './Icon.tsx';
import { carriesFiles, carriesTextOrLink, classifyDrop, isTextFile, moveBefore, nudge, orderBy, useReorder, useSavedOrder, WORKSPACE_ORDER_KEY } from '../dnd.ts';
import '../home.css';
import '../dnd.css';

interface Props {
  name: string;
  items: HomeItem[];
  mine: WorkspaceSummary[];
  lastWorkspace?: string;
  send: (ev: ClientEvent) => void;
  onEnter: (id: string) => void;
  onSignOut: () => void;
}

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');

// A text box that keeps what you are typing while the server echoes older values, and saves when you leave it.
function Field({ value, onCommit, multiline, label, placeholder, size }: { value: string; onCommit: (v: string) => void; multiline?: boolean; label: string; placeholder?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  // The latest text lives in a ref too, so leaving the box commits what was typed even if React hasn't re-rendered yet.
  const latest = useRef(value);
  useEffect(() => { if (!focused.current) { setV(value); latest.current = value; } }, [value]);
  const type = (s: string) => { latest.current = s; setV(s); };
  const onFocus = () => { focused.current = true; };
  const onBlur = () => { focused.current = false; if (latest.current !== value) onCommit(latest.current); };
  return multiline
    ? <TextArea label={label} isLabelHidden placeholder={placeholder} value={v} rows={4} onChange={type} onFocus={onFocus} onBlur={onBlur} />
    : <TextInput label={label} isLabelHidden placeholder={placeholder} value={v} size={size} onChange={type} onFocus={onFocus} onBlur={onBlur} onKeyDown={(e) => { if (e.key === 'Enter') { if (e.nativeEvent.isComposing || e.keyCode === 229) return; e.currentTarget.blur(); } }} />;
}

function HomeCard({ item, send, order }: { item: HomeItem; send: Props['send']; order: ReturnType<typeof useReorder> & { nudge: (id: string, dir: -1 | 1) => void } }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const patch = (p: Partial<Pick<HomeItem, 'title' | 'text' | 'url' | 'tasks'>>) => send({ t: 'homeUpdate', id: item.id, patch: p });
  // A task without an id is new; the server gives it one.
  const setTasks = (tasks: Partial<HomeTask>[]) => patch({ tasks: tasks as HomeTask[] });
  const [next, setNext] = useState('');
  const addTask = () => { if (next.trim()) { setTasks([...item.tasks, { text: next.trim(), done: false }]); setNext(''); } };
  // Tasks inside a to-do list can be dragged into a new order too.
  const taskOrder = useReorder((from, before) => {
    const byId = new Map(item.tasks.map((t) => [t.id, t]));
    setTasks(moveBefore(item.tasks.map((t) => t.id), from, before).map((id) => byId.get(id)!));
  });
  const label = item.kind === 'note' ? 'Note' : item.kind === 'todo' ? 'To-do list' : 'Link';
  return (
    // Card forwards DOM props, so useReorder's drop-target handlers spread straight onto it.
    <Card ref={cardRef} padding={3} role="article" className={`hs-card ${order.classOf(item.id)}`} aria-label={`${label}: ${item.title || 'Untitled'}`} {...order.targetProps(item.id)}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          {/* The grip stays a native button: useReorder spreads drag and key handlers onto it. */}
          <button className="hs-grip" aria-label={`Move ${label.toLowerCase()}: drag, or press the arrow keys`} title="Drag to reorder" {...order.handleProps(item.id, () => cardRef.current)} {...order.keyProps((d) => order.nudge(item.id, d))}>⠿</button>
          <Text type="supporting" className="hs-kind">{label}</Text>
          <IconButton size="sm" variant="ghost" label={`Delete ${label.toLowerCase()}`} tooltip="Delete" icon={<AxIcon icon="close" />} onClick={() => { if (confirm(`Delete this ${label.toLowerCase()}?`)) send({ t: 'homeRemove', id: item.id }); }} />
        </HStack>
        <Field size="lg" label="Title" placeholder="Untitled" value={item.title} onCommit={(title) => patch({ title })} />
        {item.kind === 'note' && <Field multiline label="Note text" placeholder="Write anything…" value={item.text} onCommit={(text) => patch({ text })} />}
        {item.kind === 'link' && (
          <>
            <Field label="Link address" placeholder="https://…" value={item.url} onCommit={(url) => patch({ url })} />
            {item.url && <Link href={item.url} isExternalLink>Open link</Link>}
          </>
        )}
        {item.kind === 'todo' && (
          <>
            {item.tasks.length > 0 && (
              <VStack as="ul" gap={0.5} className="hs-tasks">
                {item.tasks.map((t) => (
                  // A stack rendered as <li> so useReorder's drop-target handlers reach the DOM row.
                  <HStack as="li" key={t.id} gap={1} vAlign="center" className={`${t.done ? 'done' : ''} ${taskOrder.classOf(t.id)}`} {...taskOrder.targetProps(t.id)}>
                    <button className="hs-grip task" aria-label={`Move task: ${t.text || 'untitled'}`} title="Drag to reorder" {...taskOrder.handleProps(t.id, () => cardRef.current)} {...taskOrder.keyProps((d) => {
                      const byId = new Map(item.tasks.map((x) => [x.id, x]));
                      setTasks(nudge(item.tasks.map((x) => x.id), t.id, d).map((id) => byId.get(id)!));
                    })}>⠿</button>
                    <CheckboxInput label={`Done: ${t.text}`} isLabelHidden value={t.done} onChange={(done) => setTasks(item.tasks.map((x) => (x.id === t.id ? { ...x, done } : x)))} />
                    <Field label="Task" value={t.text} onCommit={(text) => setTasks(item.tasks.map((x) => (x.id === t.id ? { ...x, text } : x)))} />
                    <IconButton size="sm" variant="ghost" label="Remove task" icon={<AxIcon icon="close" />} onClick={() => setTasks(item.tasks.filter((x) => x.id !== t.id))} />
                  </HStack>
                ))}
              </VStack>
            )}
            <TextInput label="Add a task" isLabelHidden placeholder="Add a task, press Enter" value={next} onChange={setNext} onEnter={addTask} enterKeyHint="done" />
            {item.tasks.length > 0 && <Text type="supporting">{progress(item.tasks)}</Text>}
          </>
        )}
      </VStack>
    </Card>
  );
}

export function HomeScreen({ name, items, mine, lastWorkspace, send, onEnter, onSignOut }: Props) {
  const now = new Date();
  const add = (kind: HomeKind) => send({ t: 'homeAdd', kind });
  const narrow = useMediaQuery('(max-width: 760px)');
  const first = name.trim().split(/\s+/)[0];

  // Cards: the order is the server's, so a drop (or arrow key) just says where the card should go.
  const cardIds = items.map((i) => i.id);
  const cardOrder = useReorder((from, before) => send({ t: 'homeMove', id: from, before }));
  const cards = {
    ...cardOrder,
    nudge: (id: string, dir: -1 | 1) => {
      const next = nudge(cardIds, id, dir);
      const at = next.indexOf(id);
      if (next.join() !== cardIds.join()) send({ t: 'homeMove', id, before: next[at + 1] ?? null });
    },
  };

  // Workspaces: this browser remembers your order; the server doesn't know about it.
  const [saved, saveOrder] = useSavedOrder(WORKSPACE_ORDER_KEY);
  const sorted = orderBy(mine, (w) => w.id, saved);
  const wsIds = sorted.map((w) => w.id);
  const wsOrder = useReorder((from, before) => saveOrder(moveBefore(wsIds, from, before)));

  // Drop a link, some text or a text file anywhere on the page to keep it here.
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const inField = (e: DragEvent) => !!(e.target as HTMLElement).closest?.('input, textarea');
  const wanted = (e: DragEvent) => carriesFiles(e.dataTransfer) || carriesTextOrLink(e.dataTransfer);
  const onDrop = async (e: DragEvent) => {
    setDropping(false);
    if (!wanted(e) || inField(e)) return;
    e.preventDefault();
    const dt = e.dataTransfer;
    const drops = classifyDrop({ uri: dt.getData('text/uri-list'), text: dt.getData('text/plain'), files: Array.from(dt.files) });
    let added = 0, skipped = 0;
    for (const d of drops.slice(0, 10)) {
      if (d.kind === 'link') { send({ t: 'homeAdd', kind: 'link', fields: { title: d.title, url: d.url } }); added++; }
      else if (d.kind === 'text') { send({ t: 'homeAdd', kind: 'note', fields: { title: d.title, text: d.text } }); added++; }
      else if (isTextFile(d.file) && d.file.size <= 200_000) {
        try { send({ t: 'homeAdd', kind: 'note', fields: { title: d.file.name.replace(/\.[^.]+$/, ''), text: await d.file.text() } }); added++; } catch { skipped++; }
      } else skipped++;
    }
    if (drops.length > 10) skipped += drops.length - 10;
    setNotice(skipped
      ? { ok: false, text: `Added ${added}. Home keeps notes, to-do lists and links, so only links, text and text files can be dropped.` }
      : { ok: true, text: `Added ${added} to Home.` });
  };

  const workspaces = (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <LogoMark size={22} />
        <Text weight="bold">Relay</Text>
      </HStack>
      <List density="compact" edge="flush">
        <ListItem label="Home" startContent={<Icon n="home" />} isSelected />
      </List>
      <List density="compact" edge="flush" header={<Text type="supporting">Workspaces{mine.length > 1 && ' · drag or Alt+arrows to reorder'}</Text>}>
        {sorted.map((w) => (
          // ListItem forwards DOM props to its <li>: the row is both drop target and drag source, and
          // Alt+arrow presses on its button bubble up to the key handler.
          <ListItem
            key={w.id}
            className={`hs-ws ${wsOrder.classOf(w.id)}`}
            label={w.name}
            startContent={<WorkspaceTile ws={w} size={24} />}
            endContent={w.id === lastWorkspace ? <Text type="supporting">last used</Text> : undefined}
            onClick={() => onEnter(w.id)}
            {...wsOrder.targetProps(w.id)}
            {...wsOrder.handleProps(w.id)}
            {...wsOrder.keyProps((d) => saveOrder(nudge(wsIds, w.id, d)), true)}
          />
        ))}
      </List>
      {mine.length === 0 && <EmptyState isCompact headingLevel={2} title="No workspaces yet" description="When someone invites you, the workspace shows up here." />}
      <HStack>
        <Button variant="ghost" label="Sign out" icon={<Icon n="logout" />} onClick={onSignOut} />
      </HStack>
    </VStack>
  );

  return (
    <Layout
      className="hs"
      header={narrow ? <LayoutHeader hasDivider role="navigation" label="Workspaces">{workspaces}</LayoutHeader> : undefined}
      start={narrow ? undefined : <LayoutPanel hasDivider width={264} role="navigation" label="Workspaces">{workspaces}</LayoutPanel>}
      content={
        <LayoutContent
          label="Home"
          className={`hs-stage ${dropping ? 'dropping' : ''}`}
          onDragOver={(e) => { if (wanted(e) && !inField(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dropping) setDropping(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
          onDrop={(e) => void onDrop(e)}
        >
          {dropping && (
            <VStack className="hs-drop" aria-hidden="true" gap={1} hAlign="center" vAlign="center">
              <Heading level={2}>Drop to add to Home</Heading>
              <Text type="supporting">A link becomes a link card, text becomes a note</Text>
            </VStack>
          )}
          <VStack gap={6} paddingBlock={6} maxWidth={1100}>
            <VStack gap={1}>
              <Heading level={1}>{first ? `${greeting(now)}, ${first}` : 'Home'}</Heading>
              <Text type="supporting" as="p">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {narrow ? 'Pick a workspace above' : 'Pick a workspace on the left'}, or keep things here. Only you can see this page.</Text>
            </VStack>
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap" role="group" aria-label="Add to Home">
                <Button label="Note" icon={<Icon n="pencil" />} onClick={() => add('note')} />
                <Button label="To-do list" icon={<Icon n="checkSquare" />} onClick={() => add('todo')} />
                <Button label="Link" icon={<Icon n="globe" />} onClick={() => add('link')} />
              </HStack>
              {/* The live region stays mounted so the notice is announced when it appears. */}
              <VStack role="status">
                {notice && <Banner status={notice.ok ? 'success' : 'warning'} title={notice.text} isDismissable onDismiss={() => setNotice(null)} />}
              </VStack>
            </VStack>
            {items.length === 0 ? (
              <EmptyState headingLevel={2} title="Nothing here yet" description="Add a note, a to-do list or a link, or drop a link, some text or a text file anywhere on this page." />
            ) : (
              <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={3} align="start">{items.map((i) => <HomeCard key={i.id} item={i} send={send} order={cards} />)}</Grid>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
