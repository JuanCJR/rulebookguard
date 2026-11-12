import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { parse } from 'yaml';
import pkg from '../../package.json' with { type: 'json' };
import { assertInstalledMatches } from '../../scripts/check-published.ts';
import {
  assertLockMatches,
  scratchManifest,
  testedVersions,
} from '../../scripts/write-shrinkwrap.ts';

/** The rulebookguard packages an npx command installs, as written in it. */
function npxPackages(command: string): string[] {
  const words = command.trim().split(/\s+/).slice(1);
  const installed = words.includes('-p')
    ? words.filter((_, index) => words[index - 1] === '-p')
    : words.filter((word) => !word.startsWith('-')).slice(0, 1);

  return installed.filter((word) =>
    /^(rulebookguard|@rulebookguard\/(?:site|symbols))(@|$)/.test(word),
  );
}

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

  it('refuses an aliased dependency, naming the package behind it', () => {
    const aliased = {
      ...lockfile,
      snapshots: {
        ...lockfile.snapshots,
        'other@2.0.0': { dependencies: { renamed: '@scope/real@4.0.0(peer@3.0.0)' } },
      },
    };

    expect(() => testedVersions(aliased)).toThrow(
      'renamed is an alias of @scope/real@4.0.0(peer@3.0.0) in pnpm-lock.yaml, which the shrinkwrap cannot pin',
    );
  });

  it('accepts the real lockfile, so a package at two versions fails before a release tag', () => {
    const lock = parse(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'));

    expect([...testedVersions(lock).keys()]).toEqual(
      expect.arrayContaining(Object.keys(pkg.dependencies)),
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
  it.each(['README.md', 'README.es.md'])(
    'pins every npx command in %s to the current version',
    (file) => {
      const readme = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      const packages = (readme.match(/npx\s[^`\n]*/g) ?? []).flatMap(npxPackages);
      const expected = new Set([
        `rulebookguard@${pkg.version}`,
        `@rulebookguard/site@${pkg.version}`,
        `@rulebookguard/symbols@${pkg.version}`,
        // The Claude Code plugin section describes the launcher, which fills in its own version.
        'rulebookguard@<plugin',
      ]);

      expect(packages.length).toBeGreaterThan(0);
      expect(packages.filter((name) => !expected.has(name))).toEqual([]);
    },
  );

  it.each([
    'npx rulebookguard lint',
    'npx --yes rulebookguard lint',
    'npx -y rulebookguard lint',
    'npx  rulebookguard lint',
    'npx rulebookguard@latest lint',
    'npx rulebookguard@0.10 lint',
    'npx -p rulebookguard -p @rulebookguard/site rulebookguard site:run',
  ])('reads the unpinned package of %s', (command) => {
    expect(npxPackages(command).some((name) => !name.endsWith(`@${pkg.version}`))).toBe(true);
  });

  it('does not mistake the binary after -p for a package', () => {
    const command =
      'npx -p rulebookguard@1.0.0 -p @rulebookguard/site@1.0.0 rulebookguard site:run';

    expect(npxPackages(command)).toEqual(['rulebookguard@1.0.0', '@rulebookguard/site@1.0.0']);
  });
});

describe('assertInstalledMatches', () => {
  const lock = {
    packages: {
      '': {},
      'node_modules/direct': { version: '1.0.0' },
      'node_modules/direct/node_modules/nested': { version: '2.0.0' },
    },
  };
  const installed = (versions: Record<string, string>) => (path: string) => versions[path];

  it('accepts an install holding every locked version', () => {
    const versions = installed({
      'node_modules/direct': '1.0.0',
      'node_modules/direct/node_modules/nested': '2.0.0',
    });

    expect(() => assertInstalledMatches(lock, versions)).not.toThrow();
  });

  it('refuses an install at another version', () => {
    const versions = installed({
      'node_modules/direct': '1.1.0',
      'node_modules/direct/node_modules/nested': '2.0.0',
    });

    expect(() => assertInstalledMatches(lock, versions)).toThrow(
      'node_modules/direct is 1.1.0, but the shrinkwrap locks 1.0.0',
    );
  });

  it('refuses an install that did not nest a locked package', () => {
    const versions = installed({ 'node_modules/direct': '1.0.0' });

    expect(() => assertInstalledMatches(lock, versions)).toThrow(
      'node_modules/direct/node_modules/nested is not installed, but the shrinkwrap locks 2.0.0',
    );
  });
});

describe('package manifest', () => {
  it('publishes the shrinkwrap, which npm leaves out when files does not list it', () => {
    expect(pkg.files).toContain('npm-shrinkwrap.json');
  });
});
