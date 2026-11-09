import { describe, expect, it } from 'vite-plus/test';
import { findDefinitionLine, findTextLine, parseEvidence } from '../../src/format/evidence.ts';

describe('parseEvidence', () => {
  it('reads a path alone', () => {
    expect(parseEvidence('src/clients/create.ts')).toEqual({
      entry: 'src/clients/create.ts',
      file: 'src/clients/create.ts',
    });
  });

  it('reads a path and a symbol, splitting members on ".", "::" and "#"', () => {
    expect(parseEvidence('src/clients/create.ts validateDocument').symbol).toEqual({
      kind: 'name',
      parts: ['validateDocument'],
    });
    expect(parseEvidence('src/clients.ts Clients.create').symbol).toEqual({
      kind: 'name',
      parts: ['Clients', 'create'],
    });
    expect(parseEvidence('src/lib.rs Account::open').symbol).toEqual({
      kind: 'name',
      parts: ['Account', 'open'],
    });
    expect(parseEvidence('src/Account.java Account#open').symbol).toEqual({
      kind: 'name',
      parts: ['Account', 'open'],
    });
  });

  it('reads a quoted test name as text', () => {
    expect(parseEvidence('test/create.test.ts "rejects a duplicate document"').symbol).toEqual({
      kind: 'text',
      text: 'rejects a duplicate document',
    });
  });

  it('reads a line or a line range after the path', () => {
    expect(parseEvidence('src/billing/invoice.go:7')).toEqual({
      entry: 'src/billing/invoice.go:7',
      file: 'src/billing/invoice.go',
      lines: { line: 7, endLine: 7 },
    });
    expect(parseEvidence('src/billing/invoice.go:7-12').lines).toEqual({ line: 7, endLine: 12 });
  });

  it('normalizes the path like other repository paths', () => {
    expect(parseEvidence('./src\\clients\\create.ts check').file).toBe('src/clients/create.ts');
  });
});

describe('findDefinitionLine', () => {
  const lines = (...text: string[]): string[] => text;

  it('finds definitions introduced by a keyword in several languages', () => {
    expect(
      findDefinitionLine(lines('import x', 'export function validate(a) {', '}'), 'validate'),
    ).toBe(2);
    expect(findDefinitionLine(lines('class A:', '    def validate(self):'), 'validate')).toBe(2);
    expect(findDefinitionLine(lines('package a', 'func Validate() {}'), 'Validate')).toBe(2);
    expect(findDefinitionLine(lines('func (c *Client) Validate() error {'), 'Validate')).toBe(1);
    expect(findDefinitionLine(lines('pub fn validate() {}'), 'validate')).toBe(1);
    expect(findDefinitionLine(lines('export const LIMIT = 3;'), 'LIMIT')).toBe(1);
  });

  it('prefers a keyword definition over a call that comes first', () => {
    expect(
      findDefinitionLine(lines('  validate(input)', 'function validate(input) {', '}'), 'validate'),
    ).toBe(2);
  });

  it('finds methods, assignments and keys', () => {
    expect(
      findDefinitionLine(
        lines('class A {', '  public async create(input: X): Y {', '  }'),
        'create',
      ),
    ).toBe(2);
    expect(findDefinitionLine(lines('MAX_ATTEMPTS = 3'), 'MAX_ATTEMPTS')).toBe(1);
    expect(findDefinitionLine(lines('{', '  "contextBudget": {', '}'), 'contextBudget')).toBe(2);
    expect(findDefinitionLine(lines('limits:', '  maxItems: 3'), 'maxItems')).toBe(2);
  });

  it('ignores comment lines, longer names and calls ending in a semicolon', () => {
    expect(findDefinitionLine(lines('// function validate() {}'), 'validate')).toBeUndefined();
    expect(findDefinitionLine(lines('function validateAll() {}'), 'validate')).toBeUndefined();
    expect(findDefinitionLine(lines('  validate(input);'), 'validate')).toBeUndefined();
  });

  it('starts after a given line', () => {
    expect(
      findDefinitionLine(
        lines('function create() {}', 'class B {', '  create() {', '  }', '}'),
        'create',
        2,
      ),
    ).toBe(3);
  });
});

describe('findTextLine', () => {
  it('finds the line holding the text inside quotes of any kind', () => {
    const source = ['describe("x", () => {', "  it('rejects a duplicate', () => {});", '});'];
    expect(findTextLine(source, 'rejects a duplicate')).toBe(2);
    expect(findTextLine(['test(`rejects a duplicate`)'], 'rejects a duplicate')).toBe(1);
    expect(findTextLine(source, 'rejects')).toBeUndefined();
  });
});
