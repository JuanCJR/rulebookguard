import { describe, expect, it } from 'vite-plus/test';
import { findRuleTags } from '../../src/index.ts';

describe('findRuleTags', () => {
  it('finds tags in line comments of any language', () => {
    const source = [
      '// @rule R-CLI-001',
      '# @rule R-CLI-002',
      '-- @rule R-CLI-003',
      '/* @rule R-CLI-004 */',
      ' * @rule R-CLI-005',
    ].join('\n');

    expect(findRuleTags(source)).toEqual([
      { id: 'R-CLI-001', line: 1 },
      { id: 'R-CLI-002', line: 2 },
      { id: 'R-CLI-003', line: 3 },
      { id: 'R-CLI-004', line: 4 },
      { id: 'R-CLI-005', line: 5 },
    ]);
  });

  it('finds tags outside comments, such as in a test name or a string', () => {
    const source = [
      "it('rejects a duplicate @rule R-CLI-001', () => {});",
      'const note = "@rule R-CLI-002";',
    ].join('\n');

    expect(findRuleTags(source)).toEqual([
      { id: 'R-CLI-001', line: 1 },
      { id: 'R-CLI-002', line: 2 },
    ]);
  });

  it('finds several tags on one line', () => {
    expect(findRuleTags('// @rule R-CLI-001 @rule R-OPS-010')).toEqual([
      { id: 'R-CLI-001', line: 1 },
      { id: 'R-OPS-010', line: 1 },
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(findRuleTags('x\r\n// @rule R-CLI-001\r\n')).toEqual([{ id: 'R-CLI-001', line: 2 }]);
  });

  it('ignores ids that do not have the R-<PREFIX>-<NNN> shape', () => {
    expect(findRuleTags('// @rule R-CLI-1\n// @rule R-CLI-0012\n// @rule cli-001')).toEqual([]);
  });

  it('ignores @rule inside a longer word or email address', () => {
    expect(findRuleTags('// mail ops@rule R-CLI-001 or @rules R-CLI-002')).toEqual([]);
  });

  it('allows trailing punctuation after the id', () => {
    expect(findRuleTags('// see @rule R-CLI-001.')).toEqual([{ id: 'R-CLI-001', line: 1 }]);
  });
});
