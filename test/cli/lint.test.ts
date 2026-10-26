import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const lintFixture = fixtureRoot('lint');

async function cleanRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  await writeFile(join(dir, 'tests/billing/test_numbering.py'), '# @rule R-BIL-002\n');
  return dir;
}

describe('lint', () => {
  it('lists every finding and exits 1 when there are errors', () => {
    expect(runCli(['lint'], lintFixture)).toEqual({
      status: 1,
      stdout: [
        'error untested-rule rules/orders/R-ORD-002.md active rule R-ORD-002 has no test tagging it',
        'error schema rules/orders/R-ORD-004.md field "status" must be one of: proposed, active, deprecated',
        'warning context-over-budget rules/orders/_context.md context "orders" has 3 rules, more than the contextBudget of 2',
        'error unmatched-anchor rules/stock/R-STK-001.md anchor "src/stock/**" matches no file',
        'error duplicate-id rules/stock/R-STK-002.md field "id" duplicates the id of rules/stock/R-STK-001.md',
        'error file-name-mismatch rules/stock/R-STK-002.md field "id" must match the file name "R-STK-002"',
        'error deprecated-rule-tag tests/orders_test.py:6 tags R-ORD-003, which is deprecated',
        'error unknown-rule-tag tests/orders_test.py:11 tags R-XYZ-001, which does not exist',
        '7 errors, 1 warning',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('prints JSON', () => {
    const result = runCli(['lint', '--json'], lintFixture);

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
    });
    expect(report.findings[6]).toEqual({
      severity: 'error',
      code: 'deprecated-rule-tag',
      file: 'tests/orders_test.py',
      line: 6,
      message: 'tags R-ORD-003, which is deprecated',
    });
  });

  it('exits 0 with no findings', async () => {
    const repo = await cleanRepo();

    expect(runCli(['lint'], repo)).toEqual({ status: 0, stdout: 'No issues found.\n', stderr: '' });
    expect(JSON.parse(runCli(['lint', '--json'], repo).stdout)).toEqual({
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

    expect(runCli(['lint'], repo)).toEqual({
      status: 0,
      stdout: [
        'warning context-over-budget docs/rules/clients/_context.md context "clients" has 3 rules, more than the contextBudget of 2',
        '0 errors, 1 warning',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('reports a missing rules directory', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'rulebookguard.config.yaml'), 'schema: 1\ntestGlobs: []\n');

    expect(runCli(['lint'], dir)).toEqual({
      status: 1,
      stdout: 'error missing-rules-dir docs/rules directory does not exist\n1 error, 0 warnings\n',
      stderr: '',
    });
  });

  it('rejects unexpected arguments', () => {
    const result = runCli(['lint', 'extra'], lintFixture);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unexpected argument "extra". Usage: rulebookguard lint [--base <ref>] [--json]\n',
    );
  });
});
