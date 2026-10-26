import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('rulebookguard cli', () => {
  it.skipIf(!('typescript' in process.features))('prints usage and exits 0', () => {
    const result = spawnSync(process.execPath, [cliPath], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: rulebookguard <command>');
    expect(result.stderr).toBe('');
  });
});
