import { appendFile, cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { changedSince } from '../../src/catalog/git.ts';
import { git, initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const USAGE = 'rulebookguard for <path>|--changed <ref> [--json]';
const BIL_001 = 'R-BIL-001 (billing): Every new client gets a zero-balance account.';
const BIL_002 = 'R-BIL-002 (billing): Invoices are numbered without gaps.';
const CLI_001 = 'R-CLI-001 (clients): A client document number is unique per country.';

async function fixtureCopy(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  return dir;
}

async function committedRepo(): Promise<string> {
  const dir = await fixtureCopy();
  initRepo(dir);
  return dir;
}

// Git only detects a rename when the file has enough content to compare.
async function repoWithRenamableInvoice(): Promise<string> {
  const dir = await fixtureCopy();
  await writeFile(
    join(dir, 'src/billing/invoice.go'),
    Array.from({ length: 20 }, (_, line) => `// invoice line ${line}\n`).join(''),
  );
  initRepo(dir);
  return dir;
}

describe('for --changed', () => {
  it('lists each active rule anchored to a modified, new or deleted file, with those files', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'src/clients/create.go'), '// edited\n');
    await writeFile(join(repo, 'src/clients/new.go'), 'package clients\n');
    await rm(join(repo, 'src/billing/invoice.go'));
    await writeFile(join(repo, 'notes.txt'), 'not anchored\n');

    expect(await runCli(['for', '--changed', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: [
        BIL_001,
        '  src/billing/invoice.go',
        '  src/clients/create.go',
        BIL_002,
        '  src/billing/invoice.go',
        CLI_001,
        '  src/clients/create.go',
        '  src/clients/new.go',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('includes changes already committed since the ref', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'src/billing/tax.go'), '// edited\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'edit');

    expect((await runCli(['for', '--changed', 'HEAD~1'], repo)).stdout).toBe(
      `${BIL_001}\n  src/billing/tax.go\n`,
    );
  });

  it('prints the changed files and the rules as JSON', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'src/billing/invoice.go'), '// edited\n');
    await writeFile(join(repo, 'notes.txt'), 'not anchored\n');

    const result = await runCli(['for', '--changed', 'HEAD', '--json'], repo);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      base: 'HEAD',
      files: ['notes.txt', 'src/billing/invoice.go'],
      rules: [
        {
          id: 'R-BIL-001',
          context: 'billing',
          status: 'active',
          summary: 'Every new client gets a zero-balance account.',
          file: 'docs/rules/billing/R-BIL-001.md',
          files: ['src/billing/invoice.go'],
        },
        {
          id: 'R-BIL-002',
          context: 'billing',
          status: 'active',
          summary: 'Invoices are numbered without gaps.',
          file: 'docs/rules/billing/R-BIL-002.md',
          files: ['src/billing/invoice.go'],
        },
      ],
    });
  });

  it('says so when no changed file is anchored to an active rule', async () => {
    const repo = await committedRepo();
    await writeFile(join(repo, 'notes.txt'), 'not anchored\n');

    expect(await runCli(['for', '--changed', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: 'No active rules anchored to the files changed since HEAD.\n',
      stderr: '',
    });
  });

  it('says so in the language of the rulebook', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'rulebookguard.config.yaml'), 'language: es\n');

    expect((await runCli(['for', '--changed', 'HEAD'], repo)).stdout).toBe(
      'No hay reglas activas ancladas a los archivos cambiados desde HEAD.\n',
    );
  });

  it('prints paths from the rulebook root when run from a subdirectory', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'src/billing/tax.go'), '// edited\n');

    expect((await runCli(['for', '--changed', 'HEAD'], join(repo, 'src/clients'))).stdout).toBe(
      `${BIL_001}\n  src/billing/tax.go\n`,
    );
  });

  it('reports the rules of both paths of a renamed file', async () => {
    const repo = await repoWithRenamableInvoice();
    git(repo, 'mv', 'src/billing/invoice.go', 'src/clients/invoice.go');

    expect((await runCli(['for', '--changed', 'HEAD'], repo)).stdout).toBe(
      [
        BIL_001,
        '  src/billing/invoice.go',
        BIL_002,
        '  src/billing/invoice.go',
        CLI_001,
        '  src/clients/invoice.go',
        '',
      ].join('\n'),
    );
  });

  it('reports the rules of a file moved out of its anchors', async () => {
    const repo = await repoWithRenamableInvoice();
    git(repo, 'mv', 'src/billing/invoice.go', 'invoice.go');

    expect((await runCli(['for', '--changed', 'HEAD'], repo)).stdout).toBe(
      [BIL_001, '  src/billing/invoice.go', BIL_002, '  src/billing/invoice.go', ''].join('\n'),
    );
  });

  it('keeps the view of lint --base, where a rename counts under its new path only', async () => {
    const repo = await repoWithRenamableInvoice();
    git(repo, 'mv', 'src/billing/invoice.go', 'invoice.go');

    expect((await changedSince(repo, 'HEAD')).files).toEqual(['invoice.go']);
  });

  it('matches anchors from a rulebook below the top level of the repository', async () => {
    const repo = await scratchDir();
    const rulebook = join(repo, 'packages/app');
    await cp(fixtureRoot('repo'), rulebook, { recursive: true });
    initRepo(repo);
    await appendFile(join(rulebook, 'src/billing/tax.go'), '// edited\n');
    await writeFile(join(repo, 'outside.go'), 'package outside\n');

    const result = await runCli(['for', '--changed', 'HEAD', '--json'], rulebook);

    expect(JSON.parse(result.stdout)).toMatchObject({
      files: ['src/billing/tax.go'],
      rules: [{ id: 'R-BIL-001', files: ['src/billing/tax.go'] }],
    });
  });

  it('fails on an unknown ref', async () => {
    const repo = await committedRepo();

    expect(await runCli(['for', '--changed', 'nope'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown git ref "nope".\n',
    });
  });

  it('fails outside a git work tree, naming this option', async () => {
    const dir = await fixtureCopy();

    const result = await runCli(['for', '--changed', 'HEAD'], dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('for --changed needs a git work tree');
  });

  it('rejects a path together with --changed', async () => {
    const repo = await committedRepo();

    expect(await runCli(['for', 'src/clients/create.go', '--changed', 'HEAD'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: `Unexpected argument "src/clients/create.go". Usage: ${USAGE}\n`,
    });
  });

  it('still needs a path without --changed', async () => {
    const repo = await committedRepo();

    expect(await runCli(['for'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: `Missing argument <path>. Usage: ${USAGE}\n`,
    });
  });

  it('is not an option of the commands that share the parser', async () => {
    const repo = await committedRepo();

    const result = await runCli(['impact', 'R-CLI-001', '--changed', 'HEAD'], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--changed'");
  });

  it('keeps lint --base naming its own option outside a git work tree', async () => {
    const dir = await fixtureCopy();

    const result = await runCli(['lint', '--base', 'HEAD'], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lint --base needs a git work tree');
  });
});
