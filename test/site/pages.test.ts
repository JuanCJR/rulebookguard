import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadCatalog } from '../../src/catalog/load.ts';
import { siteData } from '../../src/site/data.ts';
import { sitePages } from '../../src/site/pages.ts';
import { fixtureRoot } from '../cli/run.ts';
import { scratchDir } from '../scratch.ts';

async function pages(options: { language?: 'en' | 'es'; base?: string; repo?: string } = {}) {
  const data = await siteData(await loadCatalog(options.repo ?? fixtureRoot('repo')));
  return sitePages(data, { language: options.language ?? 'en', base: options.base ?? '/' });
}

describe('sitePages', () => {
  it('writes the Starlight content files for every context and rule', async () => {
    const files = await pages();

    expect([...files.keys()].sort()).toEqual([
      'public/favicon.svg',
      'src/content.config.ts',
      'src/content/docs/billing/index.md',
      'src/content/docs/billing/r-bil-001.md',
      'src/content/docs/billing/r-bil-002.md',
      'src/content/docs/clients/index.md',
      'src/content/docs/clients/r-cli-001.md',
      'src/content/docs/clients/r-cli-002.md',
      'src/content/docs/clients/r-cli-003.md',
      'src/content/docs/health.md',
      'src/content/docs/index.md',
      'src/pages/rules.astro',
    ]);
  });

  it('maps the contexts on the home page with links and status counts', async () => {
    const home = (await pages()).get('src/content/docs/index.md') ?? '';

    expect(home).toContain('title: "Business rules"');
    expect(home).toContain('| [billing](/billing/) | BIL | ');
    expect(home).toMatch(/\| \[clients\]\(\/clients\/\) \| CLI \| [^|]+ \| 1 \| 1 \| 1 \|/);
  });

  it('gives a rule page its metadata, rule text, anchors, tests, history and supersedes chain', async () => {
    const page = (await pages()).get('src/content/docs/billing/r-bil-002.md') ?? '';

    expect(page).toContain('title: "R-BIL-002"');
    expect(page).toContain('description: "Invoices are numbered without gaps."');
    expect(page).toContain('| Status | active |');
    expect(page).toContain('| Context | [billing](/billing/) |');
    expect(page).toContain('| Supersedes | R-BIL-000 |');
    expect(page).toContain('- `src/billing/invoice.go`');
    expect(page).toContain('## Tests (0)');
  });

  it('demotes the headings of the rule text below the page sections', async () => {
    const page = (await pages()).get('src/content/docs/clients/r-cli-001.md') ?? '';

    expect(page).toContain('### Unique document number');
    expect(page).not.toMatch(/^# Unique document number$/m);
  });

  it('links rules of the chain that exist and keeps the others as plain ids', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    await writeFile(
      join(repo, 'docs/rules/billing/R-BIL-003.md'),
      '---\nid: R-BIL-003\ncontext: billing\nentities: []\nstatus: proposed\nsupersedes: R-BIL-002\nanchors: []\nsummary: Per series.\n---\n',
    );

    const files = await pages({ repo });

    expect(files.get('src/content/docs/billing/r-bil-003.md')).toContain(
      '| Supersedes | [R-BIL-002](/billing/r-bil-002/) → R-BIL-000 |',
    );
    expect(files.get('src/content/docs/billing/r-bil-002.md')).toContain(
      '| Superseded by | [R-BIL-003](/billing/r-bil-003/) |',
    );
  });

  it('ships the favicon Starlight links to', async () => {
    const favicon = (await pages()).get('public/favicon.svg') ?? '';

    expect(favicon).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>/);
    expect(favicon.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('styles the filters with Starlight tokens and keeps rule ids on one line', async () => {
    const list = (await pages()).get('src/pages/rules.astro') ?? '';

    expect(list).toContain('<td class="rbg-id">');
    expect(list).toMatch(/\.rbg-id \{[^}]*white-space: nowrap;/);
    expect(list).toMatch(
      /\.rbg-filters :is\(input, select\) \{[^}]*border: 1px solid var\(--sl-color-gray-5\);/,
    );
    expect(list).toMatch(
      /\.rbg-filters :is\(input, select\) \{[^}]*background-color: var\(--sl-color-bg\);/,
    );
    expect(list).toMatch(
      /\.rbg-filters :is\(input, select\) \{[^}]*color: var\(--sl-color-white\);/,
    );
    expect(list).toMatch(/\.rbg-filters > \* \{[^}]*margin: 0;/);
    expect(list).toMatch(/\.rbg-filters :is\(input, select\) \{[^}]*height: 2\.5rem;/);
    expect(list).toMatch(/<div class="rbg-table">\s*<table class="rbg-rules">/);
    expect(list).toMatch(/\.rbg-table \{[^}]*overflow-x: auto;/);
  });

  it('lists every rule in the filterable page with its filter attributes', async () => {
    const list = (await pages()).get('src/pages/rules.astro') ?? '';

    expect(list).toContain(
      'import StarlightPage from "@astrojs/starlight/components/StarlightPage.astro";',
    );
    expect(list).toContain('data-context="billing" data-status="active"');
    expect(list).toContain('<option value="deprecated">deprecated</option>');
    expect(list.match(/<tr data-context=/g)).toHaveLength(5);
  });

  it('escapes text that Markdown, HTML or Astro would interpret', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    await writeFile(
      join(repo, 'docs/rules/billing/R-BIL-009.md'),
      '---\nid: R-BIL-009\ncontext: billing\nentities: []\nstatus: proposed\nanchors: []\nsummary: "Totals | {sum} <b>"\n---\n',
    );

    const files = await pages({ repo });

    expect(files.get('src/content/docs/billing/index.md')).toContain('Totals \\| {sum} &lt;b>');
    expect(files.get('src/pages/rules.astro')).toContain('Totals | &#123;sum&#125; &lt;b&gt;');
  });

  it('reports the lint findings on the health board', async () => {
    const health = (await pages()).get('src/content/docs/health.md') ?? '';

    expect(health).toContain('title: "Health"');
    expect(health).toMatch(/\d+ errors?, \d+ warnings?/);
    expect(health).toContain(
      '| error | untested-rule | [docs/rules/billing/R-BIL-002.md](/billing/r-bil-002/) |',
    );
  });

  it('writes the generated text in the configured language', async () => {
    const files = await pages({ language: 'es' });

    expect(files.get('src/content/docs/index.md')).toContain('title: "Reglas de negocio"');
    expect(files.get('src/content/docs/billing/r-bil-002.md')).toContain('| Estado | active |');
    expect(files.get('src/content/docs/health.md')).toContain('title: "Salud"');
  });

  it('prefixes every internal link with the base path', async () => {
    const files = await pages({ base: 'docs/rules' });

    expect(files.get('src/content/docs/index.md')).toContain('[billing](/docs/rules/billing/)');
    expect(files.get('src/pages/rules.astro')).toContain('href="/docs/rules/billing/r-bil-001/"');
  });
});
