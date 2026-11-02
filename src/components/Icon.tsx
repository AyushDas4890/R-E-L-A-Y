// One line-icon set for the whole interface: 24px grid, 1.5 stroke, colored by the surrounding text.
const PATHS = {
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 14h4v6H5a2 2 0 0 1-2-2zM21 14h-4v6h2a2 2 0 0 0 2-2z',
  bellOff: 'M8.7 3A6 6 0 0 1 18 8c0 2.7.6 4.5 1.2 5.6M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14M10.3 21a2 2 0 0 0 3.4 0M2 2l20 20',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  gem: 'M6 3h12l4 6-10 13L2 9zM2 9h20M12 22 8 9l4-6 4 6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  plus: 'M12 5v14M5 12h14',
  building: 'M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 7h3M8 11h3M8 15h3',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  check: 'M20 6 9 17l-5-5',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  checkSquare: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  megaphone: 'm3 11 18-5v12L3 14zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  micOff: 'M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3M19 10v2a7 7 0 0 1-.1 1.2M5 10v2a7 7 0 0 0 12 5M12 19v3',
  video: 'm22 8-6 4 6 4zM14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z',
  paperclip: 'm21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  stop: 'M6 6h12v12H6z',
  pin: 'M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  flag: 'M4 22V4M4 4h14l-2 4 2 4H4',
  monitor: 'M2 4h20v12H2zM8 21h8M12 16v5',
  volumeX: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  command: 'M15 6a3 3 0 1 1 3 3h-12a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3z',
  bot: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2',
  home: 'M3 11 12 3l9 8M5 9.5V21h14V9.5M10 21v-6h4v6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ n, size = 16, fill }: { n: IconName; size?: number; fill?: boolean }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[n]} />
    </svg>
  );
}
