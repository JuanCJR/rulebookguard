import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toRepoPath } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import { CONTEXT_FILE_NAME } from '../format/context.ts';
import type { ContextDoc, RuleLanguage } from '../format/types.ts';
import { messages, type Messages } from '../messages.ts';
import { CliError, type CliIo, writeLines } from './io.ts';

const MAX_NUMBER = 999;
const CONTEXT_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const PREFIX = /^[A-Z][A-Z0-9]*$/;

export async function newCommand(
  catalog: Catalog,
  io: CliIo,
  name: string,
  prefix?: string,
): Promise<void> {
  const text = messages(catalog.config.language);
  const context = catalog.contexts.find((item) => item.context === name);
  if (context !== undefined) {
    if (prefix !== undefined && prefix !== context.prefix) {
      throw new CliError(text.prefixMismatch(name, context.prefix, prefix));
    }
    writeLines(io, [await writeNextRule(catalog, context, text)]);
    return;
  }
  const created = await createContext(catalog, name, prefix, text);
  try {
    writeLines(io, [created.file, await writeNextRule(catalog, created, text)]);
  } catch (error) {
    await rm(join(catalog.root, created.file), { force: true });
    throw error;
  }
}

export async function createContext(
  catalog: Catalog,
  name: string,
  option: string | undefined,
  text: Messages,
): Promise<ContextDoc> {
  if (!CONTEXT_NAME.test(name)) {
    throw new CliError(text.invalidContextName(name));
  }
  const prefix =
    option ??
    name
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase();
  if (!PREFIX.test(prefix)) {
    throw new CliError(text.invalidPrefix(prefix));
  }
  const owner = catalog.contexts.find((item) => item.prefix === prefix);
  if (owner !== undefined) {
    throw new CliError(text.prefixTaken(prefix, owner.context));
  }
  const directory = `${toRepoPath(catalog.config.rulesDir).replace(/\/+$/, '')}/${name}`;
  const file = `${directory}/${CONTEXT_FILE_NAME}`;
  await mkdir(join(catalog.root, directory), { recursive: true });
  await writeNew(catalog, file, contextTemplate(name, prefix, text), text);
  return { file, context: name, prefix, summary: '', body: '' };
}

async function writeNextRule(catalog: Catalog, context: ContextDoc, text: Messages) {
  const directory = context.file.slice(0, context.file.lastIndexOf('/'));
  const idPattern = new RegExp(`^R-${context.prefix}-([0-9]{3})$`);
  const fileNames = (await readdir(join(catalog.root, directory)))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -'.md'.length));
  const taken = [...catalog.rules.map((rule) => rule.id), ...fileNames]
    .map((id) => idPattern.exec(id)?.[1])
    .filter((digits) => digits !== undefined)
    .map(Number);
  const last = Math.max(0, ...taken);
  if (last >= MAX_NUMBER) {
    throw new CliError(text.noFreeId(context.context, `R-${context.prefix}-${MAX_NUMBER}`));
  }
  const id = `R-${context.prefix}-${String(last + 1).padStart(3, '0')}`;
  const file = `${directory}/${id}.md`;
  await writeNew(
    catalog,
    file,
    ruleTemplate(id, context.context, catalog.config.language ?? 'en'),
    text,
  );
  return file;
}

async function writeNew(catalog: Catalog, file: string, content: string, text: Messages) {
  try {
    await writeFile(join(catalog.root, file), content, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(text.alreadyExists(file));
    }
    throw error;
  }
}

function contextTemplate(name: string, prefix: string, text: Messages): string {
  return `---
context: ${name}
prefix: ${prefix}
summary: '${text.contextTemplateSummary}'
---

${text.contextTemplateBody}
`;
}

const TEMPLATE_TEXT: Record<
  RuleLanguage,
  { summary: string; title: string; intro: string; scenario: string }
> = {
  en: {
    summary: 'TODO: one-line summary of the rule.',
    title: 'TODO: rule title',
    intro: 'TODO: state the rule in full, then add examples as Gherkin scenarios or tables.',
    scenario: `Scenario: TODO
  Given TODO
  When TODO
  Then TODO`,
  },
  es: {
    summary: 'TODO: resumen de la regla en una línea.',
    title: 'TODO: título de la regla',
    intro: 'TODO: describe la regla completa y agrega ejemplos como escenarios Gherkin o tablas.',
    scenario: `# language: es
Escenario: TODO
  Dado TODO
  Cuando TODO
  Entonces TODO`,
  },
};

function ruleTemplate(id: string, context: string, language: RuleLanguage): string {
  const text = TEMPLATE_TEXT[language];
  return `---
id: ${id}
context: ${context}
entities: []
status: proposed
anchors: []
summary: '${text.summary}'
---

# ${text.title}

${text.intro}

\`\`\`gherkin
${text.scenario}
\`\`\`
`;
}
