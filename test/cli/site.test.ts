import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { astroFailureDetail, siteCommand, siteWorkRoot } from '../../src/commands/site.ts';
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

describe('site:generate', () => {
  it('builds the static site into site/ and prints its path', async () => {
    const repo = await scratchRepo();

    const result = await runCli(['site:generate'], repo);

    expect(result).toEqual({ status: 0, stdout: 'site\n', stderr: '' });
    const out = join(repo, 'site');
    expect(await read(out, 'index.html')).toContain('Business rules');
    expect(await read(out, 'billing/r-bil-002/index.html')).toContain('src/billing/invoice.go');
    expect(await read(out, 'rules/index.html')).toContain('data-status="deprecated"');
    expect(await read(out, 'health/index.html')).toContain('untested-rule');
    expect(await readdir(join(out, 'pagefind'))).not.toHaveLength(0);
  });

  it('keeps site as the same command', async () => {
    const repo = await scratchRepo();

    expect(await runCli(['site', '--out', 'public/rules'], repo)).toEqual({
      status: 0,
      stdout: 'public/rules\n',
      stderr: '',
    });
    expect(await read(join(repo, 'public/rules'), 'index.html')).toContain('Business rules');
  });

  it('writes to --out and serves under --base', async () => {
    const repo = await scratchRepo();

    const result = await runCli(
      ['site:generate', '--out', 'public/rules', '--base', '/rules'],
      repo,
    );

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

describe('site:run', () => {
  async function serve(
    repo: string,
    options: { base?: string } = {},
  ): Promise<{ url: string; stdout: () => string; stop: () => Promise<void> }> {
    let stdout = '';
    let release!: () => void;
    const until = new Promise<void>((resolveStop) => {
      release = resolveStop;
    });
    const io = {
      cwd: repo,
      stdout: (text: string) => {
        stdout += text;
      },
      stderr: () => {},
    };
    const running = siteCommand(io, { serve: true, port: 0, base: options.base }, until);
    while (!/http:\/\/\S+/.test(stdout)) {
      await new Promise((tick) => setTimeout(tick, 20));
    }
    const url = /http:\/\/\S+/.exec(stdout)![0];
    let stopped = false;
    const stop = async () => {
      if (!stopped) {
        stopped = true;
        release();
        await running;
      }
    };
    onTestFinished(stop);
    return { url, stdout: () => stdout, stop };
  }

  it('builds the site, then serves it locally until stopped', async () => {
    const repo = await scratchRepo();

    const { url, stdout, stop } = await serve(repo);

    expect(stdout()).toMatch(
      /^site\nServing site at http:\/\/127\.0\.0\.1:\d+\/ \(Ctrl\+C to stop\)\n$/,
    );
    const home = await fetch(url);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await home.text()).toContain('Business rules');
    const rule = await fetch(new URL('billing/r-bil-002/', url));
    expect(await rule.text()).toContain('src/billing/invoice.go');
    expect((await fetch(new URL('favicon.svg', url))).headers.get('content-type')).toBe(
      'image/svg+xml',
    );
    await stop();
    await expect(fetch(url)).rejects.toThrow();
  });

  it('serves under --base, redirecting directories to their trailing slash', async () => {
    const repo = await scratchRepo();

    const { url } = await serve(repo, { base: '/rules' });

    expect(url).toMatch(/\/rules\/$/);
    expect(await (await fetch(url)).text()).toContain('href="/rules/billing/"');
    const bare = await fetch(new URL('/rules/billing', url), { redirect: 'manual' });
    expect(bare.status).toBe(301);
    expect(bare.headers.get('location')).toBe('/rules/billing/');
    const root = await fetch(new URL('/', url), { redirect: 'manual' });
    expect(root.status).toBe(301);
    expect(root.headers.get('location')).toBe('/rules/');
  });

  it('answers unknown pages with the site 404 page and never leaves the output directory', async () => {
    const repo = await scratchRepo();
    await writeFile(join(repo, 'secret.txt'), 'no');

    const { url } = await serve(repo);

    const missing = await fetch(new URL('nope/', url));
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const escape = await fetch(new URL('/%2e%2e/secret.txt', url));
    expect(escape.status).toBe(404);
    expect(await escape.text()).not.toBe('no');
  });

  it('rejects a port that is not a number', async () => {
    const repo = await scratchRepo();

    expect(await runCli(['site:run', '--port', 'abc'], repo)).toEqual({
      status: 2,
      stdout: '',
      stderr:
        '--port must be a number from 0 to 65535.\nUsage: rulebookguard site:run [--out <dir>] [--base <path>] [--port <n>]\n',
    });
  });

  it('leaves --port to site:run', async () => {
    const repo = await scratchRepo();

    for (const command of ['site', 'site:generate']) {
      const result = await runCli([command, '--port', '4000'], repo);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Unknown option '--port'");
    }
  });

  it('fails before building when the port is taken', async () => {
    const repo = await scratchRepo();
    const blocker = createServer();
    await new Promise<void>((ready) => blocker.listen(0, '127.0.0.1', ready));
    onTestFinished(() => new Promise<void>((done) => blocker.close(() => done())));
    const port = (blocker.address() as AddressInfo).port;

    const result = await runCli(['site:run', '--port', String(port)], repo);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: `Port ${port} is already in use; pass another --port.\n`,
    });
    expect(await readdir(repo)).not.toContain('site');
  });
});
