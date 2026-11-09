// The grammar files this package ships, by language: the parser and the tags queries that name
// its definitions. TypeScript extends JavaScript, so its tags are JavaScript's plus its own.
const javascriptTags = ['tree-sitter-javascript', 'queries/tags.scm'];
const typescriptTags = ['tree-sitter-typescript', 'queries/tags.scm'];

export const GRAMMARS = {
  javascript: {
    wasm: ['tree-sitter-javascript', 'tree-sitter-javascript.wasm'],
    tags: [javascriptTags],
  },
  typescript: {
    wasm: ['tree-sitter-typescript', 'tree-sitter-typescript.wasm'],
    tags: [javascriptTags, typescriptTags],
  },
  tsx: {
    wasm: ['tree-sitter-typescript', 'tree-sitter-tsx.wasm'],
    tags: [javascriptTags, typescriptTags],
  },
  python: {
    wasm: ['tree-sitter-python', 'tree-sitter-python.wasm'],
    tags: [['tree-sitter-python', 'queries/tags.scm']],
  },
  go: {
    wasm: ['tree-sitter-go', 'tree-sitter-go.wasm'],
    tags: [['tree-sitter-go', 'queries/tags.scm']],
  },
  java: {
    wasm: ['tree-sitter-java', 'tree-sitter-java.wasm'],
    tags: [['tree-sitter-java', 'queries/tags.scm']],
  },
  csharp: {
    wasm: ['tree-sitter-c-sharp', 'tree-sitter-c_sharp.wasm'],
    tags: [['tree-sitter-c-sharp', 'queries/tags.scm']],
  },
  rust: {
    wasm: ['tree-sitter-rust', 'tree-sitter-rust.wasm'],
    tags: [['tree-sitter-rust', 'queries/tags.scm']],
  },
};

export const EXTENSIONS = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.rs': 'rust',
};

/** Every [package, file] pair the grammars need, once each, with each package's license. */
export function grammarFiles() {
  const seen = new Map();
  for (const { wasm, tags } of Object.values(GRAMMARS)) {
    for (const pair of [wasm, ...tags, [wasm[0], 'LICENSE']]) {
      seen.set(pair.join('/'), pair);
    }
  }
  return [...seen.values()];
}
