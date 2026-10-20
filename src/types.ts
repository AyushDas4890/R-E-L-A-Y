export interface UserStatus {
  emoji: string;
  text: string;
}

export interface User {
  id: string;
  name: string;
  color: string;
  title: string;
  status: UserStatus;
  bot?: boolean;
}

export type ChannelKind = 'public' | 'private' | 'dm';

export interface Channel {
  id: string;
  name: string;
  topic: string;
  kind: ChannelKind;
  members: string[];
  createdAt: number;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
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
  system?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: 'keyword'; keyword: string; channelId: string | 'any' } | { type: 'join'; channelId: string };
  reply: string;
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
] as const;

export interface Snapshot {
  me: string;
  workspace: { name: string; plan: string };
  users: Record<string, User>;
  online: string[];
  channels: Record<string, Channel>;
  messages: Message[];
  canvases: Record<string, string>;
  workflows: Workflow[];
  scheduled: Scheduled[];
  huddles: HuddleState[];
  saved: string[];
}

export type ClientEvent =
  | { t: 'hello'; userId: string; name: string }
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
  | { t: 'huddle'; channelId: string; action: 'join' | 'leave' };

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
  | { t: 'saved'; saved: string[] }
  | { t: 'error'; message: string };
