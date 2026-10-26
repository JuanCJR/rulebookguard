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
  // runCli maps CliError and FormatError to a status itself; anything else it
  // rethrows is a crash, so it propagates and fails the test instead of
  // looking like an ordinary exit status 1.
  const status = await run(args, io);
  return { status, stdout, stderr };
}

export function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
