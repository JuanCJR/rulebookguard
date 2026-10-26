import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import picomatch from 'picomatch';

const execFileAsync = promisify(execFile);

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
  const files = (await listGitFiles(root)) ?? (await walkFiles(root));
  return files.sort();
}

export async function expandGlobs(root: string, globs: string[]): Promise<string[]> {
  const isMatch = createGlobMatcher(globs);
  return (await listRepoFiles(root)).filter(isMatch);
}

async function listGitFiles(root: string): Promise<string[] | undefined> {
  try {
    const listed = await gitLsFiles(root, ['--cached', '--others', '--exclude-standard']);
    const deleted = new Set(await gitLsFiles(root, ['--deleted']));
    return [...new Set(listed)].filter((file) => !deleted.has(file));
  } catch {
    return undefined;
  }
}

async function gitLsFiles(root: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z', ...args], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout.split('\0').filter((file) => file !== '');
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, '', files);
  return files;
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
