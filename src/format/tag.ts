export interface RuleTag {
  id: string;
  line: number;
}

export interface RuleRegion extends RuleTag {
  endLine: number;
}

export type RegionKind = 'rule' | 'implements';

export type RuleTagProblemCode = 'unclosed-rule-tag' | 'unmatched-endrule-tag';

export type ImplementsTagProblemCode = 'unclosed-implements-tag' | 'unmatched-endimplements-tag';

export interface RuleTagProblem<Code extends string = RuleTagProblemCode> extends RuleTag {
  code: Code;
}

export interface RuleRegions<Code extends string = RuleTagProblemCode> {
  regions: RuleRegion[];
  problems: RuleTagProblem<Code>[];
}

export const RULE_TAG_PATTERN: RegExp = /(?<![\w@.-])@rule\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\w-])/g;

export const RULE_MARKER_PATTERN: RegExp = markerPattern('rule');

export const IMPLEMENTS_MARKER_PATTERN: RegExp = markerPattern('implements');

function markerPattern(kind: RegionKind): RegExp {
  return new RegExp(
    `(?<![\\w@.-])@(${kind}|end${kind})\\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\\w-])`,
    'g',
  );
}

// Markers count only on lines that start with a comment, so ids quoted in test names or strings are not links.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#|--|;|<!--|%)/;

export function findRuleTags(source: string): RuleTag[] {
  const tags: RuleTag[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    if (!COMMENT_LINE.test(text)) {
      return;
    }
    for (const match of text.matchAll(RULE_TAG_PATTERN)) {
      tags.push({ id: match[1] as string, line: index + 1 });
    }
  });
  return tags;
}

// @implements R-LIN-005
export function findRuleRegions(source: string, kind?: 'rule'): RuleRegions;
export function findRuleRegions(
  source: string,
  kind: 'implements',
): RuleRegions<ImplementsTagProblemCode>;
export function findRuleRegions(
  source: string,
  kind: RegionKind = 'rule',
): RuleRegions<RuleTagProblemCode | ImplementsTagProblemCode> {
  const pattern = kind === 'rule' ? RULE_MARKER_PATTERN : IMPLEMENTS_MARKER_PATTERN;
  const regions: RuleRegion[] = [];
  const problems: RuleTagProblem<RuleTagProblemCode | ImplementsTagProblemCode>[] = [];
  const open: RuleTag[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    if (!COMMENT_LINE.test(text)) {
      return;
    }
    const line = index + 1;
    for (const match of text.matchAll(pattern)) {
      const id = match[2] as string;
      if (match[1] === kind) {
        open.push({ id, line });
        continue;
      }
      const at = open.map((tag) => tag.id).lastIndexOf(id);
      if (at === -1) {
        problems.push({ code: `unmatched-end${kind}-tag`, id, line });
        continue;
      }
      for (const inner of open.splice(at + 1)) {
        problems.push({ code: `unclosed-${kind}-tag`, ...inner });
      }
      const start = open.pop() as RuleTag;
      regions.push({ ...start, endLine: line });
    }
  });
  for (const tag of open) {
    problems.push({ code: `unclosed-${kind}-tag`, ...tag });
  }
  problems.sort((a, b) => a.line - b.line);
  return { regions, problems };
}
// @endimplements R-LIN-005
