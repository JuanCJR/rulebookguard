import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vite-plus/test';
import { USAGE } from '../src/commands/run.ts';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const repoFixture = fileURLToPath(new URL('fixtures/repo', import.meta.url));

// Node without type stripping cannot run src/cli.ts; process.features.typescript
// is false (not absent) when stripping is disabled, so check its value.
const cannotRunTypeScript = !(process.features as { typescript?: unknown }).typescript;

function cli(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

describe('rulebookguard cli', () => {
  it.skipIf(cannotRunTypeScript)('prints usage and exits 0', () => {
    const result = cli([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: rulebookguard <command>');
    expect(result.stderr).toBe('');
  });

  it.skipIf(cannotRunTypeScript)('prints a domain error on stderr and exits 1', () => {
    const result = cli(['show', 'R-NOPE-001'], repoFixture);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.\n',
    );
  });

  it.skipIf(cannotRunTypeScript)('prints a usage error on stderr and exits 2', () => {
    const result = cli(['bogus'], repoFixture);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Unknown command "bogus".\n${USAGE}`);
  });

  it.skipIf(cannotRunTypeScript)('hook reads the event from stdin', () => {
    const file = join(repoFixture, 'src/billing/invoice.go');
    const result = spawnSync(process.execPath, [cliPath, 'hook'], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: file },
      }),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain(
      '## R-BIL-001 (billing)',
    );
  });

  it.skipIf(cannotRunTypeScript)('mcp serves the tools over stdio', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cliPath, 'mcp', '--project', repoFixture],
      }),
    );
    try {
      const result = await client.callTool({ name: 'rules_show', arguments: { id: 'R-BIL-001' } });
      expect(JSON.parse((result.content as { text: string }[])[0]?.text ?? '').rule.id).toBe(
        'R-BIL-001',
      );
    } finally {
      await client.close();
    }
  });
});
