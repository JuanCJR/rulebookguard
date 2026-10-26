import { describe, expect, it } from 'vite-plus/test';
import { expandGlobs, loadCatalog, rulesForPath, scanTestTags } from '../../src/index.ts';
import { fixtureRoot } from './helpers.ts';

const root = fixtureRoot('repo');

describe('rulesForPath', () => {
  it('returns every rule whose anchors match the path, any status, sorted by id', async () => {
    const { rules } = await loadCatalog(root);

    expect(rulesForPath(rules, 'src/clients/create.go').map((rule) => rule.id)).toEqual([
      'R-BIL-001',
      'R-CLI-001',
      'R-CLI-002',
    ]);
    expect(rulesForPath(rules, 'src/clients/legacy/import.go').map((rule) => rule.id)).toEqual([
      'R-CLI-001',
      'R-CLI-003',
    ]);
  });

  it('normalizes ./ prefixes and backslashes', async () => {
    const { rules } = await loadCatalog(root);

    expect(rulesForPath(rules, './src\\billing\\tax.go').map((rule) => rule.id)).toEqual([
      'R-BIL-001',
    ]);
  });

  it('matches paths that do not exist yet', async () => {
    const { rules } = await loadCatalog(root);

    expect(rulesForPath(rules, 'src/billing/new/file.go').map((rule) => rule.id)).toEqual([
      'R-BIL-001',
    ]);
  });

  it('returns nothing for unanchored paths', async () => {
    const { rules } = await loadCatalog(root);

    expect(rulesForPath(rules, 'README.md')).toEqual([]);
  });
});

describe('expandGlobs', () => {
  it('lists repo files matching the globs, sorted', async () => {
    expect(await expandGlobs(root, ['src/billing/**', 'src/clients/*.go'])).toEqual([
      'src/billing/invoice.go',
      'src/billing/tax.go',
      'src/clients/create.go',
      'src/clients/update.go',
    ]);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await expandGlobs(root, ['lib/**'])).toEqual([]);
  });
});

describe('scanTestTags', () => {
  it('maps each rule id to the tagging test locations', async () => {
    const tags = await scanTestTags(root, ['tests/**/*_test.go', 'tests/**/test_*.py']);

    expect(Object.fromEntries(tags)).toEqual({
      'R-BIL-001': [
        { file: 'tests/billing/invoice_test.go', line: 3 },
        { file: 'tests/clients/test_create.py', line: 6 },
      ],
      'R-CLI-001': [
        { file: 'tests/clients/test_create.py', line: 1 },
        { file: 'tests/clients/test_create.py', line: 6 },
      ],
    });
  });

  it('returns an empty index when no test glob is configured', async () => {
    expect((await scanTestTags(root, [])).size).toBe(0);
  });
});
