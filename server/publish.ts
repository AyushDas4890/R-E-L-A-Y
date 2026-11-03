// A published page as a plain, read-only HTML document for signed-out readers. Everything that comes
// from a page is escaped; only http(s) and mailto links and https images survive; no script is sent.
import type { Block, DbData, Page, Property, Rich } from '../src/types.ts';
import { asText, cellValue, type Ctx } from '../src/dbquery.ts';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (u: string | undefined): string | null => (u && /^(https?:\/\/|mailto:)[^\s"'<>]{1,2000}$/i.test(u) ? u : null);
const safeImg = (u: string | undefined): string | null => (u && /^https:\/\/[^\s"'<>]{1,2000}$/i.test(u) ? u : null);

export interface PublishOptions {
  // The public path of a sub-page that is published too, or null when it is not.
  linkFor: (pageId: string) => string | null;
  titleFor: (pageId: string) => string | null;
  db?: DbData;
  siteName: string;
}

function rich(spans: Rich[]): string {
  return spans.map((r) => {
    let t = esc(r.t);
    if (r.mention?.kind === 'user') t = '@member';
    if (r.c) t = `<code>${t}</code>`;
    if (r.b) t = `<strong>${t}</strong>`;
    if (r.i) t = `<em>${t}</em>`;
    if (r.u) t = `<u>${t}</u>`;
    if (r.s) t = `<s>${t}</s>`;
    const href = safeHref(r.link);
    if (href) t = `<a href="${esc(href)}" rel="noopener noreferrer nofollow">${t}</a>`;
    return t;
  }).join('');
}

function blocks(list: Block[], o: PublishOptions, depth = 0): string {
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const kids = () => (b.children.length && depth < 6 ? `<div class="kids">${blocks(b.children, o, depth + 1)}</div>` : '');
    switch (b.type) {
      case 'h1': html += `<h1>${rich(b.text)}</h1>${kids()}`; break;
      case 'h2': html += `<h2>${rich(b.text)}</h2>${kids()}`; break;
      case 'h3': html += `<h3>${rich(b.text)}</h3>${kids()}`; break;
      case 'bullet':
      case 'number': {
        const tag = b.type === 'bullet' ? 'ul' : 'ol';
        let items = '';
        let j = i;
        while (j < list.length && list[j].type === b.type) {
          items += `<li>${rich(list[j].text)}${list[j].children.length && depth < 6 ? blocks(list[j].children, o, depth + 1) : ''}</li>`;
          j += 1;
        }
        html += `<${tag}>${items}</${tag}>`;
        i = j - 1;
        break;
      }
      case 'todo': html += `<p class="todo"><input type="checkbox" disabled${b.checked ? ' checked' : ''}> ${rich(b.text)}</p>${kids()}`; break;
      case 'toggle': html += `<details><summary>${rich(b.text)}</summary>${kids()}</details>`; break;
      case 'quote': html += `<blockquote>${rich(b.text)}${kids()}</blockquote>`; break;
      case 'callout': html += `<div class="callout"><span>${esc(b.icon || '💡')}</span><div>${rich(b.text)}${kids()}</div></div>`; break;
      case 'divider': html += '<hr>'; break;
      case 'code': html += `<pre><code>${esc(b.text.map((r) => r.t).join(''))}</code></pre>`; break;
      case 'equation': html += `<p class="eq"><code>${esc(b.text.map((r) => r.t).join(''))}</code></p>`; break;
      case 'image': {
        const src = safeImg(b.url);
        html += src ? `<figure><img src="${esc(src)}" alt="${esc(b.name || '')}" loading="lazy"><figcaption>${rich(b.text)}</figcaption></figure>` : '';
        break;
      }
      case 'bookmark':
      case 'file': {
        const href = safeHref(b.url);
        html += href ? `<p><a href="${esc(href)}" rel="noopener noreferrer nofollow">${esc(b.name || b.url || href)}</a></p>` : '';
        break;
      }
      case 'table': {
        const rows = b.rows ?? [];
        html += `<table>${rows.map((r, ri) => `<tr>${r.map((c) => `<${b.header && ri === 0 ? 'th' : 'td'}>${esc(c)}</${b.header && ri === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
        break;
      }
      case 'columns': html += `<div class="cols">${b.children.map((c) => `<div>${blocks(c.children, o, depth + 1)}</div>`).join('')}</div>`; break;
      case 'pageLink':
      case 'subpage': {
        const id = b.pageId ?? '';
        const href = o.linkFor(id);
        const title = o.titleFor(id);
        html += title === null ? '' : href ? `<p><a href="${esc(href)}">${esc(title || 'Untitled')}</a></p>` : `<p>${esc(title || 'Untitled')}</p>`;
        break;
      }
      case 'toc':
      case 'breadcrumb':
      case 'database':
        break;
      default: html += `<p>${rich(b.text)}</p>${kids()}`;
    }
  }
  return html;
}

function database(db: DbData): string {
  const ctx: Ctx = { now: Date.now(), related: () => undefined, userName: () => 'member' };
  const view = db.views[0];
  const shown: Property[] = db.props.filter((p) => p.type === 'title' || view?.visible.includes(p.id)).filter((p) => p.type !== 'relation' && p.type !== 'person' && p.type !== 'createdBy' && p.type !== 'editedBy' && p.type !== 'button');
  const rows = db.rows.filter((r) => r.trashedAt === undefined).sort((a, b) => a.order - b.order).slice(0, 1000);
  return `<table><tr>${shown.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${shown.map((p) => `<td>${esc(asText(p, cellValue(db, r, p, ctx), ctx).join(', '))}</td>`).join('')}</tr>`).join('')}</table>`;
}

const STYLE = `body{margin:0;background:#fff;color:#1f1f1e;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Inter,sans-serif}main{max-width:720px;margin:0 auto;padding:48px 24px 96px}h1{font-size:2.2rem;line-height:1.2;margin:.2em 0 .6em}h2{font-size:1.6rem;margin:1.4em 0 .4em}h3{font-size:1.25rem;margin:1.2em 0 .3em}p{margin:.4em 0}.todo input{margin-right:.4em}blockquote{border-left:3px solid #1f1f1e;margin:.6em 0;padding:0 1em}.callout{display:flex;gap:.7em;background:#f6f5f4;border-radius:6px;padding:12px 14px;margin:.6em 0}pre{background:#f6f5f4;border-radius:6px;padding:12px;overflow:auto}code{background:#f6f5f4;border-radius:4px;padding:0 .3em;font-size:.9em}pre code{background:none;padding:0}table{border-collapse:collapse;margin:.6em 0;max-width:100%;display:block;overflow:auto}td,th{border:1px solid #dfdcd9;padding:6px 10px;text-align:left}th{background:#f6f5f4}img{max-width:100%;border-radius:4px}hr{border:0;border-top:1px solid #dfdcd9;margin:1.4em 0}.cols{display:flex;gap:24px}.cols>div{flex:1;min-width:0}.kids{margin-left:1.4em}a{color:#0075de}footer{margin-top:64px;color:#78736f;font-size:.85rem}.icon{font-size:3rem;line-height:1}@media (prefers-color-scheme:dark){body{background:#191919;color:#e6e6e4}.callout,pre,code,th{background:#262625}td,th{border-color:#3a3a38}hr{border-color:#3a3a38}a{color:#6ab4ff}blockquote{border-color:#e6e6e4}footer{color:#a39e98}}`;

export function renderPublished(page: Page, body: { blocks: Block[]; db?: DbData }, o: PublishOptions): string {
  const title = page.title || 'Untitled';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · ${esc(o.siteName)}</title><style>${STYLE}</style></head><body><main>${page.icon ? `<div class="icon">${esc(page.icon)}</div>` : ''}<h1>${esc(title)}</h1>${body.db ? database(body.db) : ''}${blocks(body.blocks, o)}<footer>Published from ${esc(o.siteName)}</footer></main></body></html>`;
}

export const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title><style>${STYLE}</style></head><body><main><h1>Page not found</h1><p>This page isn’t published, or the link is wrong.</p></main></body></html>`;

// Headers for every published response: no script, no framing, no sniffing.
export const PUBLISH_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};
