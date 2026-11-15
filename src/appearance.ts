import { useCallback, useEffect, useState } from 'react';

// Workspace backgrounds: Plain, or an image the person uploads (kept in this browser, see uploadBackground).
export interface Background {
  id: string;
  label: string;
  kind: 'none' | 'custom';
  src?: string;
}

export const BACKGROUNDS: Background[] = [
  { id: 'none', label: 'Plain', kind: 'none' },
];

// The Apple look is the product's look: light, dark, or following the system setting.
export const THEMES = [
  { id: 'system', label: 'System (Apple light / dark)' },
  { id: 'apple', label: 'Apple' },
  { id: 'apple-dark', label: 'Apple dark' },
];

// Themes that no longer exist, by whether they were dark. A stored one is moved to the matching Apple theme
// once (useAppearance), and index.html applies the same mapping before first paint, so keep the two in step.
const RETIRED_DARK = ['notion-dark', 'minimal-dark', 'plum', 'moonlight', 'chrome', 'midnight', 'aurora', 'sunset'];
const RETIRED_LIGHT = ['notion', 'minimal', 'overcast', 'meadow', 'switchboard', 'daylight'];

// The stored theme choice as one of THEMES: retired themes become Apple or Apple dark, anything unknown becomes System.
export function migrateTheme(stored: string): string {
  if (THEMES.some((t) => t.id === stored)) return stored;
  if (RETIRED_DARK.includes(stored)) return 'apple-dark';
  if (RETIRED_LIGHT.includes(stored)) return 'apple';
  return 'system';
}

// '' keeps the theme's own accent. Purple is the house colour.
export const ACCENTS = [
  { id: '', label: 'Theme', hex: '' },
  { id: 'purple', label: 'Purple', hex: '#9a6bff' },
  { id: 'blue', label: 'Blue', hex: '#4f8cff' },
  { id: 'teal', label: 'Teal', hex: '#1fb5a3' },
  { id: 'green', label: 'Green', hex: '#4caf2e' },
  { id: 'amber', label: 'Amber', hex: '#f0a020' },
  { id: 'rose', label: 'Rose', hex: '#e8578a' },
  { id: 'red', label: 'Red', hex: '#e5484d' },
];

const MAX_CUSTOM_BYTES = 3 * 1024 * 1024;
const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

// The System theme is the default for a browser that has never picked a theme: no background image and the
// theme's own accent. It follows the system light/dark setting live (see resolveTheme). A browser that already
// has a stored theme is left alone.
export function firstLook(hasTheme: boolean): { theme: string; bg: string; accent: string } | null {
  return hasTheme ? null : { theme: 'system', bg: 'none', accent: '' };
}

// The theme id that is actually painted: 'system' becomes Apple dark in dark mode and Apple in light mode.
export function resolveTheme(stored: string, prefersDark: boolean): string {
  const theme = migrateTheme(stored);
  if (theme !== 'system') return theme;
  return prefersDark ? 'apple-dark' : 'apple';
}

export type Density = 'comfortable' | 'compact';
// The stored density, with anything missing or unknown read as comfortable. index.html applies the same
// rule (and the theme rule above) inline before first paint, so keep the two in step.
export const readDensity = (raw: string | null): Density => (raw === 'compact' ? 'compact' : 'comfortable');
const DARK_QUERY = '(prefers-color-scheme: dark)';
const systemDark = () => typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;

// The Apple look lets people drag the sidebar edge. Anything unusable falls back to the default width.
export const SIDE_MIN = 200;
export const SIDE_MAX = 400;
export const SIDE_DEFAULT = 248;
export const clampSide = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(n))) : SIDE_DEFAULT);

export function useAppearance() {
  const [theme, setThemeState] = useState(() => {
    const stored = read('relay.theme', '');
    const look = firstLook(!!stored);
    if (look) {
      write('relay.theme', look.theme);
      write('relay.bg', look.bg);
      write('relay.accent', look.accent);
    } else if (migrateTheme(stored) !== stored) {
      write('relay.theme', migrateTheme(stored));
    }
    // The bundled video backgrounds are gone; a browser that had one goes back to Plain. The keys that only
    // served the retired looks and the "match colours to the background" toggle are cleared.
    if (!['none', 'custom'].includes(read('relay.bg', 'none'))) write('relay.bg', 'none');
    write('relay.look', null);
    write('relay.bgMatch', null);
    return migrateTheme(read('relay.theme', 'system'));
  });
  // Whether the system is in dark mode right now, so a 'system' theme can follow it as it changes.
  const [prefersDark, setPrefersDark] = useState(systemDark);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => setPrefersDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const resolved = resolveTheme(theme, prefersDark);
  const [density, setDensityState] = useState<Density>(() => readDensity(read('relay.density', 'comfortable')));
  const [bgId, setBgId] = useState(() => read('relay.bg', 'none'));
  const [accent, setAccentState] = useState(() => read('relay.accent', ''));
  // How much the theme colour covers the background, so text stays readable (0–95%).
  const [dim, setDimState] = useState(() => Number(read('relay.bgDim', '78')));
  const [custom, setCustom] = useState(() => read('relay.bgCustom', ''));

  // The page always gets the concrete theme; storage keeps the choice ('system' included).
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  useEffect(() => {
    write('relay.theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    write('relay.density', density);
  }, [density]);

  // An accent overrides the theme's: buttons, links, focus rings and the selected sidebar row.
  useEffect(() => {
    const root = document.documentElement.style;
    const hex = ACCENTS.find((a) => a.id === accent)?.hex;
    for (const v of ['--accent', '--accent-2', '--side-active']) root.removeProperty(v);
    if (hex) {
      root.setProperty('--accent', hex);
      root.setProperty('--accent-2', `color-mix(in srgb, ${hex} 70%, white)`);
      root.setProperty('--side-active', `color-mix(in srgb, ${hex} 72%, black)`);
    }
    write('relay.accent', accent);
  }, [accent]);

  const background: Background = bgId === 'custom' && custom
    ? { id: 'custom', label: 'Your image', kind: 'custom', src: custom }
    : BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];

  const chooseBackground = useCallback((id: string) => {
    setBgId(id);
    write('relay.bg', id);
  }, []);

  // Stores an uploaded image in this browser only. Returns an error message, or null when saved.
  const uploadBackground = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return 'Choose an image file (JPG, PNG or WebP).';
    if (file.size > MAX_CUSTOM_BYTES) return 'That image is over 3 MB. Try a smaller one.';
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    if (!write('relay.bgCustom', url)) return 'Your browser’s storage is full, so the image couldn’t be saved.';
    setCustom(url);
    setBgId('custom');
    write('relay.bg', 'custom');
    return null;
  }, []);

  return {
    theme,
    resolvedTheme: resolved,
    setTheme: setThemeState,
    density,
    setDensity: setDensityState,
    background,
    chooseBackground,
    uploadBackground,
    hasCustom: !!custom,
    accent,
    setAccent: setAccentState,
    dim,
    setDim: (n: number) => { setDimState(n); write('relay.bgDim', String(n)); },
  };
}

export type Appearance = ReturnType<typeof useAppearance>;
