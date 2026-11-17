import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import pkg from '../../package.json' with { type: 'json' };
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverInstructions } from '../agents/protocol.ts';
import { findRulebookRoot } from '../catalog/load.ts';
import { CONFIG_FILE_NAME } from '../format/config.ts';
import { runCli } from '../commands/run.ts';

export interface RulesServerOptions {
  /** Look for the rulebook in the client roots when projectDir has none; off for an explicit --project. */
  clientRoots?: boolean;
}

const MISSING_RULEBOOK_HINT =
  'If the server runs outside the project, call the tool again with project set to the absolute path of the workspace folder.';

// @implements R-AGT-004
// Clients such as Kiro start a power's server in the power's own folder and offer no roots, so
// every tool also takes the workspace folder.
const project = z
  .string()
  .optional()
  .describe(
    'Absolute path of the workspace folder that holds rulebookguard.config.yaml. Pass it when the server may run outside the project, as in Kiro powers.',
  );
// @endimplements R-AGT-004

interface Location {
  cwd: string;
  /** The rulebook was searched for in the start directory only, so the agent may pass project. */
  hint: boolean;
}

// Each tool answers exactly what the matching `--json` command prints, so the CLI stays the only source of shapes and messages.
export function createRulesServer(
  projectDir: string,
  { clientRoots = true }: RulesServerOptions = {},
): McpServer {
  // @implements R-AGT-006
  const server = new McpServer(
    { name: 'rulebookguard', version: pkg.version },
    { instructions: serverInstructions() },
  );
  // @endimplements R-AGT-006
  const directory = (call: { project?: string | undefined; path?: string } = {}) =>
    locate(server, projectDir, clientRoots, call);

  server.registerTool(
    'rules_for',
    {
      description:
        'Active business rules anchored to a file (id, context, summary, rule file, and the lines of the file each rule names through @implements regions or evidence). Call it before changing a file; the rules are the source of truth for its behavior.',
      inputSchema: z.object({
        path: z.string().describe('File path, absolute or relative to the project directory'),
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ path, project }) => cli(directory({ project, path }), ['for', path, '--json']),
  );

  server.registerTool(
    'rules_show',
    {
      description:
        'Full text of one business rule: summary, anchors, entities, supersedes, evidence with the lines each entry resolves to, and the rule body with its examples.',
      inputSchema: z.object({
        id: z.string().describe('Rule id, for example R-CLI-001'),
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ id, project }) => cli(directory({ project }), ['show', id, '--json']),
  );

  server.registerTool(
    'contexts',
    {
      description:
        'L0 map of the rulebook: each context with its prefix, summary and number of rules. Start here to find the contexts a change touches.',
      inputSchema: z.object({ project }),
      annotations: { readOnlyHint: true },
    },
    ({ project }) => cli(directory({ project }), ['contexts', '--json']),
  );

  server.registerTool(
    'rules_list',
    {
      description:
        'L1 list of rules: id, context, status and summary, optionally narrowed to one context and one status. Read the full text of the relevant ones with rules_show.',
      inputSchema: z.object({
        context: z.string().optional().describe('Context name, for example clients'),
        status: z.enum(['proposed', 'active', 'deprecated']).optional(),
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ context, status, project }) =>
      cli(directory({ project }), [
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
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ text, context, project }) =>
      cli(directory({ project }), [
        'search',
        text,
        ...(context === undefined ? [] : ['--context', context]),
        '--json',
      ]),
  );

  // @implements R-AGT-007
  server.registerTool(
    'rules_affected',
    {
      description:
        'The rules a change touches, in one call: the active rules anchored to each file, the rules in any status that hold every word of each text, and the contexts of all of them. An empty list means none, and the agent must say so. Pass at least one path or one search text.',
      inputSchema: z.object({
        paths: z
          .array(z.string())
          .optional()
          .describe('Files the change touches, absolute or relative to the project directory'),
        searches: z
          .array(z.string())
          .optional()
          .describe('Key words of the change, one text per entry, for example "invoice number"'),
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ paths = [], searches = [], project }) =>
      cli(directory({ project }), [
        'affected',
        ...paths.flatMap((path) => ['--path', path]),
        ...searches.flatMap((search) => ['--search', search]),
        '--json',
      ]),
  );
  // @endimplements R-AGT-007

  server.registerTool(
    'lint',
    {
      description:
        'Checks the whole rulebook (schema, anchors, test tags, relations between rules) and answers the findings with a hint each; with base, rules changed since that git ref also need a changed test. Findings are data: the tool fails only when lint cannot run.',
      inputSchema: z.object({
        base: z.string().optional().describe('Git ref to compare with, for example origin/main'),
        project,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ base, project }) =>
      cli(
        directory({ project }),
        ['lint', ...(base === undefined ? [] : ['--base', base]), '--json'],
        {
          findingsAreData: true,
        },
      ),
  );

  return server;
}

// The project of the call wins; then the start directory, an absolute rules_for path and, without
// an explicit --project, the client roots.
async function locate(
  server: McpServer,
  projectDir: string,
  clientRoots: boolean,
  call: { project?: string | undefined; path?: string },
): Promise<Location> {
  // @implements R-AGT-004
  if (call.project !== undefined) {
    return { cwd: resolve(projectDir, call.project), hint: false };
  }
  // @endimplements R-AGT-004
  if (!clientRoots || (await findRulebookRoot(projectDir)) !== undefined) {
    return { cwd: projectDir, hint: false };
  }
  // @implements R-AGT-004
  if (call.path !== undefined && isAbsolute(call.path)) {
    const root = await findRulebookRoot(dirname(call.path));
    if (root !== undefined) {
      return { cwd: root, hint: false };
    }
  }
  // @endimplements R-AGT-004
  const root = await rootWithRulebook(server);
  return root === undefined ? { cwd: projectDir, hint: true } : { cwd: root, hint: false };
}

// @implements R-AGT-003
// Some clients start servers in their own install directory; their roots still name the workspace.
async function rootWithRulebook(server: McpServer): Promise<string | undefined> {
  if (server.server.getClientCapabilities()?.roots === undefined) {
    return undefined;
  }
  let roots: { uri: string }[];
  try {
    ({ roots } = await server.server.listRoots());
  } catch {
    return undefined;
  }
  for (const { uri } of roots) {
    if (!uri.startsWith('file:')) {
      continue;
    }
    const root = fileURLToPath(uri);
    if ((await findRulebookRoot(root)) !== undefined) {
      return root;
    }
  }
  return undefined;
}
// @endimplements R-AGT-003

// lint exits 1 when it finds errors but still prints its JSON report; only an empty stdout means it could not run.
async function cli(location: Promise<Location>, args: string[], { findingsAreData = false } = {}) {
  const { cwd, hint } = await location;
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
  const message = stderr.trim();
  // @implements R-AGT-004
  const text =
    hint && message.startsWith(`No ${CONFIG_FILE_NAME} in `)
      ? `${message}\n${MISSING_RULEBOOK_HINT}`
      : message;
  // @endimplements R-AGT-004
  return { content: [{ type: 'text' as const, text }], isError: true };
}
