import { access, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { CONFIG_FILE_NAME, loadConfig } from '../format/config.ts';
import { CONTEXT_FILE_NAME, loadContext } from '../format/context.ts';
import { FormatError, type FormatIssue } from '../format/errors.ts';
import { isRuleId, loadRule } from '../format/rule.ts';
import type {
  ContextDoc,
  ParseOptions,
  RuleDoc,
  RuleLanguage,
  RulebookConfig,
} from '../format/types.ts';
import { messages } from '../messages.ts';
import { toRepoPath } from './files.ts';

export type CatalogIssueCode =
  | 'schema'
  | 'missing-rules-dir'
  | 'missing-context-file'
  | 'context-mismatch'
  | 'id-prefix-mismatch'
  | 'file-name-mismatch'
  | 'duplicate-id';

export interface CatalogIssue extends FormatIssue {
  code: CatalogIssueCode;
}

export interface Catalog {
  root: string;
  config: RulebookConfig;
  contexts: ContextDoc[];
  rules: RuleDoc[];
  invalidRuleIds: string[];
  issues: CatalogIssue[];
}

export async function findRulebookRoot(start: string): Promise<string | undefined> {
  let directory = resolve(start);
  for (;;) {
    if (await exists(join(directory, CONFIG_FILE_NAME))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

export async function loadCatalog(root: string): Promise<Catalog> {
  const config = await loadConfig(join(root, CONFIG_FILE_NAME));
  const catalog: Catalog = {
    root,
    config,
    contexts: [],
    rules: [],
    invalidRuleIds: [],
    issues: [],
  };
  const rulesDir = toRepoPath(config.rulesDir).replace(/\/+$/, '');
  const directories = await listEntries(join(root, rulesDir));
  if (directories === undefined) {
    catalog.issues.push({
      code: 'missing-rules-dir',
      file: rulesDir,
      message: messages(config.language).missingRulesDir,
    });
    return catalog;
  }
  for (const entry of directories.filter((item) => item.isDirectory())) {
    await loadContextDirectory(catalog, `${rulesDir}/${entry.name}`, entry.name);
  }
  catalog.issues.push(...findDuplicateIds(catalog.rules, config.language));
  return catalog;
}

async function loadContextDirectory(catalog: Catalog, dir: string, name: string): Promise<void> {
  const files = ((await listEntries(join(catalog.root, dir))) ?? [])
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);
  let context: ContextDoc | undefined;
  if (files.includes(CONTEXT_FILE_NAME)) {
    context = await load(catalog, `${dir}/${CONTEXT_FILE_NAME}`, loadContext);
    if (context !== undefined) {
      catalog.contexts.push(context);
      checkContextName(catalog, context, name);
    }
  } else {
    catalog.issues.push({
      code: 'missing-context-file',
      file: dir,
      message: messages(catalog.config.language).missingContextFile,
    });
  }
  for (const file of files.filter((item) => item !== CONTEXT_FILE_NAME)) {
    const rule = await load(catalog, `${dir}/${file}`, loadRule);
    const baseName = file.slice(0, -'.md'.length);
    if (rule === undefined && isRuleId(baseName)) {
      catalog.invalidRuleIds.push(baseName);
    }
    if (rule !== undefined) {
      catalog.rules.push(rule);
      checkRule(catalog, rule, name, baseName, context);
    }
  }
}

async function load<T extends { file: string }>(
  catalog: Catalog,
  file: string,
  loader: (path: string, options: ParseOptions) => Promise<T>,
): Promise<T | undefined> {
  try {
    return {
      ...(await loader(join(catalog.root, file), { language: catalog.config.language })),
      file,
    };
  } catch (error) {
    if (!(error instanceof FormatError)) {
      throw error;
    }
    for (const issue of error.issues) {
      catalog.issues.push({ code: 'schema', ...issue, file });
    }
    return undefined;
  }
}

function checkContextName(catalog: Catalog, doc: { file: string; context: string }, name: string) {
  if (doc.context !== name) {
    catalog.issues.push({
      code: 'context-mismatch',
      file: doc.file,
      field: 'context',
      message: messages(catalog.config.language).contextMismatch(name),
    });
  }
}

function checkRule(
  catalog: Catalog,
  rule: RuleDoc,
  directory: string,
  baseName: string,
  context: ContextDoc | undefined,
): void {
  if (rule.id !== baseName) {
    catalog.issues.push({
      code: 'file-name-mismatch',
      file: rule.file,
      field: 'id',
      message: messages(catalog.config.language).fileNameMismatch(baseName),
    });
  }
  if (context !== undefined && !rule.id.startsWith(`R-${context.prefix}-`)) {
    catalog.issues.push({
      code: 'id-prefix-mismatch',
      file: rule.file,
      field: 'id',
      message: messages(catalog.config.language).idPrefixMismatch(context.prefix),
    });
  }
  checkContextName(catalog, rule, directory);
}

function findDuplicateIds(rules: RuleDoc[], language: RuleLanguage | undefined): CatalogIssue[] {
  const firstFile = new Map<string, string>();
  const issues: CatalogIssue[] = [];
  for (const rule of rules) {
    const first = firstFile.get(rule.id);
    if (first === undefined) {
      firstFile.set(rule.id, rule.file);
    } else {
      issues.push({
        code: 'duplicate-id',
        file: rule.file,
        field: 'id',
        message: messages(language).duplicateId(first),
      });
    }
  }
  return issues;
}

async function listEntries(path: string) {
  try {
    return (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function relativeToRoot(root: string, path: string): string {
  return toRepoPath(relative(root, path));
}
