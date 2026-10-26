import { FormatError } from './errors.ts';
import { parseYaml } from './yaml.ts';

export interface Frontmatter {
  data: unknown;
  body: string;
}

const OPENING = /^---\r?\n/;
const CLOSING = /^---[ \t]*(?:\r?\n|$)/m;

export function splitFrontmatter(source: string, file: string): Frontmatter {
  const opening = OPENING.exec(source);
  if (opening === null) {
    throw new FormatError([{ file, message: 'missing YAML frontmatter delimited by "---" lines' }]);
  }
  const rest = source.slice(opening[0].length);
  const closing = CLOSING.exec(rest);
  if (closing === null) {
    throw new FormatError([{ file, message: 'frontmatter is not closed by a "---" line' }]);
  }
  const yaml = rest.slice(0, closing.index);
  const body = rest.slice(closing.index + closing[0].length).replace(/^(?:\r?\n)+/, '');
  return { data: parseYaml(yaml, file), body };
}
