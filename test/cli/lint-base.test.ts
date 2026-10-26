import { appendFile, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { git, initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const CLI_001 = 'docs/rules/clients/R-CLI-001.md';
const PENDING_CLI_001 = `error pending-implementation ${CLI_001} rule R-CLI-001 changed since HEAD but none of the tests tagging it changed`;

async function committedRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  await writeFile(join(dir, 'tests/billing/test_numbering.py'), '# @rule R-BIL-002\n');
  initRepo(dir);
  return dir;
}

function newRule(id: string): string {
  return `---\nid: ${id}\ncontext: clients\nentities: [Client]\nstatus: active\nanchors:\n  - 'src/clients/create.go'\nsummary: A new rule.\n---\n\nBody.\n`;
}

describe('lint --base', () => {
  it('passes when nothing changed since the ref', async () => {
    const repo = await committedRepo();

    expect(runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
  });

  it('reports an uncommitted rule change without a tagging test change', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');

    expect(runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: `${PENDING_CLI_001}\n1 error, 0 warnings\n`,
      stderr: '',
    });
  });

  it('passes when one of the tests tagging the rule changed too', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    await appendFile(join(repo, 'tests/clients/test_create.py'), '\n# covers the new paragraph\n');

    expect(runCli(['lint', '--base', 'HEAD'], repo).status).toBe(0);
  });

  it('compares committed changes against an older ref and prints JSON', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    git(repo, 'commit', '-q', '-am', 'change rule');

    const result = runCli(['lint', '--base', 'HEAD~1', '--json'], repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      findings: [
        {
          severity: 'error',
          code: 'pending-implementation',
          file: CLI_001,
          message: 'rule R-CLI-001 changed since HEAD~1 but none of the tests tagging it changed',
        },
      ],
      errors: 1,
      warnings: 0,
    });
    expect(runCli(['lint', '--base', 'HEAD'], repo).status).toBe(0);
  });

  it('ignores changed rules that are proposed or deprecated', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'docs/rules/clients/R-CLI-002.md'), '\nMore.\n');
    await appendFile(join(repo, 'docs/rules/clients/R-CLI-003.md'), '\nMore.\n');

    expect(runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
  });

  it('checks added active rules, counting untracked test files as changed', async () => {
    const repo = await committedRepo();
    await writeFile(join(repo, 'docs/rules/clients/R-CLI-004.md'), newRule('R-CLI-004'));
    await writeFile(join(repo, 'tests/clients/test_new.py'), '# @rule R-CLI-004\n');
    await writeFile(join(repo, 'docs/rules/clients/R-CLI-005.md'), newRule('R-CLI-005'));
    await appendFile(join(repo, 'tests/billing/invoice_test.go'), '\n// @rule R-CLI-005\n');
    git(repo, 'add', 'tests/billing/invoice_test.go');
    git(repo, 'commit', '-q', '-m', 'tag before the rule exists');

    expect(runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: [
        'error pending-implementation docs/rules/clients/R-CLI-005.md rule R-CLI-005 changed since HEAD but none of the tests tagging it changed',
        '1 error, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('works when the rulebook root is nested in the work tree', async () => {
    const dir = await scratchDir();
    const nested = join(dir, 'packages/app');
    await cp(fixtureRoot('repo'), nested, { recursive: true });
    await writeFile(join(nested, 'tests/billing/test_numbering.py'), '# @rule R-BIL-002\n');
    initRepo(dir);
    await appendFile(join(nested, CLI_001), '\nA second paragraph.\n');

    expect(runCli(['lint', '--base', 'HEAD'], nested).stdout).toBe(
      `${PENDING_CLI_001}\n1 error, 0 warnings\n`,
    );
  });

  it('fails clearly on an unknown ref', async () => {
    const repo = await committedRepo();

    for (const ref of ['no-such-branch', '--output=x']) {
      expect(runCli(['lint', `--base=${ref}`], repo)).toEqual({
        status: 1,
        stdout: '',
        stderr: `Unknown git ref "${ref}".\n`,
      });
    }
  });

  it('fails clearly outside a git work tree', async () => {
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });

    expect(runCli(['lint', '--base', 'main'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: `lint --base needs a git work tree, but ${dir} is not inside one.\n`,
    });
  });

  it('requires a value for --base', () => {
    const result = runCli(['lint', '--base'], fixtureRoot('lint'));

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: rulebookguard lint [--base <ref>] [--json]\n');
  });
});
