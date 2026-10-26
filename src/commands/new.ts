import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog } from '../catalog/load.ts';
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
    await writeFile(join(catalog.root, file), template(id, context.context), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CliError(`${file} already exists; nothing was written.`);
    }
    throw error;
  }
  writeLines(io, [file]);
}

function template(id: string, context: string): string {
  return `---
id: ${id}
context: ${context}
entities: []
status: proposed
anchors: []
summary: 'TODO: one-line summary of the rule.'
---

# TODO: rule title

TODO: state the rule in full, then add examples as Gherkin scenarios or tables.

\`\`\`gherkin
Scenario: TODO
  Given TODO
  When TODO
  Then TODO
\`\`\`
`;
}
