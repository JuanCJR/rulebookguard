import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { parseRule } from '../../src/index.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

async function scratchRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  return dir;
}

const CLIENTS = 'docs/rules/clients';

describe('new', () => {
  it('scaffolds the next free id as a proposed rule and prints its path', async () => {
    const repo = await scratchRepo();

    const result = runCli(['new', 'clients'], repo);

    expect(result).toEqual({ status: 0, stdout: `${CLIENTS}/R-CLI-004.md\n`, stderr: '' });
    const file = `${CLIENTS}/R-CLI-004.md`;
    const rule = parseRule(await readFile(join(repo, file), 'utf8'), file);
    expect(rule).toMatchObject({
      id: 'R-CLI-004',
      context: 'clients',
      status: 'proposed',
      entities: [],
      anchors: [],
    });
    expect(rule.summary).toContain('TODO');
    expect(runCli(['show', 'R-CLI-004'], repo).status).toBe(0);
  });

  it('increments on every call', async () => {
    const repo = await scratchRepo();

    runCli(['new', 'billing'], repo);
    const result = runCli(['new', 'billing'], repo);

    expect(result.stdout).toBe('docs/rules/billing/R-BIL-004.md\n');
    expect((await readdir(join(repo, 'docs/rules/billing'))).sort()).toEqual([
      'R-BIL-001.md',
      'R-BIL-002.md',
      'R-BIL-003.md',
      'R-BIL-004.md',
      '_context.md',
    ]);
  });

  it('skips ids taken by files that fail to parse and never overwrites them', async () => {
    const repo = await scratchRepo();
    const broken = join(repo, CLIENTS, 'R-CLI-007.md');
    await writeFile(broken, 'not a rule\n');

    const result = runCli(['new', 'clients'], repo);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${CLIENTS}/R-CLI-008.md\n`);
    expect(await readFile(broken, 'utf8')).toBe('not a rule\n');
  });

  it('fails when the context has no free id left', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, CLIENTS, 'R-CLI-999.md'), 'taken\n');

    const result = runCli(['new', 'clients'], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'No free rule id left in context "clients" (R-CLI-999 is taken).\n',
    );
  });

  it('rejects an unknown context', async () => {
    const repo = await scratchRepo();

    expect(runCli(['new', 'sales'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown context "sales". Run "rulebookguard contexts" to list them.\n',
    });
  });

  it('requires a context', () => {
    const result = runCli(['new'], fixtureRoot('repo'));

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('Missing argument <context>. Usage: rulebookguard new <context>\n');
  });
});
