import { readSymbols, supports } from '@rulebookguard/symbols';
import { describe, expect, it } from 'vite-plus/test';

const definitions = async (file: string, source: string) =>
  (await readSymbols(file, source))?.definitions.map(
    ({ name, line, endLine }) => `${name} ${line}-${endLine}`,
  );

describe('@rulebookguard/symbols', () => {
  it('gives the full range of TypeScript functions, classes and methods', async () => {
    const source = [
      "import x from 'y';",
      'export function validateDocument(doc: string): boolean {',
      '  return doc.length > 3;',
      '}',
      'export class Clients {',
      '  create(a: number) {',
      '    return a;',
      '  }',
      '}',
    ].join('\n');

    expect(await definitions('src/clients.ts', source)).toEqual(
      expect.arrayContaining(['validateDocument 2-4', 'Clients 5-9', 'create 6-8']),
    );
  });

  it('reads every shipped language', async () => {
    const cases: [string, string, string][] = [
      ['a.js', 'function go() {\n}\n', 'go 1-2'],
      ['a.tsx', 'export function View() {\n  return <div />;\n}\n', 'View 1-3'],
      ['a.py', 'def go():\n    pass\n', 'go 1-2'],
      ['a.go', 'package a\n\nfunc Go() {\n}\n', 'Go 3-4'],
      ['A.java', 'class A {\n  void go() {\n  }\n}\n', 'go 2-3'],
      ['A.cs', 'class A {\n  public void Go() {\n  }\n}\n', 'Go 2-3'],
      ['a.rs', 'fn go() {\n}\n', 'go 1-2'],
    ];
    for (const [file, source, expected] of cases) {
      expect(await definitions(file, source), file).toContain(expected);
    }
  });

  it('finds the call holding a string, such as a test by its name', async () => {
    const source = [
      "describe('clients', () => {",
      "  it('rejects a duplicate document', () => {",
      '    expect(1).toBe(1);',
      '  });',
      '});',
    ].join('\n');

    const symbols = await readSymbols('test/clients.test.ts', source);
    expect(symbols?.calls('rejects a duplicate document')).toEqual([{ line: 2, endLine: 4 }]);
    expect(symbols?.calls('rejects')).toEqual([]);
  });

  it('answers undefined for a language it does not ship', async () => {
    expect(supports('a.rb')).toBe(false);
    expect(supports('a.TS')).toBe(true);
    expect(await readSymbols('a.rb', 'def go\nend\n')).toBeUndefined();
  });
});
