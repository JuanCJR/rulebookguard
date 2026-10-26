import { findRulebookRoot, loadCatalog, type Catalog } from '../catalog/load.ts';
import { CONFIG_FILE_NAME } from '../format/config.ts';
import type { RuleDoc } from '../format/types.ts';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_FAILURE) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export async function requireRulebookRoot(io: CliIo): Promise<string> {
  const root = await findRulebookRoot(io.cwd);
  if (root === undefined) {
    throw new CliError(`${CONFIG_FILE_NAME} not found in ${io.cwd} or any parent directory.`);
  }
  return root;
}

export async function openCatalog(io: CliIo): Promise<Catalog> {
  const catalog = await loadCatalog(await requireRulebookRoot(io));
  const count = catalog.issues.length;
  if (count > 0) {
    io.stderr(
      `warning: the catalog has ${count} ${count === 1 ? 'issue' : 'issues'}; run "rulebookguard lint" for details.\n`,
    );
  }
  return catalog;
}

export function findRule(catalog: Catalog, id: string): RuleDoc {
  const rule = catalog.rules.find((item) => item.id === id);
  if (rule === undefined) {
    throw new CliError(`Unknown rule id "${id}". Run "rulebookguard list" to list them.`);
  }
  return rule;
}

export function writeJson(io: CliIo, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeLines(io: CliIo, lines: string[]): void {
  io.stdout(lines.map((line) => `${line}\n`).join(''));
}

export function gitFallbackWarning(io: CliIo): (reason: string) => void {
  let warned = false;
  return (reason) => {
    if (!warned) {
      warned = true;
      io.stderr(`warning: git could not list files (${reason}); walking the directory instead.\n`);
    }
  };
}
