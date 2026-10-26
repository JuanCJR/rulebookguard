import { createGlobMatcher, listRepoFiles } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import { scanTestTags } from '../catalog/tags.ts';
import { EXIT_FAILURE, EXIT_OK, type CliIo, writeJson, writeLines } from './io.ts';

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

export async function lintCommand(catalog: Catalog, io: CliIo, json: boolean): Promise<number> {
  const findings = sortFindings(await lintCatalog(catalog));
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.length - errors;
  if (json) {
    writeJson(io, { findings, errors, warnings } satisfies LintJson);
  } else if (findings.length === 0) {
    writeLines(io, ['No issues found.']);
  } else {
    writeLines(io, [
      ...findings.map(formatFinding),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}`,
    ]);
  }
  return errors > 0 ? EXIT_FAILURE : EXIT_OK;
}

export async function lintCatalog(catalog: Catalog): Promise<LintFinding[]> {
  const findings: LintFinding[] = catalog.issues.map(({ code, file, field, message }) => ({
    severity: 'error',
    code,
    file,
    message: field === undefined ? message : `field "${field}" ${message}`,
  }));
  const tags = await scanTestTags(catalog.root, catalog.config.testGlobs);
  const files = await listRepoFiles(catalog.root);
  const status = new Map(catalog.rules.map((rule) => [rule.id, rule.status]));
  for (const rule of catalog.rules) {
    if (rule.status === 'active' && !tags.has(rule.id)) {
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
  for (const [id, locations] of tags) {
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
