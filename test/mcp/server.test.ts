import { readFile } from 'node:fs/promises';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vite-plus/test';
import { createRulesServer } from '../../src/mcp/server.ts';
import { runCli, fixtureRoot } from '../cli/run.ts';
import { scratchDir } from '../scratch.ts';

async function connect(projectDir: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createRulesServer(projectDir).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  return content[0]?.text ?? '';
}

const repo = fixtureRoot('repo');

describe('mcp server', () => {
  it('identifies itself with the package version and lists the two tools', async () => {
    const client = await connect(repo);
    const { version } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(client.getServerVersion()).toMatchObject({ name: 'rulebookguard', version });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['rules_for', 'rules_show']);
    expect(tools.map((tool) => Object.keys(tool.inputSchema.properties ?? {}))).toEqual([
      ['path'],
      ['id'],
    ]);
  });

  it('rules_for answers what for --json answers', async () => {
    const client = await connect(repo);

    const result = await client.callTool({
      name: 'rules_for',
      arguments: { path: 'src/clients/create.go' },
    });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe(
      (await runCli(['for', 'src/clients/create.go', '--json'], repo)).stdout,
    );
  });

  it('rules_show answers what show --json answers', async () => {
    const client = await connect(repo);

    const result = await client.callTool({ name: 'rules_show', arguments: { id: 'R-CLI-001' } });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe((await runCli(['show', 'R-CLI-001', '--json'], repo)).stdout);
  });

  // @rule R-AGT-002
  it('reports an unknown rule as a tool error with the CLI message', async () => {
    const client = await connect(repo);

    const result = await client.callTool({ name: 'rules_show', arguments: { id: 'R-NOPE-001' } });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      'Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.',
    );
  });
  // @endrule R-AGT-002

  // @rule R-AGT-002
  it('reports a project without a rulebook as a tool error', async () => {
    const project = await scratchDir();
    const client = await connect(project);

    const result = await client.callTool({ name: 'rules_for', arguments: { path: 'a.go' } });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      `rulebookguard.config.yaml not found in ${project} or any parent directory.`,
    );
  });
  // @endrule R-AGT-002
});
