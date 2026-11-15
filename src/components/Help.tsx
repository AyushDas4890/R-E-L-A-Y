import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { StackItem } from '@astryxdesign/core/Layout';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ARTICLES, CATEGORIES, articleBySlug, searchArticles, type Article, type Block } from '../help.ts';
import { SiteFrame, SiteSection, type Route } from './Site.tsx';
import { Mascot } from './SiteShots.tsx';

const slugFromPath = (path: string): string => path.replace(/^\/help\/?/, '').replace(/\/+$/, '');
const hrefOf = (slug: string) => (slug ? `/help/${slug}` : '/help');

// Backticks mark code; everything else is plain text, so articles can't inject markup.
function inline(text: string): ReactNode {
  return text.split('`').map((part, i) => (i % 2 === 1 ? (part ? <code key={i}>{part}</code> : null) : <Fragment key={i}>{part}</Fragment>));
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        'p' in b ? <Text key={i} as="p" display="block">{inline(b.p)}</Text>
        : 'h' in b ? <Heading key={i} level={2}>{b.h}</Heading>
        : 'note' in b ? <Card key={i} variant="purple" padding={4}><Text color="secondary">{inline(b.note)}</Text></Card>
        : 'ul' in b ? <ul key={i}>{b.ul.map((t, j) => <li key={j}><Text>{inline(t)}</Text></li>)}</ul>
        : <ol key={i}>{b.ol.map((t, j) => <li key={j}><Text>{inline(t)}</Text></li>)}</ol>,
      )}
    </>
  );
}

// The help center: a search and the article categories, or one article with its siblings beside it.
// Article links are plain hrefs; the site frame routes them, and popstate brings the slug here.
export function HelpPage({ onGetStarted, signedIn }: { go: (r: Route) => void; onGetStarted: () => void; signedIn: boolean }) {
  const [slug, setSlug] = useState(() => slugFromPath(location.pathname));
  const [query, setQuery] = useState('');
  const narrow = useMediaQuery('(max-width: 860px)');
  const article = articleBySlug(slug);

  useEffect(() => {
    const onPop = () => { setSlug(slugFromPath(location.pathname)); setQuery(''); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A new article starts at the top, and the tab title says where you are.
  useEffect(() => {
    document.querySelector('.site-page')?.scrollIntoView({ block: 'start' });
    document.title = article ? `${article.title} · Relay Help` : 'Relay Help Center';
    return () => { document.title = 'Relay'; };
  }, [article]);

  const results = useMemo(() => searchArticles(query), [query]);
  const category = article && CATEGORIES.find((c) => c.id === article.category);
  const siblings = article ? ARTICLES.filter((a) => a.category === article.category) : [];

  return (
    <SiteFrame route="help" onGetStarted={onGetStarted} signedIn={signedIn}>
      {article ? (
        <SiteSection paddingBlockStart={8} gap={6}>
          <HStack gap={2} vAlign="center">
            <Link href="/help" type="supporting">Help center</Link>
            <Text type="supporting">/</Text>
            <Text type="supporting">{category?.label}</Text>
          </HStack>
          <HStack gap={10} vAlign="start">
            {!narrow && (
              <VStack as="nav" aria-label={category?.label} gap={2} width={220} hAlign="start">
                <Text type="label" weight="semibold" color="secondary">{category?.label}</Text>
                {siblings.map((a) => (
                  <Link key={a.slug} href={hrefOf(a.slug)} color={a.slug === article.slug ? 'primary' : 'secondary'} weight={a.slug === article.slug ? 'semibold' : 'normal'}>{a.title}</Link>
                ))}
              </VStack>
            )}
            <StackItem size="fill">
              <VStack as="article" gap={4} maxWidth={720} className="site-prose">
                <Heading level={1} type="display-3" weight="semibold">{article.title}</Heading>
                <Text type="large" color="secondary">{article.summary}</Text>
                <Blocks blocks={article.body} />
                <Card variant="purple" padding={5}>
                  <HStack gap={6} vAlign="center" justify="between" wrap="wrap">
                    <VStack gap={2} hAlign="start" maxWidth={420}>
                      <Text weight="semibold">Still stuck</Text>
                      <Text color="secondary">Ask your workspace admin, or search the help center for another way to say it.</Text>
                      <Link href="/help">Back to the help center</Link>
                    </VStack>
                    <Mascot say="Try asking me in Relay" />
                  </HStack>
                </Card>
              </VStack>
            </StackItem>
          </HStack>
        </SiteSection>
      ) : (
        <>
          <SiteSection paddingBlockStart={10} paddingBlockEnd={6} gap={5}>
            <VStack gap={4} hAlign="start" className="site-rise">
              <Text color="secondary" weight="medium">Help center</Text>
              <Heading level={1} type="display-2" weight="semibold">How can we help?</Heading>
              <Text type="large" color="secondary">{ARTICLES.length} short guides, from signing in to deleting your account</Text>
              <VStack width="100%" maxWidth={560}>
                <TextInput label="Search the help center" isLabelHidden placeholder="Search the help center" value={query} onChange={setQuery} size="lg" />
              </VStack>
            </VStack>
          </SiteSection>
          {query.trim() ? (
            <SiteSection paddingBlockStart={0} gap={3}>
              <Text type="supporting">{results.length ? `${results.length} article${results.length === 1 ? '' : 's'}` : 'No articles match. Try fewer or different words'}</Text>
              {results.map((a: Article) => (
                <ClickableCard key={a.slug} label={a.title} href={hrefOf(a.slug)} padding={4}>
                  <VStack gap={1}><Text weight="semibold">{a.title}</Text><Text type="supporting">{a.summary}</Text></VStack>
                </ClickableCard>
              ))}
            </SiteSection>
          ) : (
            <SiteSection paddingBlockStart={0} gap={0}>
              {CATEGORIES.map((c) => (
                <VStack key={c.id} gap={0}>
                  <Divider />
                  <Grid columns={narrow ? 1 : 3} gap={narrow ? 3 : 8} className="site-runsheet">
                    <VStack gap={1}>
                      <Heading level={2}>{c.label}</Heading>
                      <Text color="secondary">{c.blurb}</Text>
                    </VStack>
                    <Grid columns={narrow ? 1 : 2} gap={2} className="site-span-2">
                      {ARTICLES.filter((a) => a.category === c.id).map((a) => <Link key={a.slug} href={hrefOf(a.slug)}>{a.title}</Link>)}
                    </Grid>
                  </Grid>
                </VStack>
              ))}
            </SiteSection>
          )}
        </>
      )}
    </SiteFrame>
  );
}
