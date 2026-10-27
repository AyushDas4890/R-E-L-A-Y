// Link previews. The server fetches the first link in a message and reads its
// Open Graph / <title> tags. Private and loopback addresses are refused so a
// message can't make the server probe its own network.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { LinkPreview } from '../src/types.ts';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>()"']+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

function privateV4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

// Expands any IPv6 spelling (::, embedded IPv4, zone ids) into its eight 16-bit groups.
function expandV6(ip: string): number[] | null {
  let v = ip.toLowerCase().split('%')[0];
  const tail4 = v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail4) {
    const [a, b, c, d] = tail4.slice(1).map(Number);
    v = `${v.slice(0, -tail4[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const double = v.split('::');
  if (double.length > 2) return null;
  const head = double[0] ? double[0].split(':') : [];
  const rest = double.length === 2 && double[1] ? double[1].split(':') : [];
  const fill = double.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

// Fails closed: anything that doesn't parse counts as private.
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) !== 6) return privateV4(ip);
  const g = expandV6(ip);
  if (!g) return true;
  const zeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroTo(8) || (zeroTo(7) && g[7] === 1)) return true; // :: and ::1
  if (zeroTo(5) && g[5] === 0xffff) return privateV4(v4From(g[6], g[7])); // ::ffff:a.b.c.d
  if (zeroTo(6)) return privateV4(v4From(g[6], g[7])); // ::a.b.c.d (deprecated compatible form)
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(v4From(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return privateV4(v4From(g[1], g[2])); // 6to4
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
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
  const rawImage = meta(html, 'og:image') ?? meta(html, 'twitter:image');
  let image: string | undefined;
  try {
    image = rawImage ? new URL(rawImage, url).href : undefined;
  } catch {
    image = undefined;
  }
  if (image && !/^https?:/i.test(image)) image = undefined;
  return {
    url,
    title: decode(title).slice(0, 200),
    description: (meta(html, 'og:description') ?? meta(html, 'description'))?.slice(0, 300),
    image,
    site: meta(html, 'og:site_name') ?? new URL(url).hostname.replace(/^www\./, ''),
  };
}

// Resolves a host and refuses it if any address is private. Used as the socket's own lookup, so
// the address checked is the address connected to (no DNS-rebinding gap between check and fetch).
function guardedLookup(hostname: string, options: LookupOptions, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void): void {
  dnsLookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err, '');
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(new Error(`blocked address for ${hostname}`), '');
    if (options.all) cb(null, addrs);
    else cb(null, addrs[0].address, addrs[0].family);
  });
}

interface Fetched { status: number; location?: string; type: string; body: Buffer }

function get(target: URL): Promise<Fetched> {
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      target,
      { lookup: guardedLookup as never, timeout: TIMEOUT_MS, headers: { 'user-agent': 'RelayBot/1.0 (link preview)', accept: 'text/html' } },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          chunks.push(c);
          size += c.length;
          if (size >= MAX_BYTES) res.destroy();
        });
        res.on('close', () => resolve({ status, type, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export async function unfurl(url: string): Promise<LinkPreview | null> {
  let target = new URL(url);
  // Follow redirects by hand so every hop is checked against private ranges.
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(target.protocol)) return null;
    // IP literals skip DNS, so the socket lookup never sees them; check them here.
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && isPrivateAddress(host)) return null;

    const res = await get(target);
    if (res.status >= 300 && res.status < 400 && res.location) {
      target = new URL(res.location, target);
      continue;
    }
    if (res.status < 200 || res.status >= 300 || !/text\/html/i.test(res.type)) return null;
    return parsePreview(res.body.toString('utf8'), target.href);
  }
  return null;
}
