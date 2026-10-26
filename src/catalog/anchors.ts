import type { RuleDoc } from '../format/types.ts';
import { createGlobMatcher, toRepoPath } from './files.ts';

export function rulesForPath(rules: RuleDoc[], path: string): RuleDoc[] {
  const target = toRepoPath(path);
  return rules
    .filter((rule) => createGlobMatcher(rule.anchors)(target))
    .sort((a, b) => compare(a.id, b.id));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
