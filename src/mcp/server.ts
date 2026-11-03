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

  server.registerTool(
    'contexts',
    {
      description:
        'L0 map of the rulebook: each context with its prefix, summary and number of rules. Start here to find the contexts a change touches.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () => cli(projectDir, ['contexts', '--json']),
  );

  server.registerTool(
    'rules_list',
    {
      description:
        'L1 list of rules: id, context, status and summary, optionally narrowed to one context and one status. Read the full text of the relevant ones with rules_show.',
      inputSchema: z.object({
        context: z.string().optional().describe('Context name, for example clients'),
        status: z.enum(['proposed', 'active', 'deprecated']).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ context, status }) =>
      cli(projectDir, [
        'list',
        ...(context === undefined ? [] : ['--context', context]),
        ...(status === undefined ? [] : ['--status', status]),
        '--json',
      ]),
  );

  server.registerTool(
    'rules_search',
    {
      description:
        'Rules in any status whose id, summary, entities or text hold every word of the text, ignoring case (plain text search, no embeddings). Use it to find existing rules before proposing a new one.',
      inputSchema: z.object({
        text: z.string().describe('Words to look for, for example "invoice number"'),
        context: z.string().optional().describe('Context name to search in'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ text, context }) =>
      cli(projectDir, [
        'search',
        text,
        ...(context === undefined ? [] : ['--context', context]),
        '--json',
      ]),
  );

  server.registerTool(
    'lint',
    {
      description:
        'Checks the whole rulebook (schema, anchors, test tags, relations between rules) and answers the findings with a hint each; with base, rules changed since that git ref also need a changed test. Findings are data: the tool fails only when lint cannot run.',
      inputSchema: z.object({
        base: z.string().optional().describe('Git ref to compare with, for example origin/main'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ base }) =>
      cli(projectDir, ['lint', ...(base === undefined ? [] : ['--base', base]), '--json'], {
        findingsAreData: true,
      }),
  );

  return server;
}

// lint exits 1 when it finds errors but still prints its JSON report; only an empty stdout means it could not run.
async function cli(cwd: string, args: string[], { findingsAreData = false } = {}) {
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
  if (status === 0 || (findingsAreData && stdout !== '')) {
    return { content: [{ type: 'text' as const, text: stdout }] };
  }
  return { content: [{ type: 'text' as const, text: stderr.trim() }], isError: true };
}
