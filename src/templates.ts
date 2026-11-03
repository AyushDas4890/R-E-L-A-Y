// Starting points for new pages. Pure data, shared by the server (which builds the blocks) and the
// template gallery in the browser (which lists them).
import type { Block, BlockType } from './types.ts';

export interface TemplateInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'Work' | 'Team' | 'Docs' | 'Personal';
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'meeting-notes', name: 'Meeting notes', icon: '📝', description: 'Agenda, notes and action items for one meeting.', category: 'Work' },
  { id: 'project-plan', name: 'Project plan', icon: '🧭', description: 'Goal, milestones, risks and links for a project.', category: 'Work' },
  { id: 'weekly-agenda', name: 'Weekly agenda', icon: '📅', description: 'Priorities and a checklist for each day of the week.', category: 'Work' },
  { id: 'decision-log', name: 'Decision record', icon: '⚖️', description: 'Context, options and the decision, so it is easy to find later.', category: 'Work' },
  { id: 'one-on-one', name: '1:1 notes', icon: '🤝', description: 'A running page for one-on-one conversations.', category: 'Team' },
  { id: 'retro', name: 'Retrospective', icon: '🔁', description: 'What went well, what to improve and what to do next.', category: 'Team' },
  { id: 'onboarding', name: 'Onboarding checklist', icon: '🚀', description: 'A first-week checklist for a new teammate.', category: 'Team' },
  { id: 'brainstorm', name: 'Brainstorm', icon: '💡', description: 'A space to collect ideas and pick the best ones.', category: 'Team' },
  { id: 'doc', name: 'Document', icon: '📄', description: 'Overview, details and next steps.', category: 'Docs' },
  { id: 'wiki-home', name: 'Wiki home', icon: '📚', description: 'A home page for team docs with a contents list.', category: 'Docs' },
  { id: 'readme', name: 'How we work', icon: '🧰', description: 'Team norms, tools and contacts.', category: 'Docs' },
  { id: 'journal', name: 'Daily journal', icon: '📓', description: 'Gratitude, plan and reflection.', category: 'Personal' },
];

export interface BuiltTemplate { title: string; icon: string; blocks: Block[] }

export function templateFor(id: string, newId: () => string): BuiltTemplate | null {
  const info = TEMPLATES.find((t) => t.id === id);
  if (!info) return null;
  const b = (type: BlockType, text = '', extra: Partial<Block> = {}): Block => ({ id: newId(), type, text: text ? [{ t: text }] : [], children: [], rev: 1, ...extra });
  const h = (t: string) => b('h2', t);
  const todo = (t: string) => b('todo', t, { checked: false });
  const make = (title: string, blocks: Block[]): BuiltTemplate => ({ title, icon: info.icon, blocks });
  switch (id) {
    case 'meeting-notes':
      return make('Meeting notes', [b('text', 'Date and time: '), h('Attendees'), b('bullet'), h('Agenda'), b('number'), h('Notes'), b('text'), h('Action items'), todo('')]);
    case 'project-plan':
      return make('Project plan', [
        b('callout', 'Goal: say in one sentence what this project is for.', { icon: '🎯' }), h('Overview'), b('text'), h('Milestones'), todo('Kick-off'), todo('First draft'), todo('Launch'),
        h('Risks'), b('bullet'), h('Links'), b('bullet'),
      ]);
    case 'weekly-agenda':
      return make('Weekly agenda', [h('Top priorities'), todo(''), ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].flatMap((d) => [b('h3', d), todo('')])]);
    case 'decision-log':
      return make('Decision', [h('Context'), b('text'), h('Options'), b('bullet'), h('Decision'), b('callout', 'Write the decision here.', { icon: '✅' }), h('Consequences'), b('bullet')]);
    case 'one-on-one':
      return make('1:1', [h('Topics'), b('bullet'), h('Feedback'), b('text'), h('Goals'), todo(''), h('Follow-ups'), todo('')]);
    case 'retro':
      return make('Retrospective', [h('What went well'), b('bullet'), h('What could be better'), b('bullet'), h('Action items'), todo('')]);
    case 'onboarding':
      return make('Onboarding', [
        b('callout', 'Welcome! Work through this list in your first week.', { icon: '👋' }), h('Day one'), todo('Set up your accounts'), todo('Meet your team'), h('First week'),
        todo('Read the team docs'), todo('Pick up a first task'), todo('Set up a 1:1 with your manager'),
      ]);
    case 'brainstorm':
      return make('Brainstorm', [b('callout', 'The question we are trying to answer:', { icon: '❓' }), h('Ideas'), b('bullet'), h('Favorites'), b('bullet'), h('Next steps'), todo('')]);
    case 'doc':
      return make('Untitled document', [h('Overview'), b('text'), h('Details'), b('text'), h('Next steps'), todo('')]);
    case 'wiki-home':
      return make('Team wiki', [b('text', 'Welcome to the team wiki. Start here.'), b('toc'), h('Getting started'), b('bullet'), h('Processes'), b('bullet'), h('Contacts'), b('bullet')]);
    case 'readme':
      return make('How we work', [h('Our mission'), b('text'), h('How we communicate'), b('bullet'), h('Tools'), b('bullet'), h('Who to ask'), b('bullet')]);
    case 'journal':
      return make('Journal', [h('Grateful for'), b('bullet'), h('Today’s plan'), todo(''), h('Reflection'), b('text')]);
    default:
      return null;
  }
}

// Database starting points offered in the gallery (the schemas live on the server).
export const DB_PRESETS: { id: string; name: string; icon: string; description: string }[] = [
  { id: 'tasks', name: 'Tasks', icon: '✅', description: 'Status, assignee, due date and priority, with table, board and calendar views.' },
  { id: 'projects', name: 'Projects', icon: '🗂️', description: 'Status, owner and timeline, with table, timeline and board views.' },
  { id: 'notes', name: 'Notes', icon: '🗒️', description: 'Tags and created time, shown as a gallery.' },
  { id: 'reading', name: 'Reading list', icon: '📖', description: 'Status, author, link and rating.' },
  { id: 'people', name: 'People directory', icon: '👥', description: 'Role, email and phone.' },
];
