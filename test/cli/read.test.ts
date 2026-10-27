import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const repo = fixtureRoot('repo');

async function ok(args: string[], cwd = repo): Promise<string> {
  const result = await runCli(args, cwd);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return result.stdout;
}

async function json(args: string[], cwd = repo): Promise<unknown> {
  return JSON.parse(await ok([...args, '--json'], cwd));
}

describe('contexts', () => {
  it('prints the contexts map', async () => {
    expect(await ok(['contexts'])).toBe(
      [
        'billing (BIL, 2 rules): Invoices and taxes charged to clients.',
        'clients (CLI, 3 rules): Customers that receive installation services.',
        '',
      ].join('\n'),
    );
  });

  it('prints JSON', async () => {
    expect(await json(['contexts'])).toEqual({
      contexts: [
        {
          context: 'billing',
          prefix: 'BIL',
          summary: 'Invoices and taxes charged to clients.',
          rules: 2,
          file: 'docs/rules/billing/_context.md',
        },
        {
          context: 'clients',
          prefix: 'CLI',
          summary: 'Customers that receive installation services.',
          rules: 3,
          file: 'docs/rules/clients/_context.md',
        },
      ],
    });
  });

  it('works from a subdirectory of the repo', async () => {
    expect(await ok(['contexts'], join(repo, 'src/clients'))).toContain('clients (CLI, 3 rules)');
  });
});

describe('list', () => {
  it('prints id, status and summary of every rule', async () => {
    expect(await ok(['list'])).toBe(
      [
        'R-BIL-001 [active] Every new client gets a zero-balance account.',
        'R-BIL-002 [active] Invoices are numbered without gaps.',
        'R-CLI-001 [active] A client document number is unique per country.',
        'R-CLI-002 [proposed] A client email is verified before the first installation.',
        'R-CLI-003 [deprecated] Legacy clients are imported from the old CRM.',
        '',
      ].join('\n'),
    );
  });

  it('filters by context and status', async () => {
    expect(await ok(['list', '--context', 'clients', '--status', 'proposed'])).toBe(
      'R-CLI-002 [proposed] A client email is verified before the first installation.\n',
    );
  });

  it('says when no rule matches the filters', async () => {
    expect(await ok(['list', '--context', 'billing', '--status', 'deprecated'])).toBe(
      'No rules found.\n',
    );
  });

  it('prints JSON', async () => {
    expect(await json(['list', '--context', 'billing'])).toEqual({
      rules: [
        {
          id: 'R-BIL-001',
          context: 'billing',
          status: 'active',
          summary: 'Every new client gets a zero-balance account.',
        },
        {
          id: 'R-BIL-002',
          context: 'billing',
          status: 'active',
          summary: 'Invoices are numbered without gaps.',
        },
      ],
    });
  });

  it('rejects an unknown context', async () => {
    expect(await runCli(['list', '--context', 'sales'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown context "sales". Run "rulebookguard contexts" to list them.\n',
    });
  });

  it('rejects an unknown status', async () => {
    expect(await runCli(['list', '--status', 'draft'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Invalid status "draft": expected one of proposed, active, deprecated.\n',
    });
  });
});

describe('show', () => {
  it('prints the full rule', async () => {
    expect(await ok(['show', 'R-BIL-002'])).toBe(
      [
        'R-BIL-002: Invoices are numbered without gaps.',
        'context: billing',
        'status: active',
        'entities: Invoice',
        'anchors:',
        '  src/billing/invoice.go',
        'supersedes: R-BIL-000',
        'file: docs/rules/billing/R-BIL-002.md',
        '',
        '# Invoice numbering',
        '',
        'Invoice numbers are consecutive within a fiscal year.',
        '',
      ].join('\n'),
    );
  });

  it('prints (none) for empty entities and anchors', async () => {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    await runCli(['new', 'clients'], dir);

    const out = await ok(['show', 'R-CLI-004'], dir);

    expect(out).toContain('entities: (none)\nanchors:\n  (none)\n');
  });

  it('prints JSON with supersedes null when absent', async () => {
    expect(await json(['show', 'R-CLI-001'])).toEqual({
      rule: {
        id: 'R-CLI-001',
        context: 'clients',
        status: 'active',
        summary: 'A client document number is unique per country.',
        entities: ['Client'],
        anchors: ['src/clients/**/*.go'],
        supersedes: null,
        file: 'docs/rules/clients/R-CLI-001.md',
        body: '# Unique document number\n\nTwo clients in the same country cannot share a document number.\n',
      },
    });
  });

  it('rejects an unknown id', async () => {
    expect(await runCli(['show', 'R-CLI-999'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown rule id "R-CLI-999". Run "rulebookguard list" to list them.\n',
    });
  });

  it('requires an id', async () => {
    const result = await runCli(['show'], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('Missing argument <id>. Usage: rulebookguard show <id> [--json]\n');
  });
});

describe('for', () => {
  it('prints only active rules anchored to the path', async () => {
    expect(await ok(['for', 'src/clients/create.go'])).toBe(
      [
        'R-BIL-001 (billing): Every new client gets a zero-balance account.',
        'R-CLI-001 (clients): A client document number is unique per country.',
        '',
      ].join('\n'),
    );
  });

  it('resolves the path against the working directory', async () => {
    expect(await ok(['for', 'legacy/import.go'], join(repo, 'src/clients'))).toBe(
      'R-CLI-001 (clients): A client document number is unique per country.\n',
    );
  });

  it('says when no active rule is anchored', async () => {
    expect(await ok(['for', 'README.md'])).toBe('No active rules anchored to README.md.\n');
  });

  it('prints JSON', async () => {
    expect(await json(['for', 'src/billing/invoice.go'])).toEqual({
      path: 'src/billing/invoice.go',
      rules: [
        {
          id: 'R-BIL-001',
          context: 'billing',
          status: 'active',
          summary: 'Every new client gets a zero-balance account.',
          file: 'docs/rules/billing/R-BIL-001.md',
        },
        {
          id: 'R-BIL-002',
          context: 'billing',
          status: 'active',
          summary: 'Invoices are numbered without gaps.',
          file: 'docs/rules/billing/R-BIL-002.md',
        },
      ],
    });
  });

  it('rejects a path outside the repo', async () => {
    expect(await runCli(['for', '../outside.go'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: `Path "../outside.go" is outside the rulebook root ${repo}.\n`,
    });
  });
});

describe('impact', () => {
  it('prints anchored files and tagging tests', async () => {
    expect(await ok(['impact', 'R-BIL-001'])).toBe(
      [
        'R-BIL-001: Every new client gets a zero-balance account.',
        'Files matched by anchors (3):',
        '  src/billing/invoice.go',
        '  src/billing/tax.go',
        '  src/clients/create.go',
        'Tests tagging R-BIL-001 (2):',
        '  tests/billing/invoice_test.go:3',
        '  tests/clients/test_create.py:6',
        '',
      ].join('\n'),
    );
  });

  it('prints empty sections', async () => {
    expect(await ok(['impact', 'R-CLI-002'])).toBe(
      [
        'R-CLI-002: A client email is verified before the first installation.',
        'Files matched by anchors (1):',
        '  src/clients/create.go',
        'Tests tagging R-CLI-002 (0):',
        '  (none)',
        '',
      ].join('\n'),
    );
  });

  it('prints JSON', async () => {
    expect(await json(['impact', 'R-CLI-001'])).toEqual({
      id: 'R-CLI-001',
      files: ['src/clients/create.go', 'src/clients/legacy/import.go', 'src/clients/update.go'],
      tests: [
        { file: 'tests/clients/test_create.py', line: 1 },
        { file: 'tests/clients/test_create.py', line: 6 },
      ],
    });
  });

  it('lists the same files and tests outside a git work tree as inside one', async () => {
    const copy = await scratchDir();
    await cp(repo, copy, { recursive: true });

    for (const id of ['R-CLI-001', 'R-BIL-001']) {
      expect(await json(['impact', id], copy)).toEqual(await json(['impact', id]));
      expect(await ok(['impact', id], copy)).toBe(await ok(['impact', id]));
    }
  });

  it('rejects an unknown id', async () => {
    const result = await runCli(['impact', 'R-XXX-001', '--json'], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unknown rule id "R-XXX-001". Run "rulebookguard list" to list them.\n',
    );
  });
});

describe('read commands in a fresh git work tree', () => {
  it('print the same output as in the fixture, without warnings', async () => {
    const copy = await scratchDir();
    await cp(repo, copy, { recursive: true });
    initRepo(copy);

    for (const args of [
      ['contexts'],
      ['list'],
      ['show', 'R-CLI-001'],
      ['for', 'src/clients/create.go'],
      ['impact', 'R-CLI-001'],
      ['impact', 'R-BIL-001', '--json'],
    ]) {
      expect(await ok(args, copy)).toBe(await ok(args));
    }
  });
});

describe('errors and usage', () => {
  it('warns on stderr when the catalog has issues', async () => {
    const result = await runCli(
      ['list', '--context', 'sales', '--status', 'proposed'],
      fixtureRoot('catalog-issues'),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('No rules found.\n');
    expect(result.stderr).toBe(
      'warning: the catalog has 8 format issues; run "rulebookguard lint" to see them and to check anchors and test tags.\n',
    );
  });

  it('says when no context or rule exists', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'rulebookguard.config.yaml'), 'schema: 1\ntestGlobs: []\n');
    await mkdir(join(dir, 'docs/rules'), { recursive: true });

    expect(await ok(['contexts'], dir)).toBe(
      'No contexts found. Create one with "rulebookguard new <context>".\n',
    );
    expect(await ok(['list'], dir)).toBe('No rules found.\n');
    expect(await json(['list'], dir)).toEqual({ rules: [] });
  });

  it('fails when no config is found', async () => {
    const dir = await scratchDir();

    expect(await runCli(['contexts'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: `rulebookguard.config.yaml not found in ${dir} or any parent directory.\n`,
    });
  });

  it('rejects an unknown command', async () => {
    const result = await runCli(['frobnicate'], repo);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /^Unknown command "frobnicate"\.\nUsage: rulebookguard <command>/,
    );
  });

  it('rejects an unknown option', async () => {
    const result = await runCli(['contexts', '--verbose'], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--verbose'");
  });

  it('lists the commands in the usage text', async () => {
    const usage = await ok(['--help']);

    for (const command of ['contexts', 'list', 'show', 'for', 'impact', 'new']) {
      expect(usage).toContain(`  ${command}`);
    }
  });
});
