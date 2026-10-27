import { useCallback, useEffect, useState } from 'react';

// Workspace backgrounds. To add one, put a looping .mp4 (1080p, no audio) and a .jpg poster
// in public/bg/ and add an entry here; `theme` is the colour theme that suits it.
export interface Background {
  id: string;
  label: string;
  kind: 'none' | 'video' | 'image' | 'custom';
  src?: string;
  poster?: string;
  theme?: string;
  credit?: string;
}

export const BACKGROUNDS: Background[] = [
  { id: 'purple-desert', label: 'Purple Desert', kind: 'video', src: '/bg/purple-desert.mp4', poster: '/bg/purple-desert.jpg', theme: 'plum', credit: 'GetLayers' },
  { id: 'moon-walk', label: 'Moon Walk', kind: 'video', src: '/bg/moon-walk.mp4', poster: '/bg/moon-walk.jpg', theme: 'moonlight', credit: 'GetLayers' },
  { id: 'metal-human', label: 'Metal Human', kind: 'video', src: '/bg/metal-human.mp4', poster: '/bg/metal-human.jpg', theme: 'chrome', credit: 'GetLayers' },
  { id: 'far-planet', label: 'Far Planet', kind: 'video', src: '/bg/far-planet.mp4', poster: '/bg/far-planet.jpg', theme: 'overcast' },
  { id: 'material-hills', label: 'Material Hills', kind: 'video', src: '/bg/material-hills.mp4', poster: '/bg/material-hills.jpg', theme: 'meadow', credit: 'GetLayers' },
  { id: 'silver-waves', label: 'Silver Waves', kind: 'video', src: '/bg/silver-line-waves.mp4', poster: '/bg/silver-line-waves.jpg', theme: 'midnight' },
  { id: 'none', label: 'Plain', kind: 'none' },
];

export const THEMES = [
  { id: 'plum', label: 'Plum' },
  { id: 'moonlight', label: 'Moonlight' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'switchboard', label: 'Switchboard' },
  { id: 'daylight', label: 'Daylight' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'sunset', label: 'Sunset' },
];

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

export function useAppearance() {
  const [theme, setThemeState] = useState(() => read('relay.theme', 'plum'));
  const [bgId, setBgId] = useState(() => read('relay.bg', 'purple-desert'));
  const [accent, setAccentState] = useState(() => read('relay.accent', ''));
  // How much the theme colour covers the background, so text stays readable (0–95%).
  const [dim, setDimState] = useState(() => Number(read('relay.bgDim', '78')));
  const [custom, setCustom] = useState(() => read('relay.bgCustom', ''));
  const [match, setMatchState] = useState(() => read('relay.bgMatch', '1') === '1');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write('relay.theme', theme);
  }, [theme]);

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
    const theme = BACKGROUNDS.find((b) => b.id === id)?.theme;
    if (match && theme) setThemeState(theme);
  }, [match]);

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
    setTheme: setThemeState,
    background,
    chooseBackground,
    uploadBackground,
    hasCustom: !!custom,
    accent,
    setAccent: setAccentState,
    dim,
    setDim: (n: number) => { setDimState(n); write('relay.bgDim', String(n)); },
    match,
    setMatch: (on: boolean) => { setMatchState(on); write('relay.bgMatch', on ? '1' : '0'); },
  };
}

export type Appearance = ReturnType<typeof useAppearance>;
