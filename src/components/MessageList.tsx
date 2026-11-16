import { gsap } from 'gsap';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import type { Message } from '../types.ts';
import { useRelayCtx } from '../ctx.ts';
import { buildRows, type Row } from '../messageRows.ts';
import { dayLabel, EMOJI, RichText, safeUrl, timeLabel } from '../format.tsx';
import { isAdmin } from '../premium.ts';
import { Avatar } from './Avatar.tsx';
import { Icon } from './Icon.tsx';

export function MessageRow({ m, compact, inThread }: { m: Message; compact: boolean; inThread?: boolean }) {
  const { snap, send, openThread } = useRelayCtx();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const [picker, setPicker] = useState(false);
  const user = snap.users[m.userId];
  const mine = m.userId === snap.me;
  const canModerate = isAdmin(snap.users[snap.me]);
  const replies = inThread ? [] : snap.messages.filter((x) => x.threadId === m.id);
  const repliers = [...new Set(replies.map((x) => x.userId))].slice(0, 3);
  const saved = snap.saved.includes(m.id);

  if (m.system) {
    return (
      <div className="msg system">
        <RichText text={m.text} users={snap.users} groups={snap.groups} />
      </div>
    );
  }

  return (
    <div className={`msg ${compact ? 'compact' : ''} ${m.pinned ? 'pinned' : ''} ${Date.now() - m.ts < 8000 ? 'fresh' : ''}`}>
      <div className="gutter">
        {compact ? <span className="hover-time">{timeLabel(m.ts)}</span> : <Avatar user={user} />}
      </div>
      <div className="body">
        {!compact && (
          <div className="meta">
            <strong>{user?.name ?? 'Unknown'}</strong>
            {user?.status.emoji && <span title={user.status.text}>{user.status.emoji}</span>}
            <time>{timeLabel(m.ts)}</time>
            {m.pinned && <span className="badge"><Icon n="pin" size={12} /> pinned</span>}
            {m.edited && <span className="edited">(edited)</span>}
          </div>
        )}
        {editing ? (
          <div className="edit-box">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div>
              <button className="ghost-btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="send-btn" onClick={() => { send({ t: 'edit', id: m.id, text: draft }); setEditing(false); }}>Save</button>
            </div>
          </div>
        ) : (
          <div className="text">
            <RichText text={m.text} users={snap.users} groups={snap.groups} />
          </div>
        )}
        {m.files?.map((f, i) => {
          const src = safeUrl(f.url ?? f.dataUrl);
          return f.type.startsWith('image/') ? (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer"><img className="attach-img" src={src} alt={f.name} loading="lazy" decoding="async" /></a>
          ) : f.type.startsWith('video/') ? (
            <video key={i} className="attach-img" src={src} controls />
          ) : f.type.startsWith('audio/') ? (
            <audio key={i} className="attach-audio" src={src} controls />
          ) : (
            <div key={i} className="attach-row">
              <a className="attach-file" href={src} download={f.name} target="_blank" rel="noopener noreferrer">
                <Icon n="file" /> {f.name} <small>{Math.ceil(f.size / 1024)} KB</small>
              </a>
              <button className="ghost-btn" title="Summarize this file" onClick={() => send({ t: 'fileSummary', id: m.id, index: i })}><Icon n="sparkles" /> Summarize</button>
            </div>
          );
        })}
        {m.preview && (
          <a className="link-card" href={safeUrl(m.preview.url)} target="_blank" rel="noopener noreferrer">
            <div>
              <small>{m.preview.site}</small>
              <strong>{m.preview.title}</strong>
              {m.preview.description && <p>{m.preview.description}</p>}
            </div>
            {safeUrl(m.preview.image) && <img src={safeUrl(m.preview.image)} alt="" loading="lazy" decoding="async" />}
          </a>
        )}
        {Object.keys(m.reactions).length > 0 && (
          <div className="reactions">
            {Object.entries(m.reactions).map(([emoji, ids]) => (
              <button
                key={emoji}
                className={ids.includes(snap.me) ? 'mine' : ''}
                title={ids.map((id) => snap.users[id]?.name).join(', ')}
                onClick={() => send({ t: 'react', id: m.id, emoji })}
              >
                {emoji} {ids.length}
              </button>
            ))}
          </div>
        )}
        {replies.length > 0 && (
          <button className="thread-link" onClick={() => openThread(m.id)}>
            <span className="thread-avatars" aria-hidden>
              {repliers.map((id) => <Avatar key={id} user={snap.users[id]} size={18} />)}
            </span>
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            <span> · last {timeLabel(replies[replies.length - 1].ts)}</span>
          </button>
        )}
      </div>
      <div className="actions">
        <button title="React" onClick={() => setPicker(!picker)}><Icon n="smile" /></button>
        {!inThread && <button title="Reply in thread" onClick={() => openThread(m.id)}><Icon n="message" /></button>}
        <button title={m.pinned ? 'Unpin' : 'Pin'} onClick={() => send({ t: 'pin', id: m.id })}><Icon n="pin" /></button>
        <button title={saved ? 'Unsave' : 'Save for later'} onClick={() => send({ t: 'save', id: m.id })}><Icon n="star" fill={saved} /></button>
        {mine && <button title="Edit" onClick={() => { setDraft(m.text); setEditing(true); }}><Icon n="pencil" /></button>}
        {(mine || canModerate) && <button title="Delete" onClick={() => { if (confirm('Delete this message?')) send({ t: 'delete', id: m.id }); }}><Icon n="trash" /></button>}
        {!mine && (
          <button
            title="Flag for admin review"
            onClick={() => {
              const reason = prompt('Why are you flagging this message?');
              if (reason?.trim()) send({ t: 'flag', id: m.id, reason: reason.trim() });
            }}
          >
            <Icon n="flag" />
          </button>
        )}
        {picker && (
          <div className="popover emoji-pop">
            {EMOJI.map((e) => (
              <button key={e} onClick={() => { send({ t: 'react', id: m.id, emoji: e }); setPicker(false); }}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageList({ messages, inThread, onOlder, lastReadAtOpen, newestAtOpen }: {
  messages: Message[];
  inThread?: boolean;
  onOlder?: () => void;
  // What was unread when the channel opened; threads pass neither (no divider).
  lastReadAtOpen?: number;
  newestAtOpen?: number;
}) {
  const { snap } = useRelayCtx();
  const rows = useMemo(
    () => buildRows(messages, inThread ? 0 : lastReadAtOpen ?? 0, snap.me, newestAtOpen),
    [messages, inThread, lastReadAtOpen, newestAtOpen, snap.me],
  );
  // A thread is short and scrolls with its panel, so it is drawn whole.
  if (inThread) return <ThreadList rows={rows} last={messages[messages.length - 1]?.id} />;
  return <VirtualList rows={rows} messages={messages} onOlder={onOlder} />;
}

// Opens at the newest reply and brings each new reply into view, popping it in.
function ThreadList({ rows, last }: { rows: Row[]; last?: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    const arrived = opened.current;
    opened.current = true;
    end.scrollIntoView({ block: 'end', behavior: arrived && !reducedMotion() ? 'smooth' : 'auto' });
    if (!arrived || reducedMotion()) return;
    const row = end.previousElementSibling;
    if (!row) return;
    const tween = gsap.fromTo(row, { y: 24, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
    return () => { tween.kill(); };
  }, [last]);
  return (
    <div className="message-list">
      {rows.map((row) => <RowView key={row.key} row={row} inThread />)}
      <div ref={endRef} />
    </div>
  );
}

function RowView({ row, inThread }: { row: Row; inThread?: boolean }) {
  if (row.kind === 'day') return <div className="day-divider"><span>{dayLabel(row.ts)}</span></div>;
  if (row.kind === 'unread') return <div className="unread-divider" role="separator"><span>New messages</span></div>;
  return <MessageRow m={row.m} compact={row.compact} inThread={inThread} />;
}

const NEAR_BOTTOM = 120;
const JUMP_AFTER = 400;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function VirtualList({ rows, messages, onOlder }: { rows: Row[]; messages: Message[]; onOlder?: () => void }) {
  const { snap } = useRelayCtx();
  const listRef = useRef<HTMLDivElement>(null);
  // Our own scroll-to-end passes through the top of the list; only the reader's scrolling should load more.
  const autoScrollUntil = useRef(0);
  const nearBottom = useRef(true);
  const [jump, setJump] = useState(false);
  // Keyed by message id, so measured heights survive older pages arriving above. A stable function,
  // since the virtualiser recomputes every row's position whenever it changes.
  const getItemKey = useCallback((i: number) => rows[i].key, [rows]);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 56,
    overscan: 12,
    paddingStart: 8,
    paddingEnd: 12,
    getItemKey,
  });
  const toEnd = () => {
    if (!rows.length) return;
    autoScrollUntil.current = Date.now() + 1000;
    v.scrollToEnd();
  };

  const first = messages[0]?.id;
  const last = messages[messages.length - 1]?.id;
  const prev = useRef<{ first?: string; last?: string; height: number } | null>(null);
  const popIn = useRef(false);
  // A remount (React's strict-mode double mount in development) lets the virtualiser restore its own
  // scroll offset, so the next pass treats it as a first render and goes back to the latest message.
  useLayoutEffect(() => () => { prev.current = null; }, []);
  useLayoutEffect(() => {
    const el = listRef.current;
    const was = prev.current;
    prev.current = { first, last, height: el?.scrollHeight ?? 0 };
    if (!el) return;
    if (!was || (first !== was.first && last !== was.last)) {
      // First render or another channel: start at the latest message.
      nearBottom.current = true;
      setJump(false);
      toEnd();
    } else if (last !== was.last) {
      // A new message: follow it when the reader is at the bottom (or wrote it), else offer the pill.
      const lastMsg = messages[messages.length - 1];
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (nearBottom.current || lastMsg?.userId === snap.me) {
        toEnd();
        popIn.current = true;
      } else if (distance > JUMP_AFTER) setJump(true);
    } else if (was.first && first !== was.first) {
      // Older messages were added above: keep what the reader was looking at where it was.
      el.scrollTop += el.scrollHeight - was.height;
    } else if (nearBottom.current && el.scrollHeight > was.height) {
      // A row near the end grew (a reply count, a link preview): stay at the bottom.
      el.scrollTop = el.scrollHeight;
    }
    // A page that doesn't fill the pane can't be scrolled, so ask for the next one right away.
    // Skipped while the pane is collapsed (mid-animation, hidden), or it would pull in everything.
    if (onOlder && el.clientHeight > 100 && el.scrollHeight <= el.clientHeight) onOlder();
  });

  // A message that just arrived pops in; the initial render is handled by the channel-switch stagger.
  useEffect(() => {
    if (!popIn.current) return;
    popIn.current = false;
    if (reducedMotion()) return;
    const row = listRef.current?.querySelector(`[data-index="${rows.length - 1}"] > *`);
    if (row) gsap.fromTo(row, { y: 24, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
  }, [last]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = distance < NEAR_BOTTOM;
    if (nearBottom.current && jump) setJump(false);
    if (onOlder && el.scrollTop < 120 && Date.now() > autoScrollUntil.current) onOlder();
  };

  return (
    <div className="message-wrap">
      <div
        className="message-list virtual"
        ref={listRef}
        // The browser's own scroll anchoring would double the compensation done above.
        style={{ overflowAnchor: 'none' }}
        onScroll={onScroll}
      >
        <div className="vlist" style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map((item) => (
            <div key={item.key} className="vrow" data-index={item.index} ref={v.measureElement} style={{ transform: `translateY(${item.start}px)` }}>
              <RowView row={rows[item.index]} />
            </div>
          ))}
        </div>
      </div>
      {jump && (
        <button className="jump-latest" onClick={() => { setJump(false); toEnd(); }}>
          Jump to latest <span aria-hidden>↓</span>
        </button>
      )}
    </div>
  );
}
