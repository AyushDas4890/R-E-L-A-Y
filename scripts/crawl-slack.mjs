// Scrapes public Slack marketing pages via Firecrawl's REST API and writes markdown to docs/.
// Usage: FIRECRAWL_API_KEY=fc-... node scripts/crawl-slack.mjs
import fs from 'node:fs';
import path from 'node:path';

const key = process.env.FIRECRAWL_API_KEY;
if (!key) {
  console.error('Set FIRECRAWL_API_KEY first (see .env.example).');
  process.exit(1);
}

const pages = {
  home: 'https://slack.com/',
  pricing: 'https://slack.com/pricing',
  features: 'https://slack.com/features',
  huddles: 'https://slack.com/features/huddles',
  canvas: 'https://slack.com/features/canvas',
  workflows: 'https://slack.com/features/workflow-automation',
};

fs.mkdirSync('docs/slack', { recursive: true });

for (const [name, url] of Object.entries(pages)) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  });
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status} ${await res.text()}`);
    continue;
  }
  const body = await res.json();
  if (!body.success) {
    console.error(`${name}: ${JSON.stringify(body)}`);
    continue;
  }
  fs.writeFileSync(path.join('docs/slack', `${name}.md`), body.data.markdown ?? '');
  console.log(`saved docs/slack/${name}.md`);
}
