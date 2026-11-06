import { parseArgs, type ParseArgsConfig } from 'node:util';
import { formatIssue, FormatError } from '../format/errors.ts';
import type { RuleLanguage } from '../format/types.ts';
import { CliError, EXIT_FAILURE, EXIT_OK, EXIT_USAGE, openCatalog, type CliIo } from './io.ts';
import { EXPORT_USAGE, exportCommand } from './export.ts';
import { hookCommand } from './hook.ts';
import { initCommand } from './init.ts';
import { lintCommand } from './lint.ts';
import { mcpCommand } from './mcp.ts';
import { newCommand } from './new.ts';
import {
  contextsCommand,
  forCommand,
  impactCommand,
  listCommand,
  searchCommand,
  showCommand,
} from './read.ts';

type ParseArgsOptionsConfig = NonNullable<ParseArgsConfig['options']>;

export const USAGE = `Usage: rulebookguard <command> [options]

Commands:
  init <context> [--prefix <P>] [--language <en|es>] [--ci]
                                                     create rulebookguard.config.yaml and a first context in
                                                     the current directory; --language: language of generated
                                                     text (default: en), --ci: also a GitHub Actions workflow
                                                     that runs lint --base on pull requests
  contexts [--json]                                  L0: list the contexts
  list [--context <c>] [--status <s>] [--json]       L1: id and summary of each rule
  show <id> [--json]                                 L2: the full rule
  search <text> [--context <c>] [--json]             rules whose id, summary, entities or text hold every
                                                     word of <text>, ignoring case
  for <path> [--json]                                active rules anchored to a path
  impact <id> [--json]                               files matched by a rule's anchors and tests tagging it
  new <context> [--prefix <P>]                       scaffold the next free rule id as a proposed rule;
                                                     creates the context first when it does not exist,
                                                     --prefix: its id prefix (default: first 3 letters)
  lint [--base <ref>] [--json]                       check the catalog, anchors and test tags;
                                                     --base: rules changed since <ref> need a changed test
  export gherkin [--out <dir>]                       write the Gherkin blocks of each non-deprecated rule as
                                                     <out>/<context>/<id>.feature tagged @<id>;
                                                     --out: output directory (default: features/rules)
  export cursor|copilot|kiro [--out <dir>]           write each active rule as a rule file of the tool, scoped
                                                     to its anchors, in .cursor/rules, .github/instructions
                                                     or .kiro/steering, and remove those of rules no longer
                                                     active; --out: output directory
  export agents-md [--out <dir>]                     keep an index of the active rules in a marked block of
                                                     AGENTS.md; --out: its directory (default: rulebook root)
  hook                                               Claude Code hook for PreToolUse and PostToolUse: reads
                                                     the event on stdin and prints the rules anchored to
                                                     the file of the tool (Read, Edit, Write...)
  mcp [--project <dir>]                              MCP server over stdio with rules_for, rules_show, contexts,
                                                     rules_list, rules_search and lint;
                                                     --project: directory to find the rulebook from (default: cwd)
  site:generate [--out <dir>] [--base <path>]        build the read-only static site of the rulebook (alias: site);
                                                     --out: output directory (default: site), --base: URL path
  site:run [--out <dir>] [--base <path>] [--port <n>]
                                                     build the site, then serve it on 127.0.0.1 until Ctrl+C;
                                                     --port: port to serve on (default: 4321)
                                                     site commands need @rulebookguard/site installed

Exit codes: 0 success, 1 failure (lint: any error), 2 usage error.
`;

interface CommandSpec {
  usage: string;
  argument?: string;
  options: ParseArgsOptionsConfig;
}

const JSON_OPTION: ParseArgsOptionsConfig = { json: { type: 'boolean' } };

const SITE_OPTIONS: ParseArgsOptionsConfig = { out: { type: 'string' }, base: { type: 'string' } };

const COMMANDS: Record<string, CommandSpec> = {
  init: {
    usage: 'rulebookguard init <context> [--prefix <P>] [--language <en|es>] [--ci]',
    argument: 'context',
    options: { prefix: { type: 'string' }, language: { type: 'string' }, ci: { type: 'boolean' } },
  },
  contexts: { usage: 'rulebookguard contexts [--json]', options: JSON_OPTION },
  list: {
    usage: 'rulebookguard list [--context <c>] [--status <s>] [--json]',
    options: { ...JSON_OPTION, context: { type: 'string' }, status: { type: 'string' } },
  },
  show: { usage: 'rulebookguard show <id> [--json]', argument: 'id', options: JSON_OPTION },
  search: {
    usage: 'rulebookguard search <text> [--context <c>] [--json]',
    argument: 'text',
    options: { ...JSON_OPTION, context: { type: 'string' } },
  },
  for: { usage: 'rulebookguard for <path> [--json]', argument: 'path', options: JSON_OPTION },
  impact: { usage: 'rulebookguard impact <id> [--json]', argument: 'id', options: JSON_OPTION },
  new: {
    usage: 'rulebookguard new <context> [--prefix <P>]',
    argument: 'context',
    options: { prefix: { type: 'string' } },
  },
  export: { usage: EXPORT_USAGE, argument: 'format', options: { out: { type: 'string' } } },
  hook: { usage: 'rulebookguard hook', options: {} },
  mcp: { usage: 'rulebookguard mcp [--project <dir>]', options: { project: { type: 'string' } } },
  site: {
    usage: 'rulebookguard site [--out <dir>] [--base <path>]',
    options: SITE_OPTIONS,
  },
  'site:generate': {
    usage: 'rulebookguard site:generate [--out <dir>] [--base <path>]',
    options: SITE_OPTIONS,
  },
  'site:run': {
    usage: 'rulebookguard site:run [--out <dir>] [--base <path>] [--port <n>]',
    options: { ...SITE_OPTIONS, port: { type: 'string' } },
  },
  lint: {
    usage: 'rulebookguard lint [--base <ref>] [--json]',
    options: { ...JSON_OPTION, base: { type: 'string' } },
  },
};

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`${error.message}\n`);
      return error.exitCode;
    }
    if (error instanceof FormatError) {
      io.stderr(`${error.issues.map((issue) => formatIssue(issue)).join('\n')}\n`);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

async function dispatch(argv: string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === '--help' || name === '-h' || name === 'help') {
    io.stdout(USAGE);
    return EXIT_OK;
  }
  const spec = COMMANDS[name];
  if (spec === undefined) {
    throw new CliError(`Unknown command "${name}".\n${USAGE.trimEnd()}`, EXIT_USAGE);
  }
  const { values, argument } = parse(spec, rest);
  const json = values.json === true;
  if (name === 'hook') {
    await hookCommand(io);
    return EXIT_OK;
  }
  if (name === 'mcp') {
    await mcpCommand(io, values.project as string | undefined);
    return EXIT_OK;
  }
  if (name === 'site' || name === 'site:generate' || name === 'site:run') {
    const { siteCommand } = await import('./site.ts');
    await siteCommand(io, {
      out: values.out as string | undefined,
      base: values.base as string | undefined,
      serve: name === 'site:run',
      port: sitePort(values.port as string | undefined, spec.usage),
    });
    return EXIT_OK;
  }
  if (name === 'init') {
    await initCommand(io, argument, {
      prefix: values.prefix as string | undefined,
      language: initLanguage(values.language as string | undefined, spec.usage),
      ci: values.ci === true,
    });
    return EXIT_OK;
  }
  if (name === 'lint') {
    return lintCommand(io, { base: values.base as string | undefined, json });
  }
  if (name === 'search' && argument.trim() === '') {
    throw new CliError(`Search text is empty. Usage: ${spec.usage}`, EXIT_USAGE);
  }
  const catalog = await openCatalog(io);
  switch (name) {
    case 'contexts':
      contextsCommand(catalog, io, json);
      break;
    case 'list':
      listCommand(catalog, io, {
        context: values.context as string | undefined,
        status: values.status as string | undefined,
        json,
      });
      break;
    case 'show':
      await showCommand(catalog, io, argument, json);
      break;
    case 'search':
      searchCommand(catalog, io, argument, {
        context: values.context as string | undefined,
        json,
      });
      break;
    case 'for':
      await forCommand(catalog, io, argument, json);
      break;
    case 'impact':
      await impactCommand(catalog, io, argument, json);
      break;
    case 'new':
      await newCommand(catalog, io, argument, values.prefix as string | undefined);
      break;
    case 'export':
      await exportCommand(catalog, io, argument, values.out as string | undefined);
      break;
  }
  return EXIT_OK;
}

function initLanguage(value: string | undefined, usage: string): RuleLanguage | undefined {
  if (value === undefined || value === 'en' || value === 'es') {
    return value;
  }
  throw new CliError(`--language must be en or es.\nUsage: ${usage}`, EXIT_USAGE);
}

function sitePort(value: string | undefined, usage: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) {
    throw new CliError(`--port must be a number from 0 to 65535.\nUsage: ${usage}`, EXIT_USAGE);
  }
  return port;
}

function parse(
  spec: CommandSpec,
  args: string[],
): { values: Record<string, unknown>; argument: string } {
  let parsed: { values: Record<string, unknown>; positionals: string[] };
  try {
    parsed = parseArgs({ args, options: spec.options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError(`${(error as Error).message}\nUsage: ${spec.usage}`, EXIT_USAGE);
  }
  const expected = spec.argument === undefined ? 0 : 1;
  if (parsed.positionals.length < expected) {
    throw new CliError(`Missing argument <${spec.argument}>. Usage: ${spec.usage}`, EXIT_USAGE);
  }
  if (parsed.positionals.length > expected) {
    throw new CliError(
      `Unexpected argument "${parsed.positionals[expected]}". Usage: ${spec.usage}`,
      EXIT_USAGE,
    );
  }
  return { values: parsed.values, argument: parsed.positionals[0] ?? '' };
}
