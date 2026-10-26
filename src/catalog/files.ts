import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { gitFailureReason, gitPaths, isNotARepository } from './git.ts';

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

export type GitFallbackListener = (reason: string) => void;

export async function listRepoFiles(
  root: string,
  onGitFallback?: GitFallbackListener,
): Promise<string[]> {
  const files = (await listGitFiles(root, onGitFallback)) ?? (await walkFiles(root));
  return files.sort();
}

export async function expandGlobs(
  root: string,
  globs: string[],
  onGitFallback?: GitFallbackListener,
): Promise<string[]> {
  const isMatch = createGlobMatcher(globs);
  return (await listRepoFiles(root, onGitFallback)).filter(isMatch);
}

async function listGitFiles(
  root: string,
  onGitFallback: GitFallbackListener | undefined,
): Promise<string[] | undefined> {
  try {
    const listed = await gitPaths(root, 'ls-files', ['--cached', '--others', '--exclude-standard']);
    const deleted = new Set(await gitPaths(root, 'ls-files', ['--deleted']));
    return [...new Set(listed)].filter((file) => !deleted.has(file));
  } catch (error) {
    if (!isNotARepository(error)) {
      onGitFallback?.(gitFailureReason(error));
    }
    return undefined;
  }
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
