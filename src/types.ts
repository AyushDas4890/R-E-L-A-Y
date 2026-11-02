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
}

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
  | { t: 'export' };

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
