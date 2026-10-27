import { expandGlobs, type GitFallbackListener } from '../catalog/files.ts';
import { runGit } from '../catalog/git.ts';
import type { Catalog } from '../catalog/load.ts';
import { scanTestTags, type TagLocation } from '../catalog/tags.ts';
import { lintCatalog, type LintFinding } from '../commands/lint.ts';
import type { ContextDoc, RuleDoc } from '../format/types.ts';

export interface SiteCommit {
  hash: string;
  /** YYYY-MM-DD, author date. */
  date: string;
  author: string;
  subject: string;
}

export interface SiteRule {
  rule: RuleDoc;
  /** Files matched by the rule's anchors, as `impact` reports them. */
  files: string[];
  tests: TagLocation[];
  /** Commits that touched the rule file, newest first; empty outside git. */
  history: SiteCommit[];
  /** The rules this one replaces, nearest first, including ids with no rule file. */
  supersedes: string[];
  supersededBy: string | undefined;
}

export interface SiteData {
  contexts: ContextDoc[];
  rules: SiteRule[];
  findings: LintFinding[];
}

const FIELD = '\u001f';

export async function siteData(
  catalog: Catalog,
  onGitFallback?: GitFallbackListener,
): Promise<SiteData> {
  const tags = await scanTestTags(catalog.root, catalog.config.testGlobs, onGitFallback);
  const byId = new Map(catalog.rules.map((rule) => [rule.id, rule]));
  const rules = [...catalog.rules].sort((a, b) => compare(a.id, b.id));
  return {
    contexts: [...catalog.contexts].sort((a, b) => compare(a.context, b.context)),
    rules: await Promise.all(
      rules.map(async (rule) => ({
        rule,
        files: await expandGlobs(catalog.root, rule.anchors, onGitFallback),
        tests: tags.get(rule.id) ?? [],
        history: await history(catalog.root, rule.file),
        supersedes: chain(rule, byId),
        supersededBy: rules.find((other) => other.supersedes === rule.id)?.id,
      })),
    ),
    findings: await lintCatalog(catalog, tags, onGitFallback),
  };
}

function chain(rule: RuleDoc, byId: Map<string, RuleDoc>): string[] {
  const ids: string[] = [];
  for (let next = rule.supersedes; next !== undefined; next = byId.get(next)?.supersedes) {
    ids.push(next);
    if (next === rule.id || ids.indexOf(next) !== ids.length - 1) {
      break;
    }
  }
  return ids;
}

async function history(root: string, file: string): Promise<SiteCommit[]> {
  let output: string;
  try {
    output = await runGit(root, [
      'log',
      '--follow',
      `--format=%h${FIELD}%as${FIELD}%an${FIELD}%s`,
      '--',
      file,
    ]);
  } catch {
    return [];
  }
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [hash = '', date = '', author = '', subject = ''] = line.split(FIELD);
      return { hash, date, author, subject };
    });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
