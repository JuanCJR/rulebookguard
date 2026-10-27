import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { runCli as run } from '../../src/commands/run.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot } from './run.ts';

async function scratchRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  return dir;
}

async function hook(input: string, cwd: string) {
  let stdout = '';
  let stderr = '';
  const status = await run(['hook'], {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    stdin: async () => input,
  });
  return { status, stdout, stderr };
}

function event(filePath: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
    ...extra,
  });
}

function context(stdout: string): string {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(Object.keys(output)).toEqual(['hookSpecificOutput']);
  expect(Object.keys(output.hookSpecificOutput)).toEqual(['hookEventName', 'additionalContext']);
  expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  return output.hookSpecificOutput.additionalContext;
}

describe('hook', () => {
  it('injects the active rules anchored to the edited file, found from the file itself', async () => {
    const repo = await scratchRepo();
    const elsewhere = await scratchDir();

    const result = await hook(event(join(repo, 'src/clients/create.go')), elsewhere);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(context(result.stdout)).toBe(
      [
        'Business rules anchored to src/clients/create.go (rulebookguard). They are the source of truth: keep the code consistent with them, and change the rule first if this edit changes its behavior.',
        '',
        '## R-BIL-001 (billing): Every new client gets a zero-balance account.',
        'Rule file: docs/rules/billing/R-BIL-001.md',
        '',
        (await body(repo, 'docs/rules/billing/R-BIL-001.md')).trim(),
        '',
        '## R-CLI-001 (clients): A client document number is unique per country.',
        'Rule file: docs/rules/clients/R-CLI-001.md',
        '',
        '# Unique document number',
        '',
        'Two clients in the same country cannot share a document number.',
      ].join('\n'),
    );
  });

  it('writes the header in the configured language', async () => {
    const repo = await scratchRepo();
    const config = join(repo, 'rulebookguard.config.yaml');
    await writeFile(config, `${await readFile(config, 'utf8')}language: es\n`);

    const result = await hook(event(join(repo, 'src/billing/invoice.go')), repo);

    expect(context(result.stdout).split('\n').slice(0, 3)).toEqual([
      'Reglas de negocio ancladas a src/billing/invoice.go (rulebookguard). Son la fuente de verdad: mantén el código coherente con ellas y, si esta edición cambia su comportamiento, cambia primero la regla.',
      '',
      '## R-BIL-001 (billing): Every new client gets a zero-balance account.',
    ]);
    expect(context(result.stdout)).toContain(
      'Archivo de la regla: docs/rules/billing/R-BIL-001.md',
    );
  });

  it('resolves a relative file path against the cwd of the event', async () => {
    const repo = await scratchRepo();

    const result = await hook(event('src/billing/invoice.go', { cwd: repo }), await scratchDir());

    expect(context(result.stdout)).toContain('## R-BIL-001 (billing)');
  });

  it('covers a Write to a file in a directory that does not exist yet', async () => {
    const repo = await scratchRepo();
    const input = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(repo, 'src/clients/new/merge.go'), content: 'package clients' },
    });

    const result = await hook(input, repo);

    expect(context(result.stdout)).toContain('## R-CLI-001 (clients)');
  });

  it('lists summaries only when the rule bodies are too long', async () => {
    const repo = await scratchRepo();
    const file = join(repo, 'docs/rules/clients/R-CLI-001.md');
    await writeFile(file, `${await readFile(file, 'utf8')}\n${'x'.repeat(10_001)}\n`);

    const text = context((await hook(event(join(repo, 'src/clients/create.go')), repo)).stdout);

    expect(text).not.toContain('xxxx');
    expect(text).not.toContain('# Unique document number');
    expect(text.split('\n').slice(2)).toEqual([
      '## R-BIL-001 (billing): Every new client gets a zero-balance account.',
      'Rule file: docs/rules/billing/R-BIL-001.md',
      '',
      '## R-CLI-001 (clients): A client document number is unique per country.',
      'Rule file: docs/rules/clients/R-CLI-001.md',
      '',
      'Rule texts omitted (over 10000 characters); run `rulebookguard show <id>` for the full text.',
    ]);
  });

  it.each([
    ['a file no active rule is anchored to', (repo: string) => event(join(repo, 'README.md'))],
    ['a file outside any rulebook', (_repo: string) => event('/nonexistent/rulebookguard/x.go')],
    ['input that is not JSON', (_repo: string) => 'not json'],
    [
      'an event without a file path',
      (_repo: string) => JSON.stringify({ tool_name: 'Edit', tool_input: {} }),
    ],
  ])('prints nothing and exits 0 for %s', async (_name, input) => {
    const repo = await scratchRepo();

    expect(await hook(input(repo), repo)).toEqual({ status: 0, stdout: '', stderr: '' });
  });

  it('never blocks the edit when the config is invalid', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, 'rulebookguard.config.yaml'), 'schema: 2\n');

    const result = await hook(event(join(repo, 'src/clients/create.go')), repo);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('is listed in the usage', async () => {
    let usage = '';
    await run(['--help'], { cwd: '/', stdout: (t) => (usage += t), stderr: () => {} });
    expect(usage).toContain('  hook  ');
  });
});

async function body(repo: string, file: string): Promise<string> {
  const source = await readFile(join(repo, file), 'utf8');
  return source.slice(source.indexOf('---', 3) + 3);
}
