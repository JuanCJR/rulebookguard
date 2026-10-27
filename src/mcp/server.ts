import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import pkg from '../../package.json' with { type: 'json' };
import { runCli } from '../commands/run.ts';

// Each tool answers exactly what the matching `--json` command prints, so the CLI stays the only source of shapes and messages.
export function createRulesServer(projectDir: string): McpServer {
  const server = new McpServer({ name: 'rulebookguard', version: pkg.version });

  server.registerTool(
    'rules_for',
    {
      description:
        'Active business rules anchored to a file (id, context, summary, rule file). Call it before changing a file; the rules are the source of truth for its behavior.',
      inputSchema: z.object({
        path: z.string().describe('File path, absolute or relative to the project directory'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ path }) => cli(projectDir, ['for', path, '--json']),
  );

  server.registerTool(
    'rules_show',
    {
      description:
        'Full text of one business rule: summary, anchors, entities, supersedes and the rule body with its examples.',
      inputSchema: z.object({ id: z.string().describe('Rule id, for example R-CLI-001') }),
      annotations: { readOnlyHint: true },
    },
    ({ id }) => cli(projectDir, ['show', id, '--json']),
  );

  return server;
}

async function cli(cwd: string, args: string[]) {
  let stdout = '';
  let stderr = '';
  const status = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  if (status === 0) {
    return { content: [{ type: 'text' as const, text: stdout }] };
  }
  return { content: [{ type: 'text' as const, text: stderr.trim() }], isError: true };
}
