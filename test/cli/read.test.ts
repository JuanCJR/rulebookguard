import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { fixtureRoot, runCli } from './run.ts';

const repo = fixtureRoot('repo');

function ok(args: string[], cwd = repo): string {
  const result = runCli(args, cwd);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return result.stdout;
}

function json(args: string[], cwd = repo): unknown {
  return JSON.parse(ok([...args, '--json'], cwd));
}

describe('contexts', () => {
  it('prints the contexts map', () => {
    expect(ok(['contexts'])).toBe(
      [
        'billing (BIL, 2 rules): Invoices and taxes charged to clients.',
        'clients (CLI, 3 rules): Customers that receive installation services.',
        '',
      ].join('\n'),
    );
  });

  it('prints JSON', () => {
    expect(json(['contexts'])).toEqual({
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

  it('works from a subdirectory of the repo', () => {
    expect(ok(['contexts'], join(repo, 'src/clients'))).toContain('clients (CLI, 3 rules)');
  });
});

describe('list', () => {
  it('prints id, status and summary of every rule', () => {
    expect(ok(['list'])).toBe(
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

  it('filters by context and status', () => {
    expect(ok(['list', '--context', 'clients', '--status', 'proposed'])).toBe(
      'R-CLI-002 [proposed] A client email is verified before the first installation.\n',
    );
  });

  it('prints JSON', () => {
    expect(json(['list', '--context', 'billing'])).toEqual({
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

  it('rejects an unknown context', () => {
    expect(runCli(['list', '--context', 'sales'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown context "sales". Run "rulebookguard contexts" to list them.\n',
    });
  });

  it('rejects an unknown status', () => {
    expect(runCli(['list', '--status', 'draft'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Invalid status "draft": expected one of proposed, active, deprecated.\n',
    });
  });
});

describe('show', () => {
  it('prints the full rule', () => {
    expect(ok(['show', 'R-BIL-002'])).toBe(
      [
        'R-BIL-002: Invoices are numbered without gaps.',
        'context: billing',
        'status: active',
        'entities: Invoice',
        'anchors: src/billing/invoice.go',
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

  it('prints JSON with supersedes null when absent', () => {
    expect(json(['show', 'R-CLI-001'])).toEqual({
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

  it('rejects an unknown id', () => {
    expect(runCli(['show', 'R-CLI-999'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown rule id "R-CLI-999". Run "rulebookguard list" to list them.\n',
    });
  });

  it('requires an id', () => {
    const result = runCli(['show'], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('Missing argument <id>. Usage: rulebookguard show <id> [--json]\n');
  });
});

describe('for', () => {
  it('prints only active rules anchored to the path', () => {
    expect(ok(['for', 'src/clients/create.go'])).toBe(
      [
        'R-BIL-001 (billing): Every new client gets a zero-balance account.',
        'R-CLI-001 (clients): A client document number is unique per country.',
        '',
      ].join('\n'),
    );
  });

  it('resolves the path against the working directory', () => {
    expect(ok(['for', 'legacy/import.go'], join(repo, 'src/clients'))).toBe(
      'R-CLI-001 (clients): A client document number is unique per country.\n',
    );
  });

  it('says when no active rule is anchored', () => {
    expect(ok(['for', 'README.md'])).toBe('No active rules anchored to README.md.\n');
  });

  it('prints JSON', () => {
    expect(json(['for', 'src/billing/invoice.go'])).toEqual({
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

  it('rejects a path outside the repo', () => {
    expect(runCli(['for', '../outside.go'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: `Path "../outside.go" is outside the rulebook root ${repo}.\n`,
    });
  });
});

describe('impact', () => {
  it('prints anchored files and tagging tests', () => {
    expect(ok(['impact', 'R-BIL-001'])).toBe(
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

  it('prints empty sections', () => {
    expect(ok(['impact', 'R-CLI-002'])).toBe(
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

  it('prints JSON', () => {
    expect(json(['impact', 'R-CLI-001'])).toEqual({
      id: 'R-CLI-001',
      files: ['src/clients/create.go', 'src/clients/legacy/import.go', 'src/clients/update.go'],
      tests: [
        { file: 'tests/clients/test_create.py', line: 1 },
        { file: 'tests/clients/test_create.py', line: 6 },
      ],
    });
  });

  it('rejects an unknown id', () => {
    const result = runCli(['impact', 'R-XXX-001', '--json'], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unknown rule id "R-XXX-001". Run "rulebookguard list" to list them.\n',
    );
  });
});

describe('errors and usage', () => {
  it('warns on stderr when the catalog has issues', () => {
    const result = runCli(
      ['list', '--context', 'sales', '--status', 'proposed'],
      fixtureRoot('catalog-issues'),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'warning: the catalog has 8 issues; run "rulebookguard lint" for details.\n',
    );
  });

  it('fails when no config is found', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rulebookguard-'));

    expect(runCli(['contexts'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: `rulebookguard.config.yaml not found in ${dir} or any parent directory.\n`,
    });
  });

  it('rejects an unknown command', () => {
    const result = runCli(['frobnicate'], repo);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /^Unknown command "frobnicate"\.\nUsage: rulebookguard <command>/,
    );
  });

  it('rejects an unknown option', () => {
    const result = runCli(['contexts', '--verbose'], repo);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--verbose'");
  });

  it('lists the commands in the usage text', () => {
    const usage = ok(['--help']);

    for (const command of ['contexts', 'list', 'show', 'for', 'impact']) {
      expect(usage).toContain(`  ${command}`);
    }
  });
});
