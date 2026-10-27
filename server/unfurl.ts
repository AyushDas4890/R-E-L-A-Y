// Link previews. The server fetches the first link in a message and reads its
// Open Graph / <title> tags. Private and loopback addresses are refused so a
// message can't make the server probe its own network.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LinkPreview } from '../src/types.ts';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>()"']+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").trim();

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : undefined;
}

export function parsePreview(html: string, url: string): LinkPreview | null {
  const title = meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  if (!title?.trim()) return null;
  const image = meta(html, 'og:image') ?? meta(html, 'twitter:image');
  return {
    url,
    title: decode(title).slice(0, 200),
    description: (meta(html, 'og:description') ?? meta(html, 'description'))?.slice(0, 300),
    image: image ? new URL(image, url).href : undefined,
    site: meta(html, 'og:site_name') ?? new URL(url).hostname.replace(/^www\./, ''),
  };
}

export async function unfurl(url: string): Promise<LinkPreview | null> {
  let target = new URL(url);
  // Follow redirects by hand so every hop is checked against private ranges.
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(target.protocol)) return null;
    const host = target.hostname.replace(/^\[|\]$/g, '');
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (addrs.some(isPrivateAddress)) return null;

    const res = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'RelayBot/1.0 (link preview)', accept: 'text/html' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      target = new URL(res.headers.get('location')!, target);
      continue;
    }
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') ?? '')) return null;

    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel();
    return parsePreview(Buffer.concat(chunks).toString('utf8'), target.href);
  }
  return null;
}
