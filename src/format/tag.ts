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
export const COMMENT_LINE: RegExp = /^\s*(?:\/\/|\/\*|\*|#|--|;|<!--|%)/;

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

export interface MisplacedMarker extends RuleTag {
  marker: '@rule' | '@endrule' | '@implements' | '@endimplements';
}

const ANY_MARKER_PATTERN =
  /(?<![\w@.-])(@(?:end)?(?:rule|implements))\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\w-])/g;

// Openers that may follow code on the same line; ";" and "%" are left out because code uses them as operators.
const TRAILING_COMMENTS = ['//', '/*', '#', '--', '<!--'];
const QUOTES = new Set(["'", '"', '`']);

// @implements R-LIN-022
// A marker in a comment that follows code does not count; it is found so lint can say so.
// A comment opener inside a string literal does not start a comment.
export function findMisplacedMarkers(source: string): MisplacedMarker[] {
  const found: MisplacedMarker[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    if (COMMENT_LINE.test(text)) {
      return;
    }
    const start = commentStart(text);
    if (start === undefined) {
      return;
    }
    for (const match of text.slice(start).matchAll(ANY_MARKER_PATTERN)) {
      found.push({
        marker: match[1] as MisplacedMarker['marker'],
        id: match[2] as string,
        line: index + 1,
      });
    }
  });
  return found;
}

function commentStart(text: string): number | undefined {
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (quote !== undefined) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (QUOTES.has(char)) {
      quote = char;
    } else if (TRAILING_COMMENTS.some((opener) => text.startsWith(opener, index))) {
      return index;
    }
  }
  return undefined;
}
// @endimplements R-LIN-022

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
