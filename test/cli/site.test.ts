import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';
import { astroFailureDetail, siteWorkRoot } from '../../src/commands/site.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot, runCli } from './run.ts';

async function scratchRepo(): Promise<string> {
  const dir = await scratchDir();
  await cp(fixtureRoot('repo'), dir, { recursive: true });
  return dir;
}

async function read(dir: string, path: string): Promise<string> {
  return readFile(join(dir, path), 'utf8');
}

describe('site', () => {
  it('builds the static site into site/ and prints its path', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['site'], repo);

    expect(result).toEqual({ status: 0, stdout: 'site\n', stderr: '' });
    const out = join(repo, 'site');
    expect(await read(out, 'index.html')).toContain('Business rules');
    expect(await read(out, 'billing/r-bil-002/index.html')).toContain('src/billing/invoice.go');
    expect(await read(out, 'rules/index.html')).toContain('data-status="deprecated"');
    expect(await read(out, 'health/index.html')).toContain('untested-rule');
    expect(await readdir(join(out, 'pagefind'))).not.toHaveLength(0);
  });

  it('writes to --out and serves under --base', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['site', '--out', 'public/rules', '--base', '/rules'], repo);

    expect(result.stdout).toBe('public/rules\n');
    expect(await read(join(repo, 'public/rules'), 'index.html')).toContain(
      'href="/rules/billing/"',
    );
  });

  it('prints an output outside the current directory as an absolute path', async () => {
    const repo = await scratchRepo();
    const out = join(await scratchDir(), 'rules-site');

    expect((await runCli(['site', '--out', out], repo)).stdout).toBe(`${out}\n`);
  });

  it('follows language for the generated text and the interface', async () => {
    const repo = await scratchRepo();
    const config = join(repo, 'rulebookguard.config.yaml');
    await writeFile(config, `${await read(repo, 'rulebookguard.config.yaml')}language: es\n`);

    await runCli(['site'], repo);

    const home = await read(join(repo, 'site'), 'index.html');
    expect(home).toContain('lang="es"');
    expect(home).toContain('Reglas de negocio');
  });

  it('rebuilds over its own previous output', async () => {
    const repo = await scratchRepo();
    await runCli(['site'], repo);
    await writeFile(join(repo, 'site/stale.html'), 'old');

    expect((await runCli(['site'], repo)).status).toBe(0);
    expect(await readdir(join(repo, 'site'))).not.toContain('stale.html');
  });

  it('refuses to replace a directory it did not create', async () => {
    const repo = await scratchRepo();
    await mkdir(join(repo, 'docs/site'), { recursive: true });
    await writeFile(join(repo, 'docs/site/keep.md'), 'mine');

    const result = await runCli(['site', '--out', 'docs/site'], repo);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr:
        'docs/site is not empty and was not written by "rulebookguard site"; choose another --out or empty it first.\n',
    });
    expect(await read(repo, 'docs/site/keep.md')).toBe('mine');
  });

  it('builds when an older copy of an Astro dependency is hoisted above the work directory', async () => {
    // pnpm hoists packages into node_modules/.pnpm/node_modules, which sits on the resolution path of the generated
    // project; Kuadra has express's cookie 0.7 there, without the parseCookie export Astro imports.
    const shadow = join(siteWorkRoot(), 'node_modules/cookie');
    await mkdir(shadow, { recursive: true });
    onTestFinished(() =>
      rm(join(siteWorkRoot(), 'node_modules'), { recursive: true, force: true }),
    );
    await writeFile(
      join(shadow, 'package.json'),
      '{"name":"cookie","version":"0.7.2","main":"index.js"}',
    );
    await writeFile(
      join(shadow, 'index.js'),
      'exports.parse = () => ({});\nexports.serialize = () => "";\n',
    );
    const repo = await scratchRepo();

    const result = await runCli(['site'], repo);

    expect(result).toEqual({ status: 0, stdout: 'site\n', stderr: '' });
  });

  it('reports the cause of a failed build, not its stack trace', () => {
    const output = [
      "12:00:00 [ERROR] Named export 'parseCookie' not found.",
      '  Hint:',
      '    Use the default export.',
      '  Stack trace:',
      '    at ModuleJob._instantiate (node:internal/modules/esm/module_job:180:21)',
      '    at async generatePages (file:///x/astro/dist/core/build/generate.js:82:2)',
    ].join('\n');

    expect(astroFailureDetail(output)).toBe(
      [
        "12:00:00 [ERROR] Named export 'parseCookie' not found.",
        '  Hint:',
        '    Use the default export.',
      ].join('\n'),
    );
  });

  it('leaves no work directory behind', async () => {
    const repo = await scratchRepo();

    await runCli(['site'], repo);

    expect(await readdir(siteWorkRoot()).catch(() => [])).toEqual([]);
  });
});
