import { access, chmod, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
