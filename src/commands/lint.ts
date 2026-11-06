import { createGlobMatcher, listRepoFiles, type GitFallbackListener } from '../catalog/files.ts';
import {
  changedLines,
  changedSince,
  gitFailureReason,
  isCommitRef,
  isInsideWorkTree,
  type ChangeSet,
  type LineSpan,
} from '../catalog/git.ts';
import {
  loadCatalog,
  relativeToRoot,
  type Catalog,
  type CatalogIssueCode,
} from '../catalog/load.ts';
import { FormatError } from '../format/errors.ts';
import type { RuleDoc } from '../format/types.ts';
import { messages, type Messages } from '../messages.ts';
import { scanImplementations, scanTestRegions, type TagScan } from '../catalog/tags.ts';
import {
  CliError,
  EXIT_FAILURE,
  EXIT_OK,
  gitFallbackWarning,
  requireRulebookRoot,
  type CliIo,
  writeJson,
  writeLines,
} from './io.ts';

export type LintSeverity = 'error' | 'warning';

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  file: string;
  line?: number;
  message: string;
  /** One line on how to fix the finding. */
  hint: string;
}

export interface LintJson {
  findings: LintFinding[];
  errors: number;
  warnings: number;
}

export interface LintOptions {
  base?: string | undefined;
  json: boolean;
}

export async function lintCommand(io: CliIo, options: LintOptions): Promise<number> {
  const root = await requireRulebookRoot(io);
  let catalog: Catalog;
  try {
    catalog = await loadCatalog(root);
  } catch (error) {
    if (!(error instanceof FormatError)) {
      throw error;
    }
    return report(
      io,
      error.issues.map((issue) =>
        issueFinding(
          'schema',
          { ...issue, file: relativeToRoot(root, issue.file) },
          messages('en'),
        ),
      ),
      options.json,
      messages('en'),
    );
  }
  const text = messages(catalog.config.language);
  const changed =
    options.base === undefined
      ? undefined
      : await changedFiles(catalog.root, options.base, text, 'lint --base');
  const warn = gitFallbackWarning(io, catalog.config.language);
  const scan = await scanTestRegions(catalog.root, catalog.config.testGlobs, warn);
  const findings = await lintCatalog(catalog, scan, warn);
  if (options.base !== undefined && changed !== undefined) {
    const lines = await testLineChanges(catalog, scan, options.base, changed, text);
    findings.push(...pendingImplementation(catalog, scan, options.base, changed.files, lines));
  }
  return report(io, findings, options.json, text);
}

function report(io: CliIo, findings: LintFinding[], json: boolean, text: Messages): number {
  const sorted = sortFindings(findings);
  const errors = sorted.filter((finding) => finding.severity === 'error').length;
  const warnings = sorted.length - errors;
  if (json) {
    writeJson(io, { findings: sorted, errors, warnings } satisfies LintJson);
  } else if (sorted.length === 0) {
    writeLines(io, [text.noIssues]);
  } else {
    writeLines(io, [
      ...sorted.flatMap((finding) => [
        formatFinding(finding),
        `  ${text.hintLabel}: ${finding.hint}`,
      ]),
      text.lintSummary(errors, warnings),
    ]);
  }
  // @implements R-LIN-010
  return errors > 0 ? EXIT_FAILURE : EXIT_OK;
  // @endimplements R-LIN-010
}

function issueFinding(
  code: CatalogIssueCode,
  { file, field, message }: { file: string; field?: string | undefined; message: string },
  text: Messages,
): LintFinding {
  return error(
    code,
    file,
    field === undefined ? message : `${text.field(field)} ${message}`,
    text.catalogHints[code],
  );
}

export async function lintCatalog(
  catalog: Catalog,
  scan?: TagScan,
  onGitFallback?: GitFallbackListener,
): Promise<LintFinding[]> {
  const { tags: tagIndex, problems } =
    scan ?? (await scanTestRegions(catalog.root, catalog.config.testGlobs, onGitFallback));
  const text = messages(catalog.config.language);
  const findings: LintFinding[] = catalog.issues.map((issue) =>
    issueFinding(issue.code, issue, text),
  );
  for (const { code, id, file, line } of problems) {
    findings.push(
      code === 'unclosed-rule-tag'
        ? { ...error(code, file, text.unclosedRuleTag(id), text.unclosedRuleTagHint(id)), line }
        : {
            ...error(code, file, text.unmatchedEndruleTag(id), text.unmatchedEndruleTagHint(id)),
            line,
          },
    );
  }
  const files = await listRepoFiles(catalog.root, onGitFallback);
  const status = new Map(catalog.rules.map((rule) => [rule.id, rule.status]));
  const invalid = new Set(catalog.invalidRuleIds);
  const successors = new Map(
    catalog.rules
      .filter((rule) => rule.supersedes !== undefined && rule.status !== 'deprecated')
      .map((rule) => [rule.supersedes as string, rule.id]),
  );
  for (const rule of catalog.rules) {
    // @implements R-LIN-001
    if (rule.status === 'active' && !tagIndex.has(rule.id)) {
      findings.push(
        error(
          'untested-rule',
          rule.file,
          text.untestedRule(rule.id),
          text.untestedRuleHint(rule.id),
        ),
      );
    }
    // @endimplements R-LIN-001
    // @implements R-LIN-002
    for (const anchor of rule.anchors) {
      if (!files.some(createGlobMatcher([anchor]))) {
        findings.push(
          error(
            'unmatched-anchor',
            rule.file,
            text.unmatchedAnchor(anchor),
            text.unmatchedAnchorHint,
          ),
        );
      }
    }
    // @endimplements R-LIN-002
  }
  // @implements R-LIN-003
  // @implements R-LIN-004
  for (const [id, locations] of tagIndex) {
    const ruleStatus = status.get(id);
    if ((ruleStatus !== undefined && ruleStatus !== 'deprecated') || invalid.has(id)) {
      continue;
    }
    for (const { file, line } of locations) {
      findings.push(
        ruleStatus === undefined
          ? {
              ...error('unknown-rule-tag', file, text.unknownRuleTag(id), text.unknownRuleTagHint),
              line,
            }
          : {
              ...error(
                'deprecated-rule-tag',
                file,
                text.deprecatedRuleTag(id),
                text.deprecatedRuleTagHint(id, successors.get(id)),
              ),
              line,
            },
      );
    }
  }
  // @endimplements R-LIN-004
  // @endimplements R-LIN-003
  findings.push(...(await implementations(catalog, files, invalid, successors, text)));
  findings.push(...ruleRelations(catalog, invalid, text));
  // @implements R-LIN-009
  const budget = catalog.config.contextBudget;
  for (const context of catalog.contexts) {
    const count = catalog.rules.filter((rule) => rule.context === context.context).length;
    if (count > budget) {
      findings.push({
        severity: 'warning',
        code: 'context-over-budget',
        file: context.file,
        message: text.contextOverBudget(context.context, count, budget),
        hint: text.contextOverBudgetHint,
      });
    }
  }
  // @endimplements R-LIN-009
  return findings;
}

async function implementations(
  catalog: Catalog,
  files: string[],
  invalid: Set<string>,
  successors: Map<string, string>,
  text: Messages,
): Promise<LintFinding[]> {
  // Only files some rule anchors are read: code no rule anchors cannot implement one.
  const anchored = createGlobMatcher(catalog.rules.flatMap((rule) => rule.anchors));
  const scan = await scanImplementations(catalog.root, files.filter(anchored));
  const byId = new Map(catalog.rules.map((rule) => [rule.id, rule]));
  const findings: LintFinding[] = scan.problems.map(({ code, id, file, line }) => ({
    ...(code === 'unclosed-implements-tag'
      ? error(code, file, text.unclosedImplementsTag(id), text.unclosedImplementsTagHint(id))
      : error(
          code,
          file,
          text.unmatchedEndimplementsTag(id),
          text.unmatchedEndimplementsTagHint(id),
        )),
    line,
  }));
  for (const [id, regions] of scan.regions) {
    const rule = byId.get(id);
    if (rule === undefined && invalid.has(id)) {
      continue;
    }
    for (const { file, line } of regions) {
      if (rule === undefined) {
        findings.push({
          ...error(
            'unknown-implements-tag',
            file,
            text.unknownImplementsTag(id),
            text.unknownImplementsTagHint,
          ),
          line,
        });
      } else if (rule.status === 'deprecated') {
        findings.push({
          ...error(
            'deprecated-implements-tag',
            file,
            text.deprecatedImplementsTag(id),
            text.deprecatedImplementsTagHint(id, successors.get(id)),
          ),
          line,
        });
      } else if (!createGlobMatcher(rule.anchors)(file)) {
        findings.push({
          ...error(
            'implements-outside-anchors',
            file,
            text.implementsOutsideAnchors(id),
            text.implementsOutsideAnchorsHint(id),
          ),
          line,
        });
      }
    }
  }
  return findings;
}

const RELATION_FIELDS = ['dependsOn', 'conflictsWith'] as const;

function ruleRelations(catalog: Catalog, invalid: Set<string>, text: Messages): LintFinding[] {
  const byId = new Map(catalog.rules.map((rule) => [rule.id, rule]));
  const findings: LintFinding[] = [];
  // @implements R-LIN-006
  for (const rule of catalog.rules) {
    for (const field of RELATION_FIELDS) {
      for (const id of rule[field] ?? []) {
        if (id === rule.id) {
          findings.push(
            error(
              'invalid-rule-reference',
              rule.file,
              text.selfRuleReference(field),
              text.ruleReferenceHint(field),
            ),
          );
        } else if (!byId.has(id) && !invalid.has(id)) {
          findings.push(
            error(
              'invalid-rule-reference',
              rule.file,
              text.unknownRuleReference(field, id),
              text.ruleReferenceHint(field),
            ),
          );
        }
      }
    }
  }
  // @endimplements R-LIN-006
  // @implements R-LIN-007
  for (const cycle of dependencyCycles(byId)) {
    findings.push(
      error(
        'dependency-cycle',
        (byId.get(cycle[0] as string) as RuleDoc).file,
        text.dependencyCycle([...cycle, cycle[0] as string]),
        text.dependencyCycleHint,
      ),
    );
  }
  // @endimplements R-LIN-007
  // @implements R-LIN-008
  const pairs = new Set<string>();
  for (const rule of catalog.rules) {
    if (rule.status !== 'active') {
      continue;
    }
    for (const id of rule.conflictsWith ?? []) {
      if (id === rule.id || byId.get(id)?.status !== 'active') {
        continue;
      }
      const [first, second] = [rule.id, id].sort(compare) as [string, string];
      const key = `${first} ${second}`;
      if (pairs.has(key)) {
        continue;
      }
      pairs.add(key);
      findings.push(
        error(
          'active-rule-conflict',
          (byId.get(first) as RuleDoc).file,
          text.activeRuleConflict(first, second),
          text.activeRuleConflictHint,
        ),
      );
    }
  }
  // @endimplements R-LIN-008
  return findings;
}

// @implements R-LIN-007
// Each back edge of a depth-first walk closes one cycle; cycles are rotated to start at their lowest id so each is reported once.
function dependencyCycles(byId: Map<string, RuleDoc>): string[][] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();
  const visit = (id: string): void => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of byId.get(id)?.dependsOn ?? []) {
      if (next === id || !byId.has(next)) {
        continue;
      }
      const seen = state.get(next);
      if (seen === 'visiting') {
        const cycle = stack.slice(stack.indexOf(next));
        const start = cycle.indexOf([...cycle].sort(compare)[0] as string);
        const rotated = [...cycle.slice(start), ...cycle.slice(0, start)];
        cycles.set(rotated.join(' '), rotated);
      } else if (seen === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const id of [...byId.keys()].sort(compare)) {
    if (!state.has(id)) {
      visit(id);
    }
  }
  return [...cycles.values()];
}
// @endimplements R-LIN-007

// @implements R-LIN-011
export function pendingImplementation(
  catalog: Catalog,
  scan: TagScan,
  base: string,
  changed: string[],
  lines: Map<string, LineSpan[]>,
): LintFinding[] {
  const text = messages(catalog.config.language);
  return changedActiveRules(catalog, scan, changed)
    .filter(
      (rule) =>
        !(scan.regions.get(rule.id) ?? []).some((region) =>
          (lines.get(region.file) ?? []).some(
            ([start, end]) => start <= region.endLine && end >= region.line,
          ),
        ),
    )
    .map((rule) =>
      error(
        'pending-implementation',
        rule.file,
        text.pendingImplementation(rule.id, base),
        text.pendingImplementationHint(rule.id),
      ),
    );
}
// @endimplements R-LIN-011

function changedActiveRules(catalog: Catalog, scan: TagScan, changed: string[]): RuleDoc[] {
  const changedSet = new Set(changed);
  return catalog.rules.filter(
    (rule) =>
      rule.status === 'active' &&
      changedSet.has(rule.file) &&
      (scan.tags.get(rule.id) ?? []).length > 0,
  );
}

async function testLineChanges(
  catalog: Catalog,
  scan: TagScan,
  base: string,
  changed: ChangeSet,
  text: Messages,
): Promise<Map<string, LineSpan[]>> {
  const changedSet = new Set(changed.files);
  const files = new Set(
    changedActiveRules(catalog, scan, changed.files)
      .flatMap((rule) => scan.regions.get(rule.id) ?? [])
      .map((region) => region.file)
      .filter((file) => changedSet.has(file)),
  );
  const lines = new Map<string, LineSpan[]>();
  for (const file of files) {
    if (changed.untracked.has(file)) {
      lines.set(file, [[1, Number.POSITIVE_INFINITY]]);
      continue;
    }
    try {
      lines.set(file, await changedLines(catalog.root, base, file));
    } catch (error) {
      throw new CliError(text.cannotListChanged(base, gitFailureReason(error)));
    }
  }
  return lines;
}

export async function changedFiles(
  root: string,
  base: string,
  text: Messages,
  command: string,
  options?: { bothRenamePaths?: boolean },
): Promise<ChangeSet> {
  if (!(await isInsideWorkTree(root))) {
    throw new CliError(text.needsWorkTree(command, root));
  }
  if (!(await isCommitRef(root, base))) {
    throw new CliError(text.unknownRef(base));
  }
  try {
    return await changedSince(root, base, options);
  } catch (error) {
    throw new CliError(text.cannotListChanged(base, gitFailureReason(error)));
  }
}

export function formatFinding(finding: LintFinding): string {
  const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return `${finding.severity} ${finding.code} ${location} ${finding.message}`;
}

function error(code: string, file: string, message: string, hint: string): LintFinding {
  return { severity: 'error', code, file, message, hint };
}

function sortFindings(findings: LintFinding[]): LintFinding[] {
  return [...findings].sort(
    (a, b) => compare(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compare(a.code, b.code),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
