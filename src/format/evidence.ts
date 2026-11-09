import { COMMENT_LINE } from './tag.ts';

export type EvidenceSymbol = { kind: 'name'; parts: string[] } | { kind: 'text'; text: string };

export interface LineSpan {
  line: number;
  endLine: number;
}

/** One `evidence` entry: `path`, `path symbol`, `path "test name"` or the older `path:line[-endLine]`. */
export interface EvidenceEntry {
  entry: string;
  file: string;
  symbol?: EvidenceSymbol;
  lines?: LineSpan;
}

const LINE_SUFFIX = /^(.*):([0-9]+)(?:-([0-9]+))?$/;
const QUOTED = /^(["'`])(.+)\1$/;

export function parseEvidence(entry: string): EvidenceEntry {
  const trimmed = entry.trim();
  const space = trimmed.search(/\s/);
  const path = repoPath(space === -1 ? trimmed : trimmed.slice(0, space));
  const rest = space === -1 ? '' : trimmed.slice(space).trim();
  const lines = LINE_SUFFIX.exec(path);
  if (lines !== null && rest === '') {
    const line = Number(lines[2]);
    return {
      entry,
      file: lines[1] as string,
      lines: { line, endLine: lines[3] === undefined ? line : Number(lines[3]) },
    };
  }
  if (rest === '') {
    return { entry, file: path };
  }
  const quoted = QUOTED.exec(rest);
  return {
    entry,
    file: path,
    symbol:
      quoted === null
        ? { kind: 'name', parts: rest.split(/\.|::|#/).filter((part) => part !== '') }
        : { kind: 'text', text: quoted[2] as string },
  };
}

function repoPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
}

const MODIFIERS =
  '(?:(?:public|private|protected|internal|static|async|override|abstract|virtual|sealed|final|export|default|get|set|readonly|unsafe|extern|synchronized|pub(?:\\([^)]*\\))?)\\s+)*';

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ordered from the most to the least telling: the first kind with a match wins, so a definition
// keyword beats an assignment, and an assignment beats a line that only looks like a method.
function definitionPatterns(name: string): RegExp[] {
  const n = escape(name);
  const end = '(?![\\w$])';
  return [
    new RegExp(
      `(?:^|[^\\w$.])(?:function\\*?|def|fn|func|class|interface|type|enum|struct|trait|impl|module|namespace|record|object|const|let|var|val|sub|macro|alias)\\s+${n}${end}`,
    ),
    new RegExp(`\\bfunc\\s*\\([^)]*\\)\\s*${n}${end}`),
    new RegExp(`^\\s*${MODIFIERS}${n}\\s*(?::[^=]*)?=(?![=>])`),
    new RegExp(`["']${n}["']\\s*:`),
    new RegExp(`^\\s*${n}\\s*:`),
    new RegExp(`^\\s*${MODIFIERS}(?:[\\w$<>\\[\\],.?*&]+\\s+)?${n}\\s*(?:<[^>]*>)?\\s*\\([^;]*$`),
  ];
}

/** The 1-based line defining `name`, searching after line `after`; comment lines never count. */
export function findDefinitionLine(
  lines: readonly string[],
  name: string,
  after = 0,
): number | undefined {
  for (const pattern of definitionPatterns(name)) {
    for (let index = after; index < lines.length; index += 1) {
      const text = lines[index] as string;
      if (!COMMENT_LINE.test(text) && pattern.test(text)) {
        return index + 1;
      }
    }
  }
  return undefined;
}

/** The 1-based line holding `text` as a whole quoted string, such as a test name. */
export function findTextLine(lines: readonly string[], text: string): number | undefined {
  const pattern = new RegExp(`(["'\`])${escape(text)}\\1`);
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : index + 1;
}
