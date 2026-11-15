// Home: where you were, what changed, what is coming up, and quick ways to start something.
// Built on Astryx: a centred, scrolling Layout of VStack sections; page tiles are ClickableCards in a
// reflowing Grid, and Upcoming is a List of rows because it is dense, dated data.
import { Icon } from '../Icon.tsx';
import { useEffect, useMemo, useState } from 'react';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { List, ListItem } from '@astryxdesign/core/List';
import { useRelayCtx } from '../../ctx.ts';
import { readRecent } from '../../recent.ts';
import type { CalendarItem, PageNode } from '../../types.ts';
import { iconOf } from './PageTree.tsx';

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface Props {
  onOpen: (id: string) => void;
  onNew: (db?: boolean) => void;
  onLibrary: () => void;
  onCalendar: () => void;
}

// Page tiles reflow: up to four across on a wide screen, one full-width column on a phone.
const TILE_COLUMNS = { minWidth: 168, max: 4 } as const;

export function HomeView({ onOpen, onNew, onLibrary, onCalendar }: Props) {
  const { snap, send, listen } = useRelayCtx();
  const [feed, setFeed] = useState<CalendarItem[] | null>(null);
  useEffect(() => {
    const off = listen((ev) => {
      if (ev.t === 'calendarFeed') setFeed(ev.items);
    });
    send({ t: 'calendarFeed' });
    return off;
  }, [listen, send]);

  const byId = useMemo(() => new Map(snap.pages.map((n) => [n.id, n])), [snap.pages]);
  const visited = readRecent().map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed).slice(0, 8);
  const edited = [...snap.pages].filter((n) => !n.trashed).sort((a, b) => b.editedAt - a.editedAt).slice(0, 8);
  const favs = snap.pageFavorites.map((id) => byId.get(id)).filter((n): n is PageNode => !!n && !n.trashed);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = (feed ?? []).filter((i) => i.start.slice(0, 10) >= today && i.start.slice(0, 10) <= soon).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);

  const tile = (n: PageNode) => {
    const title = n.title || 'Untitled';
    const meta = `${n.kind === 'database' ? 'Database · ' : ''}${ago(n.editedAt)}${n.editedAt && snap.users[n.createdBy] ? ` · ${snap.users[n.createdBy].name}` : ''}`;
    return (
      <ClickableCard key={n.id} label={`Open ${title}`} padding={3} onClick={() => onOpen(n.id)}>
        <VStack gap={1}>
          <Text type="large" aria-hidden>{iconOf(n)}</Text>
          <Heading level={3} maxLines={1}>{title}</Heading>
          <Text type="supporting" maxLines={2}>{meta}</Text>
        </VStack>
      </ClickableCard>
    );
  };
  const tiles = (nodes: PageNode[]) => <Grid columns={TILE_COLUMNS} gap={3}>{nodes.map(tile)}</Grid>;
  const empty = (text: string) => <Text type="supporting" as="p">{text}</Text>;

  return (
    <Layout
      contentWidth={960}
      content={
        <LayoutContent label="Home">
          <VStack gap={8} paddingBlock={6}>
            <VStack gap={4}>
              <Heading level={1}>Home</Heading>
              <HStack gap={2} wrap="wrap" role="group" aria-label="Start something">
                <Button label="New page" icon={<Icon n="file" />} onClick={() => onNew(false)} />
                <Button label="New database" icon={<Icon n="database" />} onClick={() => onNew(true)} />
                <Button label="Templates" icon={<Icon n="layout" />} onClick={onLibrary} />
                <Button label="Calendar" icon={<Icon n="calendar" />} onClick={onCalendar} />
              </HStack>
            </VStack>

            {favs.length > 0 && (
              <VStack as="section" gap={3}>
                <Heading level={2}>Favorites</Heading>
                {tiles(favs.slice(0, 8))}
              </VStack>
            )}

            <VStack as="section" gap={3}>
              <Heading level={2}>Recently visited</Heading>
              {visited.length ? tiles(visited) : empty('Pages you open show up here.')}
            </VStack>

            <VStack as="section" gap={3}>
              <Heading level={2}>Upcoming</Heading>
              {feed === null ? empty('Loading…') : upcoming.length ? (
                <List hasDividers edge="flush">
                  {upcoming.map((i) => (
                    <ListItem
                      key={`${i.dbId}.${i.rowId}.${i.prop}`}
                      label={i.title}
                      description={`${new Date(i.start.slice(0, 10)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${i.dbTitle}`}
                      onClick={() => onOpen(`${i.dbId}.${i.rowId}`)}
                    />
                  ))}
                </List>
              ) : empty('Nothing dated in the next 7 days. Rows with a date in any database you can open appear here.')}
            </VStack>

            <VStack as="section" gap={3}>
              <Heading level={2}>Recently edited</Heading>
              {edited.length ? tiles(edited) : empty('No pages yet. Create one from the sidebar or pick a template.')}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
