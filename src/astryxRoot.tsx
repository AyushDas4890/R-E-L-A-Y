// Wraps the app in the Astryx design system theme. Astryx has its own light and dark token sets; which one
// is used follows the Relay theme that is painted (data-theme on <html>), judged by its background colour,
// so every Relay theme, including ones added later, gets a matching Astryx mode without a list to maintain.
import { useEffect, useState, type ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from './astryx-themes.ts';

export type AstryxMode = 'light' | 'dark';

// Relative luminance of a CSS colour string (#rgb, #rrggbb or rgb()); anything unreadable counts as light.
export function colorIsDark(value: string): boolean {
  const v = value.trim();
  let r = 255, g = 255, b = 255;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else if (rgb) {
    r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
  } else return false;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function paintedMode(): AstryxMode {
  if (typeof document === 'undefined') return 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg');
  return colorIsDark(bg) ? 'dark' : 'light';
}

// The root Astryx <Theme> writes data-theme="light" | "dark" onto <html> whenever its mode changes, which
// would wipe out the Relay theme that the app's CSS keys off the same attribute. Relay themes are never
// named plain "light" or "dark", so when one of those appears the last Relay theme is put back.
let relayTheme = typeof document === 'undefined' ? '' : document.documentElement.dataset.theme ?? '';
const isAstryxMode = (t: string | undefined) => t === 'light' || t === 'dark';

export function useAstryxMode(): AstryxMode {
  const [mode, setMode] = useState<AstryxMode>(paintedMode);
  useEffect(() => {
    const update = () => {
      const html = document.documentElement;
      const t = html.dataset.theme;
      if (isAstryxMode(t)) {
        if (relayTheme) html.dataset.theme = relayTheme;
        return;
      }
      if (t) relayTheme = t;
      setMode(paintedMode());
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look'] });
    return () => mo.disconnect();
  }, []);
  return mode;
}

export function AstryxRoot({ children }: { children: ReactNode }) {
  const mode = useAstryxMode();
  return <Theme theme={themes[defaultThemeSlug]} mode={mode}>{children}</Theme>;
}
