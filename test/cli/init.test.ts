import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import pkg from '../../package.json' with { type: 'json' };
import { parseContext } from '../../src/index.ts';
import { loadConfig } from '../../src/format/config.ts';
import { scratchDir } from '../scratch.ts';
import { runCli } from './run.ts';

const CONFIG = 'rulebookguard.config.yaml';
const WORKFLOW = '.github/workflows/rulebookguard.yml';

describe('init', () => {
  it('writes the config and the first context, prints their paths, and leaves a clean lint', async () => {
    const project = await scratchDir();

    const result = await runCli(['init', 'clients'], project);

    expect(result).toEqual({
      status: 0,
      stdout: `${CONFIG}\ndocs/rules/clients/_context.md\n`,
      stderr: '',
    });
    expect(await readFile(join(project, CONFIG), 'utf8')).toBe(
      "schema: 1\nrulesDir: docs/rules\ntestGlobs:\n  - '**/*.test.*'\n  - '**/*.spec.*'\n  - '**/test_*.py'\n  - '**/*_test.go'\n",
    );
    const file = 'docs/rules/clients/_context.md';
    expect(parseContext(await readFile(join(project, file), 'utf8'), file)).toMatchObject({
      context: 'clients',
      prefix: 'CLI',
    });
    expect(await readdir(project)).not.toContain('.github');
    expect(await runCli(['lint'], project)).toEqual({
      status: 0,
      stdout: 'No issues found.\n',
      stderr: '',
    });
    expect((await runCli(['new', 'clients'], project)).stdout).toBe(
      'docs/rules/clients/R-CLI-001.md\n',
    );
  });

  it('uses --prefix for the context', async () => {
    const project = await scratchDir();

    await runCli(['init', 'clients', '--prefix', 'CL'], project);

    const file = 'docs/rules/clients/_context.md';
    expect(parseContext(await readFile(join(project, file), 'utf8'), file).prefix).toBe('CL');
  });

  it('writes --language into the config and the context template', async () => {
    const project = await scratchDir();

    expect((await runCli(['init', 'clientes', '--language', 'es'], project)).status).toBe(0);

    expect((await loadConfig(join(project, CONFIG))).language).toBe('es');
    const file = 'docs/rules/clientes/_context.md';
    expect(parseContext(await readFile(join(project, file), 'utf8'), file).summary).toBe(
      'TODO: resumen del contexto en una línea.',
    );
  });

  it('writes a CI workflow pinned to this version with --ci', async () => {
    const project = await scratchDir();

    const result = await runCli(['init', 'clients', '--ci'], project);

    expect(result.stdout).toBe(`${CONFIG}\ndocs/rules/clients/_context.md\n${WORKFLOW}\n`);
    const workflow = await readFile(join(project, WORKFLOW), 'utf8');
    expect(workflow).toContain('on: pull_request\n');
    expect(workflow).toContain('fetch-depth: 0\n');
    expect(workflow).toContain(
      `run: npx --yes rulebookguard@${pkg.version} lint --base origin/\${{ github.base_ref }}\n`,
    );
  });

  // @rule R-AUT-003
  it('fails and writes nothing when the config already exists', async () => {
    const project = await scratchDir();
    await writeFile(join(project, CONFIG), 'schema: 1\ntestGlobs: []\n');

    const result = await runCli(['init', 'clients', '--ci'], project);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: `${CONFIG} already exists; nothing was written.\n`,
    });
    expect((await readdir(project)).sort()).toEqual([CONFIG]);
  });

  it('fails and writes nothing when the CI workflow already exists', async () => {
    const project = await scratchDir();
    await mkdir(join(project, '.github/workflows'), { recursive: true });
    await writeFile(join(project, WORKFLOW), 'name: mine\n');

    const result = await runCli(['init', 'clients', '--ci'], project);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: `${WORKFLOW} already exists; nothing was written.\n`,
    });
    expect((await readdir(project)).sort()).toEqual(['.github']);
    expect(await readFile(join(project, WORKFLOW), 'utf8')).toBe('name: mine\n');
  });

  it('fails and writes nothing for an invalid context name', async () => {
    const project = await scratchDir();

    const result = await runCli(['init', 'Clients'], project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"Clients"');
    expect(await readdir(project)).toEqual([]);
  });
  // @endrule R-AUT-003

  it('rejects a --language other than en or es as a usage error', async () => {
    const project = await scratchDir();

    const result = await runCli(['init', 'clients', '--language', 'fr'], project);

    expect(result).toEqual({
      status: 2,
      stdout: '',
      stderr:
        '--language must be en or es.\nUsage: rulebookguard init <context> [--prefix <P>] [--language <en|es>] [--ci]\n',
    });
    expect(await readdir(project)).toEqual([]);
  });

  it('requires a context', async () => {
    const result = await runCli(['init'], await scratchDir());

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Missing argument <context>.');
  });

  it('is listed in the usage', async () => {
    const result = await runCli(['--help'], '/');

    expect(result.stdout).toMatch(
      /\n {2}init <context> \[--prefix <P>\] \[--language <en\|es>\] \[--ci\]/,
    );
  });
});
