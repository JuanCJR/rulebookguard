import { appendFile, cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const lintFixture = fixtureRoot('lint');

async function cleanRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  await writeFile(
    join(dir, 'tests/billing/test_numbering.py'),
    '# @rule R-BIL-002\n# @endrule R-BIL-002\n',
  );
  return dir;
}

describe('lint', () => {
  it('lists every finding and exits 1 when there are errors', async () => {
    expect(await runCli(['lint'], lintFixture)).toEqual({
      status: 1,
      stdout: [
        'error untested-rule rules/orders/R-ORD-002.md active rule R-ORD-002 has no test tagging it',
        '  hint: wrap a test in a file matched by testGlobs with "@rule R-ORD-002" and "@endrule R-ORD-002", or set the rule\'s status to proposed',
        'error schema rules/orders/R-ORD-004.md field "status" must be one of: proposed, active, deprecated',
        '  hint: fix the file as the message says; the JSON Schemas ship under rulebookguard/schemas/v1/',
        'warning context-over-budget rules/orders/_context.md context "orders" has 3 rules, more than the contextBudget of 2',
        '  hint: split the context into smaller ones, or raise contextBudget in rulebookguard.config.yaml',
        'error unmatched-anchor rules/stock/R-STK-001.md anchor "src/stock/**" matches no file',
        '  hint: fix the glob so it matches the files that implement the rule, or remove it',
        'error duplicate-id rules/stock/R-STK-002.md field "id" duplicates the id of rules/stock/R-STK-001.md',
        '  hint: give one of the rules another id; "rulebookguard new <context>" picks the next free one',
        'error file-name-mismatch rules/stock/R-STK-002.md field "id" must match the file name "R-STK-002"',
        '  hint: rename the file after the id, or change the id',
        'error deprecated-rule-tag tests/orders_test.py:6 tags R-ORD-003, which is deprecated',
        '  hint: tag the rule that replaces R-ORD-003, or remove the tag',
        'error unknown-rule-tag tests/orders_test.py:11 tags R-XYZ-001, which does not exist',
        '  hint: fix the id in the tag, or create the rule it refers to',
        '7 errors, 1 warning',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('prints JSON', async () => {
    const result = await runCli(['lint', '--json'], lintFixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report.errors).toBe(7);
    expect(report.warnings).toBe(1);
    expect(report.findings).toHaveLength(8);
    expect(report.findings[0]).toEqual({
      severity: 'error',
      code: 'untested-rule',
      file: 'rules/orders/R-ORD-002.md',
      message: 'active rule R-ORD-002 has no test tagging it',
      hint: 'wrap a test in a file matched by testGlobs with "@rule R-ORD-002" and "@endrule R-ORD-002", or set the rule\'s status to proposed',
    });
    expect(report.findings[6]).toEqual({
      severity: 'error',
      code: 'deprecated-rule-tag',
      file: 'tests/orders_test.py',
      line: 6,
      message: 'tags R-ORD-003, which is deprecated',
      hint: 'tag the rule that replaces R-ORD-003, or remove the tag',
    });
  });

  it('names the superseding rule in the hint of a deprecated tag', async () => {
    const repo = await scratchDir();
    await cp(lintFixture, repo, { recursive: true });
    const file = join(repo, 'rules/orders/R-ORD-001.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(/^id: .*$/m, '$&\nsupersedes: R-ORD-003'),
    );

    const report = JSON.parse((await runCli(['lint', '--json'], repo)).stdout);

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'deprecated-rule-tag',
        hint: 'tag R-ORD-001, which supersedes R-ORD-003, instead',
      }),
    );
  });

  it('reports a @rule without its @endrule and an @endrule without its @rule', async () => {
    const repo = await cleanRepo();
    await writeFile(
      join(repo, 'tests/billing/test_regions.py'),
      '# @rule R-BIL-001\ndef test_a():\n    pass\n\n# @endrule R-BIL-002\n',
    );

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error unclosed-rule-tag tests/billing/test_regions.py:1 @rule R-BIL-001 has no matching @endrule R-BIL-001',
        '  hint: add "@endrule R-BIL-001" after the last line of the test, or close the inner regions first',
        'error unmatched-endrule-tag tests/billing/test_regions.py:5 @endrule R-BIL-002 has no open @rule R-BIL-002 before it',
        '  hint: add "@rule R-BIL-002" before the test, or remove the stray @endrule',
        '2 errors, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
    expect(JSON.parse((await runCli(['lint', '--json'], repo)).stdout).findings[1]).toEqual({
      severity: 'error',
      code: 'unmatched-endrule-tag',
      file: 'tests/billing/test_regions.py',
      line: 5,
      message: '@endrule R-BIL-002 has no open @rule R-BIL-002 before it',
      hint: 'add "@rule R-BIL-002" before the test, or remove the stray @endrule',
    });
  });

  it('exits 0 with no findings', async () => {
    const repo = await cleanRepo();

    expect(await runCli(['lint'], repo)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
    expect(JSON.parse((await runCli(['lint', '--json'], repo)).stdout)).toEqual({
      findings: [],
      errors: 0,
      warnings: 0,
    });
  });

  it('exits 0 when there are only warnings', async () => {
    const repo = await cleanRepo();
    await writeFile(
      join(repo, 'rulebookguard.config.yaml'),
      "schema: 1\nrulesDir: docs/rules\ntestGlobs: ['tests/**/*_test.go', 'tests/**/test_*.py']\ncontextBudget: 2\n",
    );

    expect(await runCli(['lint'], repo)).toEqual({
      status: 0,
      stdout: [
        'warning context-over-budget docs/rules/clients/_context.md context "clients" has 3 rules, more than the contextBudget of 2',
        '  hint: split the context into smaller ones, or raise contextBudget in rulebookguard.config.yaml',
        '0 errors, 1 warning',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('reports a missing rules directory', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'rulebookguard.config.yaml'), 'schema: 1\ntestGlobs: []\n');

    expect(await runCli(['lint'], dir)).toEqual({
      status: 1,
      stdout:
        'error missing-rules-dir docs/rules directory does not exist\n  hint: create the directory, or set rulesDir in rulebookguard.config.yaml\n1 error, 0 warnings\n',
      stderr: '',
    });
  });

  it('does not report tags of a rule that fails the schema as unknown', async () => {
    const dir = await scratchDir();
    await cp(lintFixture, dir, { recursive: true });
    await appendFile(
      join(dir, 'tests/orders_test.py'),
      '\n\n# @rule R-ORD-004\ndef test_x():\n    pass\n# @endrule R-ORD-004\n',
    );

    const result = await runCli(['lint'], dir);

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('tags R-ORD-004');
    expect(result.stdout).toContain('7 errors, 1 warning');
  });

  it('reports an invalid config as schema findings', async () => {
    const repo = await cleanRepo();
    await writeFile(join(repo, 'rulebookguard.config.yaml'), 'schema: 2\ntestGlobs: []\n');

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error schema rulebookguard.config.yaml field "schema" must be equal to 1',
        '  hint: fix the file as the message says; the JSON Schemas ship under rulebookguard/schemas/v1/',
        '1 error, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
    expect(JSON.parse((await runCli(['lint', '--json'], repo)).stdout)).toEqual({
      findings: [
        {
          severity: 'error',
          code: 'schema',
          file: 'rulebookguard.config.yaml',
          message: 'field "schema" must be equal to 1',
          hint: 'fix the file as the message says; the JSON Schemas ship under rulebookguard/schemas/v1/',
        },
      ],
      errors: 1,
      warnings: 0,
    });
    expect(await runCli(['list'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: `${join(repo, 'rulebookguard.config.yaml')}: field "schema" must be equal to 1\n`,
    });

    await writeFile(join(repo, 'rulebookguard.config.yaml'), 'schema: 1\n');
    expect(await runCli(['list'], repo)).toEqual({
      status: 1,
      stdout: '',
      stderr: `${join(repo, 'rulebookguard.config.yaml')}: field "testGlobs" is required\n`,
    });
  });

  it('prints each invalid-YAML finding on a single line', async () => {
    const repo = await cleanRepo();
    await writeFile(
      join(repo, 'docs/rules/clients/R-CLI-003.md'),
      '---\nid: [unclosed\nsummary: x\n---\n\nBody.\n',
    );
    await writeFile(join(repo, 'rulebookguard.config.yaml'), 'schema: 1\ntestGlobs: [unclosed\n');

    const configResult = await runCli(['lint'], repo);
    expect(configResult.stdout).toMatch(
      /^error schema rulebookguard\.config\.yaml invalid YAML: [^\n]+ at line \d+, column \d+\n  hint: [^\n]+\n1 error, 0 warnings\n$/,
    );

    await writeFile(
      join(repo, 'rulebookguard.config.yaml'),
      "schema: 1\nrulesDir: docs/rules\ntestGlobs: ['tests/**/*_test.go', 'tests/**/test_*.py']\n",
    );
    const ruleResult = await runCli(['lint'], repo);
    expect(ruleResult.status).toBe(1);
    expect(ruleResult.stdout).toMatch(
      /^error schema docs\/rules\/clients\/R-CLI-003\.md invalid YAML: [^\n]+ at line \d+, column \d+\n  hint: [^\n]+\n1 error, 0 warnings\n$/,
    );
  });

  it('rejects unexpected arguments', async () => {
    const result = await runCli(['lint', 'extra'], lintFixture);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unexpected argument "extra". Usage: rulebookguard lint [--base <ref>] [--json]\n',
    );
  });
});

async function addFrontmatter(repo: string, rule: string, lines: string): Promise<void> {
  const context = rule.startsWith('R-BIL') ? 'billing' : 'clients';
  const file = join(repo, 'docs/rules', context, `${rule}.md`);
  await writeFile(file, (await readFile(file, 'utf8')).replace(/^id: .*$/m, `$&\n${lines}`));
}

describe('lint relations between rules', () => {
  it('reports a reference to an unknown rule or to the rule itself', async () => {
    const repo = await cleanRepo();
    await addFrontmatter(repo, 'R-BIL-001', 'dependsOn: [R-BIL-009, R-BIL-001]');
    await addFrontmatter(repo, 'R-BIL-002', 'conflictsWith: [R-ORD-001]');

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error invalid-rule-reference docs/rules/billing/R-BIL-001.md dependsOn names R-BIL-009, which does not exist',
        '  hint: fix the id, or remove it from dependsOn',
        'error invalid-rule-reference docs/rules/billing/R-BIL-001.md dependsOn names the rule itself',
        '  hint: fix the id, or remove it from dependsOn',
        'error invalid-rule-reference docs/rules/billing/R-BIL-002.md conflictsWith names R-ORD-001, which does not exist',
        '  hint: fix the id, or remove it from conflictsWith',
        '3 errors, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('reports a dependsOn cycle once, starting at its lowest id', async () => {
    const repo = await cleanRepo();
    await addFrontmatter(repo, 'R-CLI-001', 'dependsOn: [R-BIL-001]');
    await addFrontmatter(repo, 'R-BIL-001', 'dependsOn: [R-BIL-002]');
    await addFrontmatter(repo, 'R-BIL-002', 'dependsOn: [R-CLI-001]');
    await addFrontmatter(repo, 'R-CLI-002', 'dependsOn: [R-CLI-001]');

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error dependency-cycle docs/rules/billing/R-BIL-001.md dependsOn forms a cycle: R-BIL-001 → R-BIL-002 → R-CLI-001 → R-BIL-001',
        '  hint: remove one dependsOn link of the cycle',
        '1 error, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('reports two active rules in conflict once, and ignores a conflict with a proposed rule', async () => {
    const repo = await cleanRepo();
    await addFrontmatter(repo, 'R-BIL-002', 'conflictsWith: [R-BIL-001]');
    await addFrontmatter(repo, 'R-BIL-001', 'conflictsWith: [R-BIL-002, R-CLI-003]');
    const file = join(repo, 'docs/rules/clients/R-CLI-003.md');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(/^status: .*$/m, 'status: proposed'),
    );

    expect(await runCli(['lint'], repo)).toEqual({
      status: 1,
      stdout: [
        'error active-rule-conflict docs/rules/billing/R-BIL-001.md active rules R-BIL-001 and R-BIL-002 conflict',
        '  hint: deprecate one of them or set it to proposed, or remove the conflictsWith entry',
        '1 error, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('prints relation findings in Spanish', async () => {
    const repo = await cleanRepo();
    await appendFile(join(repo, 'rulebookguard.config.yaml'), 'language: es\n');
    await addFrontmatter(
      repo,
      'R-BIL-001',
      'dependsOn: [R-BIL-002, R-BIL-009]\nconflictsWith: [R-BIL-002]',
    );
    await addFrontmatter(repo, 'R-BIL-002', 'dependsOn: [R-BIL-001]');

    expect((await runCli(['lint'], repo)).stdout).toBe(
      [
        'error active-rule-conflict docs/rules/billing/R-BIL-001.md las reglas activas R-BIL-001 y R-BIL-002 están en conflicto',
        '  sugerencia: depreca una de ellas o déjala en proposed, o quita la entrada de conflictsWith',
        'error dependency-cycle docs/rules/billing/R-BIL-001.md dependsOn forma un ciclo: R-BIL-001 → R-BIL-002 → R-BIL-001',
        '  sugerencia: quita un vínculo dependsOn del ciclo',
        'error invalid-rule-reference docs/rules/billing/R-BIL-001.md dependsOn nombra a R-BIL-009, que no existe',
        '  sugerencia: corrige el id o quítalo de dependsOn',
        '3 errores, 0 avisos',
        '',
      ].join('\n'),
    );
  });
});
