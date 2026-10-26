import { access, lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
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

/**
 * Called when git cannot list files. Without `submodule`, the whole listing falls back to a
 * directory walk; with `submodule` (a repo-relative path), only that submodule was skipped.
 */
export type GitFallbackListener = (reason: string, submodule?: string) => void;

interface ListScope {
  realRoot: string;
  prefix: string;
  onGitFallback: GitFallbackListener | undefined;
}

export async function listRepoFiles(
  root: string,
  onGitFallback?: GitFallbackListener,
): Promise<string[]> {
  const scope = { realRoot: await realpath(root), prefix: '', onGitFallback };
  const files = (await listGitFiles(root, scope)) ?? (await walkFiles(root));
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

async function listGitFiles(root: string, scope: ListScope): Promise<string[] | undefined> {
  let listing: { files: string[]; gitlinks: string[] } | undefined;
  try {
    listing = await listGitIndex(root);
  } catch (error) {
    if (isNotARepository(error)) {
      return undefined;
    }
    if (scope.prefix !== '') {
      throw error;
    }
    scope.onGitFallback?.(gitFailureReason(error));
    return undefined;
  }
  if (listing === undefined) {
    return undefined;
  }
  const { files, gitlinks } = listing;
  for (const gitlink of gitlinks) {
    const nested = await listSubmoduleFiles(root, gitlink, scope);
    files.push(...nested.map((file) => `${gitlink}/${file}`));
  }
  return files;
}

async function listGitIndex(
  root: string,
): Promise<{ files: string[]; gitlinks: string[] } | undefined> {
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
  return { files, gitlinks: [...gitlinks] };
}

// A failure inside one submodule skips only that submodule, never the superproject listing.
async function listSubmoduleFiles(
  root: string,
  gitlink: string,
  scope: ListScope,
): Promise<string[]> {
  const dir = join(root, gitlink);
  const path = `${scope.prefix}${gitlink}`;
  try {
    if (!(await isContainedEntry(dir, scope.realRoot))) {
      return [];
    }
    if (!(await exists(join(dir, '.git')))) {
      return await walkFiles(dir);
    }
    return (await listGitFiles(dir, { ...scope, prefix: `${path}/` })) ?? (await walkFiles(dir));
  } catch (error) {
    scope.onGitFallback?.(gitFailureReason(error), path);
    return [];
  }
}

// A gitlink path comes from the index, so a crafted repository can put a symlink there, or under
// a symlinked parent; only entries that are no symlink and resolve inside the root are listed.
async function isContainedEntry(path: string, realRoot: string): Promise<boolean> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      return false;
    }
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  const fromRoot = relative(realRoot, await realpath(path));
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
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

// Dirent types come from lstat, so symlinks (to files or directories) are never followed.
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
