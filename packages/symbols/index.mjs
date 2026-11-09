import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser, Query } from 'web-tree-sitter';
import { EXTENSIONS, GRAMMARS } from './grammars.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// A published package carries its grammar files in grammars/ (see copy-grammars.mjs); a workspace
// checkout reads them from the grammar packages it has as dev dependencies.
function grammarFile(name, file) {
  const shipped = join(here, 'grammars', name, file);
  return existsSync(shipped)
    ? shipped
    : join(dirname(require.resolve(`${name}/package.json`)), file);
}

let ready;
const loaded = new Map();

function load(language) {
  let grammar = loaded.get(language);
  if (grammar === undefined) {
    grammar = (async () => {
      ready ??= Parser.init();
      await ready;
      const { wasm, tags } = GRAMMARS[language];
      const parsed = await Language.load(grammarFile(...wasm));
      const sources = await Promise.all(tags.map((pair) => readFile(grammarFile(...pair), 'utf8')));
      return { language: parsed, query: new Query(parsed, sources.join('\n')) };
    })();
    loaded.set(language, grammar);
  }
  return grammar;
}

/** Whether `file`'s language has a grammar here. */
export function supports(file) {
  return Object.hasOwn(EXTENSIONS, extname(file).toLowerCase());
}

const STRING = /string(?:_literal)?$/;
const CALL = /call|invocation/;
const QUOTES = /^[a-zA-Z]*(?:"""|'''|["'`])|(?:"""|'''|["'`])$/g;

function span(node) {
  return { line: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
}

/** The definitions and string calls of `source`, or undefined when its language is not supported. */
export async function readSymbols(file, source) {
  const language = EXTENSIONS[extname(file).toLowerCase()];
  if (language === undefined) {
    return undefined;
  }
  const grammar = await load(language);
  const parser = new Parser();
  parser.setLanguage(grammar.language);
  const tree = parser.parse(source);
  if (tree === null) {
    parser.delete();
    return undefined;
  }
  try {
    const definitions = [];
    for (const match of grammar.query.matches(tree.rootNode)) {
      const name = match.captures.find((capture) => capture.name === 'name');
      const definition = match.captures.find((capture) => capture.name.startsWith('definition.'));
      if (name !== undefined && definition !== undefined) {
        definitions.push({ name: name.node.text, ...span(definition.node) });
      }
    }
    definitions.sort((a, b) => a.line - b.line || b.endLine - a.endLine);

    const strings = [];
    const visit = (node) => {
      if (STRING.test(node.type)) {
        let call = node.parent;
        while (call !== null && !CALL.test(call.type)) {
          call = call.parent;
        }
        strings.push({ text: node.text.replace(QUOTES, ''), ...span(call ?? node) });
        return;
      }
      for (const child of node.namedChildren) {
        visit(child);
      }
    };
    visit(tree.rootNode);

    return {
      definitions,
      calls: (text) =>
        strings
          .filter((string) => string.text === text)
          .map(({ line, endLine }) => ({ line, endLine })),
    };
  } finally {
    tree.delete();
    parser.delete();
  }
}
