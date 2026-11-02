// The Relay help center. Plain data, so the articles can be searched and tested without the UI.
// Every claim here describes what the app does today; keep it in step when behavior changes.

export type Block =
  | { p: string }
  | { h: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string };

export interface Article {
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: Block[];
  // Extra words people might search for that the text doesn't use.
  keywords?: string;
}

export const CATEGORIES: { id: string; label: string; blurb: string }[] = [
  { id: 'start', label: 'Get started', blurb: 'Sign in, join or create a workspace.' },
  { id: 'messaging', label: 'Messaging', blurb: 'Channels, DMs, threads, files and formatting.' },
  { id: 'tools', label: 'Tools', blurb: 'Huddles, canvases, lists, workflows and search.' },
  { id: 'notify', label: 'Notifications', blurb: 'Stay informed without the noise.' },
  { id: 'admin', label: 'For admins', blurb: 'Roles, invites, removal and compliance.' },
  { id: 'data', label: 'You and your data', blurb: 'Leave, delete, and what others can see.' },
  { id: 'help', label: 'Troubleshooting', blurb: 'When something does not look right.' },
];

export const ARTICLES: Article[] = [
  {
    slug: 'sign-in',
    title: 'Sign in and join a workspace',
    category: 'start',
    summary: 'Use your Google or GitHub account. There is no separate password.',
    keywords: 'login account oauth google github invite code',
    body: [
      { p: 'Choose Continue with Google or Continue with GitHub on the sign-in page. Relay never sees your password; it receives your name, email address and profile picture from the provider.' },
      { h: 'Which workspace you land in' },
      { ul: [
        'If you already belong to a workspace, Relay opens the last one you used on this browser.',
        'Relay HQ is open: anyone who signs in joins it.',
        'New workspaces are invite-only. Paste the invite code on the sign-in page, or open the invite link you were sent.',
      ] },
      { note: 'The first person to sign in to a brand-new workspace becomes its owner.' },
    ],
  },
  {
    slug: 'create-workspace',
    title: 'Create a workspace and invite people',
    category: 'start',
    summary: 'Start your own space in a few seconds and bring your team in.',
    keywords: 'new workspace invite link owner',
    body: [
      { ol: [
        'Open the workspace name at the top of the sidebar and choose Create a new workspace.',
        'Give it a name. You become its owner. You can own up to 20.',
        'Choose Invite people to share a link. Each link carries a code that can be revoked later.',
      ] },
      { p: 'New workspaces start invite-only. Admins can open sign-up to anyone who signs in from the Admin console under Policies.' },
      { p: 'Switch between your workspaces from the same menu, or from the tiles on the far left.' },
    ],
  },
  {
    slug: 'channels',
    title: 'Channels: public and private',
    category: 'messaging',
    summary: 'Channels keep a topic in one place.',
    keywords: 'channel browse join private public topic star',
    body: [
      { p: 'Public channels can be found and joined by everyone in the workspace. Posting in a public channel joins it automatically. Private channels are visible only to their members, and any member can add other people.' },
      { ul: [
        'Create one with Add channels in the sidebar. Names are lowercase letters, numbers, dashes and underscores.',
        'Star a channel from its header to pin it to the top of your sidebar.',
        'Admins can make a channel admins-only for posting. People can still read it and react.',
        'Guests only see the channels they have been added to.',
      ] },
    ],
  },
  {
    slug: 'direct-messages',
    title: 'Direct messages',
    category: 'messaging',
    summary: 'Talk privately with one person.',
    keywords: 'dm private chat',
    body: [
      { p: 'Pick a name under Direct messages, or choose a person in People, to open a conversation. Only the two of you can see it in Relay.' },
      { p: 'If an information barrier separates you from someone, Relay does not let you message or huddle with them. If someone has left the workspace you can still read the old conversation but cannot send to them.' },
      { note: 'Workspace admins can export all workspace data, which includes direct messages. See What admins can see.' },
    ],
  },
  {
    slug: 'threads',
    title: 'Threads',
    category: 'messaging',
    summary: 'Reply to one message without crowding the channel.',
    body: [
      { p: 'Hover over a message and choose Reply in thread (the speech bubble). Replies open in a panel on the right and show a reply count under the original message.' },
      { p: 'You are notified about replies in threads you started, and about mentions in any thread you can see.' },
    ],
  },
  {
    slug: 'formatting',
    title: 'Formatting, mentions and slash commands',
    category: 'messaging',
    summary: 'Bold, code, quotes, @mentions and shortcuts that start with a slash.',
    keywords: 'markdown bold italic code mention @ slash command remind topic shrug',
    body: [
      { h: 'Formatting' },
      { ul: [
        '`**bold**`, `_italic_`, `~~strikethrough~~` and `` `code` ``.',
        'Three backticks open a code block. A line that starts with `>` is a quote.',
        'Type @ and pick a person, or a user group, to mention them.',
      ] },
      { h: 'Slash commands' },
      { ul: [
        '`/remind me <what> in <10m | 2h | 1d>` sets a reminder that arrives as a message from Relay Bot.',
        '`/topic <text>` changes the channel topic.',
        '`/huddle` starts a huddle in the channel.',
        '`/summarize` recaps the channel or thread. `/recap` sends you a recap of the last day.',
        '`/explain <term>` looks for what your workspace has said about a term.',
        '`/me <text>` and `/shrug` post as you.',
      ] },
    ],
  },
  {
    slug: 'files',
    title: 'Files, links and previews',
    category: 'messaging',
    summary: 'Share up to five files per message, and see link previews.',
    keywords: 'upload attachment image video audio clip',
    body: [
      { ul: [
        'Attach files with the plus button, or record an audio or screen clip from the composer.',
        'Each file can be up to 10 MB, and a message can carry up to five.',
        'The first link in a message gets a preview card with its title and image when the site provides one.',
        'On a text file, choose Summarize to get a short summary posted in a thread.',
      ] },
    ],
  },
  {
    slug: 'edit-delete',
    title: 'Edit, delete, pin and save',
    category: 'messaging',
    summary: 'Fix a typo, remove a message, pin what matters, save it for later.',
    keywords: 'edit delete pin save later flag report',
    body: [
      { ul: [
        'You can edit your own messages while you are still allowed to post in that channel. Edited messages are marked (edited).',
        'You can delete your own messages. Admins can delete anyone\'s, and the deletion is recorded in the audit log.',
        'Pin a message to mark it and list it in the channel details. Only members of the channel can pin or unpin.',
        'Save a message (Save for later) to find it under Later. Saved items are private to you.',
        'Flag for admin review tells admins about a message, with a short reason.',
      ] },
    ],
  },
  {
    slug: 'huddles',
    title: 'Huddles: voice and screen sharing',
    category: 'tools',
    summary: 'Talk and share your screen straight from a channel or DM.',
    keywords: 'call audio voice video screen share webrtc microphone mute turn',
    body: [
      { p: 'Choose Huddle in a channel or DM, or type `/huddle`. Audio and screens travel directly between browsers, so a huddle works best with a handful of people: up to 6 can be in one at a time.' },
      { ul: [
        'Allow the microphone when your browser asks.',
        'Mute yourself, and share your screen, from the huddle bar.',
        'If you open Relay in a second tab, joining from there moves you to that tab so you never hear yourself.',
        'When a huddle of at least 30 seconds ends, Relay Bot posts a short note with who joined.',
      ] },
      { note: 'Behind some strict networks the direct connection can fail. Relay falls back to a public relay server and retries automatically.' },
    ],
  },
  {
    slug: 'canvases',
    title: 'Canvases',
    category: 'tools',
    summary: 'A shared document that lives in a channel.',
    keywords: 'canvas document notes wiki edit',
    body: [
      { p: 'Open the Canvas tab in a channel to write a document everyone in that channel can read and edit. It supports headings, lists and the same formatting as messages.' },
      { ul: [
        'Only members of the channel can edit its canvas. If you are not a member, join the channel first.',
        'Changes save as you type and appear for everyone live.',
        'Two people editing the same canvas at once overwrite each other\'s latest keystrokes, so agree who is writing.',
      ] },
    ],
  },
  {
    slug: 'lists',
    title: 'Lists',
    category: 'tools',
    summary: 'A small task board for each channel.',
    keywords: 'list tasks todo kanban assignee due',
    body: [
      { p: 'Open the List tab to track tasks as To do, In progress or Done, with an assignee and a due date.' },
      { ul: [
        'Add a task with the box at the top. Change its status with the checkbox or the dropdown.',
        'Only members of the channel can change the list.',
        'Each change affects one task, so two people working on different tasks never overwrite each other.',
      ] },
    ],
  },
  {
    slug: 'workflows',
    title: 'Workflows',
    category: 'tools',
    summary: 'Teach Relay Bot to reply on its own.',
    keywords: 'automation bot trigger keyword schedule join template branch',
    body: [
      { p: 'A workflow is a trigger and a reply. Open Workflows from the More menu in the left rail, build one, and press Publish.' },
      { ul: [
        'Keyword: the bot replies when a message contains a word, in one channel or in any channel.',
        'Join: the bot posts when someone joins a channel.',
        'Schedule: the bot posts at a set time each day, optionally weekdays only.',
        'Branch: add a condition and a second reply for messages that also contain another word.',
      ] },
      { h: 'Who can change a workflow' },
      { p: 'A workflow belongs to the person who published it. Only they, or an admin, can edit or delete it. If you publish a list that includes other people\'s workflows, theirs are left unchanged. The starter workflows that come with a workspace can be changed by admins only.' },
    ],
  },
  {
    slug: 'search',
    title: 'Search',
    category: 'tools',
    summary: 'Find messages, channels and people from anywhere.',
    keywords: 'find ctrl k command k palette question answer',
    body: [
      { p: 'Press Ctrl+K (Cmd+K on a Mac), or click the bar at the top. Type to find channels and messages. End your query with a question mark to get a short answer drawn from messages Relay has loaded.' },
      { note: 'Search looks at messages loaded in your browser, which starts with the newest 50 in each channel. Scroll a channel up to load older messages, and they become searchable too.' },
    ],
  },
  {
    slug: 'reminders',
    title: 'Reminders and scheduled messages',
    category: 'tools',
    summary: 'Have Relay nudge you, or send a message later.',
    keywords: 'remind schedule later send',
    body: [
      { ul: [
        '`/remind me stretch in 10m` sends you a message from Relay Bot in 10 minutes.',
        'Choose Schedule in the composer to send your message later: in 1 minute, 30 minutes, 1 hour, 3 hours or tomorrow.',
        'See and cancel what is pending under Scheduled messages in the More menu. You can have up to 100.',
        'A scheduled message is checked again when it is due. If you have lost access to the channel by then, it is not sent.',
      ] },
    ],
  },
  {
    slug: 'notification-levels',
    title: 'Notification levels and Do Not Disturb',
    category: 'notify',
    summary: 'Choose what is worth a ping. Your choices follow you to every device.',
    keywords: 'mute dnd pause snooze alerts desktop unread',
    body: [
      { h: 'Per channel' },
      { ul: [
        'All new posts: a desktop alert for every message.',
        'Just mentions (the default): DMs, mentions of you or your groups, and replies in threads you started.',
        'Mute: no alerts, and the channel is dimmed in your sidebar.',
      ] },
      { h: 'Do Not Disturb' },
      { p: 'Choose the bell at the top right and pause notifications for 30 minutes, 1 hour, 4 hours or until tomorrow at 9:00. A moon appears on your avatar while it is on.' },
      { h: 'Saved on the server' },
      { p: 'Your unread position, channel levels and Do Not Disturb are stored in your account for that workspace. Sign in on another browser or device and they are already there, and changes show up on your other tabs within a moment.' },
    ],
  },
  {
    slug: 'email-notifications',
    title: 'Email notifications',
    category: 'notify',
    summary: 'Hear about mentions and DMs when you are away.',
    keywords: 'email offline away mention digest unsubscribe',
    body: [
      { p: 'If you are not connected to Relay, you can get an email when someone mentions you or sends you a direct message.' },
      { ul: [
        'Messages are batched: the first one starts a 2-minute wait and everything in that window arrives as one email.',
        'You will not be emailed again for 15 minutes after one is sent.',
        'No email is sent if you came back, read the message, muted the channel or have Do Not Disturb on.',
        'You are never emailed about a channel you cannot see.',
        'Turn it off in Profile & preferences by clearing Email me about mentions and DMs when I\'m away.',
      ] },
      { note: 'Email is only sent if the person running your Relay server has set up an email provider. If you never receive any, ask your workspace owner.' },
    ],
  },
  {
    slug: 'other-devices',
    title: 'Using Relay on more than one device',
    category: 'notify',
    summary: 'Pick up where you left off on your phone, laptop or another browser.',
    keywords: 'phone mobile sync tablet browser',
    body: [
      { p: 'Sign in with the same Google or GitHub account anywhere. Your channels, saved items, sidebar sections, stars, reminders, unread position, channel notification levels and Do Not Disturb come with you.' },
      { p: 'Things that belong to the screen stay on that device: theme, accent colour and background.' },
    ],
  },
  {
    slug: 'roles',
    title: 'Roles and permissions',
    category: 'admin',
    summary: 'Who can do what.',
    keywords: 'owner admin member guest permissions role',
    body: [
      { ul: [
        'Owner: everything an admin can do, plus granting or removing admin and owner roles. A workspace always keeps at least one owner.',
        'Admin: settings, invites, groups, removing members and guests, analytics, exports, legal holds, flagged messages and renaming the workspace.',
        'Member: read and post in channels they can see, create channels, use every tool.',
        'Guest: only the channels they have been added to. Only admins can add guests to channels.',
      ] },
      { p: 'The server checks every action against these rules. Hiding a button in the app is never the only protection.' },
      { p: 'Email addresses are visible to admins and to the person themselves, not to other members.' },
    ],
  },
  {
    slug: 'invites',
    title: 'Invites and open sign-up',
    category: 'admin',
    summary: 'Decide who can join.',
    keywords: 'invite code link open invite-only',
    body: [
      { ul: [
        'Invite-only: new people need a valid code. This is the default for new workspaces.',
        'Open: anyone who signs in can join. Relay HQ works this way.',
        'Create and revoke codes in the Admin console under Invites. Revoking a code stops it working for new people; it does not remove anyone already inside.',
      ] },
    ],
  },
  {
    slug: 'removing-people',
    title: 'Removing people',
    category: 'admin',
    summary: 'Cut someone off at once, and let them back in later if you choose.',
    keywords: 'remove kick ban restore',
    body: [
      { p: 'In the Admin console, open Members and choose Remove next to a person.' },
      { ul: [
        'They are signed out of the workspace on every device immediately.',
        'They cannot rejoin, even through an open workspace or an invite code, until you choose Allow back in.',
        'Their old messages stay, under their name. Direct messages are kept for the other person.',
        'Only an owner can remove an admin or another owner. Nobody can remove themselves this way; they use Leave workspace.',
        'Every removal and restore is written to the audit log.',
      ] },
    ],
  },
  {
    slug: 'groups-barriers',
    title: 'User groups and information barriers',
    category: 'admin',
    summary: 'Mention a team in one go, and keep two groups apart.',
    keywords: 'group handle barrier compliance separation',
    body: [
      { p: 'Create groups in the Admin console. Mention a whole group with its @handle.' },
      { p: 'Under Policies you can pair two groups as an information barrier. People in one group cannot send direct messages to, or huddle with, people in the other.' },
    ],
  },
  {
    slug: 'retention-export',
    title: 'Retention, legal hold and exports',
    category: 'admin',
    summary: 'Keep what you must, delete what you should, take a copy.',
    keywords: 'retention legal hold export audit log compliance flagged',
    body: [
      { ul: [
        'Retention: choose how many days to keep messages. Older ones are deleted. Messages from people under legal hold are never deleted by retention.',
        'Legal hold: while on, edited and deleted messages from that person are preserved and included in exports. A person under legal hold cannot delete their account.',
        'Export: Export all data downloads the workspace as one file. Each export is logged.',
        'Audit log: privileged actions are recorded with who did them and when. Find it in the Admin console.',
        'Flagged messages: review and dismiss, or remove, messages people have reported.',
      ] },
    ],
  },
  {
    slug: 'leave-workspace',
    title: 'Leave a workspace',
    category: 'data',
    summary: 'Step away without losing the history.',
    keywords: 'leave exit quit',
    body: [
      { p: 'Open the workspace name and choose Leave workspace.' },
      { ul: [
        'You are removed from the channels you were in, and your sessions on every device end.',
        'Your messages stay in the workspace under your name.',
        'If the workspace is open, or you have an invite, you can rejoin later and start fresh.',
        'If you are the only owner, make someone else an owner first.',
      ] },
    ],
  },
  {
    slug: 'delete-account',
    title: 'Delete your account',
    category: 'data',
    summary: 'Erase your personal data from a workspace.',
    keywords: 'delete erase remove data gdpr anonymize',
    body: [
      { p: 'Open the workspace name and choose Delete my account. This cannot be undone.' },
      { h: 'What happens' },
      { ul: [
        'Your messages stay in the conversation, now credited to Deleted user, so threads still make sense.',
        'Your reactions, saved items, sidebar sections, stars, reminders, notification settings and read position are erased.',
        'You are removed from channels and user groups.',
        'The audit log keeps a record that the account was deleted, because that log exists to be a complete history.',
      ] },
      { h: 'What it does not do' },
      { ul: [
        'It affects one workspace. To leave others, delete in each.',
        'It does not delete your Google or GitHub account.',
        'Mentions of your name inside other people\'s messages are not rewritten.',
        'It is refused while you are under legal hold, or if you are the only owner.',
      ] },
    ],
  },
  {
    slug: 'what-admins-see',
    title: 'What admins can see',
    category: 'data',
    summary: 'Plain answers about privacy.',
    keywords: 'privacy private dm export admin visibility email',
    body: [
      { ul: [
        'Other members cannot read your direct messages, or private channels you are not in.',
        'Your email address is visible to admins and to you, and to no other member.',
        'Admins can export the whole workspace. That file includes private channels and direct messages. Treat admin access accordingly.',
        'Admins can see who flagged what, the audit log, and which messages are under legal hold.',
        'Admins cannot read your saved items, reminders or notification settings.',
      ] },
    ],
  },
  {
    slug: 'slow-start',
    title: 'Relay is slow to open or says it is connecting',
    category: 'help',
    summary: 'The server sleeps when nobody uses it.',
    keywords: 'slow connecting loading wake sleep offline',
    body: [
      { p: 'On a free host the Relay server goes to sleep after about 15 idle minutes. The first visit can take up to a minute while it wakes. The page keeps retrying on its own; you do not need to refresh.' },
      { p: 'If it still does not connect after two minutes, check your internet connection and try again.' },
    ],
  },
  {
    slug: 'no-alerts',
    title: 'I am not getting alerts',
    category: 'help',
    summary: 'A short checklist.',
    keywords: 'notifications desktop alerts not working permission',
    body: [
      { ol: [
        'Allow notifications for the site when your browser asks, or in the browser\'s site settings.',
        'Check the bell at the top right: if a moon is on your avatar, Do Not Disturb is on.',
        'Check the channel\'s level. Muted channels never alert.',
        'Desktop alerts need Relay open in a tab. When it is closed, email notifications cover mentions and DMs if your server has them set up.',
      ] },
    ],
  },
  {
    slug: 'cannot-edit',
    title: 'I cannot post, edit or change something',
    category: 'help',
    summary: 'The usual reasons.',
    keywords: 'permission denied cannot post edit canvas list pin read-only',
    body: [
      { ul: [
        'Join the channel. Canvases, lists and pins can only be changed by its members.',
        'The channel may be admins-only for posting. That also blocks editing your older messages there.',
        'An information barrier may separate you from the person you are messaging.',
        'You may be a guest, who can use only the channels they were added to.',
        'A workflow you did not publish can be changed only by its creator or an admin.',
      ] },
    ],
  },
];

export const articleBySlug = (slug: string): Article | undefined => ARTICLES.find((a) => a.slug === slug);

// Text of one block, for searching.
const blockText = (b: Block): string => ('p' in b ? b.p : 'h' in b ? b.h : 'note' in b ? b.note : 'ul' in b ? b.ul.join(' ') : b.ol.join(' '));

// Words in the title count most, then the summary and keywords, then the body. Every word typed has
// to appear somewhere in the article, so adding words narrows the results.
export function searchArticles(query: string, articles: Article[] = ARTICLES): Article[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (words.length === 0) return [];
  const scored: { a: Article; score: number; i: number }[] = [];
  articles.forEach((a, i) => {
    const title = a.title.toLowerCase();
    const near = `${a.summary} ${a.keywords ?? ''}`.toLowerCase();
    const body = a.body.map(blockText).join(' ').toLowerCase();
    let score = 0;
    for (const w of words) {
      const s = (title.includes(w) ? 6 : 0) + (near.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0);
      if (s === 0) return;
      score += s;
    }
    scored.push({ a, score, i });
  });
  return scored.sort((x, y) => y.score - x.score || x.i - y.i).map((s) => s.a);
}
