import { describe, expect, it } from 'vite-plus/test';
import { findRuleRegions, findRuleTags } from '../../src/index.ts';

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

describe('findRuleRegions', () => {
  it('pairs each @rule with its @endrule', () => {
    const source = ['// @rule R-CLI-001', 'it()', '// @endrule R-CLI-001'].join('\n');

    expect(findRuleRegions(source)).toEqual({
      regions: [{ id: 'R-CLI-001', line: 1, endLine: 3 }],
      problems: [],
    });
  });

  it('allows nested regions that are properly paired', () => {
    const source = [
      '# @rule R-CLI-001',
      '# @rule R-CLI-002',
      '# @endrule R-CLI-002',
      '# @endrule R-CLI-001',
    ].join('\n');

    expect(findRuleRegions(source).regions).toEqual([
      { id: 'R-CLI-002', line: 2, endLine: 3 },
      { id: 'R-CLI-001', line: 1, endLine: 4 },
    ]);
  });

  it('allows a region on a single line', () => {
    expect(findRuleRegions('// @rule R-CLI-001 x @endrule R-CLI-001')).toEqual({
      regions: [{ id: 'R-CLI-001', line: 1, endLine: 1 }],
      problems: [],
    });
  });

  it('reports a @rule without its @endrule', () => {
    expect(findRuleRegions('// @rule R-CLI-001\nit()')).toEqual({
      regions: [],
      problems: [{ code: 'unclosed-rule-tag', id: 'R-CLI-001', line: 1 }],
    });
  });

  it('reports an @endrule without an open @rule of the same id', () => {
    expect(findRuleRegions('// @endrule R-CLI-001')).toEqual({
      regions: [],
      problems: [{ code: 'unmatched-endrule-tag', id: 'R-CLI-001', line: 1 }],
    });
  });

  it('reports the inner rule of crossed markers as unclosed', () => {
    const source = [
      '// @rule R-CLI-001',
      '// @rule R-CLI-002',
      '// @endrule R-CLI-001',
      '// @endrule R-CLI-002',
    ].join('\n');

    expect(findRuleRegions(source)).toEqual({
      regions: [{ id: 'R-CLI-001', line: 1, endLine: 3 }],
      problems: [
        { code: 'unclosed-rule-tag', id: 'R-CLI-002', line: 2 },
        { code: 'unmatched-endrule-tag', id: 'R-CLI-002', line: 4 },
      ],
    });
  });

  it('matches @endrule with the same boundaries as @rule', () => {
    expect(
      findRuleRegions('// @rule R-CLI-001\n// x@endrule R-CLI-001 @endrules R-CLI-001').problems,
    ).toEqual([{ code: 'unclosed-rule-tag', id: 'R-CLI-001', line: 1 }]);
  });

  it('does not count @endrule as a @rule tag', () => {
    expect(findRuleTags('// @endrule R-CLI-001')).toEqual([]);
  });
});
