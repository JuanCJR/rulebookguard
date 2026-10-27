import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { parseContext, parseRule } from '../../src/index.ts';
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

    const result = await runCli(['new', 'clients'], repo);

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
    expect(rule.summary).toBe('TODO: one-line summary of the rule.');
    expect(rule.body).toContain('Scenario: TODO');
    expect((await runCli(['show', 'R-CLI-004'], repo)).status).toBe(0);
  });

  it('writes the template in the configured language', async () => {
    const repo = await scratchRepo();
    const config = join(repo, 'rulebookguard.config.yaml');
    await writeFile(config, `${await readFile(config, 'utf8')}language: es\n`);

    const result = await runCli(['new', 'clients'], repo);

    expect(result).toEqual({ status: 0, stdout: `${CLIENTS}/R-CLI-004.md\n`, stderr: '' });
    const file = `${CLIENTS}/R-CLI-004.md`;
    const rule = parseRule(await readFile(join(repo, file), 'utf8'), file);
    expect(rule).toMatchObject({ id: 'R-CLI-004', context: 'clients', status: 'proposed' });
    expect(rule.summary).toBe('TODO: resumen de la regla en una línea.');
    expect(rule.body).toContain('# TODO: título de la regla');
    expect(rule.body).toContain('# language: es\nEscenario: TODO');
  });

  it('increments on every call', async () => {
    const repo = await scratchRepo();

    await runCli(['new', 'billing'], repo);
    const result = await runCli(['new', 'billing'], repo);

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

    const result = await runCli(['new', 'clients'], repo);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${CLIENTS}/R-CLI-008.md\n`);
    expect(await readFile(broken, 'utf8')).toBe('not a rule\n');
  });

  it('fails when the context has no free id left', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, CLIENTS, 'R-CLI-999.md'), 'taken\n');

    const result = await runCli(['new', 'clients'], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'No free rule id left in context "clients" (R-CLI-999 is taken).\n',
    );
  });

  it('creates a missing context and its first rule, printing both paths', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['new', 'inventory'], repo);

    expect(result).toEqual({
      status: 0,
      stdout: 'docs/rules/inventory/_context.md\ndocs/rules/inventory/R-INV-001.md\n',
      stderr: '',
    });
    const file = 'docs/rules/inventory/_context.md';
    expect(parseContext(await readFile(join(repo, file), 'utf8'), file)).toMatchObject({
      context: 'inventory',
      prefix: 'INV',
      summary: 'TODO: one-line summary of the context.',
    });
    expect((await runCli(['contexts'], repo)).stdout).toContain(
      'inventory (INV, 1 rule): TODO: one-line summary of the context.\n',
    );
    expect((await runCli(['show', 'R-INV-001'], repo)).status).toBe(0);
  });

  it('uses --prefix for a new context', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['new', 'inventory', '--prefix', 'STK'], repo);

    expect(result.stdout).toBe(
      'docs/rules/inventory/_context.md\ndocs/rules/inventory/R-STK-001.md\n',
    );
  });

  it('writes the context template in the configured language', async () => {
    const repo = await scratchRepo();
    const config = join(repo, 'rulebookguard.config.yaml');
    await writeFile(config, `${await readFile(config, 'utf8')}language: es\n`);

    await runCli(['new', 'inventory'], repo);

    const file = 'docs/rules/inventory/_context.md';
    const context = parseContext(await readFile(join(repo, file), 'utf8'), file);
    expect(context.summary).toBe('TODO: resumen del contexto en una línea.');
    expect(context.body).toBe('TODO: describe qué cubre este contexto y qué queda fuera.\n');
  });

  it('accepts --prefix equal to the prefix of an existing context', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['new', 'clients', '--prefix', 'CLI'], repo);

    expect(result).toEqual({ status: 0, stdout: `${CLIENTS}/R-CLI-004.md\n`, stderr: '' });
  });

  it.each([
    [
      ['new', 'clients', '--prefix', 'CLX'],
      'Context "clients" already exists with prefix "CLI", not "CLX".',
    ],
    [
      ['new', 'clientele'],
      'Prefix "CLI" is already used by context "clients". Pass another one with --prefix.',
    ],
    [
      ['new', '2024-plans'],
      'Invalid prefix "202": use uppercase letters and digits, starting with a letter. Pass one with --prefix.',
    ],
    [
      ['new', 'inventory', '--prefix', 'inv'],
      'Invalid prefix "inv": use uppercase letters and digits, starting with a letter. Pass one with --prefix.',
    ],
    [
      ['new', '../outside'],
      'Invalid context name "../outside": use lowercase letters, digits, "-" or "_", starting with a letter or digit.',
    ],
  ])('rejects %j and writes nothing', async (args, message) => {
    const repo = await scratchRepo();
    const before = await readdir(join(repo, 'docs/rules'), { recursive: true });

    expect(await runCli(args, repo)).toEqual({ status: 1, stdout: '', stderr: `${message}\n` });
    expect(await readdir(join(repo, 'docs/rules'), { recursive: true })).toEqual(before);
    expect(await readdir(repo)).not.toContain('outside');
  });

  it('requires a context', async () => {
    const result = await runCli(['new'], fixtureRoot('repo'));

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      'Missing argument <context>. Usage: rulebookguard new <context> [--prefix <P>]\n',
    );
  });
});
