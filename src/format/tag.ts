export interface RuleTag {
  id: string;
  line: number;
}

export interface RuleRegion extends RuleTag {
  endLine: number;
}

export type RuleTagProblemCode = 'unclosed-rule-tag' | 'unmatched-endrule-tag';

export interface RuleTagProblem extends RuleTag {
  code: RuleTagProblemCode;
}

export interface RuleRegions {
  regions: RuleRegion[];
  problems: RuleTagProblem[];
}

export const RULE_TAG_PATTERN: RegExp = /(?<![\w@.-])@rule\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\w-])/g;

export const RULE_MARKER_PATTERN: RegExp =
  /(?<![\w@.-])@(rule|endrule)\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\w-])/g;

export function findRuleTags(source: string): RuleTag[] {
  const tags: RuleTag[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    for (const match of text.matchAll(RULE_TAG_PATTERN)) {
      tags.push({ id: match[1] as string, line: index + 1 });
    }
  });
  return tags;
}

export function findRuleRegions(source: string): RuleRegions {
  const regions: RuleRegion[] = [];
  const problems: RuleTagProblem[] = [];
  const open: RuleTag[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    for (const match of text.matchAll(RULE_MARKER_PATTERN)) {
      const id = match[2] as string;
      if (match[1] === 'rule') {
        open.push({ id, line });
        continue;
      }
      const at = open.map((tag) => tag.id).lastIndexOf(id);
      if (at === -1) {
        problems.push({ code: 'unmatched-endrule-tag', id, line });
        continue;
      }
      for (const inner of open.splice(at + 1)) {
        problems.push({ code: 'unclosed-rule-tag', ...inner });
      }
      const start = open.pop() as RuleTag;
      regions.push({ ...start, endLine: line });
    }
  });
  for (const tag of open) {
    problems.push({ code: 'unclosed-rule-tag', ...tag });
  }
  problems.sort((a, b) => a.line - b.line);
  return { regions, problems };
}
