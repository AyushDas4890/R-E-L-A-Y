export interface UserStatus {
  emoji: string;
  text: string;
}

export type Role = 'owner' | 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  name: string;
  color: string;
  title: string;
  status: UserStatus;
  bot?: boolean;
  role?: Role;
  avatarUrl?: string;
  email?: string;
  // Left or was removed. Kept so old messages still show a name; hidden from people lists.
  inactive?: boolean;
}

export interface Invite {
  code: string;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
}

export type ChannelKind = 'public' | 'private' | 'dm';

export interface Channel {
  id: string;
  name: string;
  topic: string;
  kind: ChannelKind;
  members: string[];
  createdAt: number;
  postingPolicy?: 'everyone' | 'admins';
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  // Uploads arrive as dataUrl; with Supabase Storage the server swaps it for a stored url.
  url?: string;
  dataUrl?: string;
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  site?: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  ts: number;
  threadId?: string;
  reactions: Record<string, string[]>;
  edited?: boolean;
  pinned?: boolean;
  files?: FileAttachment[];
  preview?: LinkPreview;
  system?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger:
    | { type: 'keyword'; keyword: string; channelId: string | 'any' }
    | { type: 'join'; channelId: string }
    | { type: 'schedule'; channelId: string; time: string; weekdaysOnly: boolean };
  reply: string;
  branch?: { contains: string; reply: string };
  // Who published it. Only they (or an admin) may change or delete it.
  createdBy?: string;
}

export interface ListItem {
  id: string;
  title: string;
  done: boolean;
  assignee: string;
  due: string;
  status: 'todo' | 'doing' | 'done';
}

export interface Section {
  id: string;
  name: string;
  channelIds: string[];
}

export interface UserGroup {
  id: string;
  handle: string;
  name: string;
  members: string[];
}

export interface Flag {
  id: string;
  messageId: string;
  channelId: string;
  by: string;
  reason: string;
  ts: number;
  excerpt: string;
}

export interface AuditEntry {
  ts: number;
  actor: string;
  action: string;
  detail: string;
}

export interface Settings {
  retentionDays: number;
  terms: string;
  termsVersion: number;
  barriers: [string, string][];
  // Off by default: anyone who signs in joins. On: new people need an invite code.
  inviteOnly?: boolean;
}

export interface AdminData {
  flags: Flag[];
  audit: AuditEntry[];
  legalHolds: string[];
  preservedCount: number;
  invites: Invite[];
  // People an admin removed. They can't rejoin, even by invite, until restored.
  removed: string[];
}

export interface Scheduled {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  at: number;
}

export interface HuddleState {
  channelId: string;
  participants: string[];
}

// Huddle media is a WebRTC mesh: every browser in a huddle connects to every other one.
export const MAX_HUDDLE = 6;

// One browser tab in a huddle. A user with two tabs open has two peers.
export interface HuddlePeer {
  id: string;
  userId: string;
}

// WebRTC signaling, relayed by the server between two peers in the same huddle.
export type RtcSignal =
  | { kind: 'description'; description: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string } }
  | { kind: 'candidate'; candidate: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } }
  | { kind: 'state'; muted: boolean; sharing: boolean };

export const PLAN_FEATURES = [
  'Unlimited message history',
  'Unlimited huddles with screen share',
  'Canvases in every channel',
  'Workflow Builder',
  'Scheduled messages and reminders',
  'AI recaps and thread summaries',
  'Custom statuses and themes',
  'Unlimited file uploads',
  'Private channels and guest access',
  'Advanced search and saved items',
  'Lists, custom sidebar sections, and user groups',
  'Audio and screen clips, huddle notes',
  'Daily recaps, /explain, file summaries, search answers',
  'Conditional branching and workflow templates',
  'Roles, guests, and channel posting permissions',
  'Admin analytics, audit logs, and full data exports',
  'Retention policies, legal holds, and flagged content review',
  'Information barriers and custom terms of service',
] as const;

// One row in the workspace switcher.
export interface WorkspaceSummary {
  id: string;
  name: string;
  color: string;
  members: number;
  inviteOnly: boolean;
}

export type ChannelLevel = 'all' | 'mentions' | 'mute';

// A person's own settings inside one workspace. Kept on the server so every device sees the same.
export interface UserPrefs {
  // Channel id -> server time the person last read it.
  lastRead: Record<string, number>;
  // Only channels that differ from the default ('mentions').
  levels: Record<string, ChannelLevel>;
  // Do Not Disturb until this time (0 = off).
  dndUntil: number;
  // Email about mentions and DMs while offline. On unless they switch it off.
  email: boolean;
}

// Where to continue paging up a channel's history: the oldest message already sent.
export interface HistoryCursor {
  ts: number;
  id: string;
}

export interface Snapshot {
  me: string;
  workspace: { id: string; name: string; plan: string; color: string };
  users: Record<string, User>;
  online: string[];
  channels: Record<string, Channel>;
  // The newest page per channel, plus saved and pinned messages. Older ones come via `history`.
  messages: Message[];
  // Channels that have older messages than `messages` holds, with where to continue from.
  history: Record<string, HistoryCursor>;
  canvases: Record<string, string>;
  workflows: Workflow[];
  scheduled: Scheduled[];
  huddles: HuddleState[];
  saved: string[];
  lists: Record<string, ListItem[]>;
  sections: Section[];
  starred: string[];
  groups: UserGroup[];
  settings: Settings;
  termsAccepted: number;
  prefs: UserPrefs;
  admin?: AdminData;
  // The page tree this person may see (no bodies), and their favorites.
  pages: PageNode[];
  pageFavorites: string[];
  teamspaces: Teamspace[];
  inbox: InboxItem[];
}

// A change to a database, as the people who have it open receive it. Every list holds whole items
// that changed (or the ids that went); the receiver merges them into its copy.
export interface DbDelta {
  props?: Property[];
  propsRemoved?: string[];
  // The full order of property ids, when it changed.
  propOrder?: string[];
  views?: View[];
  viewsRemoved?: string[];
  rows?: Row[];
  rowsRemoved?: string[];
  templates?: RowTemplate[];
  templatesRemoved?: string[];
  automations?: Automation[];
  automationsRemoved?: string[];
  form?: FormConfig;
  locked?: boolean;
}

export interface CalendarItem {
  rowId: string;
  dbId: string;
  dbTitle: string;
  title: string;
  start: string;
  end?: string;
  prop: string;
}

// ---- Pages: the Notion-style documents (see docs/notion/plan.md) ----

// `edit-content` (databases only) may add and change rows but not the schema or views.
export type PageLevel = 'none' | 'view' | 'comment' | 'edit-content' | 'edit' | 'full';

// Inline text. One span per run of identical styling.
export interface Rich {
  t: string;
  b?: 1;
  i?: 1;
  u?: 1;
  s?: 1;
  c?: 1;
  link?: string;
  color?: string;
  mention?: { kind: 'user' | 'page' | 'date'; id: string };
}

export type BlockType =
  | 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'toggle' | 'quote' | 'callout' | 'divider'
  | 'code' | 'image' | 'file' | 'bookmark' | 'table' | 'columns' | 'column' | 'toc' | 'breadcrumb'
  | 'pageLink' | 'subpage' | 'equation' | 'database';

export interface Block {
  id: string;
  type: BlockType;
  text: Rich[];
  children: Block[];
  checked?: boolean;
  open?: boolean;
  language?: string;
  color?: string;
  bg?: string;
  url?: string;
  name?: string;
  icon?: string;
  // pageLink and subpage point at a page.
  pageId?: string;
  // Simple table: plain-text cells.
  rows?: string[][];
  header?: boolean;
  // Bumps on every change to this block, so two people editing one block are noticed.
  rev: number;
}

export type BlockPatch = Partial<Pick<Block, 'type' | 'text' | 'checked' | 'open' | 'language' | 'color' | 'bg' | 'url' | 'name' | 'icon' | 'pageId' | 'rows' | 'header'>>;

// Blocks are addressed by id, never by position, so edits to different blocks never collide.
// `after: null` puts the block first; an `after` that no longer exists puts it last.
export type BlockOp =
  | { op: 'insert'; parent: string | null; after: string | null; block: Block }
  | { op: 'update'; id: string; patch: BlockPatch; baseRev: number; rev?: number }
  | { op: 'move'; id: string; parent: string | null; after: string | null }
  | { op: 'remove'; id: string };

export interface PageShare {
  who: { kind: 'user'; id: string } | { kind: 'workspace' } | { kind: 'group'; id: string };
  level: Exclude<PageLevel, 'none'>;
}

// ---- Databases ----

export type PropType =
  | 'title' | 'text' | 'number' | 'select' | 'status' | 'multi' | 'date' | 'person' | 'file' | 'checkbox'
  | 'url' | 'email' | 'phone' | 'formula' | 'relation' | 'rollup' | 'createdTime' | 'createdBy'
  | 'editedTime' | 'editedBy' | 'button' | 'id' | 'place';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
  // Status options sit in one of three groups.
  group?: 'todo' | 'progress' | 'done';
}

export interface DateValue {
  // `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when it has a time.
  start: string;
  end?: string;
}

export type PropValue = string | number | boolean | string[] | DateValue | null;

export type RollupFn =
  | 'count' | 'countValues' | 'countUnique' | 'countEmpty' | 'countNotEmpty' | 'percentEmpty' | 'percentNotEmpty'
  | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'range' | 'showOriginal' | 'checked' | 'unchecked' | 'percentChecked'
  | 'earliest' | 'latest' | 'dateRange';

export interface Action {
  kind: 'setProp' | 'notify';
  // setProp: which property and the value to set. notify: a person id or `creator`, and the text.
  prop?: string;
  value?: PropValue;
  user?: string;
  text?: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
  // Number display: plain, commas, percent, usd, eur, gbp, inr.
  format?: string;
  relation?: { dbId: string; twoWay?: string };
  rollup?: { relation: string; prop: string; fn: RollupFn };
  formula?: string;
  button?: { label: string; actions: Action[] };
}

export type FilterOp =
  | 'is' | 'isNot' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty'
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter'
  | 'checked' | 'unchecked' | 'pastWeek' | 'pastMonth' | 'thisWeek' | 'nextWeek' | 'nextMonth';

export interface FilterRule { prop: string; op: FilterOp; value?: PropValue }
export interface FilterGroup { op: 'and' | 'or'; items: (FilterRule | FilterGroup)[] }
export interface SortRule { prop: string; dir: 'asc' | 'desc' }
export interface ColorRule { prop: string; op: FilterOp; value?: PropValue; color: string }

export type ViewLayout = 'table' | 'board' | 'list' | 'gallery' | 'calendar' | 'timeline' | 'chart' | 'feed';

export interface View {
  id: string;
  name: string;
  layout: ViewLayout;
  // Property ids shown, in order. The title is always shown.
  visible: string[];
  filter: FilterGroup;
  sorts: SortRule[];
  // Board columns / table groups.
  group?: string;
  // Calendar and timeline: the date property (and the end date property).
  dateProp?: string;
  endProp?: string;
  // Footer calculations in a table: property id -> function.
  calc: Record<string, string>;
  wrap?: boolean;
  cardSize?: 'small' | 'medium' | 'large';
  cardCover?: string;
  colors: ColorRule[];
  chart?: { kind: 'bar' | 'line' | 'donut'; x: string; y?: string; fn: 'count' | 'sum' | 'avg' };
}

export interface Row {
  id: string;
  props: Record<string, PropValue>;
  icon?: string;
  createdBy: string;
  createdAt: number;
  editedBy: string;
  editedAt: number;
  order: number;
  trashedAt?: number;
}

export interface RowTemplate { id: string; name: string; props: Record<string, PropValue>; blocks: Block[] }

export interface Automation {
  id: string;
  name: string;
  on: boolean;
  trigger: { kind: 'rowAdded' } | { kind: 'propChanged'; prop: string; to?: PropValue };
  actions: Action[];
}

export interface FormConfig {
  enabled: boolean;
  title: string;
  description: string;
  // Property ids asked for, in order, and which of them must be answered.
  fields: string[];
  required: string[];
  submitLabel: string;
}

export interface DbData {
  props: Property[];
  views: View[];
  rows: Row[];
  templates: RowTemplate[];
  automations: Automation[];
  form: FormConfig;
  locked: boolean;
}

export type SchemaOp =
  | { op: 'addProp'; prop: Partial<Property> & { type: PropType; name: string } }
  | { op: 'patchProp'; id: string; patch: Partial<Omit<Property, 'id'>> }
  | { op: 'removeProp'; id: string }
  | { op: 'moveProp'; id: string; after: string | null };

export type ViewOp =
  | { op: 'add'; view: Partial<View> & { layout: ViewLayout } }
  | { op: 'patch'; viewId: string; patch: Partial<Omit<View, 'id'>> }
  | { op: 'remove'; viewId: string }
  | { op: 'duplicate'; viewId: string };

// A comment is anchored to a block (or the whole page) and may have replies.
export interface PageComment {
  id: string;
  parent?: string;
  blockId?: string;
  by: string;
  at: number;
  text: string;
  resolved?: boolean;
}

// A proposed replacement for one block's text, from someone who can comment but not edit.
export interface Suggestion {
  id: string;
  blockId: string;
  by: string;
  at: number;
  // What the block said when the suggestion was made, and what it should say.
  was: string;
  text: Rich[];
}

export interface PageVersion { id: string; at: number; by: string; title: string }

export interface Teamspace {
  id: string;
  name: string;
  icon: string;
  description: string;
  // default: everyone. open: any member may join. closed: visible, join by request. private: members only.
  kind: 'default' | 'open' | 'closed' | 'private';
  // Member user id -> role in this teamspace.
  members: Record<string, 'owner' | 'member'>;
}

export interface Reminder { id: string; userId: string; pageId: string; at: number; text: string }

export interface Reminder { id: string; userId: string; pageId: string; at: number; text: string }

export interface InboxItem {
  id: string;
  kind: 'mention' | 'comment' | 'reply' | 'share' | 'assigned' | 'reminder' | 'notify' | 'request' | 'suggestion';
  pageId: string;
  by: string;
  at: number;
  text: string;
  read?: boolean;
  archived?: boolean;
}

export interface SearchHit {
  id: string;
  kind: 'page' | 'database' | 'row';
  title: string;
  icon: string;
  snippet: string;
  // The page or database it lives in, for rows.
  parentId: string | null;
  editedAt: number;
  score: number;
}

export interface Page {
  id: string;
  parentId: string | null;
  // Only on top-level pages. null = Private (its creator only); 'general' = the default teamspace.
  teamspaceId: string | null;
  title: string;
  icon: string;
  cover: string;
  font: 'default' | 'serif' | 'mono';
  smallText: boolean;
  fullWidth: boolean;
  locked: boolean;
  // Position among siblings (fractional so a move rewrites one number).
  order: number;
  createdBy: string;
  createdAt: number;
  editedBy: string;
  editedAt: number;
  trashedAt?: number;
  access: { entries: PageShare[]; restricted?: boolean };
  // A database is a page too. Its rows are kept in its body, not in the tree.
  kind?: 'page' | 'database';
  // Where a page was made from, e.g. `canvas:<channelId>`, so a migration is not done twice.
  source?: string;
  // Read-only public link.
  publish?: { token: string; at: number; duplicate: boolean };
  verified?: { by: string; until: number };
}

// What the page tree needs: no body, no access list.
export interface PageNode {
  id: string;
  parentId: string | null;
  teamspaceId: string | null;
  title: string;
  icon: string;
  order: number;
  createdBy: string;
  editedAt: number;
  // This person's level on the page.
  level: PageLevel;
  // The page itself is in the trash (its children are hidden with it).
  trashed?: boolean;
  kind?: 'page' | 'database';
  source?: string;
  published?: boolean;
}

export type PageMeta = Omit<Page, 'access'>;

export type ClientEvent =
  | { t: 'auth'; token: string; invite?: string; workspace?: string }
  | { t: 'createWorkspace'; name: string }
  | { t: 'renameWorkspace'; name: string }
  | { t: 'star'; channelId: string }
  | { t: 'inviteCreate' }
  | { t: 'inviteRevoke'; code: string }
  | { t: 'send'; channelId: string; text: string; threadId?: string; files?: FileAttachment[] }
  | { t: 'edit'; id: string; text: string }
  | { t: 'delete'; id: string }
  | { t: 'react'; id: string; emoji: string }
  | { t: 'pin'; id: string }
  | { t: 'save'; id: string }
  | { t: 'createChannel'; name: string; kind: 'public' | 'private'; topic: string }
  | { t: 'join'; channelId: string }
  | { t: 'leave'; channelId: string }
  | { t: 'openDM'; userId: string }
  | { t: 'typing'; channelId: string }
  | { t: 'profile'; name?: string; title?: string; status?: UserStatus }
  | { t: 'canvas'; channelId: string; content: string }
  | { t: 'workflows'; list: Workflow[] }
  | { t: 'schedule'; channelId: string; text: string; at: number }
  | { t: 'unschedule'; id: string }
  | { t: 'huddle'; channelId: string; action: 'join' | 'leave' }
  | { t: 'rtc'; to: string; signal: RtcSignal }
  // One change to one item, so two people editing a list don't overwrite each other.
  | { t: 'listItem'; channelId: string; id: string; patch?: Partial<Pick<ListItem, 'title' | 'status' | 'assignee' | 'due'>>; remove?: boolean }
  | { t: 'sections'; sections: Section[] }
  | { t: 'groups'; groups: UserGroup[] }
  | { t: 'flag'; id: string; reason: string }
  | { t: 'resolveFlag'; id: string; removeMessage: boolean }
  | { t: 'role'; userId: string; role: Role }
  | { t: 'channelPolicy'; channelId: string; postingPolicy: 'everyone' | 'admins' }
  | { t: 'addMember'; channelId: string; userId: string }
  | { t: 'settings'; settings: Partial<Omit<Settings, 'termsVersion'>> }
  | { t: 'legalHold'; userId: string; on: boolean }
  | { t: 'acceptTerms' }
  | { t: 'leaveWorkspace' }
  | { t: 'removeMember'; userId: string }
  | { t: 'restoreMember'; userId: string }
  // Anonymizes this person's messages and erases their personal data in this workspace.
  | { t: 'deleteMyAccount' }
  | { t: 'history'; channelId: string; before: HistoryCursor }
  | { t: 'markRead'; channelId: string }
  | { t: 'setLevel'; channelId: string; level: ChannelLevel }
  | { t: 'setDnd'; until: number }
  | { t: 'setEmail'; on: boolean }
  // One-time upload of what this browser kept before prefs lived on the server.
  | { t: 'importPrefs'; lastRead?: Record<string, number>; levels?: Record<string, string>; dndUntil?: number }
  | { t: 'fileSummary'; id: string; index: number }
  | { t: 'analytics' }
  | { t: 'export' }
  | { t: 'pageCreate'; parentId: string | null; shared?: boolean; teamspaceId?: string; title?: string; icon?: string; template?: string; source?: string }
  | { t: 'dbCreate'; parentId: string | null; shared?: boolean; teamspaceId?: string; title?: string; icon?: string; preset?: string; layout?: ViewLayout; source?: string; props?: Partial<Property>[]; rows?: Record<string, PropValue>[] }
  | { t: 'dbGet'; id: string }
  | { t: 'dbClose'; id: string }
  | { t: 'dbSchema'; id: string; ops: SchemaOp[] }
  | { t: 'dbView'; id: string; op: ViewOp }
  | { t: 'rowCreate'; id: string; props?: Record<string, PropValue>; template?: string; after?: string | null }
  | { t: 'rowUpdate'; id: string; rowId: string; props?: Record<string, PropValue>; icon?: string }
  | { t: 'rowRemove'; id: string; rowId: string; restore?: boolean }
  | { t: 'rowMove'; id: string; rowId: string; after: string | null }
  | { t: 'dbTemplate'; id: string; op: { op: 'set'; template: { id?: string; name: string; props: Record<string, PropValue>; blocks?: Block[] } } | { op: 'remove'; templateId: string } }
  | { t: 'dbAutomation'; id: string; op: { op: 'set'; automation: Omit<Automation, 'id'> & { id?: string } } | { op: 'remove'; automationId: string } }
  | { t: 'dbForm'; id: string; patch: Partial<FormConfig> }
  | { t: 'dbLock'; id: string; locked: boolean }
  | { t: 'formSubmit'; id: string; values: Record<string, PropValue> }
  | { t: 'rowButton'; id: string; rowId: string; prop: string }
  | { t: 'pageAccess'; id: string }
  | { t: 'pageShare'; id: string; entries: PageShare[]; restricted: boolean }
  | { t: 'comment'; id: string; text: string; blockId?: string; parent?: string }
  | { t: 'commentResolve'; id: string; commentId: string; on: boolean }
  | { t: 'commentDelete'; id: string; commentId: string }
  | { t: 'suggest'; id: string; blockId: string; text: Rich[] }
  | { t: 'suggestResolve'; id: string; suggestionId: string; accept: boolean }
  | { t: 'pageRequestAccess'; id: string }
  | { t: 'pageHistory'; id: string; versionId?: string }
  | { t: 'pageRestoreVersion'; id: string; versionId: string }
  | { t: 'pageVerify'; id: string; days: number }
  | { t: 'pagePublish'; id: string; on: boolean; duplicate?: boolean }
  | { t: 'teamspace'; op: 'create' | 'update' | 'delete' | 'join' | 'leave' | 'setMember' | 'removeMember'; id?: string; name?: string; icon?: string; description?: string; kind?: Teamspace['kind']; userId?: string; role?: 'owner' | 'member' }
  | { t: 'search'; q: string }
  | { t: 'inboxRead'; id: string }
  | { t: 'inboxArchive'; id: string }
  | { t: 'calendarFeed' }
  | { t: 'pageUpdate'; id: string; patch: Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'font' | 'smallText' | 'fullWidth' | 'locked'>> }
  | { t: 'pageMove'; id: string; parentId: string | null; shared?: boolean; teamspaceId?: string; after: string | null }
  | { t: 'pageTrash'; id: string }
  | { t: 'pageRestore'; id: string }
  | { t: 'pageDelete'; id: string }
  | { t: 'pageDuplicate'; id: string }
  | { t: 'pageFavorite'; id: string; on: boolean }
  | { t: 'pageGet'; id: string }
  | { t: 'pageClose'; id: string }
  | { t: 'blockOps'; id: string; ops: BlockOp[] }
  | { t: 'pagePresence'; id: string; cursor: string | null };

export type ServerEvent =
  | { t: 'init'; snapshot: Snapshot }
  | { t: 'user'; user: User }
  | { t: 'presence'; online: string[] }
  | { t: 'channel'; channel: Channel }
  | { t: 'message'; message: Message }
  | { t: 'messageDeleted'; id: string }
  | { t: 'canvas'; channelId: string; content: string }
  | { t: 'workflows'; list: Workflow[] }
  | { t: 'scheduled'; list: Scheduled[] }
  | { t: 'typing'; channelId: string; userId: string }
  | { t: 'huddles'; huddles: HuddleState[] }
  // Sent to each tab in a huddle when its membership changes; channelId null means this tab is out.
  | { t: 'huddleCall'; channelId: string | null; self: string; peers: HuddlePeer[] }
  | { t: 'rtc'; from: string; signal: RtcSignal }
  | { t: 'saved'; saved: string[] }
  | { t: 'lists'; channelId: string; items: ListItem[] }
  | { t: 'sections'; sections: Section[] }
  | { t: 'groups'; groups: UserGroup[] }
  | { t: 'settings'; settings: Settings }
  | { t: 'termsAccepted'; version: number }
  | { t: 'prefs'; prefs: UserPrefs }
  // `cursor` is where to continue, or null when this page reached the start of the channel.
  | { t: 'history'; channelId: string; messages: Message[]; cursor: HistoryCursor | null }
  | { t: 'admin'; admin: AdminData }
  | { t: 'analytics'; data: Analytics }
  | { t: 'export'; data: unknown }
  | { t: 'workspaces'; mine: WorkspaceSummary[]; discover: WorkspaceSummary[] }
  | { t: 'workspaceCreated'; id: string }
  | { t: 'workspace'; workspace: Snapshot['workspace'] }
  | { t: 'starred'; list: string[] }
  | { t: 'pageNodes'; nodes: PageNode[]; gone: string[] }
  | { t: 'pageCreated'; id: string }
  | { t: 'pageBody'; id: string; page: PageMeta; level: PageLevel; blocks: Block[]; version: number; comments: PageComment[]; suggestions: Suggestion[] }
  | { t: 'pageMeta'; page: PageMeta }
  | { t: 'blockOps'; id: string; ops: BlockOp[]; version: number; by: string; ack?: boolean }
  | { t: 'blockConflict'; id: string; block: Block }
  | { t: 'pagePresence'; id: string; userId: string; cursor: string | null }
  | { t: 'pageRevoked'; id: string }
  | { t: 'pageFavorites'; list: string[] }
  | { t: 'dbData'; id: string; page: PageMeta; level: PageLevel; db: DbData; version: number }
  | { t: 'dbDelta'; id: string; delta: DbDelta; by: string }
  | { t: 'comments'; id: string; comments: PageComment[] }
  | { t: 'suggestions'; id: string; suggestions: Suggestion[] }
  | { t: 'pageAccess'; id: string; access: Page['access'] }
  | { t: 'pageHistory'; id: string; versions: PageVersion[]; preview?: { id: string; blocks: Block[] } }
  | { t: 'teamspaces'; list: Teamspace[] }
  | { t: 'inbox'; items: InboxItem[] }
  | { t: 'searchResults'; q: string; hits: SearchHit[] }
  | { t: 'calendarFeed'; items: CalendarItem[] }
  | { t: 'error'; message: string; code?: 'auth-required' | 'invite-required' | 'no-workspace' | 'removed' };

export interface Analytics {
  totalMessages: number;
  activeUsers7d: number;
  messagesByDay: { day: string; count: number }[];
  topChannels: { channelId: string; name: string; count: number }[];
  topPosters: { userId: string; name: string; count: number }[];
  filesShared: number;
  reactions: number;
}
