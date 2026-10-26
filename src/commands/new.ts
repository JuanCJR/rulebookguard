import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog } from '../catalog/load.ts';
import type { RuleLanguage } from '../format/types.ts';
import { CliError, type CliIo, writeLines } from './io.ts';

const MAX_NUMBER = 999;

export async function newCommand(catalog: Catalog, io: CliIo, name: string): Promise<void> {
  const context = catalog.contexts.find((item) => item.context === name);
  if (context === undefined) {
    throw new CliError(`Unknown context "${name}". Run "rulebookguard contexts" to list them.`);
  }
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
    throw new CliError(
      `No free rule id left in context "${name}" (R-${context.prefix}-${MAX_NUMBER} is taken).`,
    );
  }
  const id = `R-${context.prefix}-${String(last + 1).padStart(3, '0')}`;
  const file = `${directory}/${id}.md`;
  try {
    await writeFile(
      join(catalog.root, file),
      template(id, context.context, catalog.config.language ?? 'en'),
      { flag: 'wx' },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(`${file} already exists; nothing was written.`);
    }
    throw error;
  }
  writeLines(io, [file]);
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

function template(id: string, context: string, language: RuleLanguage): string {
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
