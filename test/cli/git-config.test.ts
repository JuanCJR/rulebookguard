import { access, chmod, cp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { git, initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('git subprocesses', () => {
  it('never run the core.fsmonitor command of the repository config', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    initRepo(repo);
    const marker = join(repo, 'fsmonitor-ran');
    const hook = join(await scratchDir(), 'fsmonitor.sh');
    await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\n`);
    await chmod(hook, 0o755);
    git(repo, 'config', 'core.fsmonitor', hook);

    for (const args of [
      ['lint'],
      ['for', 'src/clients/create.go'],
      ['impact', 'R-CLI-001'],
      ['lint', '--base', 'HEAD'],
    ]) {
      await runCli(args, repo);
      expect(await exists(marker), args.join(' ')).toBe(false);
    }
  });
});

describe('git failures', () => {
  it('warns once and walks the directory when git cannot run', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    const warning =
      'warning: git could not list files (git was not found); walking the directory instead.\n';
    const path = process.env.PATH;
    process.env.PATH = '';
    try {
      const lint = await runCli(['lint'], repo);
      const impact = await runCli(['impact', 'R-CLI-001'], repo);

      expect(lint.status).toBe(1);
      expect(lint.stderr).toBe(warning);
      expect(impact.status).toBe(0);
      expect(impact.stderr).toBe(warning);
    } finally {
      process.env.PATH = path;
    }
  });

  it('warns with the first git error line when git fails for another reason', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    const bin = await scratchDir();
    await writeFile(
      join(bin, 'git'),
      [
        '#!/bin/sh',
        "echo 'warning: ignored before the real error' >&2",
        'echo "fatal: detected dubious ownership in repository at \'$PWD\'" >&2',
        "echo 'second line is not the reason' >&2",
        'exit 128',
        '',
      ].join('\n'),
    );
    await chmod(join(bin, 'git'), 0o755);
    const warning = `warning: git could not list files (fatal: detected dubious ownership in repository at '${repo}'); walking the directory instead.\n`;
    const path = process.env.PATH;
    process.env.PATH = bin;
    try {
      const lint = await runCli(['lint'], repo);
      const impact = await runCli(['impact', 'R-CLI-001'], repo);

      expect(lint.status).toBe(1);
      expect(lint.stderr).toBe(warning);
      expect(impact.status).toBe(0);
      expect(impact.stderr).toBe(warning);
    } finally {
      process.env.PATH = path;
    }
  });

  it('stays silent when the directory is not a git repository', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    const ceiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = dirname(repo);
    try {
      const lint = await runCli(['lint'], repo);
      const impact = await runCli(['impact', 'R-CLI-001'], repo);

      expect(lint.status).toBe(1);
      expect(lint.stderr).toBe('');
      expect(impact.status).toBe(0);
      expect(impact.stderr).toBe('');
    } finally {
      if (ceiling === undefined) {
        delete process.env.GIT_CEILING_DIRECTORIES;
      } else {
        process.env.GIT_CEILING_DIRECTORIES = ceiling;
      }
    }
  });

  it('reports a git failure while listing changes as a CLI error', async () => {
    const repo = await scratchDir();
    await cp(fixtureRoot('repo'), repo, { recursive: true });
    initRepo(repo);
    const tree = git(repo, 'rev-parse', 'HEAD^{tree}').trim();
    await rm(join(repo, '.git/objects', tree.slice(0, 2), tree.slice(2)));

    const result = await runCli(['lint', '--base', 'HEAD'], repo);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /^Cannot list the files changed since "HEAD": (?:fatal|error): [^\n]+\n$/,
    );
  });
});
