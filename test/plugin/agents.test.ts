import { access, readFile, readdir, stat } from 'node:fs/promises';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vite-plus/test';
import { splitFrontmatter } from '../../src/format/frontmatter.ts';
import { createRulesServer } from '../../src/mcp/server.ts';
import { fixtureRoot } from '../cli/run.ts';

const pluginDir = new URL('../../plugin/', import.meta.url);
const MCP_PREFIX = 'mcp__plugin_rulebookguard_rulebookguard__';
const BUILTIN_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write']);

async function serverTools(): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createRulesServer(fixtureRoot('repo')).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return (await client.listTools()).tools.map((tool) => tool.name);
}

async function agents(): Promise<{ file: string; data: Record<string, unknown>; body: string }[]> {
  const dir = new URL('agents/', pluginDir);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
  return Promise.all(
    files.map(async (file) => {
      const { data, body } = splitFrontmatter(await readFile(new URL(file, dir), 'utf8'), file);
      return { file, data: data as Record<string, unknown>, body };
    }),
  );
}

function list(value: unknown): string[] {
  return typeof value === 'string'
    ? value.split(',').map((item) => item.trim())
    : (value as string[]);
}

describe('plugin agents', () => {
  it('ships rule-miner', async () => {
    expect((await agents()).map((agent) => agent.data.name)).toContain('rule-miner');
  });

  it('gives every agent a name, a description and a body', async () => {
    for (const { file, data, body } of await agents()) {
      expect(data.name, file).toBe(file.replace(/\.md$/, ''));
      expect(typeof data.description, file).toBe('string');
      expect(body.trim().length, file).toBeGreaterThan(0);
    }
  });

  it('names only tools that exist: built-in tools or tools of the rulebookguard MCP server', async () => {
    const mcp = new Set(await serverTools());
    for (const { file, data } of await agents()) {
      for (const tool of list(data.tools)) {
        if (tool.startsWith(MCP_PREFIX)) {
          expect(mcp.has(tool.slice(MCP_PREFIX.length)), `${file}: ${tool}`).toBe(true);
        } else {
          expect(BUILTIN_TOOLS.has(tool), `${file}: ${tool}`).toBe(true);
        }
      }
    }
  });

  it('preloads only skills the plugin ships', async () => {
    for (const { file, data } of await agents()) {
      for (const skill of list(data.skills ?? [])) {
        const [plugin, name] = skill.split(':');
        expect(plugin, `${file}: ${skill}`).toBe('rulebookguard');
        await expect(
          access(new URL(`skills/${name}/SKILL.md`, pluginDir)),
        ).resolves.toBeUndefined();
      }
    }
  });

  it('ships the launcher as an executable, so bin/ on PATH can run it', async () => {
    const { mode } = await stat(new URL('bin/rulebookguard.mjs', pluginDir));
    expect(mode & 0o111).not.toBe(0);
  });
});
