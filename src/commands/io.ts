import { findRulebookRoot, loadCatalog, type Catalog } from '../catalog/load.ts';
import type { GitFallbackListener } from '../catalog/files.ts';
import { CONFIG_FILE_NAME } from '../format/config.ts';
import type { RuleDoc, RuleLanguage } from '../format/types.ts';
import { messages } from '../messages.ts';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin?: () => Promise<string>;
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
    io.stderr(`${messages(catalog.config.language).catalogWarning(count)}\n`);
  }
  return catalog;
}

export function findRule(catalog: Catalog, id: string): RuleDoc {
  const rule = catalog.rules.find((item) => item.id === id);
  if (rule === undefined) {
    throw new CliError(messages(catalog.config.language).unknownRule(id));
  }
  return rule;
}

export function writeJson(io: CliIo, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeLines(io: CliIo, lines: string[]): void {
  io.stdout(lines.map((line) => `${line}\n`).join(''));
}

export function gitFallbackWarning(io: CliIo, language?: RuleLanguage): GitFallbackListener {
  const text = messages(language);
  let warned = false;
  // lint lists files twice (tags and anchors); warn once per submodule.
  const skipped = new Set<string>();
  return (reason, submodule) => {
    if (submodule !== undefined) {
      if (!skipped.has(submodule)) {
        skipped.add(submodule);
        io.stderr(`${text.submoduleSkipped(submodule, reason)}\n`);
      }
      return;
    }
    if (!warned) {
      warned = true;
      io.stderr(`${text.gitFallback(reason)}\n`);
    }
  };
}
