import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SAFE_CONFIG = ['-c', 'core.fsmonitor=false'];

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...SAFE_CONFIG, ...args], {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
  });
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

export function gitFailureReason(error: unknown): string {
  const { code, stderr, message } = error as {
    code?: unknown;
    stderr?: unknown;
    message?: unknown;
  };
  if (code === 'ENOENT') {
    return 'git was not found';
  }
  const lines = `${typeof stderr === 'string' ? stderr : ''}\n${String(message ?? error)}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('warning:'));
  return lines[0] ?? 'git failed';
}

export function isNotARepository(error: unknown): boolean {
  const { stderr } = error as { stderr?: unknown };
  return typeof stderr === 'string' && stderr.includes('not a git repository');
}
