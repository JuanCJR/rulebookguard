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
import { scanTestRegions, type TagScan } from '../catalog/tags.ts';
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
    options.base === undefined ? undefined : await changedFiles(catalog.root, options.base, text);
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
  return errors > 0 ? EXIT_FAILURE : EXIT_OK;
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
  }
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
  return findings;
}

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

async function changedFiles(root: string, base: string, text: Messages): Promise<ChangeSet> {
  if (!(await isInsideWorkTree(root))) {
    throw new CliError(text.needsWorkTree(root));
  }
  if (!(await isCommitRef(root, base))) {
    throw new CliError(text.unknownRef(base));
  }
  try {
    return await changedSince(root, base);
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
