import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { splitFrontmatter } from '../../src/format/frontmatter.ts';
import { fixtureRoot } from '../cli/run.ts';
import { scratchDir } from '../scratch.ts';

const root = new URL('../../', import.meta.url);
const repo = fileURLToPath(root);

// npm and npx are .cmd scripts on Windows, which need a shell and quoted paths.
function run(command: string, args: string[], cwd: string): string {
  const result =
    process.platform === 'win32' && command !== process.execPath
      ? spawnSync([command, ...args.map((arg) => JSON.stringify(arg))].join(' '), {
          cwd,
          encoding: 'utf8',
          shell: true,
        })
      : spawnSync(command, args, { cwd, encoding: 'utf8' });
  expect(result.status, `${command} ${args.join(' ')}\n${result.stderr}`).toBe(0);
  return result.stdout;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, root), 'utf8')) as Record<string, unknown>;
}

describe('Kiro power', () => {
  it('has the manifest fields Kiro requires, at the version of the package', async () => {
    const pkg = await readJson('package.json');

    expect(await readJson('plugin/plugin.json')).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'rulebookguard',
      version: pkg.version,
      description: expect.any(String),
      author: { name: expect.any(String) },
      keywords: expect.arrayContaining(['business rules', 'rulebookguard']),
    });
  });

  it('runs the MCP server of the version of the package', async () => {
    const pkg = await readJson('package.json');

    expect(await readJson('plugin/mcp.json')).toEqual({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: {
        rulebookguard: {
          type: 'stdio',
          command: 'npx',
          args: ['--yes', `rulebookguard@${String(pkg.version)}`, 'mcp'],
        },
      },
    });
  });

  it('ships skills whose frontmatter meets the rules of Kiro', async () => {
    const folders = await readdir(new URL('plugin/skills/', root));

    expect(folders.sort()).toEqual(['rule-writing', 'rules']);
    for (const folder of folders) {
      const file = `plugin/skills/${folder}/SKILL.md`;
      const { data } = splitFrontmatter(await readFile(new URL(file, root), 'utf8'), file);
      const { name, description } = data as { name: string; description: string };

      expect(name, file).toBe(folder);
      expect(name, file).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(description.length, file).toBeGreaterThan(0);
      expect(description.length, file).toBeLessThanOrEqual(1024);
    }
  });
});

describe('npm package', () => {
  it('runs export kiro-agents from the files npm publishes', { timeout: 120_000 }, async () => {
    const scratch = await scratchDir();
    const packageDir = join(scratch, 'package');
    const published = JSON.parse(run('npm', ['pack', '--dry-run', '--json'], repo)) as {
      files: { path: string }[];
    }[];
    for (const { path } of published[0]?.files ?? []) {
      if (!path.startsWith('dist/')) {
        await mkdir(dirname(join(packageDir, path)), { recursive: true });
        await copyFile(join(repo, path), join(packageDir, path));
      }
    }
    run('npx', ['vp', 'pack', '--out-dir', join(packageDir, 'dist')], repo);
    await symlink(join(repo, 'node_modules'), join(packageDir, 'node_modules'), 'junction');
    const project = join(scratch, 'project');
    await cp(fixtureRoot('repo'), project, { recursive: true });

    const stdout = run(
      process.execPath,
      [join(packageDir, 'dist/cli.mjs'), 'export', 'kiro-agents'],
      project,
    );

    expect(stdout).toBe(
      '.kiro/agents/rulebookguard-rule-author.md\n.kiro/agents/rulebookguard-rule-miner.md\n',
    );
    expect(
      await readFile(join(project, '.kiro/agents/rulebookguard-rule-author.md'), 'utf8'),
    ).toContain('# Writing a business rule (rulebookguard)');
  });
});
