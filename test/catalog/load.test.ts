import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { FormatError, findRulebookRoot, loadCatalog } from '../../src/index.ts';
import { scratchDir } from '../scratch.ts';
import { fixtureRoot } from './helpers.ts';

describe('loadCatalog', () => {
  it('loads every context and rule with repo-relative paths', async () => {
    const catalog = await loadCatalog(fixtureRoot('repo'));

    expect(catalog.root).toBe(fixtureRoot('repo'));
    expect(catalog.config.rulesDir).toBe('docs/rules');
    expect(catalog.issues).toEqual([]);
    expect(
      catalog.contexts.map(({ context, prefix, file }) => ({ context, prefix, file })),
    ).toEqual([
      { context: 'billing', prefix: 'BIL', file: 'docs/rules/billing/_context.md' },
      { context: 'clients', prefix: 'CLI', file: 'docs/rules/clients/_context.md' },
    ]);
    expect(catalog.rules.map(({ id, status, file }) => ({ id, status, file }))).toEqual([
      { id: 'R-BIL-001', status: 'active', file: 'docs/rules/billing/R-BIL-001.md' },
      { id: 'R-BIL-002', status: 'active', file: 'docs/rules/billing/R-BIL-002.md' },
      { id: 'R-CLI-001', status: 'active', file: 'docs/rules/clients/R-CLI-001.md' },
      { id: 'R-CLI-002', status: 'proposed', file: 'docs/rules/clients/R-CLI-002.md' },
      { id: 'R-CLI-003', status: 'deprecated', file: 'docs/rules/clients/R-CLI-003.md' },
    ]);
    expect(catalog.rules[0]?.body).toBe(
      '# Zero-balance account\n\nCreating a client opens a billing account with balance 0.\n',
    );
  });

  it('returns cross-file catalog problems as structured issues', async () => {
    const catalog = await loadCatalog(fixtureRoot('catalog-issues'));

    expect(catalog.issues).toEqual([
      { code: 'missing-context-file', file: 'rules/orphan', message: 'has no _context.md' },
      {
        code: 'file-name-mismatch',
        file: 'rules/sales/R-SAL-002.md',
        field: 'id',
        message: 'must match the file name "R-SAL-002"',
      },
      {
        code: 'schema',
        file: 'rules/sales/R-SAL-003.md',
        field: 'entities',
        message: 'is required',
      },
      {
        code: 'id-prefix-mismatch',
        file: 'rules/sales/R-STK-001.md',
        field: 'id',
        message: 'must use the context prefix "SAL"',
      },
      {
        code: 'context-mismatch',
        file: 'rules/stock/_context.md',
        field: 'context',
        message: 'must match its directory name "stock"',
      },
      {
        code: 'context-mismatch',
        file: 'rules/stock/R-STK-001.md',
        field: 'context',
        message: 'must match its directory name "stock"',
      },
      {
        code: 'duplicate-id',
        file: 'rules/sales/R-SAL-002.md',
        field: 'id',
        message: 'duplicates the id of rules/sales/R-SAL-001.md',
      },
      {
        code: 'duplicate-id',
        file: 'rules/stock/R-STK-001.md',
        field: 'id',
        message: 'duplicates the id of rules/sales/R-STK-001.md',
      },
    ]);
    expect(catalog.rules.map((rule) => rule.file)).toEqual([
      'rules/orphan/R-ORP-001.md',
      'rules/sales/R-SAL-001.md',
      'rules/sales/R-SAL-002.md',
      'rules/sales/R-STK-001.md',
      'rules/stock/R-STK-001.md',
    ]);
  });

  it('reports a missing rules directory as an issue', async () => {
    const root = await scratchDir();
    await writeFile(join(root, 'rulebookguard.config.yaml'), 'schema: 1\ntestGlobs: []\n');

    const catalog = await loadCatalog(root);

    expect(catalog.config.rulesDir).toBe('docs/rules');
    expect(catalog.contexts).toEqual([]);
    expect(catalog.rules).toEqual([]);
    expect(catalog.issues).toEqual([
      { code: 'missing-rules-dir', file: 'docs/rules', message: 'directory does not exist' },
    ]);
  });

  it('throws a FormatError when the config is missing', async () => {
    const root = await scratchDir();

    await expect(loadCatalog(root)).rejects.toBeInstanceOf(FormatError);
  });
});

describe('findRulebookRoot', () => {
  it('finds the nearest directory holding the config', async () => {
    const root = fixtureRoot('repo');

    expect(await findRulebookRoot(join(root, 'src/clients/legacy'))).toBe(root);
    expect(await findRulebookRoot(root)).toBe(root);
  });

  it('returns undefined when no config exists up the tree', async () => {
    const dir = await scratchDir();

    expect(await findRulebookRoot(dir)).toBeUndefined();
  });
});
