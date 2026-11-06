// The landing hero: twelve features on a curved shelf. The tape in the middle turns to face you and its
// cover plays a short loop of the real UI doing that job. Plain DOM and one animation frame loop; the
// React wrapper only mounts it. Motion is springs (they can be interrupted) and the covers' own loops are
// CSS animations that run only on the cover in front.

const INK = '#1d1d1f', MUT = '#6e6e73', BLUE = '#0071e3', BI = '#0066cc', SOFT = '#f5f5f7', LINE = 'rgba(0,0,0,.08)', TINT = 'rgba(0,113,227,.12)';

const IC: Record<string, string> = {
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 14h4v6H5a2 2 0 0 1-2-2zM21 14h-4v6h2a2 2 0 0 0 2-2z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  bot: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z',
};

// ---- cover art: small honest mock-ups of the real UI. `P(k, …)` makes a group that appears at step k of a 10 second loop ----
const tx = (x: number, y: number, s: string | number, size: number, w = 400, fill = INK, anchor?: string) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''} letter-spacing="-0.2">${s}</text>`;
const av = (cx: number, cy: number, r: number, t: string, f = '#e8e8ed', c = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>${tx(cx, cy + r * 0.34, t, r * 0.95, 600, c, 'middle')}`;
const pill = (x: number, y: number, w: number, h: number, f: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${f}"/>`;
const rr = (x: number, y: number, w: number, h: number, r: number, f: string, s?: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"${s ? ` stroke="${s}"` : ''}/>`;
const hl = (x: number, y: number, w: number) => `<path d="M${x} ${y}H${x + w}" stroke="${LINE}" stroke-width="1.5"/>`;
const P = (k: number, inner: string) => `<g class="m p${k}">${inner}</g>`;
const cls = (c: string, inner: string) => `<g class="m ${c}">${inner}</g>`;

const ART: Record<string, () => string> = {
  channels: () => P(0, tx(58, 54, 'Channels', 17, 600, MUT)) + P(1, rr(46, 78, 382, 52, 14, BLUE) + tx(70, 112, '# general', 22, 500, '#fff') + '<circle cx="400" cy="104" r="14" fill="#fff"/>' + tx(400, 110, '3', 17, 600, BLUE, 'middle')) +
    `<rect class="m sw" x="46" y="142" width="382" height="52" rx="14" fill="rgba(0,0,0,.05)"/>` +
    P(2, tx(70, 176, '# design', 22)) + P(3, tx(70, 240, '# launch', 22)) + P(4, tx(70, 304, '# random', 22)) +
    P(5, hl(58, 352, 358) + tx(58, 396, 'Direct messages', 17, 600, MUT)) + P(6, av(74, 448, 20, 'M') + tx(108, 456, 'Maya', 22) + av(74, 512, 20, 'K') + tx(108, 520, 'Ken', 22)),
  threads: () => P(0, av(70, 66, 22, 'M') + tx(108, 60, 'Maya', 20, 600) + tx(108, 88, 'Launch copy is ready for review', 19) + tx(418, 60, '10:42', 15, 400, MUT, 'end')) +
    P(1, rr(46, 124, 382, 320, 18, SOFT)) +
    P(2, av(84, 176, 18, 'K', '#e2e2e7') + tx(114, 172, 'Ken', 19, 600) + tx(114, 198, 'Looks great. One question on pricing', 17, 400, MUT)) +
    P(3, av(84, 276, 18, 'M', '#e2e2e7') + tx(114, 272, 'Maya', 19, 600) + tx(114, 298, 'Sending the new numbers now', 17, 400, MUT)) +
    P(4, av(84, 376, 18, 'P', '#e2e2e7') + tx(114, 372, 'Priya', 19, 600) + tx(114, 398, 'Thanks, that settles it', 17, 400, MUT)) +
    P(5, tx(70, 492, '3 replies', 20, 500, BI)),
  mentions: () => P(0, av(70, 66, 22, 'M') + tx(108, 60, 'Maya', 20, 600) + tx(418, 60, '10:44', 15, 400, MUT, 'end')) +
    P(1, rr(104, 92, 116, 38, 10, TINT) + tx(116, 120, '@Priya', 23, 500, BI) + tx(232, 120, 'can you confirm', 23) + tx(106, 160, 'QA by 3?', 23) + '<rect class="m w1" x="98" y="86" width="346" height="86" fill="#fff"/>') +
    P(3, tx(58, 252, 'Activity', 17, 600, MUT) + rr(46, 272, 382, 96, 18, SOFT) + av(88, 320, 22, 'P', '#e2e2e7') + tx(124, 314, 'Priya', 20, 600) + tx(124, 340, 'mentioned you in #launch', 17, 400, MUT) + `<circle class="m dotp" cx="404" cy="320" r="7" fill="${BLUE}"/>`),
  huddles: () => [[142, 150, 'M'], [332, 150, 'K'], [142, 332, 'A'], [332, 332, 'S']].map((p, i) => P(i, av(p[0] as number, p[1] as number, 62, p[2] as string, i === 3 ? BLUE : '#e8e8ed', i === 3 ? '#fff' : INK) + tx(p[0] as number, (p[1] as number) + 96, ['Maya', 'Ken', 'Ava', 'Sam'][i], 17, 500, MUT, 'middle'))).join('') +
    P(4, `<g class="m hop"><circle class="m pulse" cx="142" cy="150" r="76" fill="none" stroke="${BLUE}" stroke-width="4"/></g>`) +
    P(5, pill(112, 474, 250, 62, INK) + '<circle cx="170" cy="505" r="20" fill="rgba(255,255,255,.18)"/><circle cx="237" cy="505" r="20" fill="rgba(255,255,255,.18)"/><circle cx="304" cy="505" r="20" fill="#ff453a"/>'),
  canvases: () => P(0, tx(58, 70, 'Launch plan', 34, 600) + tx(58, 112, 'Everything we ship on Thursday.', 20, 400, MUT)) +
    ['Write the launch copy', 'Review the pricing page', 'Book the demo call'].map((t, i) => { const y = 170 + i * 62; return P(1 + i, (i < 2 ? rr(58, y, 28, 28, 8, BLUE) + `<path class="m d${2 + i}" pathLength="1" d="M65 ${y + 14}l5 5 9-11" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : rr(59, y + 1, 26, 26, 7, '#fff', INK)) + tx(104, y + 22, t, 22, 400, i < 2 ? MUT : INK)); }).join('') +
    `<rect class="m cr" x="316" y="296" width="2.5" height="26" rx="1" fill="${BLUE}"/>` +
    P(4, rr(46, 384, 382, 128, 18, SOFT) + tx(72, 430, 'Tip', 18, 600, BI) + tx(72, 466, 'Type / to add a block,', 21) + tx(72, 494, 'a table or a list.', 21)),
  lists: () => [['Write launch copy', 'Maya', 'Done'], ['Review pricing', 'Ken', 'In progress'], ['Book the demo', 'Ava', 'To do'], ['QA pass', 'Sam', 'To do']].map((r, i) => {
    const y = 92 + i * 108; const moving = i === 1;
    const status = moving
      ? cls('xo4', pill(296, y + 14, 122, 36, TINT) + tx(357, y + 39, 'In progress', 16, 500, BI, 'middle')) + cls('xi4', pill(296, y + 14, 122, 36, SOFT) + tx(357, y + 39, 'Done', 16, 500, MUT, 'middle'))
      : pill(296, y + 14, 122, 36, SOFT) + tx(357, y + 39, r[2], 16, 500, MUT, 'middle');
    return P(i, av(76, y + 34, 18, r[1][0]) + tx(108, y + 30, r[0], 22, 500) + tx(108, y + 58, r[1], 17, 400, MUT) + status + (i < 3 ? hl(58, y + 88, 358) : ''));
  }).join('') + P(0, tx(58, 58, 'Launch', 28, 600)),
  workflows: () => P(0, tx(58, 58, 'New member welcome', 24, 600)) +
    [['When', 'Someone joins #general'], ['Then', 'Send the welcome message'], ['Then', 'Add them to #onboarding']].map((r, i) => { const y = 110 + i * 140;
      return P(1 + i, rr(58, y, 60, 60, 16, i === 0 ? BLUE : SOFT) + (i === 0 ? `<path d="M13 2 3 14h9l-1 8 10-12h-9z" transform="translate(73 ${y + 15}) scale(1.2)" fill="#fff"/>` : `<circle cx="88" cy="${y + 30}" r="6" fill="${MUT}"/>`) + tx(138, y + 26, r[0], 17, 500, MUT) + tx(138, y + 54, r[1], 22, 500));
    }).join('') +
    [0, 1].map((i) => `<path class="m d${2 + i * 2}" pathLength="1" d="M88 ${178 + i * 140}V${242 + i * 140}" stroke="${BLUE}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`).join('') +
    cls('xi4', rr(58, 250, 60, 60, 16, BLUE) + '<circle cx="88" cy="280" r="7" fill="#fff"/>') + cls('xi6', rr(58, 390, 60, 60, 16, BLUE) + '<circle cx="88" cy="420" r="7" fill="#fff"/>') +
    P(6, tx(58, 520, 'Runs every time, in a second.', 17, 400, MUT)),
  search: () => P(0, pill(46, 26, 382, 64, SOFT) + `<circle cx="82" cy="57" r="11" fill="none" stroke="${MUT}" stroke-width="2.6"/><path d="M90 65l9 9" stroke="${MUT}" stroke-width="2.6" stroke-linecap="round"/>` + rr(338, 42, 76, 32, 9, '#fff', LINE) + tx(376, 64, 'Ctrl K', 15, 500, MUT, 'middle')) +
    P(1, tx(116, 67, 'launch', 24) + `<rect class="m w1" x="112" y="40" width="190" height="36" fill="${SOFT}"/>`) + `<rect class="m cr" x="202" y="44" width="2.5" height="26" rx="1" fill="${INK}"/>` +
    [['# launch', 'Channel', 1], ['Maya', 'Person', 0], ['Launch copy is ready', 'Message, #launch', 0]].map((r, i) => { const y = 124 + i * 108;
      return P(2 + i, (r[2] ? rr(46, y, 382, 92, 16, TINT) : '') + av(88, y + 46, 22, i === 0 ? '#' : i === 1 ? 'M' : '“', i === 0 ? BLUE : '#e8e8ed', i === 0 ? '#fff' : INK) + tx(128, y + 42, r[0] as string, 22, 500) + tx(128, y + 70, r[1] as string, 17, 400, MUT));
    }).join('') + P(5, tx(58, 500, 'Ask a question to get the answer.', 17, 400, MUT)),
  recap: () => P(0, `<circle cx="72" cy="62" r="22" fill="${INK}"/><circle cx="64" cy="62" r="4" fill="#fff"/><circle cx="80" cy="62" r="4" fill="#fff"/>` + tx(108, 56, 'Relay Bot', 20, 600) + tx(108, 82, 'Recap, #launch', 17, 400, MUT)) +
    ['Maya finished the launch copy.', 'Ken raised a question on pricing.', 'QA moves to Thursday.'].map((t, i) => { const y = 170 + i * 92; return P(1 + i, `<circle cx="62" cy="${y - 7}" r="6" fill="${BLUE}"/>` + tx(84, y, t, 21)); }).join('') +
    P(4, hl(58, 456, 358) + tx(58, 500, 'One message, not fifty.', 19, 500, BI)),
  relaybot: () => P(0, `<circle cx="72" cy="62" r="22" fill="${INK}"/><circle cx="64" cy="62" r="4" fill="#fff"/><circle cx="80" cy="62" r="4" fill="#fff"/>` + tx(108, 70, 'Relay Bot', 20, 600)) +
    P(1, rr(86, 128, 342, 64, 22, SOFT) + tx(110, 168, '/remind me stretch in 10m', 20)) +
    cls('ty2', rr(46, 222, 104, 50, 25, SOFT) + [0, 1, 2].map((d) => `<circle class="m pulse" style="animation-delay:${d * 0.2}s" cx="${78 + d * 20}" cy="247" r="5" fill="${MUT}"/>`).join('')) +
    P(3, rr(46, 222, 330, 104, 22, BLUE) + tx(72, 266, 'Reminder set', 23, 600, '#fff') + tx(72, 298, 'Stretch, in 10 minutes', 20, 400, 'rgba(255,255,255,.85)')) +
    P(4, rr(86, 356, 342, 64, 22, SOFT) + tx(110, 396, 'What did Ken ask?', 20)) +
    cls('ty5', rr(46, 450, 104, 50, 25, SOFT) + [0, 1, 2].map((d) => `<circle class="m pulse" style="animation-delay:${d * 0.2}s" cx="${78 + d * 20}" cy="475" r="5" fill="${MUT}"/>`).join('')) +
    P(6, rr(46, 450, 300, 64, 22, BLUE) + tx(72, 490, 'About pricing, in #launch.', 19, 400, '#fff')),
  calendar: () => { let s = tx(58, 62, 'November 2026', 28, 600); 'SMTWTFS'.split('').forEach((d, i) => { s += tx(73 + i * 55, 112, d, 15, 600, MUT, 'middle'); });
    let ev = '';
    for (let n = 1; n <= 30; n++) { const c = (n - 1) % 7, r = Math.floor((n - 1) / 7), x = 73 + c * 55, y = 160 + r * 58; s += tx(x, y, n, 21, 400, INK, 'middle'); if (n === 18 || n === 25) ev += `<circle cx="${x}" cy="${y + 16}" r="3.5" fill="${BLUE}"/>`; }
    const sx = 73 + 4 * 55, sy = 160 + 1 * 58;
    return P(0, s) + cls('xi2', `<circle cx="${sx}" cy="${sy - 7}" r="23" fill="${BLUE}"/>` + tx(sx, sy, 12, 21, 600, '#fff', 'middle')) + P(3, ev) +
      P(4, rr(46, 444, 382, 84, 18, SOFT) + rr(58, 458, 5, 56, 3, BLUE) + tx(78, 482, 'Launch review', 20, 600) + tx(78, 508, 'Thursday 12, 10:00', 17, 400, MUT)); },
  inbox: () => [['Priya', 'Can you confirm QA by 3?', '2m', 1], ['Maya', 'Launch copy is ready for review', '1h', 1], ['Ken', 'Looks great. One question on pricing', '3h', 0], ['Ava', 'Joined #onboarding', 'Mon', 0]].map((r, i) => { const y = 24 + i * 134;
    return P(i, av(82, y + 48, 26, (r[0] as string)[0]) + tx(124, y + 42, r[0] as string, 21, r[3] ? 600 : 500) + tx(418, y + 42, r[2] as string, 16, 400, MUT, 'end') + tx(124, y + 72, r[1] as string, 18, 400, MUT) + (r[3] ? `<circle class="m dotp" cx="406" cy="${y + 64}" r="7" fill="${BLUE}"/>` : '') + (i < 3 ? hl(58, y + 108, 358) : '')); }).join(''),
};

const BAR: Record<string, string> = { channels: 'Relay, #general', threads: 'Relay, #launch', mentions: 'Relay, #launch', huddles: 'Huddle, #design', canvases: 'Relay, Canvas', lists: 'Relay, List', workflows: 'Relay, Workflows', search: 'Relay, Search', recap: 'Relay, #launch', relaybot: 'Relay, #general', calendar: 'Relay, Calendar', inbox: 'Relay, Inbox' };

interface Feature { id: string; t: string; su: string; cat: string; g?: string; i?: string; d: string; key: string }
const F: Feature[] = [
  { id: 'channels', t: 'Channels', su: 'One room per team, project or topic.', cat: 'Chat', g: '#', d: 'Every team and project gets a channel. Public ones anyone can find, private ones for the few who need them.', key: 'Press Ctrl K to jump to any channel.' },
  { id: 'threads', t: 'Threads', su: 'Side conversations stay on the side.', cat: 'Chat', g: '↳', d: 'Reply to one message and the side conversation folds into a thread, so the channel stays readable.', key: 'Reply to any message to start one.' },
  { id: 'mentions', t: 'Mentions', su: 'Reach exactly the right person.', cat: 'Chat', g: '@', d: 'Type @ and a name. That person gets notified, and the mention shows up in their Activity view.', key: 'Type @ in any message.' },
  { id: 'huddles', t: 'Huddles', su: 'Talk it through, live.', cat: 'Voice', i: 'headphones', d: 'Press the headphones in any channel header, or type /huddle. You are live in that channel straight away.', key: 'Type /huddle in a channel.' },
  { id: 'canvases', t: 'Canvases', su: 'A document beside the chat.', cat: 'Docs', i: 'file', d: 'A document for every channel, next to the conversation, with headings, lists and live mentions.', key: 'Open Canvas in a channel.' },
  { id: 'lists', t: 'Lists', su: 'Track work by status and owner.', cat: 'Work', i: 'check', d: 'Track work by status and owner, in a list that lives in the same channel as the talk about it.', key: 'Open List in a channel.' },
  { id: 'workflows', t: 'Workflows', su: 'Let the bot do the rounds.', cat: 'Automate', i: 'zap', d: 'Welcome new people, answer common questions and send reminders on a schedule.', key: 'Start from a keyword or a schedule.' },
  { id: 'search', t: 'Search', su: 'Everything, one shortcut away.', cat: 'Find', i: 'search', d: 'Ctrl K searches every message, person and channel you can see, and suggests the answer.', key: 'Press Ctrl K from anywhere.' },
  { id: 'recap', t: 'Recap', su: 'Catch up in one message.', cat: 'Bot', i: 'clock', d: 'Press Recap and Relay Bot sums up who said what, so catching up is one message instead of fifty.', key: 'Press Recap in any channel.' },
  { id: 'relaybot', t: 'Relay Bot', su: 'A teammate built in.', cat: 'Bot', i: 'bot', d: 'It answers questions, sends reminders and posts huddle notes, right where the conversation is.', key: 'Type /remind to try it.' },
  { id: 'calendar', t: 'Calendar', su: 'Every dated row, in view.', cat: 'Plan', i: 'calendar', d: 'Month, week and day views of every row that has a date. Drag one to reschedule it.', key: 'Open Calendar in the sidebar.' },
  { id: 'inbox', t: 'Inbox', su: 'Replies and mentions, together.', cat: 'Find', i: 'inbox', d: 'Mentions and replies gather in one place, so a question never gets lost in the scroll.', key: 'Open Inbox in the sidebar.' },
];
const N = F.length, TOTAL = N * 3;

function winFrame(f: Feature): string {
  return '<rect x="30" y="252" width="414" height="604" rx="22" fill="#fff" stroke="rgba(0,0,0,.1)" filter="url(#fs-cs)"/><path d="M30 296V274a22 22 0 0 1 22-22h370a22 22 0 0 1 22 22v22z" fill="#f6f6f8"/><path d="M30 296H444" stroke="rgba(0,0,0,.08)"/><circle cx="58" cy="274" r="6" fill="#ff5f57"/><circle cx="78" cy="274" r="6" fill="#febc2e"/><circle cx="98" cy="274" r="6" fill="#28c840"/>' + tx(237, 279, BAR[f.id], 14, 500, MUT, 'middle');
}
function poster(f: Feature): string {
  return '<rect width="474" height="900" fill="#fff"/>' + tx(36, 64, f.cat, 19, 500, MUT) + tx(34, 142, f.t, f.t.length > 8 ? 64 : 72, 600, INK).replace('letter-spacing="-0.2"', 'letter-spacing="-3"') + tx(36, 184, f.su.replace(/\.$/, ''), 22, 400, MUT) + winFrame(f) + `<g transform="translate(0,300)">${ART[f.id]()}</g>`;
}

// The cover loops are generated here: step k of a 10 second loop starts at 2 + 8k percent, and everything fades out together at the end.
function keyframes(): string {
  const out: string[] = [];
  for (let k = 0; k < 9; k++) {
    const s = 2 + 8 * k, e = s + 5;
    out.push(`@keyframes fs-p${k}{0%,${s}%{opacity:0;transform:translateY(12px)}${e}%,91%{opacity:1;transform:none}97%,100%{opacity:0;transform:none}}`);
    out.push(`@keyframes fs-w${k}{0%,${s + 3}%{transform:scaleX(1)}${s + 13}%,91%{transform:scaleX(0)}97%,100%{transform:scaleX(1)}}`);
    out.push(`@keyframes fs-d${k}{0%,${s}%{stroke-dashoffset:1}${e + 2}%,91%{stroke-dashoffset:0}97%,100%{stroke-dashoffset:1}}`);
    out.push(`@keyframes fs-xi${k}{0%,${s}%{opacity:0}${e}%,91%{opacity:1}97%,100%{opacity:0}}`);
    out.push(`@keyframes fs-xo${k}{0%,${s}%{opacity:1}${e}%,91%{opacity:0}97%,100%{opacity:1}}`);
    out.push(`@keyframes fs-ty${k}{0%,${s}%{opacity:0}${s + 2}%,${s + 8}%{opacity:1}${s + 10}%,100%{opacity:0}}`);
  }
  let rules = '';
  for (let k = 0; k < 9; k++) rules += `.fs-act .p${k}{animation-name:fs-p${k}}.fs-act .w${k}{animation-name:fs-w${k}}.fs-act .d${k}{animation-name:fs-d${k}}.fs-act .xi${k}{animation-name:fs-xi${k}}.fs-act .xo${k}{animation-name:fs-xo${k}}.fs-act .ty${k}{animation-name:fs-ty${k}}`;
  return out.join('') + rules +
    '.fs-act .m{animation-duration:10s;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.32,.72,0,1);animation-fill-mode:both}' + rules +
    '@keyframes fs-sw{0%,30%{transform:translateY(0);opacity:0}34%,50%{transform:translateY(0);opacity:1}56%,70%{transform:translateY(64px);opacity:1}76%,88%{transform:translateY(128px);opacity:1}94%,100%{transform:translateY(128px);opacity:0}}' +
    '@keyframes fs-hop{0%,16%{transform:translate(0,0)}24%,40%{transform:translate(190px,0)}48%,64%{transform:translate(190px,182px)}72%,88%{transform:translate(0,182px)}96%,100%{transform:translate(0,0)}}' +
    '@keyframes fs-pulse{0%{transform:scale(1);opacity:1}60%{transform:scale(1.07);opacity:.35}100%{transform:scale(1);opacity:1}}' +
    '@keyframes fs-blink{0%,49%{opacity:1}50%,100%{opacity:0}}' +
    '@keyframes fs-dot{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}' +
    '.fs-act .sw{animation:fs-sw 10s cubic-bezier(.32,.72,0,1) infinite both}.fs-act .hop{animation:fs-hop 10s cubic-bezier(.32,.72,0,1) infinite both}' +
    '.fs-act .pulse{animation:fs-pulse 1.6s ease-in-out infinite}.fs-act .cr{animation:fs-blink 1s steps(1) infinite}.fs-act .dotp{animation:fs-dot 1.8s ease-in-out infinite}' +
    '.fs-act .p4 .pulse,.fs-act .ty2 .pulse,.fs-act .ty5 .pulse{animation:fs-pulse 1.1s ease-in-out infinite}' +
    '.fs-act path[pathLength]{stroke-dasharray:1}.fs-act .m.w1,.fs-act .m[class*=" w"]{transform-box:fill-box;transform-origin:100% 50%}.fs-act .pulse,.fs-act .dotp{transform-box:fill-box;transform-origin:50% 50%}' +
    '@media (prefers-reduced-motion:reduce){.fs-act .m{animation:none!important}}';
}

export function mountShelf(host: HTMLElement, onGetStarted: () => void): () => void {
  if (!document.getElementById('fs-kf')) { const st = document.createElement('style'); st.id = 'fs-kf'; st.textContent = keyframes(); document.head.appendChild(st); }
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  host.innerHTML =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="fs-cs" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0b1220" flood-opacity=".1"/></filter></defs></svg>' +
    '<h1 class="fs-h">Team chat with a teammate built in</h1><p class="fs-sub">It answers, reminds and recaps, so the work keeps moving.</p>' +
    '<div class="fs-act-row"><button class="ap-pill blue" data-fs="start">Get started free</button><a class="ap-more" href="#tour">See how it works <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a></div>' +
    '<section class="fs-shelf" aria-label="Relay features"><div class="fs-floor"></div><div class="fs-stage"></div></section>' +
    '<div class="fs-cap" aria-live="polite"><div class="fs-stack fs-ti"></div><div class="fs-stack fs-de"></div><button class="fs-more" type="button">Learn more <svg viewBox="0 0 12 12"><path d="M4 1.5 8.5 6 4 10.5"/></svg></button></div>' +
    '<div class="fs-bar"><button class="fs-arr" data-fs="prev" aria-label="Previous feature"><svg viewBox="0 0 14 14"><path d="M9 2 4 7l5 5"/></svg></button><div class="fs-dots" role="tablist" aria-label="Features"></div><button class="fs-arr" data-fs="next" aria-label="Next feature"><svg viewBox="0 0 14 14"><path d="M5 2l5 5-5 5"/></svg></button></div>';
  // The detail sheet lives on the body so no page layer can sit above it.
  const sheet = document.createElement('div');
  sheet.className = 'fs-sheet'; sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = '<div class="fs-scrim"></div><div class="fs-panel" role="dialog" aria-modal="true" aria-label="Feature details"><button class="fs-x" aria-label="Close"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button><div class="fs-txt"></div><div class="fs-slot"></div></div><div class="fs-hero"></div>';
  document.body.appendChild(sheet);

  const $ = <T extends HTMLElement>(sel: string, from: ParentNode = host) => from.querySelector(sel) as T;
  const stage = $('.fs-stage'), shelf = $('.fs-shelf'), dots = $('.fs-dots');
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--H);width:1px'; host.appendChild(probe);
  interface Tape { el: HTMLElement; sp: HTMLElement; cv: HTMLElement; lift: number }
  const tapes: Tape[] = [];
  for (let v = 0; v < TOTAL; v++) {
    const i = v % N, f = F[i], t = document.createElement('div');
    t.className = 'fs-tape' + (i % 2 ? ' alt' : ''); t.dataset.v = String(v);
    t.innerHTML = '<div class="fs-face fs-lf"></div><div class="fs-face fs-bk"></div><div class="fs-face fs-sp"><div class="g">' + (f.i ? `<svg viewBox="0 0 24 24"><path d="${IC[f.i]}"/></svg>` : f.g) + `</div><div class="t">${f.t}</div></div><div class="fs-face fs-cv"><svg viewBox="0 0 474 900" preserveAspectRatio="none">${poster(f)}</svg></div>`;
    stage.appendChild(t); tapes.push({ el: t, sp: t.children[2] as HTMLElement, cv: t.lastChild as HTMLElement, lift: 0 });
  }

  let H = 0, ws = 0, d = 0, gap = 0, U = 0, XS: number[] = [0], cx = 0, cyPx = 0;
  let s = N, vs = 0, T = N, tiltX = 0, tiltY = 0, open = false, hoverV = -1, last = performance.now(), idleT = 0, visible = true, raf = 0, activeI = -1, actV = -1, alive = true;
  let drag: { x: number; s0: number; moved: boolean } | null = null;
  let hist: [number, number][] = [];
  const mouse = { x: 0, y: 0 };
  const RESP = 0.5, OM = (2 * Math.PI) / RESP;

  function measure() {
    H = probe.getBoundingClientRect().height; ws = H * 142 / 840; d = H * 474 / 900; gap = H * 0.035;
    const Wd = shelf.getBoundingClientRect().width; U = H * (Wd < 768 ? 1.05 : 1.3);
    host.style.setProperty('--Hp', H + 'px'); host.style.setProperty('--wsp', ws + 'px'); host.style.setProperty('--dp', d + 'px');
    XS = [0]; for (let u = 0; u < 3 * U; u += 2) XS.push(XS[XS.length - 1] + 2 / (1 + Math.pow(u / U, 1.6)));
  }
  const xsc = (u: number) => { const a = Math.abs(u) / 2, i = Math.min(XS.length - 2, Math.floor(a)), f = a - i; return Math.sign(u) * (XS[i] + (XS[i + 1] - XS[i]) * f); };
  const scl = (u: number) => 1 / (1 + Math.pow(Math.abs(u) / U, 1.6));
  const sm = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const rel = (v: number, s0: number) => { const r = (((v - s0) % TOTAL) + TOTAL) % TOTAL; return r >= TOTAL / 2 ? r - TOTAL : r; };
  const Fa = (r: number) => { const b = Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * 0.5; return r * (ws + gap) + (d - ws + 1.4 * gap) * b; };

  const capEls = { ti: $('.fs-ti'), de: $('.fs-de') };
  function setCap(i: number, dir: number, first: boolean) {
    const f = F[i], vals: Record<'ti' | 'de', [string, string]> = { ti: ['ti', f.t], de: ['de', f.su] };
    (Object.keys(vals) as ('ti' | 'de')[]).forEach((k) => {
      const m = capEls[k], n = document.createElement('span'); n.className = vals[k][0]; n.textContent = vals[k][1];
      const olds = Array.from(m.children) as HTMLElement[]; m.appendChild(n);
      if (first || reduce) { olds.forEach((o) => o.remove()); return; }
      n.animate([{ opacity: 0, transform: `translateY(${dir * 10}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 520, delay: 90, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'both' });
      olds.forEach((o) => { const a = o.animate([{ opacity: +getComputedStyle(o).opacity, transform: 'none' }, { opacity: 0, transform: `translateY(${-dir * 8}px)` }], { duration: 260, easing: 'ease-out', fill: 'both' }); a.onfinish = () => o.remove(); });
    });
    Array.from(dots.children).forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); });
  }
  F.forEach((f, k) => { const b = document.createElement('button'); b.setAttribute('role', 'tab'); b.setAttribute('aria-label', f.t); b.onclick = () => goTo(k); dots.appendChild(b); });
  function goTo(k: number) { if (open) return; const cur = ((Math.round(T) % N) + N) % N; let df = k - cur; if (df > N / 2) df -= N; if (df < -N / 2) df += N; T = Math.round(T) + df; }
  const step = (n: number) => { if (!open) T = Math.round(T) + n; };

  function frame(now: number) {
    raf = 0; if (!alive || !visible) return;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016); last = now;
    if (drag && drag.moved) T = s;
    else if (reduce) { s = T; vs = 0; }
    else { const a = OM * OM * (T - s) - 2 * OM * vs; vs += a * dt; s += vs * dt; }
    if (Math.abs(s) >= 4 * N) { const sh = Math.trunc(s / N) * N; s -= sh; T -= sh; if (drag) drag.s0 -= sh; }
    const ai = ((Math.round(s) % N) + N) % N;
    if (ai !== activeI) { setCap(ai, activeI < 0 ? 1 : (Math.sign(T - s) || 1), activeI < 0); activeI = ai; }
    const settled = Math.abs(T - s) < 0.3;
    // Only the cover in front plays its loop, and only once the shelf has come to rest.
    const want = settled ? ((Math.round(s) % TOTAL) + TOTAL) % TOTAL : -1;
    if (want !== actV) { if (actV >= 0) tapes[actV].el.classList.remove('fs-act'); if (want >= 0) tapes[want].el.classList.add('fs-act'); actV = want; }
    const r = shelf.getBoundingClientRect(); cx = r.left + r.width / 2; cyPx = r.top + r.height / 2;
    const onCover = !open && settled && Math.abs(mouse.x - cx) < 0.55 * d && Math.abs(mouse.y - cyPx) < 0.55 * H;
    const tyT = onCover ? (mouse.x - cx) / (0.55 * d) * 7 : (mouse.x - cx) / Math.max(1, r.width) * 3, txT = onCover ? -(mouse.y - cyPx) / (H / 2) * 4 : 0, ek = reduce ? 1 : 1 - Math.exp(-7 * dt);
    tiltY += (tyT - tiltY) * ek; tiltX += (txT - tiltX) * ek;
    for (let v = 0; v < TOTAL; v++) {
      const tp = tapes[v], rl = rel(v, s), o = sm(Math.max(0, 1 - Math.abs(rl))), u = Fa(rl);
      if (Math.abs(u) > U * 1.95) { tp.el.style.display = 'none'; continue; } tp.el.style.display = '';
      const hl = (v === hoverV && Math.abs(rl) > 0.5 && !drag) ? 1 : 0; tp.lift += (hl - tp.lift) * (reduce ? 1 : 1 - Math.exp(-12 * dt));
      const sc = scl(u), k2 = 1 / sc, z = 1400 * (1 - k2) + o * H * 0.1, x = xsc(u) * k2, y = (H * 0.5 * (1 - sc) * 0.42 + o * H * 0.012 - tp.lift * H * 0.04) * k2;
      const ry = Math.sign(u) * Math.min(1, Math.abs(u) / U) * 26 * (1 - o) - 90 * o + tiltY * o, rx = tiltX * o;
      tp.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      tp.el.style.zIndex = String(Math.round(3000 + z));
      tp.sp.style.setProperty('--shade', Math.min(0.4, o * 0.3 + (1 - sc) * 0.26).toFixed(3));
      tp.cv.style.setProperty('--shade', ((1 - o) * 0.34).toFixed(3)); tp.cv.style.setProperty('--glo', o.toFixed(3)); tp.cv.style.setProperty('--gl', (50 - tiltY * 7 + tiltX * 3).toFixed(1) + '%');
    }
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && alive && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const onMove = (e: PointerEvent) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    const t = (e.target as HTMLElement | null)?.closest?.('.fs-tape') as HTMLElement | null; hoverV = t && host.contains(t) ? +(t.dataset.v ?? -1) : -1;
    if (drag) { const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; drag.x = e.clientX; drag.s0 = s; shelf.classList.add('drag'); }
      if (drag.moved) { s = drag.s0 - (e.clientX - drag.x) / (ws + gap); hist.push([performance.now(), s]); while (hist.length > 6) hist.shift(); } }
  };
  const onDown = (e: PointerEvent) => { if (open) return; drag = { x: e.clientX, s0: s, moved: false }; hist = []; };
  const onUp = (e: PointerEvent) => {
    if (!drag) return; const dr = drag; drag = null; shelf.classList.remove('drag');
    if (dr.moved) { let v0 = 0; if (hist.length > 1) { const a = hist[0], b = hist[hist.length - 1]; v0 = (b[1] - a[1]) / Math.max(0.016, (b[0] - a[0]) / 1000); } vs = Math.max(-14, Math.min(14, v0)); T = Math.round(s + Math.max(-3, Math.min(3, vs * 0.28))); return; }
    const t = (e.target as HTMLElement | null)?.closest?.('.fs-tape') as HTMLElement | null; if (!t || open || !host.contains(t)) return;
    const rl = rel(+(t.dataset.v ?? 0), s); if (Math.abs(rl) < 0.5) openSheet(); else T = Math.round(T + rl);
  };
  // Horizontal swipes move the shelf. Vertical scrolling is left to the page.
  const onWheel = (e: WheelEvent) => { if (open || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) return; T += e.deltaX / (ws + gap) * 0.5; clearTimeout(idleT); idleT = window.setTimeout(() => { T = Math.round(T); }, 140); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) { closeSheet(); return; }
    const tag = (document.activeElement as HTMLElement | null)?.tagName; if (!visible || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
  };
  window.addEventListener('pointermove', onMove); shelf.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); shelf.addEventListener('wheel', onWheel, { passive: true }); window.addEventListener('keydown', onKey);
  host.querySelector('[data-fs="prev"]')!.addEventListener('click', () => step(-1)); host.querySelector('[data-fs="next"]')!.addEventListener('click', () => step(1));
  host.querySelector('[data-fs="start"]')!.addEventListener('click', onGetStarted);

  // ---- the sheet: the cover itself travels into place (same aspect, so a pure scale and move) ----
  const panel = $('.fs-panel', sheet), scrim = $('.fs-scrim', sheet), hero = $('.fs-hero', sheet), slot = $('.fs-slot', sheet), txt = $('.fs-txt', sheet);
  let openTape: Tape | null = null; let anims: Animation[] = [];
  const EASE = 'cubic-bezier(.32,.72,0,1)';
  const flip = (from: DOMRect, to: { left: number; top: number; width: number; height: number }) => `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`;
  function openSheet() {
    if (open) return; const i = ((Math.round(T) % N) + N) % N, f = F[i]; T = Math.round(T); open = true;
    openTape = tapes[((Math.round(s) % TOTAL) + TOTAL) % TOTAL]; const from = openTape.cv.getBoundingClientRect();
    txt.innerHTML = `<span class="k">${f.cat}</span><h2>${f.t}</h2><p>${f.d}</p><span class="hint">${f.key}</span><button class="fs-go" type="button">Try it in Relay</button>`;
    (txt.querySelector('.fs-go') as HTMLElement).onclick = () => { closeSheet(); onGetStarted(); };
    hero.innerHTML = `<svg viewBox="0 0 474 900" preserveAspectRatio="none">${poster(f)}</svg>`; hero.classList.add('fs-act');
    sheet.classList.add('on'); sheet.setAttribute('aria-hidden', 'false');
    const to = slot.getBoundingClientRect(); Object.assign(hero.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
    openTape.cv.style.opacity = '0';
    anims.forEach((a) => a.cancel()); anims = [];
    const rs = 22 / (from.width / to.width);
    anims.push(scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 1 : 420, easing: 'ease-out', fill: 'both' }));
    anims.push(panel.animate([{ opacity: 0, transform: 'scale(.965)' }, { opacity: 1, transform: 'none' }], { duration: reduce ? 1 : 560, delay: reduce ? 0 : 60, easing: EASE, fill: 'both' }));
    anims.push(hero.animate([{ transform: flip(from, to), borderRadius: rs + 'px' }, { transform: 'none', borderRadius: '26px' }], { duration: reduce ? 1 : 640, easing: EASE, fill: 'both' }));
    Array.from(txt.children).forEach((el, k) => anims.push((el as HTMLElement).animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: reduce ? 1 : 560, delay: reduce ? 0 : 220 + k * 55, easing: EASE, fill: 'both' })));
    ($('.fs-x', sheet)).focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!open || !openTape) return; const tp = openTape, from = tp.cv.getBoundingClientRect(), to = hero.getBoundingClientRect();
    const rs2 = 22 / (from.width / to.width);
    const a = hero.animate([{ transform: 'none', borderRadius: '26px' }, { transform: flip(from, to), borderRadius: rs2 + 'px' }], { duration: reduce ? 1 : 520, easing: EASE, fill: 'both' });
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 1 : 420, easing: 'ease-out', fill: 'both' });
    panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: reduce ? 1 : 300, easing: 'ease-in', fill: 'both' });
    a.onfinish = () => { sheet.classList.remove('on'); sheet.setAttribute('aria-hidden', 'true'); anims.forEach((x) => x.cancel()); a.cancel(); hero.classList.remove('fs-act'); tp.cv.style.opacity = ''; open = false; };
  }
  ($('.fs-x', sheet)).onclick = closeSheet; scrim.onclick = closeSheet; ($('.fs-more')).onclick = openSheet;

  const io = new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) wake(); }, { threshold: 0 }); io.observe(host);
  const ro = new ResizeObserver(() => measure()); ro.observe(shelf);
  measure(); wake();
  return () => {
    alive = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); clearTimeout(idleT);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('keydown', onKey);
    sheet.remove(); host.innerHTML = '';
  };
}
