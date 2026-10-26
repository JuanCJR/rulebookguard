import { fileURLToPath } from 'node:url';
import { runCli as run } from '../../src/commands/run.ts';

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], cwd: string): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const io = {
    cwd,
    stdout: (text: string) => {
      stdout += text;
    },
    stderr: (text: string) => {
      stderr += text;
    },
  };
  try {
    const status = await run(args, io);
    return { status, stdout, stderr };
  } catch (error) {
    return { status: 1, stdout, stderr: `${stderr}${(error as Error).stack ?? String(error)}\n` };
  }
}

export function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
