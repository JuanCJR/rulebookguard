import { splitFrontmatter } from './frontmatter.ts';
import { readSource } from './read.ts';
import type { ContextDoc } from './types.ts';
import { validate, validators } from './validate.ts';

export const CONTEXT_FILE_NAME = '_context.md';

export function parseContext(source: string, file: string): ContextDoc {
  const { data, body } = splitFrontmatter(source, file);
  return { file, ...validate(validators.context, data, file), body };
}

export async function loadContext(path: string): Promise<ContextDoc> {
  return parseContext(await readSource(path), path);
}
