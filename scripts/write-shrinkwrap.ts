// Writes npm-shrinkwrap.json at the repository root for the release workflow, so that
// `npx rulebookguard@<version>` installs the production tree the test suite ran against
// (pnpm-lock.yaml) instead of whatever the dependency ranges resolve to that day.
// Run from the repository root: node scripts/write-shrinkwrap.ts

import { execSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

type PnpmLock = {
  importers: Record<string, { dependencies?: Record<string, { version: string }> }>;
  snapshots: Record<
    string,
    {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }
  >;
};

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  [field: string]: unknown;
};

type NpmLock = { packages: Record<string, { version?: string }> };

const NODE_MODULES = 'node_modules/';

/** The name and version of every package in the production tree of pnpm-lock.yaml. */
export function testedVersions(lock: PnpmLock): Map<string, string> {
  const versions = new Map<string, string>();
  const visited = new Set<string>();

  const visit = (name: string, resolution: string): void => {
    const key = `${name}@${resolution}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    const version = resolution.split('(')[0] ?? resolution;
    if (version.includes('@')) {
      throw new Error(
        `${name} is an alias of ${resolution} in pnpm-lock.yaml, which the shrinkwrap cannot pin`,
      );
    }
    const known = versions.get(name);
    if (known !== undefined && known !== version) {
      throw new Error(`${name} resolves to ${known} and ${version} in pnpm-lock.yaml`);
    }
    versions.set(name, version);

    const snapshot = lock.snapshots[key];
    if (snapshot === undefined) {
      throw new Error(`${key} is not in the snapshots of pnpm-lock.yaml`);
    }
    const dependencies = { ...snapshot.dependencies, ...snapshot.optionalDependencies };
    for (const [dependency, dependencyResolution] of Object.entries(dependencies)) {
      visit(dependency, dependencyResolution);
    }
  };

  const direct = lock.importers['.']?.dependencies ?? {};
  for (const [name, { version }] of Object.entries(direct)) {
    visit(name, version);
  }
  return versions;
}

/** The manifest npm resolves from: only production dependencies, each at its tested version. */
export function scratchManifest(manifest: Manifest, versions: Map<string, string>): Manifest {
  const { devDependencies: _dev, ...production } = manifest;
  const direct = new Set(Object.keys(manifest.dependencies ?? {}));
  const pinned = (names: (name: string) => boolean): Record<string, string> =>
    Object.fromEntries([...versions].filter(([name]) => names(name)));

  return {
    ...production,
    // npm refuses an override of a direct dependency, so those are pinned in place.
    dependencies: pinned((name) => direct.has(name)),
    overrides: pinned((name) => !direct.has(name)),
  };
}

/** Fails unless the lock holds exactly the tested versions, so nothing untested gets published. */
export function assertLockMatches(lock: NpmLock, versions: Map<string, string>): void {
  const locked = new Set<string>();

  for (const [path, { version }] of Object.entries(lock.packages)) {
    if (path === '') {
      continue;
    }
    const name = path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
    const tested = versions.get(name);
    if (tested === undefined) {
      throw new Error(`npm locked ${name}@${version}, but the tests ran no version of it`);
    }
    if (tested !== version) {
      throw new Error(`npm locked ${name}@${version}, but the tests ran ${tested}`);
    }
    locked.add(name);
  }

  for (const [name, version] of versions) {
    if (!locked.has(name)) {
      throw new Error(`npm did not lock ${name}@${version}`);
    }
  }
}

function writeShrinkwrap(): void {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;
  const versions = testedVersions(parse(readFileSync('pnpm-lock.yaml', 'utf8')) as PnpmLock);

  // Resolved away from the repository: npm would otherwise start from pnpm's node_modules.
  const scratch = mkdtempSync(join(tmpdir(), 'rulebookguard-shrinkwrap-'));
  try {
    writeFileSync(
      join(scratch, 'package.json'),
      JSON.stringify(scratchManifest(manifest, versions), null, 2),
    );
    const npm = (args: string): void => {
      execSync(`npm ${args}`, { cwd: scratch, stdio: 'inherit' });
    };
    npm('install --package-lock-only --ignore-scripts --no-audit --no-fund');
    npm('shrinkwrap');

    const lockPath = join(scratch, 'npm-shrinkwrap.json');
    assertLockMatches(JSON.parse(readFileSync(lockPath, 'utf8')) as NpmLock, versions);
    copyFileSync(lockPath, 'npm-shrinkwrap.json');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeShrinkwrap();
}
