import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { USAGE } from '../src/commands/run.ts';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const repoFixture = fileURLToPath(new URL('fixtures/repo', import.meta.url));

// Node without type stripping cannot run src/cli.ts; process.features.typescript
// is false (not absent) when stripping is disabled, so check its value.
const cannotRunTypeScript = !(process.features as { typescript?: unknown }).typescript;

function cli(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

describe('rulebookguard cli', () => {
  it.skipIf(cannotRunTypeScript)('prints usage and exits 0', () => {
    const result = cli([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: rulebookguard <command>');
    expect(result.stderr).toBe('');
  });

  it.skipIf(cannotRunTypeScript)('prints a domain error on stderr and exits 1', () => {
    const result = cli(['show', 'R-NOPE-001'], repoFixture);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Unknown rule id "R-NOPE-001". Run "rulebookguard list" to list them.\n',
    );
  });

  it.skipIf(cannotRunTypeScript)('prints a usage error on stderr and exits 2', () => {
    const result = cli(['bogus'], repoFixture);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Unknown command "bogus".\n${USAGE}`);
  });
});
