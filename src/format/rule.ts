import { splitFrontmatter } from './frontmatter.ts';
import { readSource } from './read.ts';
import type { RuleDoc } from './types.ts';
import { validate, validators } from './validate.ts';

const RULE_ID = /^R-[A-Z][A-Z0-9]*-[0-9]{3}$/;

export function isRuleId(value: string): boolean {
  return RULE_ID.test(value);
}

export function parseRule(source: string, file: string): RuleDoc {
  const { data, body } = splitFrontmatter(source, file);
  return { file, ...validate(validators.rule, data, file), body };
}

export async function loadRule(path: string): Promise<RuleDoc> {
  return parseRule(await readSource(path), path);
}
