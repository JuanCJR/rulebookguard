import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { expandGlobs, listRepoFiles, scanTestTags } from '../../src/index.ts';
import { initRepo } from '../git.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot } from './helpers.ts';

async function repoWithIgnoredBuild(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  await writeFile(join(dir, '.gitignore'), 'dist/\n');
  await mkdir(join(dir, 'dist/src/clients'), { recursive: true });
  await writeFile(join(dir, 'dist/src/clients/create.go'), 'package clients\n');
  await mkdir(join(dir, 'dist/tests/clients'), { recursive: true });
  await writeFile(join(dir, 'dist/tests/clients/test_build.py'), '# @rule R-CLI-002\n');
  return dir;
}

describe('listRepoFiles inside a git work tree', () => {
  it('skips files ignored by .gitignore and keeps tracked and untracked files', async () => {
    const dir = await repoWithIgnoredBuild();
    initRepo(dir);
    await writeFile(join(dir, 'src/clients/untracked.go'), 'package clients\n');
    await rm(join(dir, 'src/billing/tax.go'));

    const files = await listRepoFiles(dir);

    expect(files).toContain('src/clients/untracked.go');
    expect(files).toContain('.gitignore');
    expect(files).not.toContain('src/billing/tax.go');
    expect(files.filter((file) => file.startsWith('dist/'))).toEqual([]);
    expect(await expandGlobs(dir, ['**/clients/create.go'])).toEqual(['src/clients/create.go']);
    expect((await scanTestTags(dir, ['**/test_*.py'])).has('R-CLI-002')).toBe(false);
  });

  it('lists paths relative to a rulebook root nested in the work tree', async () => {
    const dir = await scratchDir();
    const nested = join(dir, 'packages/app');
    await mkdir(nested, { recursive: true });
    await cp(fixtureRoot('repo'), nested, { recursive: true });
    await writeFile(join(dir, 'outside.go'), 'package outside\n');
    initRepo(dir);

    expect(await expandGlobs(nested, ['src/billing/**', '**/outside.go'])).toEqual([
      'src/billing/invoice.go',
      'src/billing/tax.go',
    ]);
  });
});

describe('listRepoFiles outside a git work tree', () => {
  it('walks the whole tree, skipping only .git and node_modules', async () => {
    const dir = await repoWithIgnoredBuild();
    await mkdir(join(dir, 'node_modules/pkg'), { recursive: true });
    await writeFile(join(dir, 'node_modules/pkg/index.go'), 'package pkg\n');

    expect(await expandGlobs(dir, ['**/clients/create.go'])).toEqual([
      'dist/src/clients/create.go',
      'src/clients/create.go',
    ]);
    expect((await listRepoFiles(dir)).some((file) => file.startsWith('node_modules/'))).toBe(false);
  });
});
