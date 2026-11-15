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

  it('parses the optional kind, entities and relations', () => {
    const context = parseContext(
      [
        '---',
        'context: clients',
        'prefix: CLI',
        'summary: Customers.',
        'kind: domain',
        'entities:',
        '  - name: Client',
        '    description: A person or a company.',
        '    origin: extracted',
        '    evidence: [src/clients/client.ts Client]',
        'relations:',
        '  - from: Client',
        '    to: Order',
        '    label: Requests orders',
        '---',
        '',
      ].join('\n'),
      FILE,
    );

    expect(context.kind).toBe('domain');
    expect(context.entities).toEqual([
      {
        name: 'Client',
        description: 'A person or a company.',
        origin: 'extracted',
        evidence: ['src/clients/client.ts Client'],
      },
    ]);
    expect(context.relations).toEqual([{ from: 'Client', to: 'Order', label: 'Requests orders' }]);
  });

  it('accepts a crosscutting kind and rejects any other', () => {
    const base = '---\ncontext: audit\nprefix: AUD\nsummary: x\n';

    expect(parseContext(`${base}kind: crosscutting\n---\n`, FILE).kind).toBe('crosscutting');
    expect(captureIssues(() => parseContext(`${base}kind: shared\n---\n`, FILE))).toEqual([
      { file: FILE, field: 'kind', message: 'must be one of: domain, crosscutting' },
    ]);
  });

  it('requires a name and a one-line description for each entity', () => {
    const issues = captureIssues(() =>
      parseContext(
        '---\ncontext: clients\nprefix: CLI\nsummary: x\nentities:\n  - description: "a\\nb"\n---\n',
        FILE,
      ),
    );

    expect(issues).toEqual([
      { file: FILE, field: 'entities[0].name', message: 'is required' },
      { file: FILE, field: 'entities[0].description', message: 'must be a single line' },
    ]);
  });

  it('requires from, to and label for each relation', () => {
    const issues = captureIssues(() =>
      parseContext(
        '---\ncontext: clients\nprefix: CLI\nsummary: x\nrelations:\n  - from: Client\n    via: Order\n---\n',
        FILE,
      ),
    );

    expect(issues).toEqual([
      { file: FILE, field: 'relations[0].to', message: 'is required' },
      { file: FILE, field: 'relations[0].label', message: 'is required' },
      { file: FILE, field: 'relations[0].via', message: 'is not allowed' },
    ]);
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
