import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadCatalog } from '../../src/catalog/load.ts';
import { lintCatalog } from '../../src/commands/lint.ts';
import { siteData } from '../../src/site/data.ts';
import { fixtureRoot, runCli } from '../cli/run.ts';
import { git, initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';

async function scratchRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  return dir;
}

const REPLACEMENT = `---
id: R-BIL-003
context: billing
entities: [Invoice]
status: proposed
supersedes: R-BIL-002
anchors:
  - 'src/billing/invoice.go'
summary: Invoices are numbered per series.
---

# Numbered per series
`;

describe('siteData', () => {
  it('gives each rule the files and tests impact reports', async () => {
    const repo = fixtureRoot('repo');
    const data = await siteData(await loadCatalog(repo));

    for (const { rule, files, tests } of data.rules) {
      const impact = JSON.parse((await runCli(['impact', rule.id, '--json'], repo)).stdout) as {
        files: string[];
        tests: unknown[];
      };
      expect({ id: rule.id, files, tests }).toEqual({
        id: rule.id,
        files: impact.files,
        tests: impact.tests,
      });
    }
    expect(data.rules.map(({ rule }) => rule.id)).toEqual([
      'R-BIL-001',
      'R-BIL-002',
      'R-CLI-001',
      'R-CLI-002',
      'R-CLI-003',
    ]);
    expect(data.contexts.map((context) => context.context)).toEqual(['billing', 'clients']);
  });

  it('carries the lint findings for the health board', async () => {
    const catalog = await loadCatalog(fixtureRoot('repo'));

    expect((await siteData(catalog)).findings).toEqual(await lintCatalog(catalog));
  });

  it('follows the supersedes chain both ways, keeping ids with no rule file', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, 'docs/rules/billing/R-BIL-003.md'), REPLACEMENT);

    const rules = new Map(
      (await siteData(await loadCatalog(repo))).rules.map((entry) => [entry.rule.id, entry]),
    );

    expect(rules.get('R-BIL-003')).toMatchObject({
      supersedes: ['R-BIL-002', 'R-BIL-000'],
      supersededBy: undefined,
    });
    expect(rules.get('R-BIL-002')).toMatchObject({
      supersedes: ['R-BIL-000'],
      supersededBy: 'R-BIL-003',
    });
    expect(rules.get('R-BIL-001')).toMatchObject({ supersedes: [], supersededBy: undefined });
  });

  it('stops a supersedes cycle', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, 'docs/rules/billing/R-BIL-003.md'), REPLACEMENT);
    const old = join(repo, 'docs/rules/billing/R-BIL-002.md');
    await writeFile(
      old,
      (await readFile(old, 'utf8')).replace('supersedes: R-BIL-000', 'supersedes: R-BIL-003'),
    );

    const rule = (await siteData(await loadCatalog(repo))).rules.find(
      (entry) => entry.rule.id === 'R-BIL-003',
    );

    expect(rule?.supersedes).toEqual(['R-BIL-002', 'R-BIL-003']);
  });

  it('lists the git history of each rule file, newest first', async () => {
    const repo = await scratchRepo();
    initRepo(repo);
    const file = join(repo, 'docs/rules/billing/R-BIL-001.md');
    await writeFile(file, `${await readFile(file, 'utf8')}\nMore.\n`);
    git(repo, 'commit', '-q', '-am', 'docs: clarify the zero balance');

    const rule = (await siteData(await loadCatalog(repo))).rules.find(
      (entry) => entry.rule.id === 'R-BIL-001',
    );

    expect(rule?.history.map(({ subject, author }) => ({ subject, author }))).toEqual([
      { subject: 'docs: clarify the zero balance', author: 'test' },
      { subject: 'initial', author: 'test' },
    ]);
    expect(rule?.history[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rule?.history[0]?.hash).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('has an empty history outside git', async () => {
    const repo = await scratchRepo();

    const data = await siteData(await loadCatalog(repo));

    expect(data.rules.every((entry) => entry.history.length === 0)).toBe(true);
  });
});
