// What the page runtime shares with the database and collaboration modules: the index, the body
// cache, who may do what, and the ways to tell people about a change. Types only.
import type { WebSocket } from 'ws';
import type { BlockOp, ClientEvent, InboxItem, Page, PageLevel, PageMeta, ServerEvent } from '../src/types.ts';
import type { PageBody, Spaces, Who } from './pages.ts';
import type { PageStore, PagesIndex } from './pageStore.ts';

export interface PageDeps {
  store: PageStore;
  index: PagesIndex;
  workspaceId: string;
  // Every open tab and the person behind it.
  clients: () => Iterable<[WebSocket, string]>;
  who: (userId: string) => Who | undefined;
  // People who can be named in a share or a mention: id -> display name.
  people: () => Record<string, string>;
  workspaceName: () => string;
  // Information barriers: may these two people be connected through a page?
  barred?: (a: string, b: string) => boolean;
  groupMembers?: (groupId: string) => string[];
  send: (ws: WebSocket, ev: ServerEvent) => void;
  audit: (actor: string, action: string, detail: string) => void;
  now?: () => number;
  newId?: () => string;
}

// A page the person asked for. For a database row, `page` is the database page and `row` is set.
export interface Target {
  page: Page;
  // The id the body is stored under (the page id, or `<database>.<row>`).
  id: string;
  meta: PageMeta;
  level: PageLevel;
  row?: { dbId: string };
}

export interface Core {
  deps: PageDeps;
  index: PagesIndex;
  now: () => number;
  newId: () => string;
  spaces: () => Spaces;
  levelOf: (page: Page, userId: string) => PageLevel;
  need: (ws: WebSocket, userId: string, id: unknown, level: PageLevel) => Page | null;
  // Like `need`, but also understands database row ids.
  target: (ws: WebSocket, userId: string, id: unknown, level: PageLevel) => Promise<Target | null>;
  bodyOf: (id: string) => Promise<PageBody>;
  touchBody: (id: string) => void;
  touchIndex: () => void;
  metaOf: (page: Page) => PageMeta;
  sendUser: (userId: string, ev: ServerEvent) => void;
  syncNodes: (ids: string[]) => void;
  broadcastToOpen: (id: string, ev: ServerEvent, except?: WebSocket) => void;
  openTabs: (id: string) => Set<WebSocket>;
  edited: (page: Page, userId: string) => void;
  notify: (userId: string, item: Omit<InboxItem, 'id' | 'at'>) => void;
  erase: (ids: string[]) => void;
  denied: (ws: WebSocket) => void;
  hooks: {
    // Just before a batch of block ops is applied.
    beforeEdit: (page: Page, body: PageBody, userId: string) => void;
    // After ops took effect (`id` is the page or row id the body belongs to).
    afterEdit: (page: Page, id: string, body: PageBody, userId: string, ops: BlockOp[]) => void;
  };
}

export type Handler = (ws: WebSocket, userId: string, ev: ClientEvent) => Promise<boolean>;
