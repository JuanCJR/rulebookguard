import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
        dependsOn: [],
        conflictsWith: [],
        origin: null,
        evidence: [],
        evidenceLinks: [],
        implementations: [],
        file: 'docs/rules/clients/R-CLI-001.md',
        body: '# Unique document number\n\nTwo clients in the same country cannot share a document number.\n',
      },
    });
  });

  it('prints dependsOn and conflictsWith when present', async () => {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    const file = join(dir, 'docs/rules/billing/R-BIL-002.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        /^id: .*$/m,
        '$&\ndependsOn: [R-BIL-001, R-CLI-001]\nconflictsWith: [R-CLI-002]',
      ),
    );

    const out = await ok(['show', 'R-BIL-002'], dir);
    expect(out).toContain(
      'supersedes: R-BIL-000\ndependsOn: R-BIL-001, R-CLI-001\nconflictsWith: R-CLI-002\nfile: ',
    );
    expect(await json(['show', 'R-BIL-002'], dir)).toMatchObject({
      rule: { dependsOn: ['R-BIL-001', 'R-CLI-001'], conflictsWith: ['R-CLI-002'] },
    });
  });

  it('prints origin and evidence when present', async () => {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    const file = join(dir, 'docs/rules/clients/R-CLI-002.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        /^id: .*$/m,
        "$&\norigin: extracted\nevidence:\n  - 'src/clients/create.go:12'\n  - 'tests/clients/test_create.py:3'",
      ),
    );

    expect(await ok(['show', 'R-CLI-002'], dir)).toContain(
      'origin: extracted\nevidence:\n  src/clients/create.go:12\n  tests/clients/test_create.py:3\nfile: ',
    );
    expect(await json(['show', 'R-CLI-002'], dir)).toMatchObject({
      rule: {
        origin: 'extracted',
        evidence: ['src/clients/create.go:12', 'tests/clients/test_create.py:3'],
      },
    });
  });

  it('prints the code regions that implement the rule, only in files it anchors', async () => {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    await writeFile(
      join(dir, 'src/clients/create.go'),
      'package clients\n\n// @implements R-CLI-001\nfunc Create() {}\n// @endimplements R-CLI-001\n',
    );
    await writeFile(
      join(dir, 'src/clients/update.go'),
      '// @implements R-CLI-001\n// @endimplements R-CLI-001\n',
    );
    await writeFile(
      join(dir, 'src/billing/tax.go'),
      '// @implements R-CLI-001\n// @endimplements R-CLI-001\n',
    );

    expect(await ok(['show', 'R-CLI-001'], dir)).toContain(
      'implementations:\n  src/clients/create.go:3-5\n  src/clients/update.go:1-2\nfile: ',
    );
    expect(await json(['show', 'R-CLI-001'], dir)).toMatchObject({
      rule: {
        implementations: [
          { file: 'src/clients/create.go', line: 3, endLine: 5 },
          { file: 'src/clients/update.go', line: 1, endLine: 2 },
        ],
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

  it('answers for a directory as before, without reading it', async () => {
    expect(await ok(['for', 'src/clients'])).toBe('No active rules anchored to src/clients.\n');
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
          regions: [],
          evidence: [],
        },
        {
          id: 'R-BIL-002',
          context: 'billing',
          status: 'active',
          summary: 'Invoices are numbered without gaps.',
          file: 'docs/rules/billing/R-BIL-002.md',
          regions: [],
          evidence: [],
        },
      ],
    });
  });

  it('gives the lines of the file that implement each rule', async () => {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    await writeFile(
      join(dir, 'src/clients/create.go'),
      [
        'package clients',
        '',
        '// @implements R-CLI-001',
        'func a() {}',
        '// @endimplements R-CLI-001',
        '',
        '// @implements R-CLI-001',
        'func b() {}',
        '// @endimplements R-CLI-001',
        '',
      ].join('\n'),
    );

    expect(await ok(['for', 'src/clients/create.go'], dir)).toBe(
      [
        'R-BIL-001 (billing): Every new client gets a zero-balance account.',
        'R-CLI-001 (clients): A client document number is unique per country. (lines 3-5, 7-9)',
        '',
      ].join('\n'),
    );
    expect(await json(['for', 'src/clients/create.go'], dir)).toMatchObject({
      rules: [
        { id: 'R-BIL-001', regions: [] },
        {
          id: 'R-CLI-001',
          regions: [
            { line: 3, endLine: 5 },
            { line: 7, endLine: 9 },
          ],
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

describe('search', () => {
  it('lists the rules holding every term, ignoring case', async () => {
    expect(await ok(['search', 'client NUMBER'])).toBe(
      'R-CLI-001 [active] A client document number is unique per country.\n',
    );
  });

  it('matches the id, entities and body too, in every status', async () => {
    expect(await json(['search', 'invoice'])).toEqual({
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
    expect(await ok(['search', 'fiscal'])).toBe(
      'R-BIL-002 [active] Invoices are numbered without gaps.\n',
    );
    expect(await ok(['search', 'r-cli-003'])).toBe(
      'R-CLI-003 [deprecated] Legacy clients are imported from the old CRM.\n',
    );
  });

  it('narrows to one context', async () => {
    expect(await ok(['search', 'client', '--context', 'billing'])).toBe(
      'R-BIL-001 [active] Every new client gets a zero-balance account.\n',
    );
  });

  it('says so when no rule matches', async () => {
    expect(await ok(['search', 'nothing here'])).toBe('No rules found.\n');
    expect(await json(['search', 'nothing here'])).toEqual({ rules: [] });
  });

  it('rejects an empty text and an unknown context', async () => {
    expect(await runCli(['search', '  '], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Search text is empty. Usage: rulebookguard search <text> [--context <c>] [--json]\n',
    });
    expect(await runCli(['search', 'client', '--context', 'nope'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: 'Unknown context "nope". Run "rulebookguard contexts" to list them.\n',
    });
  });
});

describe('evidence lines', () => {
  async function withEvidence(...entries: string[]): Promise<string> {
    const dir = await scratchDir();
    await cp(repo, dir, { recursive: true });
    const file = join(dir, 'docs/rules/clients/R-CLI-001.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        /^id: .*$/m,
        `$&\norigin: extracted\nevidence:\n${entries.map((entry) => `  - '${entry}'`).join('\n')}`,
      ),
    );
    return dir;
  }

  it('show prints the lines each evidence symbol resolves to, and lists them in JSON', async () => {
    const dir = await withEvidence(
      'src/clients/create.go Create',
      'src/clients/create.go Missing',
      'src/clients/create.go:12',
    );

    expect(await ok(['show', 'R-CLI-001'], dir)).toContain(
      'evidence:\n  src/clients/create.go Create (lines 3-3)\n  src/clients/create.go Missing\n  src/clients/create.go:12\nfile: ',
    );
    expect(await json(['show', 'R-CLI-001'], dir)).toMatchObject({
      rule: {
        evidence: [
          'src/clients/create.go Create',
          'src/clients/create.go Missing',
          'src/clients/create.go:12',
        ],
        evidenceLinks: [
          {
            entry: 'src/clients/create.go Create',
            file: 'src/clients/create.go',
            line: 3,
            endLine: 3,
          },
          {
            entry: 'src/clients/create.go Missing',
            file: 'src/clients/create.go',
            line: null,
            endLine: null,
          },
          {
            entry: 'src/clients/create.go:12',
            file: 'src/clients/create.go',
            line: 12,
            endLine: 12,
          },
        ],
      },
    });
  });

  it('show lists no evidence links for a rule without evidence', async () => {
    expect(await json(['show', 'R-CLI-001'])).toMatchObject({ rule: { evidenceLinks: [] } });
  });

  it('for adds the evidence lines in the path to the lines of each rule', async () => {
    const dir = await withEvidence('src/clients/create.go Create', 'src/clients/update.go');

    expect(await ok(['for', 'src/clients/create.go'], dir)).toBe(
      [
        'R-BIL-001 (billing): Every new client gets a zero-balance account.',
        'R-CLI-001 (clients): A client document number is unique per country. (lines 3-3)',
        '',
      ].join('\n'),
    );
    expect(await json(['for', 'src/clients/create.go'], dir)).toMatchObject({
      rules: [
        { id: 'R-BIL-001', regions: [], evidence: [] },
        {
          id: 'R-CLI-001',
          regions: [],
          evidence: [{ entry: 'src/clients/create.go Create', line: 3, endLine: 3 }],
        },
      ],
    });
  });
});
