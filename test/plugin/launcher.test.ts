import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { scratchDir } from '../scratch.ts';

const launcher = fileURLToPath(new URL('../../plugin/bin/rulebookguard.mjs', import.meta.url));

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8'));
}

const pluginVersion = (await readJson('plugin/.claude-plugin/plugin.json')).version as string;

// A stand-in for rulebookguard that reports how it was called.
const ECHO = `let stdin = '';
process.stdin.on('data', (chunk) => (stdin += chunk));
process.stdin.on('end', () => {
  console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), stdin }));
  process.exitCode = Number(process.env.FAKE_EXIT ?? 0);
});
`;

async function projectWithLocal(version: string): Promise<string> {
  const project = await scratchDir();
  const pkg = join(project, 'node_modules/rulebookguard');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'rulebookguard', version, bin: { rulebookguard: 'cli.mjs' } }),
  );
  await writeFile(join(pkg, 'cli.mjs'), ECHO);
  return project;
}

async function checkout(name: string, version: string, built: boolean): Promise<string> {
  const project = await scratchDir();
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ name, version, bin: { rulebookguard: 'dist/cli.mjs' } }),
  );
  if (built) {
    await mkdir(join(project, 'dist'));
    await writeFile(join(project, 'dist/cli.mjs'), ECHO);
  }
  return project;
}

async function fakeNpxPath(): Promise<string> {
  const bin = await scratchDir();
  const npx = join(bin, 'npx');
  await writeFile(npx, `#!${process.execPath}\n${ECHO}`);
  await chmod(npx, 0o755);
  return `${bin}${delimiter}${process.env.PATH ?? ''}`;
}

function launch(args: string[], project: string, env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [launcher, ...args], {
    cwd: project,
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
    input: 'event',
    encoding: 'utf8',
  });
  return { status: result.status, call: JSON.parse(result.stdout || 'null') };
}

describe('plugin launcher', () => {
  it('ships one version across the package and the plugin manifests', async () => {
    const pkg = await readJson('package.json');
    const marketplace = await readJson('.claude-plugin/marketplace.json');

    expect(pluginVersion).toBe(pkg.version);
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: 'rulebookguard', source: './plugin' }),
    ]);
  });

  it('runs the project install when it is at least the plugin version', async () => {
    const project = await projectWithLocal(pluginVersion);

    const { status, call } = launch(['hook'], project);

    expect(status).toBe(0);
    expect(call).toEqual({ args: ['hook'], cwd: project, stdin: 'event' });
  });

  it('finds the install in a parent directory of the project', async () => {
    const root = await projectWithLocal(pluginVersion);
    const project = join(root, 'apps/api');
    await mkdir(project, { recursive: true });

    expect(launch(['hook'], project).call.args).toEqual(['hook']);
  });

  it('falls back to npx with the plugin version when the install is older', async () => {
    const project = await projectWithLocal('0.1.1');

    const { call } = launch(['hook'], project, { PATH: await fakeNpxPath() });

    expect(call).toEqual({
      args: ['--yes', `rulebookguard@${pluginVersion}`, 'hook'],
      cwd: project,
      stdin: 'event',
    });
  });

  it('falls back to npx when there is no install', async () => {
    const project = await scratchDir();

    const { call } = launch(['hook'], project, { PATH: await fakeNpxPath() });

    expect(call.args).toEqual(['--yes', `rulebookguard@${pluginVersion}`, 'hook']);
  });

  it('runs the bin of a rulebookguard checkout itself, whatever its version', async () => {
    const project = await checkout('rulebookguard', '0.1.1', true);

    const { status, call } = launch(['hook'], project, { PATH: await fakeNpxPath() });

    expect(status).toBe(0);
    expect(call).toEqual({ args: ['hook'], cwd: project, stdin: 'event' });
  });

  it('falls back to npx in a rulebookguard checkout that is not built', async () => {
    const project = await checkout('rulebookguard', pluginVersion, false);

    const { call } = launch(['hook'], project, { PATH: await fakeNpxPath() });

    expect(call.args).toEqual(['--yes', `rulebookguard@${pluginVersion}`, 'hook']);
  });

  it('falls back to npx in a project whose own package is another one', async () => {
    const project = await checkout('my-app', pluginVersion, true);

    const { call } = launch(['hook'], project, { PATH: await fakeNpxPath() });

    expect(call.args).toEqual(['--yes', `rulebookguard@${pluginVersion}`, 'hook']);
  });

  it('points mcp at the project directory', async () => {
    const project = await projectWithLocal(pluginVersion);

    expect(launch(['mcp'], project).call.args).toEqual(['mcp', '--project', project]);
  });

  it('never exits 2, which would block the edit', async () => {
    const project = await projectWithLocal(pluginVersion);

    expect(launch(['hook'], project, { FAKE_EXIT: '2' }).status).toBe(1);
    expect(launch(['hook'], project, { FAKE_EXIT: '3' }).status).toBe(3);
  });
});
