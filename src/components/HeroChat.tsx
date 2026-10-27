import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// A tiny live demo for the home page: Relay Bot answers a scripted chat, then answers
// whatever the visitor types. Replies are canned keyword matches, not a model.

type Mood = 'happy' | 'focus' | 'sad';
interface Line { id: number; who: string; text: string; bot?: boolean }

const SCRIPT: Omit<Line, 'id'>[] = [
  { who: 'Maya', text: 'Who’s in the design review today?' },
  { who: 'Relay Bot', text: 'Maya, Ken and Priya. Agenda is pinned in #design 📌', bot: true },
  { who: 'Ken', text: '/remind #launch ship notes in 2h' },
  { who: 'Relay Bot', text: 'Done. I’ll ping #launch at 4:00 PM ⏰', bot: true },
];

const ANSWERS: [RegExp, string][] = [
  [/\b(hi|hey|hello|yo)\b/i, 'Hey! 👋 I live in every channel. Ask me about huddles, canvases or reminders.'],
  [/huddle|call|voice|meet/i, 'Hit 🎧 Huddle in any channel. When it ends I post the notes back to the channel.'],
  [/canvas|doc|notes/i, 'Every channel has a canvas for docs right beside the chat. Edits sync live.'],
  [/remind|schedule|later/i, 'Try /remind me stretch in 10m, or schedule a message for tomorrow morning.'],
  [/search|find/i, 'Press Ctrl+K and I’ll search every message, person and channel at once.'],
  [/price|cost|free|paid|plan/i, 'Everything is unlocked. No seat limits, no paywalls 🎉'],
  [/workflow|automat/i, 'Workflow Builder can welcome new members, answer keywords and branch on conditions.'],
  [/who|you|bot/i, 'I’m Relay Bot. I recap channels, run workflows and answer questions like this one.'],
];

const answer = (q: string) => ANSWERS.find(([re]) => re.test(q))?.[1] ?? 'Good question! Sign in and ask me inside your workspace, I know a lot more there 🙂';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function HeroChat({ active, onMood, poke }: { active: boolean; onMood: (m: Mood) => void; poke: number }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const takenOver = useRef(false);
  const busy = useRef(false);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  const push = (l: Omit<Line, 'id'>) => setLines((prev) => [...prev.slice(-5), { ...l, id: nextId.current++ }]);

  // The bot "thinks" (focused face, typing dots), then answers with a happy face.
  const botSays = async (text: string) => {
    busy.current = true;
    onMood('focus');
    setTyping(true);
    await wait(700 + Math.min(text.length * 18, 900));
    setTyping(false);
    push({ who: 'Relay Bot', text, bot: true });
    onMood('happy');
    busy.current = false;
  };

  // Autoplay the script once the hero is on screen; stop as soon as the visitor joins in.
  useEffect(() => {
    if (!active) return;
    let stop = false;
    (async () => {
      await wait(1400);
      while (!stop && !takenOver.current) {
        setLines([]);
        for (const l of SCRIPT) {
          if (stop || takenOver.current) return;
          if (l.bot) await botSays(l.text);
          else { push(l); await wait(900); }
          await wait(500);
        }
        await wait(4200);
      }
    })();
    return () => { stop = true; };
  }, [active]);

  // Clicking the robot makes it wave and say hi.
  useEffect(() => {
    if (!poke || busy.current) return;
    takenOver.current = true;
    void botSays('👋 Hi! I’m Relay Bot. Type a question below and I’ll answer.');
  }, [poke]);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    const last = el.querySelector('.hc-msg:last-child');
    if (last && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(last, { y: 14, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
    }
  }, [lines.length]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || busy.current) return;
    takenOver.current = true;
    setDraft('');
    push({ who: 'You', text: q });
    await wait(300);
    await botSays(answer(q));
  };

  return (
    <div className="hc" role="region" aria-label="Relay Bot demo">
      <header className="hc-head"><span className="hc-hash">#</span>launch<span className="hc-live"><i />live demo</span></header>
      <div className="hc-list" ref={list} aria-live="polite">
        {lines.map((l) => (
          <div key={l.id} className={`hc-msg ${l.bot ? 'bot' : ''} ${l.who === 'You' ? 'me' : ''}`}>
            <b>{l.who}</b>
            <p>{l.text}</p>
          </div>
        ))}
        {typing && <div className="hc-typing" aria-label="Relay Bot is typing"><i /><i /><i /></div>}
      </div>
      <form className="hc-input" onSubmit={ask}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Relay Bot anything…" maxLength={120} aria-label="Ask Relay Bot" />
        <button disabled={!draft.trim()} aria-label="Send">➤</button>
      </form>
    </div>
  );
}
