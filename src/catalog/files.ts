import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

export function toRepoPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
}

export function createGlobMatcher(globs: string[]): (path: string) => boolean {
  if (globs.length === 0) {
    return () => false;
  }
  const isMatch = picomatch(globs);
  return (path) => isMatch(toRepoPath(path));
}

export async function listRepoFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, '', files);
  return files.sort();
}

export async function expandGlobs(root: string, globs: string[]): Promise<string[]> {
  const isMatch = createGlobMatcher(globs);
  return (await listRepoFiles(root)).filter(isMatch);
}

async function walk(root: string, prefix: string, files: string[]): Promise<void> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await walk(root, path, files);
      }
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
}
