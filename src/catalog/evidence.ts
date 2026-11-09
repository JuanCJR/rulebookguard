import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDefinitionLine,
  findTextLine,
  parseEvidence,
  type EvidenceEntry,
  type LineSpan,
} from '../format/evidence.ts';
import { importOptionalPackage } from '../optional-package.ts';
import { resolvesInside } from './files.ts';

export const SYMBOLS_PACKAGE = '@rulebookguard/symbols';

export interface SymbolDefinition extends LineSpan {
  name: string;
}

/** The symbols of one source file, as `@rulebookguard/symbols` reads them. */
export interface SourceSymbols {
  definitions: SymbolDefinition[];
  /** The calls holding `text` as a whole string literal, such as a test with that name. */
  calls(text: string): LineSpan[];
}

/** What `@rulebookguard/symbols` exports. */
export interface SymbolsPackage {
  /** Undefined when the file's language is not supported. */
  readSymbols(file: string, source: string): Promise<SourceSymbols | undefined>;
}

export type EvidenceProblem = 'missing-file' | 'missing-symbol';

export interface EvidenceLink {
  entry: string;
  file: string;
  /** The symbol as the entry writes it, without quotes; absent for a path alone. */
  symbol?: string;
  line: number | null;
  endLine: number | null;
  problem?: EvidenceProblem;
}

export type EvidenceResolver = (entry: string) => Promise<EvidenceLink>;

interface Source {
  lines: string[];
  symbols: SourceSymbols | undefined;
}

type PathKind = 'file' | 'directory' | 'missing';

/**
 * Resolves evidence entries to the lines they name: exact ranges through `@rulebookguard/symbols`
 * when it is installed and knows the language, otherwise the definition line a regex finds.
 */
export async function createEvidenceResolver(
  root: string,
  from: readonly string[] = [root, dirname(fileURLToPath(import.meta.url))],
): Promise<EvidenceResolver> {
  const realRoot = await realpath(root);
  const symbols = await importOptionalPackage<SymbolsPackage>(SYMBOLS_PACKAGE, from);
  const kinds = new Map<string, Promise<PathKind>>();
  const sources = new Map<string, Promise<Source>>();

  const kindOf = (file: string): Promise<PathKind> => {
    let kind = kinds.get(file);
    if (kind === undefined) {
      kind = pathKind(join(root, file), realRoot);
      kinds.set(file, kind);
    }
    return kind;
  };
  const sourceOf = (file: string): Promise<Source> => {
    let source = sources.get(file);
    if (source === undefined) {
      source = readSource(file, join(root, file), symbols);
      sources.set(file, source);
    }
    return source;
  };

  return async (entry) => {
    const parsed = parseEvidence(entry);
    const symbol = symbolText(parsed);
    const link: EvidenceLink = {
      entry,
      file: parsed.file,
      ...(symbol === undefined ? {} : { symbol }),
      line: null,
      endLine: null,
    };
    const kind = await kindOf(parsed.file);
    if (kind === 'missing' || (kind === 'directory' && parsed.symbol !== undefined)) {
      return { ...link, problem: 'missing-file' };
    }
    if (parsed.lines !== undefined) {
      return { ...link, ...parsed.lines };
    }
    if (parsed.symbol === undefined) {
      return link;
    }
    const source = await sourceOf(parsed.file);
    const span =
      parsed.symbol.kind === 'name'
        ? resolveName(parsed.symbol.parts, source)
        : resolveText(parsed.symbol.text, source);
    return span === undefined ? { ...link, problem: 'missing-symbol' } : { ...link, ...span };
  };
}

function symbolText(parsed: EvidenceEntry): string | undefined {
  if (parsed.symbol === undefined) {
    return undefined;
  }
  if (parsed.symbol.kind === 'text') {
    return parsed.symbol.text;
  }
  const trimmed = parsed.entry.trim();
  return trimmed.slice(trimmed.search(/\s/)).trim();
}

// A path that escapes the root, through `..` or a symlink, counts as missing: it is never read.
async function pathKind(path: string, realRoot: string): Promise<PathKind> {
  if (!(await resolvesInside(path, realRoot))) {
    return 'missing';
  }
  const info = await stat(path);
  return info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'missing';
}

async function readSource(
  file: string,
  path: string,
  symbols: SymbolsPackage | undefined,
): Promise<Source> {
  const text = await readFile(path, 'utf8');
  let read: SourceSymbols | undefined;
  try {
    read = await symbols?.readSymbols(file, text);
  } catch {
    // A grammar that fails to load or parse leaves the regex resolver in charge.
    read = undefined;
  }
  return { lines: text.split(/\r?\n/), symbols: read };
}

function resolveName(parts: string[], source: Source): LineSpan | undefined {
  if (parts.length === 0) {
    return undefined;
  }
  const exact =
    source.symbols === undefined ? undefined : inDefinitions(parts, source.symbols.definitions);
  return exact ?? byRegex(parts, source.lines);
}

// Each part after the first is looked up inside the range of the one before: `Clients.create`.
function inDefinitions(
  parts: string[],
  definitions: readonly SymbolDefinition[],
): LineSpan | undefined {
  let scope: SymbolDefinition | undefined;
  for (const part of parts) {
    const outer = scope;
    scope = definitions.find(
      (definition) =>
        definition.name === part &&
        (outer === undefined ||
          (definition !== outer &&
            definition.line >= outer.line &&
            definition.endLine <= outer.endLine)),
    );
    if (scope === undefined) {
      return undefined;
    }
  }
  return scope === undefined ? undefined : { line: scope.line, endLine: scope.endLine };
}

function byRegex(parts: string[], lines: readonly string[]): LineSpan | undefined {
  let line = 0;
  for (const part of parts) {
    const found = findDefinitionLine(lines, part, line);
    if (found === undefined) {
      return undefined;
    }
    line = found;
  }
  return { line, endLine: line };
}

function resolveText(text: string, source: Source): LineSpan | undefined {
  const call = source.symbols?.calls(text)[0];
  if (call !== undefined) {
    return call;
  }
  const line = findTextLine(source.lines, text);
  return line === undefined ? undefined : { line, endLine: line };
}
