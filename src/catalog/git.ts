import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

export async function gitPaths(cwd: string, command: string, args: string[]): Promise<string[]> {
  return (await runGit(cwd, [command, '-z', ...args])).split('\0').filter((path) => path !== '');
}

export async function isInsideWorkTree(cwd: string): Promise<boolean> {
  try {
    return (await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true';
  } catch {
    return false;
  }
}

export async function isCommitRef(cwd: string, ref: string): Promise<boolean> {
  if (ref.startsWith('-')) {
    return false;
  }
  try {
    await runGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function changedSince(cwd: string, ref: string): Promise<string[]> {
  const changed = await gitPaths(cwd, 'diff', ['--name-only', '--relative', ref, '--']);
  const untracked = await gitPaths(cwd, 'ls-files', ['--others', '--exclude-standard']);
  return [...new Set([...changed, ...untracked])].sort();
}
