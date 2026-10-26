import { parseArgs, type ParseArgsConfig } from 'node:util';
import { formatIssue, FormatError } from '../format/errors.ts';
import { CliError, EXIT_FAILURE, EXIT_OK, EXIT_USAGE, openCatalog, type CliIo } from './io.ts';
import { lintCommand } from './lint.ts';
import { newCommand } from './new.ts';
import { contextsCommand, forCommand, impactCommand, listCommand, showCommand } from './read.ts';

type ParseArgsOptionsConfig = NonNullable<ParseArgsConfig['options']>;

export const USAGE = `Usage: rulebookguard <command> [options]

Commands:
  contexts [--json]                                  L0: list the contexts
  list [--context <c>] [--status <s>] [--json]       L1: id and summary of each rule
  show <id> [--json]                                 L2: the full rule
  for <path> [--json]                                active rules anchored to a path
  impact <id> [--json]                               files matched by a rule's anchors and tests tagging it
  new <context>                                      scaffold the next free rule id as a proposed rule
  lint [--base <ref>] [--json]                       check the catalog, anchors and test tags;
                                                     --base: rules changed since <ref> need a changed test

Exit codes: 0 success, 1 failure (lint: any error), 2 usage error.
`;

interface CommandSpec {
  usage: string;
  argument?: string;
  options: ParseArgsOptionsConfig;
}

const JSON_OPTION: ParseArgsOptionsConfig = { json: { type: 'boolean' } };

const COMMANDS: Record<string, CommandSpec> = {
  contexts: { usage: 'rulebookguard contexts [--json]', options: JSON_OPTION },
  list: {
    usage: 'rulebookguard list [--context <c>] [--status <s>] [--json]',
    options: { ...JSON_OPTION, context: { type: 'string' }, status: { type: 'string' } },
  },
  show: { usage: 'rulebookguard show <id> [--json]', argument: 'id', options: JSON_OPTION },
  for: { usage: 'rulebookguard for <path> [--json]', argument: 'path', options: JSON_OPTION },
  impact: { usage: 'rulebookguard impact <id> [--json]', argument: 'id', options: JSON_OPTION },
  new: { usage: 'rulebookguard new <context>', argument: 'context', options: {} },
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
      io.stderr(`${error.issues.map(formatIssue).join('\n')}\n`);
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
  const catalog = await openCatalog(io, name !== 'lint');
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
      showCommand(catalog, io, argument, json);
      break;
    case 'for':
      forCommand(catalog, io, argument, json);
      break;
    case 'impact':
      await impactCommand(catalog, io, argument, json);
      break;
    case 'new':
      await newCommand(catalog, io, argument);
      break;
    case 'lint':
      return lintCommand(catalog, io, { base: values.base as string | undefined, json });
  }
  return EXIT_OK;
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
