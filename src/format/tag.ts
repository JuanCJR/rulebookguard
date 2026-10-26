export interface RuleTag {
  id: string;
  line: number;
}

export const RULE_TAG_PATTERN: RegExp = /(?<![\w@.-])@rule\s+(R-[A-Z][A-Z0-9]*-[0-9]{3})(?![\w-])/g;

export function findRuleTags(source: string): RuleTag[] {
  const tags: RuleTag[] = [];
  source.split(/\r?\n/).forEach((text, index) => {
    for (const match of text.matchAll(RULE_TAG_PATTERN)) {
      tags.push({ id: match[1] as string, line: index + 1 });
    }
  });
  return tags;
}
