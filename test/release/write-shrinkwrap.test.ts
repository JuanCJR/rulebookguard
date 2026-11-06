import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import pkg from '../../package.json' with { type: 'json' };
import {
  assertLockMatches,
  scratchManifest,
  testedVersions,
} from '../../scripts/write-shrinkwrap.ts';

const lockfile = {
  importers: {
    '.': {
      dependencies: {
        direct: { version: '1.0.0(peer@3.0.0)' },
        other: { version: '2.0.0' },
      },
      devDependencies: { devonly: { version: '9.0.0' } },
    },
  },
  snapshots: {
    'direct@1.0.0(peer@3.0.0)': {
      dependencies: { transitive: '4.0.0', peer: '3.0.0' },
      optionalDependencies: { optional: '5.0.0' },
    },
    'other@2.0.0': { dependencies: { transitive: '4.0.0' } },
    'transitive@4.0.0': {},
    'peer@3.0.0': {},
    'optional@5.0.0': {},
    'devonly@9.0.0': {},
  },
};

describe('testedVersions', () => {
  it('collects the production tree of the lockfile, without peer suffixes or dev dependencies', () => {
    expect(Object.fromEntries(testedVersions(lockfile))).toEqual({
      direct: '1.0.0',
      other: '2.0.0',
      transitive: '4.0.0',
      peer: '3.0.0',
      optional: '5.0.0',
    });
  });

  it('refuses a package resolved to two versions, which one override cannot pin', () => {
    const conflicting = {
      ...lockfile,
      snapshots: {
        ...lockfile.snapshots,
        'other@2.0.0': { dependencies: { transitive: '4.1.0' } },
        'transitive@4.1.0': {},
      },
    };

    expect(() => testedVersions(conflicting)).toThrow(
      'transitive resolves to 4.0.0 and 4.1.0 in pnpm-lock.yaml',
    );
  });

  it('refuses a dependency missing from the snapshots', () => {
    const incomplete = { ...lockfile, snapshots: {} };

    expect(() => testedVersions(incomplete)).toThrow(
      'direct@1.0.0(peer@3.0.0) is not in the snapshots of pnpm-lock.yaml',
    );
  });
});

describe('scratchManifest', () => {
  it('drops dev dependencies, pins direct dependencies and overrides the transitive ones', () => {
    const manifest = {
      name: 'tool',
      version: '1.2.3',
      dependencies: { direct: '^1.0.0' },
      devDependencies: { devonly: 'workspace:*' },
    };
    const versions = new Map([
      ['direct', '1.0.0'],
      ['transitive', '4.0.0'],
    ]);

    expect(scratchManifest(manifest, versions)).toEqual({
      name: 'tool',
      version: '1.2.3',
      dependencies: { direct: '1.0.0' },
      overrides: { transitive: '4.0.0' },
    });
  });
});

describe('assertLockMatches', () => {
  const versions = new Map([['direct', '1.0.0']]);
  const packages = (entries: Record<string, { version: string }>) => ({
    packages: { '': {}, ...entries },
  });

  it('accepts a lock holding exactly the tested versions', () => {
    const lock = packages({ 'node_modules/direct': { version: '1.0.0' } });

    expect(() => assertLockMatches(lock, versions)).not.toThrow();
  });

  it('refuses a package at a version the tests did not run', () => {
    const lock = packages({ 'node_modules/direct': { version: '1.1.0' } });

    expect(() => assertLockMatches(lock, versions)).toThrow(
      'npm locked direct@1.1.0, but the tests ran 1.0.0',
    );
  });

  it('refuses a package the tests did not run', () => {
    const lock = packages({
      'node_modules/direct': { version: '1.0.0' },
      'node_modules/extra': { version: '1.0.0' },
    });

    expect(() => assertLockMatches(lock, versions)).toThrow(
      'npm locked extra@1.0.0, but the tests ran no version of it',
    );
  });

  it('refuses a tested package missing from the lock', () => {
    expect(() => assertLockMatches(packages({}), versions)).toThrow(
      'npm did not lock direct@1.0.0',
    );
  });
});

describe('README', () => {
  it('pins every command to the current version', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    const pins = [...readme.matchAll(/npx (?:--yes )?rulebookguard@(\d+\.\d+\.\d+)/g)];

    expect(pins.length).toBeGreaterThan(0);
    expect(pins.map(([, version]) => version).filter((version) => version !== pkg.version)).toEqual(
      [],
    );
  });
});

describe('package manifest', () => {
  it('publishes the shrinkwrap, which npm leaves out when files does not list it', () => {
    expect(pkg.files).toContain('npm-shrinkwrap.json');
  });
});
