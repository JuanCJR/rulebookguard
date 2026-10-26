import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vite-plus/test';

export async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rulebookguard-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
