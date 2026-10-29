import { splitFrontmatter } from './frontmatter.ts';
import { readSource } from './read.ts';
import type { ContextDoc, ParseOptions } from './types.ts';
import { validate, validators } from './validate.ts';

export const CONTEXT_FILE_NAME = '_context.md';

export function parseContext(
  source: string,
  file: string,
  { language }: ParseOptions = {},
): ContextDoc {
  const { data, body } = splitFrontmatter(source, file, { language });
  return { file, ...validate(validators.context, data, file, { language }), body };
}

export async function loadContext(path: string, options?: ParseOptions): Promise<ContextDoc> {
  return parseContext(await readSource(path), path, options);
}
