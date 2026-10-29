import { splitFrontmatter } from './frontmatter.ts';
import { readSource } from './read.ts';
import type { RuleDoc, ParseOptions } from './types.ts';
import { validate, validators } from './validate.ts';

const RULE_ID = /^R-[A-Z][A-Z0-9]*-[0-9]{3}$/;

export function isRuleId(value: string): boolean {
  return RULE_ID.test(value);
}

export function parseRule(source: string, file: string, { language }: ParseOptions = {}): RuleDoc {
  const { data, body } = splitFrontmatter(source, file, { language });
  return { file, ...validate(validators.rule, data, file, { language }), body };
}

export async function loadRule(path: string, options?: ParseOptions): Promise<RuleDoc> {
  return parseRule(await readSource(path), path, options);
}
