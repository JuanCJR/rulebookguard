import { describe, expect, it } from 'vite-plus/test';
import { isRuleId, loadRule, parseRule } from '../../src/index.ts';
import { captureIssues, captureIssuesAsync, fixture } from './helpers.ts';

const FILE = 'docs/rules/clients/R-CLI-001.md';

function rule(frontmatter: string, body = 'Rule text.\n'): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

const VALID = [
  'id: R-CLI-001',
  'context: clients',
  'entities: [Client]',
  'status: active',
  'anchors: ["src/clients/**"]',
  'summary: Document numbers are unique.',
];

function withField(name: string, line: string | undefined): string {
  const lines = VALID.filter((entry) => !entry.startsWith(`${name}:`));
  return line === undefined ? lines.join('\n') : [...lines, line].join('\n');
}

describe('parseRule', () => {
  it('parses frontmatter and the Markdown body', () => {
    const parsed = parseRule(rule(VALID.join('\n'), '# Title\n\n| a | b |\n'), FILE);

    expect(parsed).toEqual({
      file: FILE,
      id: 'R-CLI-001',
      context: 'clients',
      entities: ['Client'],
      status: 'active',
      anchors: ['src/clients/**'],
      summary: 'Document numbers are unique.',
      body: '# Title\n\n| a | b |\n',
    });
  });

  it('accepts an optional supersedes rule id', () => {
    const parsed = parseRule(rule(withField('supersedes', 'supersedes: R-CLI-000')), FILE);

    expect(parsed.supersedes).toBe('R-CLI-000');
  });

  it('accepts CRLF line endings', () => {
    const parsed = parseRule(rule(VALID.join('\n')).replaceAll('\n', '\r\n'), FILE);

    expect(parsed.id).toBe('R-CLI-001');
    expect(parsed.body).toBe('Rule text.\r\n');
  });

  it.each(['id', 'context', 'entities', 'status', 'anchors', 'summary'])('requires %s', (field) => {
    const issues = captureIssues(() => parseRule(rule(withField(field, undefined)), FILE));

    expect(issues).toEqual([{ file: FILE, field, message: 'is required' }]);
  });

  it.each(['R-CLI-1', 'R-cli-001', 'CLI-001', 'R-CLI-0001', 'R--001'])(
    'rejects the id %s',
    (id) => {
      const issues = captureIssues(() => parseRule(rule(withField('id', `id: ${id}`)), FILE));

      expect(issues).toEqual([
        { file: FILE, field: 'id', message: 'must match pattern "^R-[A-Z][A-Z0-9]*-[0-9]{3}$"' },
      ]);
    },
  );

  it('rejects a malformed supersedes id', () => {
    const issues = captureIssues(() =>
      parseRule(rule(withField('supersedes', 'supersedes: CLI-1')), FILE),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['supersedes']);
  });

  it.each(['proposed', 'active', 'deprecated'])('accepts status %s', (status) => {
    expect(parseRule(rule(withField('status', `status: ${status}`)), FILE).status).toBe(status);
  });

  it('rejects an unknown status', () => {
    const issues = captureIssues(() =>
      parseRule(rule(withField('status', 'status: enabled')), FILE),
    );

    expect(issues).toEqual([
      { file: FILE, field: 'status', message: 'must be one of: proposed, active, deprecated' },
    ]);
  });

  it('requires entities and anchors to be lists of strings', () => {
    const issues = captureIssues(() =>
      parseRule(
        rule(withField('entities', 'entities: Client').replace(/anchors:.*/, 'anchors: [1]')),
        FILE,
      ),
    );

    expect(issues).toEqual([
      { file: FILE, field: 'entities', message: 'must be array' },
      { file: FILE, field: 'anchors[0]', message: 'must be string' },
    ]);
  });

  it('requires a one-line summary', () => {
    const issues = captureIssues(() =>
      parseRule(rule(withField('summary', 'summary: |\n  line one\n  line two')), FILE),
    );

    expect(issues).toEqual([{ file: FILE, field: 'summary', message: 'must be a single line' }]);
  });

  it('rejects unknown frontmatter fields', () => {
    const issues = captureIssues(() => parseRule(rule(withField('tests', 'tests: [a]')), FILE));

    expect(issues).toEqual([{ file: FILE, field: 'tests', message: 'is not allowed' }]);
  });

  it('requires YAML frontmatter', () => {
    const issues = captureIssues(() => parseRule('# Just markdown\n', FILE));

    expect(issues).toEqual([
      { file: FILE, message: 'missing YAML frontmatter delimited by "---" lines' },
    ]);
  });

  it('requires a closing frontmatter delimiter', () => {
    const issues = captureIssues(() => parseRule('---\nid: R-CLI-001\n', FILE));

    expect(issues).toEqual([{ file: FILE, message: 'frontmatter is not closed by a "---" line' }]);
  });

  it('requires the frontmatter to be a mapping', () => {
    const issues = captureIssues(() => parseRule('---\n- a\n---\n', FILE));

    expect(issues).toEqual([{ file: FILE, message: 'must be object' }]);
  });

  it('reports YAML syntax errors in the frontmatter', () => {
    const issues = captureIssues(() => parseRule('---\nid: [R\n---\n', FILE));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/^invalid YAML/);
  });
});

describe('isRuleId', () => {
  it('accepts R-<PREFIX>-<NNN>', () => {
    expect(isRuleId('R-CLI-001')).toBe(true);
    expect(isRuleId('R-OPS2-120')).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isRuleId('R-CLI-01')).toBe(false);
    expect(isRuleId('R-CLI-001 ')).toBe(false);
  });
});

describe('loadRule', () => {
  it('reads a rule file with a Gherkin example', async () => {
    const path = fixture('catalog/clients/R-CLI-001.md');
    const loaded = await loadRule(path);

    expect(loaded.file).toBe(path);
    expect(loaded.id).toBe('R-CLI-001');
    expect(loaded.body).toContain('Scenario: duplicate document');
  });

  it('reports every issue of an invalid rule file with its path', async () => {
    const path = fixture('invalid/R-CLI-002.md');
    const issues = await captureIssuesAsync(() => loadRule(path));

    expect(issues).toEqual([
      { file: path, field: 'id', message: 'must match pattern "^R-[A-Z][A-Z0-9]*-[0-9]{3}$"' },
      { file: path, field: 'status', message: 'must be one of: proposed, active, deprecated' },
    ]);
  });

  it('reports a missing file with its path', async () => {
    const path = fixture('missing.md');
    const issues = await captureIssuesAsync(() => loadRule(path));

    expect(issues).toEqual([{ file: path, message: 'cannot read file (ENOENT)' }]);
  });
});
