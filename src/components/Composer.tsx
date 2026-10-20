import { useRef, useState } from 'react';
import type { FileAttachment } from '../types.ts';
import { useRelayCtx } from '../ctx.ts';
import { EMOJI } from '../format.tsx';

const MAX_FILE = 4 * 1024 * 1024;

function readFile(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function Composer({
  channelId,
  threadId,
  placeholder,
  onSchedule,
}: {
  channelId: string;
  threadId?: string;
  placeholder: string;
  onSchedule?: (text: string) => void;
}) {
  const { snap, send } = useRelayCtx();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [picker, setPicker] = useState(false);
  const [fileError, setFileError] = useState('');
  const lastTyping = useRef(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const mentionQuery = /(?:^|\s)@(\w*)$/.exec(text)?.[1];
  const mentionMatches =
    mentionQuery === undefined
      ? []
      : Object.values(snap.users)
          .filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 5);

  const submit = () => {
    if (!text.trim() && files.length === 0) return;
    send({ t: 'send', channelId, text, threadId, files: files.length ? files : undefined });
    setText('');
    setFiles([]);
  };

  const onChange = (value: string) => {
    setText(value);
    const now = Date.now();
    if (now - lastTyping.current > 2000 && value.trim()) {
      lastTyping.current = now;
      send({ t: 'typing', channelId });
    }
  };

  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    setText(text.slice(0, a) + mark + text.slice(a, b) + mark + text.slice(b));
    el.focus();
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setFileError('');
    const accepted: FileAttachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) {
        setFileError(`${f.name} is over 4 MB`);
        continue;
      }
      accepted.push(await readFile(f));
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, 5));
  };

  return (
    <div className="composer">
      {mentionMatches.length > 0 && (
        <div className="popover mention-pop">
          {mentionMatches.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setText(text.replace(/@\w*$/, `<@${u.id}> `));
                ref.current?.focus();
              }}
            >
              @{u.name}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="file-chips">
          {files.map((f, i) => (
            <span key={i} className="chip">
              📎 {f.name}
              <button aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {fileError && <div className="field-error">{fileError}</div>}
      <div className="composer-box">
        <div className="format-bar">
          <button title="Bold" onClick={() => wrap('**')}><b>B</b></button>
          <button title="Italic" onClick={() => wrap('_')}><i>I</i></button>
          <button title="Strike" onClick={() => wrap('~')}><s>S</s></button>
          <button title="Code" onClick={() => wrap('`')}>{'</>'}</button>
        </div>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-actions">
          <label className="icon-btn" title="Attach files">
            ＋
            <input type="file" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <button className="icon-btn" title="Emoji" onClick={() => setPicker(!picker)}>☺</button>
          <button className="icon-btn" title="Mention" onClick={() => setText(text + '@')}>@</button>
          <span className="spacer" />
          {onSchedule && (
            <button className="ghost-btn" disabled={!text.trim()} onClick={() => { onSchedule(text); setText(''); }}>
              ⏱ Schedule
            </button>
          )}
          <button className="send-btn" disabled={!text.trim() && files.length === 0} onClick={submit}>
            Send ➤
          </button>
        </div>
        {picker && (
          <div className="popover emoji-pop">
            {EMOJI.map((e) => (
              <button key={e} onClick={() => { setText(text + e); setPicker(false); ref.current?.focus(); }}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
