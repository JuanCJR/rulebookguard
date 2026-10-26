import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { expandGlobs, listRepoFiles, scanTestTags } from '../../src/index.ts';
import { git, initRepo } from '../git.ts';
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

describe('listRepoFiles in special git layouts', () => {
  it('walks a rulebook root that the enclosing work tree ignores', async () => {
    const dir = await scratchDir();
    const nested = join(dir, 'packages/app');
    await cp(fixtureRoot('repo'), nested, { recursive: true });
    await writeFile(join(dir, '.gitignore'), 'packages/\n');
    initRepo(dir);

    expect(await expandGlobs(nested, ['src/billing/**'])).toEqual([
      'src/billing/invoice.go',
      'src/billing/tax.go',
    ]);
    expect((await scanTestTags(nested, ['tests/**/test_*.py'])).has('R-CLI-001')).toBe(true);
  });

  it('lists the files inside submodules instead of the gitlink', async () => {
    const library = await scratchDir();
    await mkdir(join(library, 'pkg'), { recursive: true });
    await writeFile(join(library, 'pkg/lib.go'), 'package pkg\n');
    initRepo(library);
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });
    initRepo(dir);
    git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', library, 'vendor/lib');
    git(dir, 'commit', '-q', '-m', 'add submodule');

    const files = await listRepoFiles(dir);

    expect(files).toContain('vendor/lib/pkg/lib.go');
    expect(files).toContain('.gitmodules');
    expect(files).not.toContain('vendor/lib');
    expect(await expandGlobs(dir, ['vendor/**/*.go'])).toEqual(['vendor/lib/pkg/lib.go']);
  });

  it('skips a submodule whose git listing fails instead of walking it', async () => {
    const library = await scratchDir();
    await mkdir(join(library, 'pkg'), { recursive: true });
    await writeFile(join(library, 'pkg/lib.go'), 'package pkg\n');
    await writeFile(join(library, '.gitignore'), 'dist/\n');
    initRepo(library);
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });
    initRepo(dir);
    git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', library, 'vendor/lib');
    git(dir, 'commit', '-q', '-m', 'add submodule');
    await mkdir(join(dir, 'vendor/lib/dist'), { recursive: true });
    await writeFile(join(dir, 'vendor/lib/dist/built.go'), 'package dist\n');
    await writeFile(join(dir, '.git/modules/vendor/lib/index'), 'corrupt\n');
    const calls: [string, string | undefined][] = [];

    const files = await listRepoFiles(dir, (reason, submodule) => calls.push([reason, submodule]));

    expect(files).toContain('src/clients/create.go');
    expect(files.filter((file) => file.startsWith('vendor/lib/'))).toEqual([]);
    expect(calls.map(([, submodule]) => submodule)).toEqual(['vendor/lib']);
  });
});

async function outsideTree(): Promise<string> {
  const outside = await scratchDir();
  await mkdir(join(outside, 'tests'), { recursive: true });
  await writeFile(join(outside, 'tests/test_leak.py'), '# @rule R-CLI-002\n');
  return outside;
}

function addGitlink(dir: string, path: string): void {
  const commit = git(dir, 'rev-parse', 'HEAD').trim();
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${commit},${path}`);
  git(dir, 'commit', '-q', '-m', `add gitlink ${path}`);
}

describe('listRepoFiles with crafted gitlinks', () => {
  it('skips a gitlink whose working-tree entry escapes the rulebook root', async () => {
    const plain = await outsideTree();
    const repo = await outsideTree();
    initRepo(repo);
    const parent = await outsideTree();
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });
    initRepo(dir);
    addGitlink(dir, 'vendor/plain');
    addGitlink(dir, 'vendor/repo');
    addGitlink(dir, 'linked/tests');
    await mkdir(join(dir, 'vendor'), { recursive: true });
    await symlink(plain, join(dir, 'vendor/plain'));
    await symlink(repo, join(dir, 'vendor/repo'));
    await symlink(parent, join(dir, 'linked'));
    const reasons: string[] = [];

    const files = await listRepoFiles(dir, (reason) => reasons.push(reason));

    expect(files.filter((file) => /^(vendor(\/|$)|linked\/)/.test(file))).toEqual([]);
    expect(files).toContain('src/clients/create.go');
    expect((await scanTestTags(dir, ['**/test_*.py'])).has('R-CLI-002')).toBe(false);
    expect(reasons).toEqual([]);
  });

  it('keeps the superproject listing when one submodule cannot be listed', async () => {
    const dir = await repoWithIgnoredBuild();
    initRepo(dir);
    addGitlink(dir, 'vendor/broken');
    await mkdir(join(dir, 'vendor'), { recursive: true });
    await writeFile(join(dir, 'vendor/broken'), 'not a directory\n');
    const calls: [string, string | undefined][] = [];

    const files = await listRepoFiles(dir, (reason, submodule) => calls.push([reason, submodule]));

    expect(files).toContain('src/clients/create.go');
    expect(files.filter((file) => file.startsWith('dist/'))).toEqual([]);
    expect(files.filter((file) => file.startsWith('vendor/'))).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('vendor/broken');
    expect(calls[0]?.[0]).toMatch(/ENOTDIR/);
  });
});

describe('listRepoFiles outside a git work tree', () => {
  it('does not follow a symlinked directory that points outside the root', async () => {
    const outside = await outsideTree();
    const dir = await scratchDir();
    await cp(fixtureRoot('repo'), dir, { recursive: true });
    await symlink(outside, join(dir, 'ext'));

    const files = await listRepoFiles(dir);

    expect(files.filter((file) => file.startsWith('ext'))).toEqual([]);
    expect(files).toContain('src/clients/create.go');
  });

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
