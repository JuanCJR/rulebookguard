import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { gitFailureReason, gitPaths, isNotARepository } from './git.ts';

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);
const GITLINK_MODE = '160000';

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
    const staged = (await gitPaths(root, 'ls-files', ['--stage'])).map(parseStageEntry);
    const others = await gitPaths(root, 'ls-files', ['--others', '--exclude-standard']);
    const deleted = new Set(await gitPaths(root, 'ls-files', ['--deleted']));
    const gitlinks = new Set(
      staged.filter(({ mode }) => mode === GITLINK_MODE).map(({ path }) => path),
    );
    const files = [...new Set([...staged.map(({ path }) => path), ...others])].filter(
      (file) => !deleted.has(file) && !gitlinks.has(file),
    );
    if (files.length === 0 && gitlinks.size === 0) {
      return undefined;
    }
    for (const gitlink of gitlinks) {
      const nested = await listSubmoduleFiles(join(root, gitlink), onGitFallback);
      files.push(...nested.map((file) => `${gitlink}/${file}`));
    }
    return files;
  } catch (error) {
    if (!isNotARepository(error)) {
      onGitFallback?.(gitFailureReason(error));
    }
    return undefined;
  }
}

async function listSubmoduleFiles(
  dir: string,
  onGitFallback: GitFallbackListener | undefined,
): Promise<string[]> {
  if (!(await exists(join(dir, '.git')))) {
    return (await exists(dir)) ? walkFiles(dir) : [];
  }
  return (await listGitFiles(dir, onGitFallback)) ?? (await walkFiles(dir));
}

function parseStageEntry(entry: string): { mode: string; path: string } {
  const tab = entry.indexOf('\t');
  return { mode: entry.slice(0, entry.indexOf(' ')), path: entry.slice(tab + 1) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
