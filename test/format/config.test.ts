import { describe, expect, it } from 'vite-plus/test';
import { FormatError, loadConfig, parseConfig } from '../../src/index.ts';
import { captureIssues, captureIssuesAsync, fixture } from './helpers.ts';

const FILE = 'rulebookguard.config.yaml';

describe('parseConfig', () => {
  it('parses a complete config', () => {
    const config = parseConfig(
      'schema: 1\nrulesDir: rules\ntestGlobs: ["test/**/*.ts"]\ncontextBudget: 10\n',
      FILE,
    );

    expect(config).toEqual({
      schema: 1,
      rulesDir: 'rules',
      testGlobs: ['test/**/*.ts'],
      contextBudget: 10,
    });
  });

  it('defaults rulesDir to docs/rules and contextBudget to 30', () => {
    const config = parseConfig('schema: 1\ntestGlobs: ["test/**/*.ts"]\n', FILE);

    expect(config.rulesDir).toBe('docs/rules');
    expect(config.contextBudget).toBe(30);
  });

  it('requires schema version 1', () => {
    const issues = captureIssues(() => parseConfig('schema: 2\ntestGlobs: []\n', FILE));

    expect(issues).toEqual([{ file: FILE, field: 'schema', message: 'must be equal to 1' }]);
  });

  it('requires schema and testGlobs', () => {
    const issues = captureIssues(() => parseConfig('rulesDir: rules\n', FILE));

    expect(issues.map((issue) => issue.field)).toEqual(['schema', 'testGlobs']);
    expect(issues[0]?.message).toBe('is required');
  });

  it('requires testGlobs to be a list of strings', () => {
    const issues = captureIssues(() => parseConfig('schema: 1\ntestGlobs: [1]\n', FILE));

    expect(issues).toEqual([{ file: FILE, field: 'testGlobs[0]', message: 'must be string' }]);
  });

  it('requires contextBudget to be a positive integer', () => {
    const issues = captureIssues(() =>
      parseConfig('schema: 1\ntestGlobs: []\ncontextBudget: 0\n', FILE),
    );

    expect(issues).toEqual([{ file: FILE, field: 'contextBudget', message: 'must be >= 1' }]);
  });

  it('rejects unknown fields', () => {
    const issues = captureIssues(() =>
      parseConfig('schema: 1\ntestGlobs: []\nrulesdir: x\n', FILE),
    );

    expect(issues).toEqual([{ file: FILE, field: 'rulesdir', message: 'is not allowed' }]);
  });

  it('reports YAML syntax errors with the file name', () => {
    const issues = captureIssues(() => parseConfig('schema: [1\n', FILE));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe(FILE);
    expect(issues[0]?.field).toBeUndefined();
    expect(issues[0]?.message).toMatch(/^invalid YAML/);
  });

  it('names the file and field in the error message', () => {
    expect(() => parseConfig('schema: 2\ntestGlobs: []\n', FILE)).toThrow(
      new FormatError([{ file: FILE, field: 'schema', message: 'must be equal to 1' }]),
    );
    expect(() => parseConfig('schema: 2\ntestGlobs: []\n', FILE)).toThrow(
      'rulebookguard.config.yaml: field "schema" must be equal to 1',
    );
  });
});

describe('loadConfig', () => {
  it('reads and parses a config file', async () => {
    const config = await loadConfig(fixture('rulebookguard.config.yaml'));

    expect(config).toEqual({
      schema: 1,
      rulesDir: 'docs/rules',
      testGlobs: ['src/**/*.test.ts'],
      contextBudget: 25,
    });
  });

  it('reports every issue of an invalid config file with its path', async () => {
    const path = fixture('invalid/rulebookguard.config.yaml');
    const issues = await captureIssuesAsync(() => loadConfig(path));

    expect(issues).toEqual([
      { file: path, field: 'schema', message: 'must be equal to 1' },
      { file: path, field: 'testGlobs', message: 'must be array' },
    ]);
  });
});
