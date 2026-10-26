import { describe, expect, it } from 'vite-plus/test';
import { loadContext, parseContext } from '../../src/index.ts';
import { captureIssues, captureIssuesAsync, fixture } from './helpers.ts';

const FILE = 'docs/rules/clients/_context.md';

describe('parseContext', () => {
  it('parses frontmatter and body', () => {
    const context = parseContext(
      '---\ncontext: clients\nprefix: CLI\nsummary: Customers.\n---\n\nWhat clients are.\n',
      FILE,
    );

    expect(context).toEqual({
      file: FILE,
      context: 'clients',
      prefix: 'CLI',
      summary: 'Customers.',
      body: 'What clients are.\n',
    });
  });

  it('requires context, prefix and summary', () => {
    const issues = captureIssues(() => parseContext('---\nother: 1\n---\n', FILE));

    expect(issues.map((issue) => issue.field)).toEqual(['context', 'prefix', 'summary', 'other']);
  });

  it('requires an uppercase alphanumeric prefix', () => {
    const issues = captureIssues(() =>
      parseContext('---\ncontext: clients\nprefix: cli\nsummary: x\n---\n', FILE),
    );

    expect(issues).toEqual([
      { file: FILE, field: 'prefix', message: 'must match pattern "^[A-Z][A-Z0-9]*$"' },
    ]);
  });
});

describe('loadContext', () => {
  it('reads a context file', async () => {
    const path = fixture('catalog/clients/_context.md');
    const context = await loadContext(path);

    expect(context.file).toBe(path);
    expect(context.prefix).toBe('CLI');
    expect(context.body).toBe('The clients context owns customer identity and contact data.\n');
  });

  it('reports invalid context files with their path', async () => {
    const path = fixture('invalid/_context.md');
    const issues = await captureIssuesAsync(() => loadContext(path));

    expect(issues).toEqual([
      { file: path, field: 'summary', message: 'is required' },
      { file: path, field: 'prefix', message: 'must match pattern "^[A-Z][A-Z0-9]*$"' },
    ]);
  });
});
