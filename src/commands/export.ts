import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Catalog } from '../catalog/load.ts';
import type { RuleDoc } from '../format/types.ts';
import { messages, type Messages } from '../messages.ts';
import { AGENT_FORMATS, exportAgentRules } from './export-agents.ts';
import { CliError, EXIT_USAGE, shownPath, type CliIo, writeLines } from './io.ts';

export const EXPORT_USAGE = 'rulebookguard export <format> [--out <dir>]';

const GHERKIN_BLOCK = /^```gherkin[^\n]*\n([\s\S]*?)^```/gm;
const LANGUAGE_LINE = /^\s*#\s*language:.*$/;

export async function exportCommand(
  catalog: Catalog,
  io: CliIo,
  format: string,
  out: string | undefined,
): Promise<void> {
  if (AGENT_FORMATS.includes(format)) {
    await exportAgentRules(catalog, io, format, out);
    return;
  }
  if (format !== 'gherkin') {
    const supported = ['gherkin', ...AGENT_FORMATS].join(', ');
    throw new CliError(
      `Unknown export format "${format}"; supported: ${supported}.\nUsage: ${EXPORT_USAGE}`,
      EXIT_USAGE,
    );
  }
  const language = catalog.config.language ?? 'en';
  const text = messages(language);
  const outDir = resolve(io.cwd, out ?? 'features/rules');
  const written: string[] = [];
  const rules = catalog.rules
    .filter((rule) => rule.status !== 'deprecated')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const rule of rules) {
    const scenarios = gherkinBlocks(rule.body);
    if (scenarios.length === 0) {
      continue;
    }
    const file = join(outDir, rule.context, `${rule.id}.feature`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, featureFile(rule, scenarios, language === 'es', text));
    written.push(shownPath(io.cwd, file));
  }
  writeLines(io, written.length === 0 ? [text.noGherkinScenarios] : written);
}

function gherkinBlocks(body: string): string[] {
  return [...body.matchAll(GHERKIN_BLOCK)]
    .map((match) =>
      (match[1] ?? '')
        .split('\n')
        .filter((line) => !LANGUAGE_LINE.test(line))
        .join('\n')
        .trim(),
    )
    .filter((block) => block !== '');
}

function featureFile(rule: RuleDoc, scenarios: string[], spanish: boolean, text: Messages): string {
  const indented = scenarios.map((block) =>
    block
      .split('\n')
      .map((line) => (line.trim() === '' ? '' : `  ${line}`))
      .join('\n'),
  );
  return [
    ...(spanish ? ['# language: es'] : []),
    `# ${text.generatedFeature(rule.file)}`,
    `@${rule.id}`,
    `${text.featureKeyword}: ${rule.id} ${rule.summary}`,
    '',
    `${indented.join('\n\n')}\n`,
  ].join('\n');
}
