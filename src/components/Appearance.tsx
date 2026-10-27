import { useRef, useState } from 'react';
import { ACCENTS, BACKGROUNDS, THEMES, type Appearance, type Background } from '../appearance.ts';

// The workspace background: a looping video, an image, or nothing, under a theme-coloured veil.
export function Backdrop({ bg, dim }: { bg: Background; dim: number }) {
  return (
    <div className="main-bg" aria-hidden style={{ ['--bg-dim' as string]: `${dim}%`, backgroundImage: bg.poster || bg.kind === 'custom' ? `url("${bg.poster ?? bg.src}")` : 'none' }}>
      {bg.kind === 'video' && <video key={bg.id} src={bg.src} poster={bg.poster} autoPlay muted loop playsInline preload="metadata" />}
    </div>
  );
}

export function AppearanceSettings({ a }: { a: Appearance }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  return (
    <section className="appearance">
      <h3>Appearance</h3>

      <div className="appearance-label">Background</div>
      <div className="bg-grid" role="radiogroup" aria-label="Background">
        {BACKGROUNDS.map((b) => (
          <button key={b.id} role="radio" aria-checked={a.background.id === b.id} className={`bg-tile ${a.background.id === b.id ? 'on' : ''}`} onClick={() => a.chooseBackground(b.id)}>
            <span className="bg-thumb" style={b.poster ? { backgroundImage: `url("${b.poster}")` } : undefined}>{b.kind === 'none' && 'Aa'}</span>
            <span>{b.label}</span>
          </button>
        ))}
        <button role="radio" aria-checked={a.background.id === 'custom'} className={`bg-tile ${a.background.id === 'custom' ? 'on' : ''}`} onClick={() => (a.hasCustom && a.background.id !== 'custom' ? a.chooseBackground('custom') : fileRef.current?.click())}>
          <span className="bg-thumb upload" style={a.background.kind === 'custom' ? { backgroundImage: `url("${a.background.src}")` } : undefined}>{a.background.kind !== 'custom' && '＋'}</span>
          <span>{a.hasCustom ? 'Your image' : 'Upload image'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setUploadError(await a.uploadBackground(f));
          }}
        />
      </div>
      {a.hasCustom && <button className="link-btn small" onClick={() => fileRef.current?.click()}>Replace your image</button>}
      {uploadError && <p className="field-error">{uploadError}</p>}

      <label className="check"><input type="checkbox" checked={a.match} onChange={(e) => a.setMatch(e.target.checked)} /> Match colours to the background</label>

      <label>
        <span className="appearance-label">Background strength</span>
        <input type="range" min={5} max={95} value={100 - a.dim} onChange={(e) => a.setDim(100 - Number(e.target.value))} aria-label="Background strength" />
      </label>

      <label>
        <span className="appearance-label">Colour theme</span>
        <select value={a.theme} onChange={(e) => a.setTheme(e.target.value)}>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>

      <div className="appearance-label">Accent colour</div>
      <div className="accent-row" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((c) => (
          <button
            key={c.id || 'theme'}
            role="radio"
            aria-checked={a.accent === c.id}
            aria-label={c.label}
            title={c.label}
            className={`accent-dot ${a.accent === c.id ? 'on' : ''} ${c.hex ? '' : 'theme'}`}
            style={c.hex ? { background: c.hex } : undefined}
            onClick={() => a.setAccent(c.id)}
          />
        ))}
      </div>
    </section>
  );
}
