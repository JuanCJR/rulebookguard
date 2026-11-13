import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vite-plus/test';
import { createRulesServer } from '../../src/mcp/server.ts';
import { runCli, fixtureRoot } from '../cli/run.ts';
import { scratchDir } from '../scratch.ts';

async function connect(
  projectDir: string,
  { roots, clientRoots = true }: { roots?: string[]; clientRoots?: boolean } = {},
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createRulesServer(projectDir, { clientRoots }).connect(serverTransport);
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    roots === undefined ? {} : { capabilities: { roots: {} } },
  );
  if (roots !== undefined) {
    client.setRequestHandler('roots/list', () => ({
      roots: roots.map((dir) => ({ uri: pathToFileURL(dir).href })),
    }));
  }
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
  it('identifies itself with the package version and lists its tools', async () => {
    const client = await connect(repo);
    const { version } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(client.getServerVersion()).toMatchObject({ name: 'rulebookguard', version });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'rules_for',
      'rules_show',
      'contexts',
      'rules_list',
      'rules_search',
      'lint',
    ]);
    expect(tools.map((tool) => Object.keys(tool.inputSchema.properties ?? {}))).toEqual([
      ['path'],
      ['id'],
      [],
      ['context', 'status'],
      ['text', 'context'],
      ['base'],
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

  it('contexts, rules_list and rules_search answer what their --json commands answer', async () => {
    const client = await connect(repo);
    const calls: [string, Record<string, string>, string[]][] = [
      ['contexts', {}, ['contexts']],
      ['rules_list', {}, ['list']],
      [
        'rules_list',
        { context: 'clients', status: 'active' },
        ['list', '--context', 'clients', '--status', 'active'],
      ],
      ['rules_search', { text: 'invoice' }, ['search', 'invoice']],
      [
        'rules_search',
        { text: 'client', context: 'billing' },
        ['search', 'client', '--context', 'billing'],
      ],
    ];

    for (const [name, args, cli] of calls) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBeFalsy();
      expect(text(result)).toBe((await runCli([...cli, '--json'], repo)).stdout);
    }
  });

  it('lint answers the lint JSON as data even when lint finds errors', async () => {
    const client = await connect(repo);
    const expected = await runCli(['lint', '--json'], repo);
    expect(expected.status).toBe(1);

    const result = await client.callTool({ name: 'lint', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe(expected.stdout);
  });

  // @rule R-AGT-002
  it('reports a lint that cannot run as a tool error with the CLI message', async () => {
    const project = await scratchDir();
    const client = await connect(project);

    const result = await client.callTool({ name: 'lint', arguments: { base: 'main' } });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      `rulebookguard.config.yaml not found in ${project} or any parent directory.`,
    );
  });
  // @endrule R-AGT-002

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

  // @rule R-AGT-003
  it('runs in the first client root that has a rulebook when the start directory has none', async () => {
    const start = await scratchDir();
    const other = await scratchDir();
    const client = await connect(start, { roots: [other, repo] });

    const contexts = await client.callTool({ name: 'contexts', arguments: {} });
    const rules = await client.callTool({
      name: 'rules_for',
      arguments: { path: 'src/clients/create.go' },
    });

    expect(contexts.isError).toBeFalsy();
    expect(text(contexts)).toBe((await runCli(['contexts', '--json'], repo)).stdout);
    expect(text(rules)).toBe(
      (await runCli(['for', 'src/clients/create.go', '--json'], repo)).stdout,
    );
  });
  // @endrule R-AGT-003

  // @rule R-AGT-003
  it('keeps the start directory when it has a rulebook, whatever the client roots', async () => {
    const client = await connect(repo, { roots: [fixtureRoot('lint')] });

    const result = await client.callTool({ name: 'contexts', arguments: {} });

    expect(text(result)).toBe((await runCli(['contexts', '--json'], repo)).stdout);
  });
  // @endrule R-AGT-003

  // @rule R-AGT-003
  it('ignores the client roots with an explicit project', async () => {
    const project = await scratchDir();
    const client = await connect(project, { roots: [repo], clientRoots: false });

    const result = await client.callTool({ name: 'contexts', arguments: {} });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      `rulebookguard.config.yaml not found in ${project} or any parent directory.`,
    );
  });
  // @endrule R-AGT-003

  // @rule R-AGT-003
  it('answers the start directory error when no client root has a rulebook', async () => {
    const start = await scratchDir();
    const client = await connect(start, { roots: [await scratchDir()] });

    const result = await client.callTool({ name: 'contexts', arguments: {} });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      `rulebookguard.config.yaml not found in ${start} or any parent directory.`,
    );
  });
  // @endrule R-AGT-003
});
