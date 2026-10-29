import { isAbsolute, relative, resolve } from 'node:path';
import { rulesForPath } from '../catalog/anchors.ts';
import { expandGlobs, toRepoPath } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import { scanTestTags, type TagLocation } from '../catalog/tags.ts';
import type { RuleDoc, RuleStatus } from '../format/types.ts';
import { messages } from '../messages.ts';
import {
  CliError,
  EXIT_USAGE,
  findRule,
  gitFallbackWarning,
  type CliIo,
  writeJson,
  writeLines,
} from './io.ts';

export const RULE_STATUSES: RuleStatus[] = ['proposed', 'active', 'deprecated'];

export interface ContextsJson {
  contexts: { context: string; prefix: string; summary: string; rules: number; file: string }[];
}

export interface RuleSummaryJson {
  id: string;
  context: string;
  status: RuleStatus;
  summary: string;
}

export interface ListJson {
  rules: RuleSummaryJson[];
}

export interface ShowJson {
  rule: RuleSummaryJson & {
    entities: string[];
    anchors: string[];
    supersedes: string | null;
    file: string;
    body: string;
  };
}

export interface ForJson {
  path: string;
  rules: (RuleSummaryJson & { file: string })[];
}

export interface ImpactJson {
  id: string;
  files: string[];
  tests: TagLocation[];
}

export function contextsCommand(catalog: Catalog, io: CliIo, json: boolean): void {
  const contexts = [...catalog.contexts]
    .sort((a, b) => compare(a.context, b.context))
    .map(({ context, prefix, summary, file }) => ({
      context,
      prefix,
      summary,
      rules: catalog.rules.filter((rule) => rule.context === context).length,
      file,
    }));
  if (json) {
    writeJson(io, { contexts } satisfies ContextsJson);
    return;
  }
  if (contexts.length === 0) {
    writeLines(io, [messages(catalog.config.language).noContexts]);
    return;
  }
  writeLines(
    io,
    contexts.map(
      (item) =>
        `${item.context} (${item.prefix}, ${messages(catalog.config.language).ruleCount(item.rules)}): ${item.summary}`,
    ),
  );
}

export function listCommand(
  catalog: Catalog,
  io: CliIo,
  options: { context?: string | undefined; status?: string | undefined; json: boolean },
): void {
  const { context, status } = options;
  const text = messages(catalog.config.language);
  if (status !== undefined && !RULE_STATUSES.includes(status as RuleStatus)) {
    throw new CliError(text.invalidStatus(status, RULE_STATUSES.join(', ')), EXIT_USAGE);
  }
  if (context !== undefined && !catalog.contexts.some((item) => item.context === context)) {
    throw new CliError(text.unknownContext(context));
  }
  const rules = sortById(catalog.rules)
    .filter((rule) => context === undefined || rule.context === context)
    .filter((rule) => status === undefined || rule.status === status)
    .map(toSummary);
  if (options.json) {
    writeJson(io, { rules } satisfies ListJson);
    return;
  }
  if (rules.length === 0) {
    writeLines(io, [text.noRules]);
    return;
  }
  writeLines(
    io,
    rules.map((rule) => `${rule.id} [${rule.status}] ${rule.summary}`),
  );
}

export function showCommand(catalog: Catalog, io: CliIo, id: string, json: boolean): void {
  const rule = findRule(catalog, id);
  if (json) {
    writeJson(io, {
      rule: {
        ...toSummary(rule),
        entities: rule.entities,
        anchors: rule.anchors,
        supersedes: rule.supersedes ?? null,
        file: rule.file,
        body: rule.body,
      },
    } satisfies ShowJson);
    return;
  }
  const none = messages(catalog.config.language).none;
  const header = [
    `${rule.id}: ${rule.summary}`,
    `context: ${rule.context}`,
    `status: ${rule.status}`,
    `entities: ${rule.entities.length === 0 ? none : rule.entities.join(', ')}`,
    'anchors:',
    ...indent(rule.anchors, none),
    ...(rule.supersedes === undefined ? [] : [`supersedes: ${rule.supersedes}`]),
    `file: ${rule.file}`,
  ];
  io.stdout(`${header.join('\n')}\n\n${rule.body}`);
}

export function forCommand(catalog: Catalog, io: CliIo, input: string, json: boolean): void {
  const text = messages(catalog.config.language);
  const path = toRootPath(catalog, resolve(io.cwd, input), input);
  const rules = rulesForPath(catalog.rules, path)
    .filter((rule) => rule.status === 'active')
    .map((rule) => ({ ...toSummary(rule), file: rule.file }));
  if (json) {
    writeJson(io, { path, rules } satisfies ForJson);
    return;
  }
  if (rules.length === 0) {
    writeLines(io, [text.noActiveRulesFor(path)]);
    return;
  }
  writeLines(
    io,
    rules.map((rule) => `${rule.id} (${rule.context}): ${rule.summary}`),
  );
}

export async function impactCommand(
  catalog: Catalog,
  io: CliIo,
  id: string,
  json: boolean,
): Promise<void> {
  const rule = findRule(catalog, id);
  const text = messages(catalog.config.language);
  const warn = gitFallbackWarning(io, catalog.config.language);
  const files = await expandGlobs(catalog.root, rule.anchors, warn);
  const tests = (await scanTestTags(catalog.root, catalog.config.testGlobs, warn)).get(id) ?? [];
  if (json) {
    writeJson(io, { id, files, tests } satisfies ImpactJson);
    return;
  }
  writeLines(io, [
    `${rule.id}: ${rule.summary}`,
    text.filesMatched(files.length),
    ...indent(files, text.none),
    text.testsTagging(rule.id, tests.length),
    ...indent(
      tests.map((test) => `${test.file}:${test.line}`),
      text.none,
    ),
  ]);
}

function toRootPath(catalog: Catalog, absolute: string, input: string): string {
  const path = toRepoPath(relative(catalog.root, absolute));
  if (path === '' || path === '..' || path.startsWith('../') || isAbsolute(path)) {
    throw new CliError(messages(catalog.config.language).outsideRoot(input, catalog.root));
  }
  return path;
}

function toSummary(rule: RuleDoc): RuleSummaryJson {
  return { id: rule.id, context: rule.context, status: rule.status, summary: rule.summary };
}

function indent(lines: string[], none: string): string[] {
  return lines.length === 0 ? [`  ${none}`] : lines.map((line) => `  ${line}`);
}

function sortById(rules: RuleDoc[]): RuleDoc[] {
  return [...rules].sort((a, b) => compare(a.id, b.id));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
