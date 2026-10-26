import { createGlobMatcher, listRepoFiles } from '../catalog/files.ts';
import { changedSince, isCommitRef, isInsideWorkTree } from '../catalog/git.ts';
import type { Catalog } from '../catalog/load.ts';
import { scanTestTags, type TagIndex } from '../catalog/tags.ts';
import { CliError, EXIT_FAILURE, EXIT_OK, type CliIo, writeJson, writeLines } from './io.ts';

export type LintSeverity = 'error' | 'warning';

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  file: string;
  line?: number;
  message: string;
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

export async function lintCommand(
  catalog: Catalog,
  io: CliIo,
  options: LintOptions,
): Promise<number> {
  const changed =
    options.base === undefined ? undefined : await changedFiles(catalog.root, options.base);
  const tags = await scanTestTags(catalog.root, catalog.config.testGlobs);
  const findings = await lintCatalog(catalog, tags);
  if (options.base !== undefined && changed !== undefined) {
    findings.push(...pendingImplementation(catalog, tags, options.base, changed));
  }
  const sorted = sortFindings(findings);
  const errors = sorted.filter((finding) => finding.severity === 'error').length;
  const warnings = sorted.length - errors;
  if (options.json) {
    writeJson(io, { findings: sorted, errors, warnings } satisfies LintJson);
  } else if (sorted.length === 0) {
    writeLines(io, ['No issues found.']);
  } else {
    writeLines(io, [
      ...sorted.map(formatFinding),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}`,
    ]);
  }
  return errors > 0 ? EXIT_FAILURE : EXIT_OK;
}

export async function lintCatalog(catalog: Catalog, tags?: TagIndex): Promise<LintFinding[]> {
  const tagIndex = tags ?? (await scanTestTags(catalog.root, catalog.config.testGlobs));
  const findings: LintFinding[] = catalog.issues.map(({ code, file, field, message }) => ({
    severity: 'error',
    code,
    file,
    message: field === undefined ? message : `field "${field}" ${message}`,
  }));
  const files = await listRepoFiles(catalog.root);
  const status = new Map(catalog.rules.map((rule) => [rule.id, rule.status]));
  for (const rule of catalog.rules) {
    if (rule.status === 'active' && !tagIndex.has(rule.id)) {
      findings.push(
        error('untested-rule', rule.file, `active rule ${rule.id} has no test tagging it`),
      );
    }
    for (const anchor of rule.anchors) {
      if (!files.some(createGlobMatcher([anchor]))) {
        findings.push(error('unmatched-anchor', rule.file, `anchor "${anchor}" matches no file`));
      }
    }
  }
  for (const [id, locations] of tagIndex) {
    const ruleStatus = status.get(id);
    if (ruleStatus !== undefined && ruleStatus !== 'deprecated') {
      continue;
    }
    for (const { file, line } of locations) {
      findings.push(
        ruleStatus === undefined
          ? { ...error('unknown-rule-tag', file, `tags ${id}, which does not exist`), line }
          : { ...error('deprecated-rule-tag', file, `tags ${id}, which is deprecated`), line },
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
        message: `context "${context.context}" has ${count} rules, more than the contextBudget of ${budget}`,
      });
    }
  }
  return findings;
}

export function pendingImplementation(
  catalog: Catalog,
  tags: TagIndex,
  base: string,
  changed: string[],
): LintFinding[] {
  const changedSet = new Set(changed);
  return catalog.rules
    .filter((rule) => rule.status === 'active' && changedSet.has(rule.file))
    .filter((rule) => !(tags.get(rule.id) ?? []).some(({ file }) => changedSet.has(file)))
    .map((rule) =>
      error(
        'pending-implementation',
        rule.file,
        `rule ${rule.id} changed since ${base} but none of the tests tagging it changed`,
      ),
    );
}

async function changedFiles(root: string, base: string): Promise<string[]> {
  if (!(await isInsideWorkTree(root))) {
    throw new CliError(`lint --base needs a git work tree, but ${root} is not inside one.`);
  }
  if (!(await isCommitRef(root, base))) {
    throw new CliError(`Unknown git ref "${base}".`);
  }
  return changedSince(root, base);
}

export function formatFinding(finding: LintFinding): string {
  const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return `${finding.severity} ${finding.code} ${location} ${finding.message}`;
}

function error(code: string, file: string, message: string): LintFinding {
  return { severity: 'error', code, file, message };
}

function sortFindings(findings: LintFinding[]): LintFinding[] {
  return [...findings].sort(
    (a, b) => compare(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compare(a.code, b.code),
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
