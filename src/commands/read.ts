import { isAbsolute, relative, resolve } from 'node:path';
import { rulesForPath } from '../catalog/anchors.ts';
import { expandGlobs, toRepoPath } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import {
  scanImplementations,
  scanTestTags,
  type TagLocation,
  type TagRegion,
} from '../catalog/tags.ts';
import type { RuleDoc, RuleOrigin, RuleStatus } from '../format/types.ts';
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
import { changedFiles } from './lint.ts';

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
    dependsOn: string[];
    conflictsWith: string[];
    origin: RuleOrigin | null;
    evidence: string[];
    implementations: TagRegion[];
    file: string;
    body: string;
  };
}

export interface ForJson {
  path: string;
  rules: (RuleSummaryJson & { file: string; regions: LineSpanJson[] })[];
}

export interface ForChangedJson {
  base: string;
  files: string[];
  rules: (RuleSummaryJson & { file: string; files: string[] })[];
}

export interface LineSpanJson {
  line: number;
  endLine: number;
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

export function searchCommand(
  catalog: Catalog,
  io: CliIo,
  query: string,
  options: { context?: string | undefined; json: boolean },
): void {
  const { context } = options;
  const text = messages(catalog.config.language);
  if (context !== undefined && !catalog.contexts.some((item) => item.context === context)) {
    throw new CliError(text.unknownContext(context));
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rules = sortById(catalog.rules)
    .filter((rule) => context === undefined || rule.context === context)
    .filter((rule) => {
      const haystack = [rule.id, rule.summary, ...rule.entities, rule.body]
        .join('\n')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map(toSummary);
  if (options.json) {
    writeJson(io, { rules } satisfies ListJson);
    return;
  }
  writeLines(
    io,
    rules.length === 0
      ? [text.noRules]
      : rules.map((rule) => `${rule.id} [${rule.status}] ${rule.summary}`),
  );
}

export async function showCommand(
  catalog: Catalog,
  io: CliIo,
  id: string,
  json: boolean,
): Promise<void> {
  const rule = findRule(catalog, id);
  const files = await expandGlobs(
    catalog.root,
    rule.anchors,
    gitFallbackWarning(io, catalog.config.language),
  );
  const implementations =
    (await scanImplementations(catalog.root, files)).regions.get(rule.id) ?? [];
  if (json) {
    writeJson(io, {
      rule: {
        ...toSummary(rule),
        entities: rule.entities,
        anchors: rule.anchors,
        supersedes: rule.supersedes ?? null,
        dependsOn: rule.dependsOn ?? [],
        conflictsWith: rule.conflictsWith ?? [],
        origin: rule.origin ?? null,
        evidence: rule.evidence ?? [],
        implementations,
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
    ...(rule.dependsOn?.length ? [`dependsOn: ${rule.dependsOn.join(', ')}`] : []),
    ...(rule.conflictsWith?.length ? [`conflictsWith: ${rule.conflictsWith.join(', ')}`] : []),
    ...(rule.origin === undefined ? [] : [`origin: ${rule.origin}`]),
    ...(rule.evidence?.length ? ['evidence:', ...indent(rule.evidence, none)] : []),
    ...(implementations.length
      ? [
          'implementations:',
          ...indent(
            implementations.map((region) => `${region.file}:${region.line}-${region.endLine}`),
            none,
          ),
        ]
      : []),
    `file: ${rule.file}`,
  ];
  io.stdout(`${header.join('\n')}\n\n${rule.body}`);
}

export async function forCommand(
  catalog: Catalog,
  io: CliIo,
  input: string,
  json: boolean,
): Promise<void> {
  const text = messages(catalog.config.language);
  const path = toRootPath(catalog, resolve(io.cwd, input), input);
  const regions = await regionsIn(catalog.root, path);
  const rules = rulesForPath(catalog.rules, path)
    .filter((rule) => rule.status === 'active')
    .map((rule) => ({ ...toSummary(rule), file: rule.file, regions: regions(rule.id) }));
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
    rules.map(
      (rule) =>
        `${rule.id} (${rule.context}): ${rule.summary}${rule.regions.length === 0 ? '' : ` (${text.lines(formatSpans(rule.regions))})`}`,
    ),
  );
}

export async function forChangedCommand(
  catalog: Catalog,
  io: CliIo,
  base: string,
  json: boolean,
): Promise<void> {
  const text = messages(catalog.config.language);
  const { files } = await changedFiles(catalog.root, base, text, 'for --changed');
  const touched = new Map<string, string[]>();
  for (const file of files) {
    for (const rule of rulesForPath(catalog.rules, file)) {
      touched.set(rule.id, [...(touched.get(rule.id) ?? []), file]);
    }
  }
  const rules = sortById(catalog.rules.filter((rule) => rule.status === 'active')).flatMap(
    (rule) => {
      const ruleFiles = touched.get(rule.id);
      return ruleFiles === undefined
        ? []
        : [{ ...toSummary(rule), file: rule.file, files: ruleFiles }];
    },
  );
  if (json) {
    writeJson(io, { base, files, rules } satisfies ForChangedJson);
    return;
  }
  if (rules.length === 0) {
    writeLines(io, [text.noActiveRulesForChanged(base)]);
    return;
  }
  writeLines(
    io,
    rules.flatMap((rule) => [
      `${rule.id} (${rule.context}): ${rule.summary}`,
      ...indent(rule.files, text.none),
    ]),
  );
}

export async function regionsIn(
  root: string,
  path: string,
): Promise<(id: string) => LineSpanJson[]> {
  const found = (await scanImplementations(root, [path])).regions;
  return (id) => (found.get(id) ?? []).map(({ line, endLine }) => ({ line, endLine }));
}

export function formatSpans(spans: LineSpanJson[]): string {
  return spans.map(({ line, endLine }) => `${line}-${endLine}`).join(', ');
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
