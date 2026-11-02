import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ARTICLES, CATEGORIES, articleBySlug, searchArticles, type Article, type Block } from '../help.ts';
import { Icon } from './Icon.tsx';
import { SiteFooter, SiteNav, type Route } from './Site.tsx';

const slugFromPath = (path: string): string => path.replace(/^\/help\/?/, '').replace(/\/+$/, '');

// Backticks mark code; everything else is plain text, so articles can't inject markup.
function inline(text: string): ReactNode {
  return text.split('`').map((part, i) => (i % 2 === 1 ? (part ? <code key={i}>{part}</code> : null) : <Fragment key={i}>{part}</Fragment>));
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        'p' in b ? <p key={i}>{inline(b.p)}</p>
        : 'h' in b ? <h2 key={i}>{b.h}</h2>
        : 'note' in b ? <p key={i} className="hp-note">{inline(b.note)}</p>
        : 'ul' in b ? <ul key={i}>{b.ul.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
        : <ol key={i}>{b.ol.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>,
      )}
    </>
  );
}

export function HelpPage({ go, onGetStarted, signedIn }: { go: (r: Route) => void; onGetStarted: () => void; signedIn: boolean }) {
  const [slug, setSlug] = useState(() => slugFromPath(location.pathname));
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const article = articleBySlug(slug);

  useEffect(() => {
    const onPop = () => setSlug(slugFromPath(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A new article starts at the top, and the tab title says where you are.
  useEffect(() => {
    root.current?.scrollTo({ top: 0 });
    document.title = article ? `${article.title} · Relay Help` : 'Relay Help Center';
    return () => { document.title = 'Relay'; };
  }, [article]);

  const open = (to: string) => {
    const path = to ? `/help/${to}` : '/help';
    if (path !== location.pathname) window.history.pushState(null, '', path);
    setSlug(to);
    setQuery('');
  };
  const link = (to: string, children: ReactNode, className?: string) => (
    <a href={to ? `/help/${to}` : '/help'} className={className} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      open(to);
    }}>{children}</a>
  );

  const results = useMemo(() => searchArticles(query), [query]);
  const category = article && CATEGORIES.find((c) => c.id === article.category);
  const siblings = article ? ARTICLES.filter((a) => a.category === article.category) : [];

  return (
    <div className="ap hp" ref={root}>
      <section className="ap-hero hp-hero">
        <div className="ap-sky" aria-hidden />
        <SiteNav route="help" go={go} onGetStarted={onGetStarted} signedIn={signedIn} />
        {article ? (
          <div className="hp-crumbs">
            {link('', 'Help center')}<Icon n="chevron" size={12} />{category?.label}
          </div>
        ) : (
          <div className="hp-head">
            <h1>How can we help?</h1>
            <label className="hp-search">
              <Icon n="search" size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the help center" aria-label="Search the help center" />
            </label>
          </div>
        )}
      </section>

      {article ? (
        <main className="hp-article-wrap">
          <aside className="hp-side" aria-label={category?.label}>
            <b>{category?.label}</b>
            {siblings.map((a) => link(a.slug, a.title, a.slug === article.slug ? 'on' : undefined))}
          </aside>
          <article className="hp-article">
            <h1>{article.title}</h1>
            <p className="hp-lede">{article.summary}</p>
            <Blocks blocks={article.body} />
            <div className="hp-foot">
              <b>Still stuck?</b>
              <p>Ask your workspace admin, or search the help center for another way to say it.</p>
              {link('', 'Back to the help center', 'ap-more')}
            </div>
          </article>
        </main>
      ) : query.trim() ? (
        <main className="hp-results">
          <p className="hp-count">{results.length ? `${results.length} article${results.length === 1 ? '' : 's'}` : 'No articles match. Try fewer or different words.'}</p>
          {results.map((a: Article) => link(a.slug, <><strong>{a.title}</strong><span>{a.summary}</span></>, 'hp-hit'))}
        </main>
      ) : (
        <main className="hp-grid">
          {CATEGORIES.map((c) => (
            <section key={c.id} className="hp-card">
              <h2>{c.label}</h2>
              <p>{c.blurb}</p>
              <ul>
                {ARTICLES.filter((a) => a.category === c.id).map((a) => <li key={a.slug}>{link(a.slug, a.title)}</li>)}
              </ul>
            </section>
          ))}
        </main>
      )}
      <SiteFooter go={go} />
    </div>
  );
}
