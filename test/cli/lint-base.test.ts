import { appendFile, cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { git, initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

const CLI_001 = 'docs/rules/clients/R-CLI-001.md';
const PENDING_CLI_001 = `error pending-implementation ${CLI_001} rule R-CLI-001 changed since HEAD but none of the tests tagging it changed`;
const PENDING_HINT =
  '  hint: update or add a test inside an "@rule R-CLI-001" … "@endrule R-CLI-001" region that covers the changed rule';

const TEST_CREATE = 'tests/clients/test_create.py';

async function editTest(repo: string, edit: (source: string) => string): Promise<void> {
  const file = join(repo, TEST_CREATE);
  await writeFile(file, edit(await readFile(file, 'utf8')));
}

async function committedRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  await writeFile(
    join(dir, 'tests/billing/test_numbering.py'),
    '# @rule R-BIL-002\n# @endrule R-BIL-002\n',
  );
  initRepo(dir);
  return dir;
}

function newRule(id: string): string {
  return `---\nid: ${id}\ncontext: clients\nentities: [Client]\nstatus: active\nanchors:\n  - 'src/clients/create.go'\nsummary: A new rule.\n---\n\nBody.\n`;
}

describe('lint --base', () => {
  it('passes when nothing changed since the ref', async () => {
    const repo = await committedRepo();

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
  });

  it('reports an uncommitted rule change without a tagging test change', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: `${PENDING_CLI_001}\n${PENDING_HINT}\n1 error, 0 warnings\n`,
      stderr: '',
    });
  });

  it('passes when a line inside a region tagging the rule changed too', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    await editTest(repo, (source) =>
      source.replace('    pass\n', '    assert covers_second_paragraph()\n'),
    );

    expect((await runCli(['lint', '--base', 'HEAD'], repo)).status).toBe(0);
  });

  it('passes when lines were only deleted inside a region tagging the rule', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    await editTest(repo, (source) => source.replace('    pass\n', ''));

    expect((await runCli(['lint', '--base', 'HEAD'], repo)).status).toBe(0);
  });

  it('reports the rule when the test file changed only outside its regions', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    await appendFile(join(repo, TEST_CREATE), '\n# an unrelated note\n');
    await editTest(repo, (source) =>
      source.replace('# @endrule R-CLI-001\n\n', '# @endrule R-CLI-001\n\n\n'),
    );

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: `${PENDING_CLI_001}\n${PENDING_HINT}\n1 error, 0 warnings\n`,
      stderr: '',
    });
  });

  it('does not count a deletion right after a region', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    await editTest(repo, (source) =>
      source.replace('# @endrule R-CLI-001\n\n', '# @endrule R-CLI-001\n'),
    );

    expect((await runCli(['lint', '--base', 'HEAD'], repo)).status).toBe(1);
  });

  it('compares committed changes against an older ref and prints JSON', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, CLI_001), '\nA second paragraph.\n');
    git(repo, 'commit', '-q', '-am', 'change rule');

    const result = await runCli(['lint', '--base', 'HEAD~1', '--json'], repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      findings: [
        {
          severity: 'error',
          code: 'pending-implementation',
          file: CLI_001,
          message: 'rule R-CLI-001 changed since HEAD~1 but none of the tests tagging it changed',
          hint: 'update or add a test inside an "@rule R-CLI-001" … "@endrule R-CLI-001" region that covers the changed rule',
        },
      ],
      errors: 1,
      warnings: 0,
    });
    expect((await runCli(['lint', '--base', 'HEAD'], repo)).status).toBe(0);
  });

  it('ignores changed rules that are proposed or deprecated', async () => {
    const repo = await committedRepo();
    await appendFile(join(repo, 'docs/rules/clients/R-CLI-002.md'), '\nMore.\n');
    await appendFile(join(repo, 'docs/rules/clients/R-CLI-003.md'), '\nMore.\n');

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
  });

  it('checks added active rules, counting untracked test files as changed', async () => {
    const repo = await committedRepo();
    await writeFile(join(repo, 'docs/rules/clients/R-CLI-004.md'), newRule('R-CLI-004'));
    await writeFile(
      join(repo, 'tests/clients/test_new.py'),
      '# @rule R-CLI-004\n# @endrule R-CLI-004\n',
    );
    await writeFile(join(repo, 'docs/rules/clients/R-CLI-005.md'), newRule('R-CLI-005'));
    await appendFile(
      join(repo, 'tests/billing/invoice_test.go'),
      '\n// @rule R-CLI-005\n// @endrule R-CLI-005\n',
    );
    git(repo, 'add', 'tests/billing/invoice_test.go');
    git(repo, 'commit', '-q', '-m', 'tag before the rule exists');

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: [
        'error pending-implementation docs/rules/clients/R-CLI-005.md rule R-CLI-005 changed since HEAD but none of the tests tagging it changed',
        '  hint: update or add a test inside an "@rule R-CLI-005" … "@endrule R-CLI-005" region that covers the changed rule',
        '1 error, 0 warnings',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('reports only untested-rule for a changed active rule that no test tags', async () => {
    const repo = await committedRepo();
    await writeFile(join(repo, 'docs/rules/clients/R-CLI-004.md'), newRule('R-CLI-004'));

    expect(await runCli(['lint', '--base', 'HEAD'], repo)).toEqual({
      status: 1,
      stdout: [
        'error untested-rule docs/rules/clients/R-CLI-004.md active rule R-CLI-004 has no test tagging it',
        '  hint: wrap a test in a file matched by testGlobs with "@rule R-CLI-004" and "@endrule R-CLI-004", or set the rule\'s status to proposed',
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
    await writeFile(
      join(nested, 'tests/billing/test_numbering.py'),
      '# @rule R-BIL-002\n# @endrule R-BIL-002\n',
    );
    initRepo(dir);
    await appendFile(join(nested, CLI_001), '\nA second paragraph.\n');

    expect((await runCli(['lint', '--base', 'HEAD'], nested)).stdout).toBe(
      `${PENDING_CLI_001}\n${PENDING_HINT}\n1 error, 0 warnings\n`,
    );
  });

  it('fails clearly on an unknown ref', async () => {
    const repo = await committedRepo();

    for (const ref of ['no-such-branch', '--output=x']) {
      expect(await runCli(['lint', `--base=${ref}`], repo)).toEqual({
        status: 1,
        stdout: '',
        stderr: `Unknown git ref "${ref}".\n`,
      });
    }
  });

  it('fails clearly outside a git work tree', async () => {
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });

    expect(await runCli(['lint', '--base', 'main'], dir)).toEqual({
      status: 1,
      stdout: '',
      stderr: `lint --base needs a git work tree, but ${dir} is not inside one.\n`,
    });
  });

  it('requires a value for --base', async () => {
    const result = await runCli(['lint', '--base'], fixtureRoot('lint'));

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: rulebookguard lint [--base <ref>] [--json]\n');
  });
});
