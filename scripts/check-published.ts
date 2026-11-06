// Checks, after the release workflow publishes, what only the real registry can prove: that
// it flagged the shrinkwrap, and that installing the package from it yields the locked versions.
// Run from the repository root: node scripts/check-published.ts

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

type NpmLock = { packages: Record<string, { version?: string }> };

const ATTEMPTS = 10;
const ATTEMPT_DELAY_MS = 30_000;

/** Fails unless every package of the lock is installed at its locked version. */
export function assertInstalledMatches(
  lock: NpmLock,
  installedVersion: (path: string) => string | undefined,
): void {
  for (const [path, { version }] of Object.entries(lock.packages)) {
    if (path === '') {
      continue;
    }
    const installed = installedVersion(path);
    if (installed === undefined) {
      throw new Error(`${path} is not installed, but the shrinkwrap locks ${version}`);
    }
    if (installed !== version) {
      throw new Error(`${path} is ${installed}, but the shrinkwrap locks ${version}`);
    }
  }
}

async function checkPublished(): Promise<void> {
  const { name, version } = JSON.parse(readFileSync('package.json', 'utf8')) as {
    name: string;
    version: string;
  };
  const spec = `${name}@${version}`;
  const failure = (reason: string): Error =>
    new Error(`${spec} is published, but ${reason}. Its dependencies may not be locked.`);

  // A version just published can take a while to reach the registry's metadata.
  let flag = '';
  for (let attempt = 1; attempt <= ATTEMPTS && flag !== 'true'; attempt += 1) {
    if (attempt > 1) {
      await sleep(ATTEMPT_DELAY_MS);
    }
    try {
      flag = execSync(`npm view ${spec} _hasShrinkwrap`, { encoding: 'utf8' }).trim();
    } catch {
      flag = '';
    }
  }
  if (flag !== 'true') {
    throw failure(`the registry reports _hasShrinkwrap "${flag}" instead of "true"`);
  }

  const scratch = mkdtempSync(join(tmpdir(), 'rulebookguard-published-'));
  try {
    writeFileSync(join(scratch, 'package.json'), '{"private":true}');
    execSync(`npm install ${spec} --ignore-scripts --no-audit --no-fund`, {
      cwd: scratch,
      stdio: 'inherit',
    });

    const root = join(scratch, 'node_modules', name);
    const lock = JSON.parse(readFileSync(join(root, 'npm-shrinkwrap.json'), 'utf8')) as NpmLock;
    assertInstalledMatches(lock, (path) => {
      const manifest = join(root, path, 'package.json');
      return existsSync(manifest)
        ? (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version
        : undefined;
    });
  } catch (error) {
    throw failure((error as Error).message);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkPublished();
}
