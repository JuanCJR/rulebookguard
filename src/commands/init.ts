import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { loadCatalog } from '../catalog/load.ts';
import { CONFIG_FILE_NAME } from '../format/config.ts';
import type { RuleLanguage } from '../format/types.ts';
import { messages } from '../messages.ts';
import { CliError, type CliIo, writeLines } from './io.ts';
import { createContext } from './new.ts';

export const WORKFLOW_FILE = '.github/workflows/rulebookguard.yml';

const TEST_GLOBS = ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go'];

export interface InitOptions {
  prefix: string | undefined;
  language: RuleLanguage | undefined;
  ci: boolean;
}

export async function initCommand(io: CliIo, name: string, options: InitOptions): Promise<void> {
  const root = io.cwd;
  const text = messages(options.language);
  const files = options.ci ? [CONFIG_FILE_NAME, WORKFLOW_FILE] : [CONFIG_FILE_NAME];
  for (const file of files) {
    if (await exists(join(root, file))) {
      throw new CliError(text.alreadyExists(file));
    }
  }
  const written: string[] = [];
  try {
    await writeNew(root, CONFIG_FILE_NAME, configTemplate(options.language), written);
    const context = await createContext(await loadCatalog(root), name, options.prefix, text);
    written.push(context.file);
    if (options.ci) {
      await writeNew(root, WORKFLOW_FILE, WORKFLOW, written);
    }
  } catch (error) {
    await Promise.all(written.map((file) => rm(join(root, file), { force: true })));
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(text.alreadyExists(written.at(-1) ?? CONFIG_FILE_NAME));
    }
    throw error;
  }
  writeLines(io, written);
}

async function writeNew(root: string, file: string, content: string, written: string[]) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), content, { flag: 'wx' });
  written.push(file);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function configTemplate(language: RuleLanguage | undefined): string {
  const globs = TEST_GLOBS.map((glob) => `  - '${glob}'\n`).join('');
  const languageLine = language === undefined ? '' : `language: ${language}\n`;
  return `schema: 1\nrulesDir: docs/rules\ntestGlobs:\n${globs}${languageLine}`;
}

const WORKFLOW = `name: rules
on: pull_request

jobs:
  rulebookguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npx --yes rulebookguard@${pkg.version} lint --base origin/\${{ github.base_ref }}
`;
