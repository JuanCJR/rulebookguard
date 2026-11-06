import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { toRepoPath } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import { isRuleId } from '../format/rule.ts';
import type { RuleDoc } from '../format/types.ts';
import { messages, type Messages } from '../messages.ts';
import { CliError, shownPath, type CliIo, writeLines } from './io.ts';

interface RuleFileTarget {
  dir: string;
  extension: string;
  frontmatter: (patterns: string[]) => string[];
}

// Each tool reads its own frontmatter: Cursor and Copilot take one comma-separated string, Kiro a
// string or a list. See the steering, rules and instructions pages of their documentation.
const RULE_FILE_TARGETS: Record<string, RuleFileTarget> = {
  cursor: {
    dir: '.cursor/rules',
    extension: '.mdc',
    frontmatter: (patterns) => [`globs: ${patterns.join(', ')}`, 'alwaysApply: false'],
  },
  copilot: {
    dir: '.github/instructions',
    extension: '.instructions.md',
    frontmatter: (patterns) => [`applyTo: ${JSON.stringify(patterns.join(','))}`],
  },
  kiro: {
    dir: '.kiro/steering',
    extension: '.md',
    frontmatter: (patterns) => [
      'inclusion: fileMatch',
      `fileMatchPattern: ${JSON.stringify(patterns.length === 1 ? patterns[0] : patterns)}`,
    ],
  },
};

const AGENTS_MD_FORMAT = 'agents-md';
const AGENTS_MD_FILE = 'AGENTS.md';
const BLOCK_START = '<!-- rulebookguard:start -->';
const BLOCK_END = '<!-- rulebookguard:end -->';
const RULE_FILE_PREFIX = 'rulebookguard-';

export const AGENT_FORMATS = [...Object.keys(RULE_FILE_TARGETS), AGENTS_MD_FORMAT];

export async function exportAgentRules(
  catalog: Catalog,
  io: CliIo,
  format: string,
  out: string | undefined,
): Promise<void> {
  const rules = catalog.rules
    .filter((rule) => rule.status === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const target = RULE_FILE_TARGETS[format];
  const outDir = (dir: string): string =>
    out === undefined ? join(catalog.root, dir) : resolve(io.cwd, out);
  writeLines(
    io,
    target === undefined
      ? await writeAgentsMd(catalog, io, rules, outDir('.'))
      : await writeRuleFiles(catalog, io, rules, format, target, outDir(target.dir)),
  );
}

// These tools attach a file by path, so a rule without anchors has nothing to attach it to.
function anchoredRules(rules: RuleDoc[], io: CliIo, text: Messages): RuleDoc[] {
  const unanchored = rules.filter((rule) => rule.anchors.length === 0);
  if (unanchored.length > 0) {
    io.stderr(unanchored.map((rule) => `${text.unanchoredRuleSkipped(rule.id)}\n`).join(''));
  }
  return rules.filter((rule) => rule.anchors.length > 0);
}

async function writeRuleFiles(
  catalog: Catalog,
  io: CliIo,
  active: RuleDoc[],
  format: string,
  target: RuleFileTarget,
  dir: string,
): Promise<string[]> {
  const text = messages(catalog.config.language);
  const rules = anchoredRules(active, io, text);
  const nothing = active.length === 0 ? text.noActiveRules : text.noAnchoredRules;
  const lines: string[] = rules.length === 0 ? [nothing] : [];
  const current = new Set<string>();
  for (const rule of rules) {
    const name = `${RULE_FILE_PREFIX}${rule.id}${target.extension}`;
    current.add(name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), ruleFile(rule, format, target, text));
    lines.push(toRepoPath(shownPath(io.cwd, join(dir, name))));
  }
  for (const name of await staleRuleFiles(dir, format, target, current)) {
    await rm(join(dir, name));
    lines.push(text.removedExport(toRepoPath(shownPath(io.cwd, join(dir, name)))));
  }
  return lines;
}

function ruleFile(rule: RuleDoc, format: string, target: RuleFileTarget, text: Messages): string {
  return [
    '---',
    ...target.frontmatter(patternsOf(rule)),
    '---',
    '',
    `<!-- ${text.generatedRule(format, rule.file)} -->`,
    '',
    `**${rule.id}:** ${rule.summary}`,
    '',
    `${normalizedBody(rule)}\n`,
  ].join('\n');
}

// A rule that left the active set would keep steering the agent, so its file goes. Only files this
// command wrote qualify: the exact name of a rule id and the generated line of the same format.
async function staleRuleFiles(
  dir: string,
  format: string,
  target: RuleFileTarget,
  current: Set<string>,
): Promise<string[]> {
  const stale: string[] = [];
  for (const name of await listNames(dir)) {
    if (
      !current.has(name) &&
      name.startsWith(RULE_FILE_PREFIX) &&
      name.endsWith(target.extension) &&
      isRuleId(name.slice(RULE_FILE_PREFIX.length, -target.extension.length)) &&
      hasGeneratedLine(await readFile(join(dir, name), 'utf8'), format)
    ) {
      stale.push(name);
    }
  }
  return stale.sort();
}

// The generated line sits right after the frontmatter, as ruleFile writes it, in any language.
function hasGeneratedLine(content: string, format: string): boolean {
  const lines = content.split(/\r?\n/);
  const closing = lines.indexOf('---', 1);
  const line = lines[closing + 2] ?? '';
  return (
    lines[0] === '---' &&
    closing !== -1 &&
    lines[closing + 1] === '' &&
    line.startsWith('<!-- ') &&
    line.includes(` "rulebookguard export ${format}" `) &&
    line.endsWith(' -->')
  );
}

async function listNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeAgentsMd(
  catalog: Catalog,
  io: CliIo,
  rules: RuleDoc[],
  dir: string,
): Promise<string[]> {
  const text = messages(catalog.config.language);
  const file = join(dir, AGENTS_MD_FILE);
  const shown = toRepoPath(shownPath(io.cwd, file));
  const existing = await readOptional(file);
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  const starts = existing.split(BLOCK_START).length - 1;
  const ends = existing.split(BLOCK_END).length - 1;
  // Replacing the first of several blocks would leave stale rules in a file agents always read.
  if (starts !== ends || starts > 1 || end < start) {
    throw new CliError(text.invalidAgentsMdMarkers(shown, BLOCK_START, BLOCK_END));
  }
  const hasBlock = starts === 1;
  if (rules.length === 0 && !hasBlock) {
    return [text.noActiveRules];
  }
  const before = hasBlock ? existing.slice(0, start) : existing;
  const after = hasBlock ? existing.slice(end + BLOCK_END.length) : '';
  await mkdir(dir, { recursive: true });
  await writeFile(
    file,
    rules.length === 0
      ? withoutBlock(before, after)
      : withBlock(before, after, agentsBlock(rules, text), hasBlock),
  );
  return rules.length === 0 ? [text.noActiveRules, shown] : [shown];
}

function withBlock(before: string, after: string, block: string, hasBlock: boolean): string {
  if (hasBlock) {
    return `${before}${block}${after}`;
  }
  return before.trim() === '' ? `${block}\n` : `${before.trimEnd()}\n\n${block}\n`;
}

function withoutBlock(before: string, after: string): string {
  const joined = `${before}${after.replace(/^(?:\r?\n)+/, '')}`;
  return joined.trim() === '' ? '' : `${joined.trimEnd()}\n`;
}

// AGENTS.md has no path scoping and is always read, so it holds an index and not the rule texts.
function agentsBlock(rules: RuleDoc[], text: Messages): string {
  return [
    BLOCK_START,
    `<!-- ${text.generatedAgentsMd} -->`,
    `## ${text.agentsMdHeading}`,
    '',
    text.agentsMdIntro,
    '',
    ...rules.map((rule) => {
      const anchors =
        rule.anchors.map((anchor) => `\`${toRepoPath(anchor)}\``).join(', ') ||
        text.agentsMdNoAnchors;
      return `- \`${rule.id}\` (${anchors}): ${rule.summary} ${text.agentsMdSeeFile(rule.file)}`;
    }),
    BLOCK_END,
  ].join('\n');
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function patternsOf(rule: RuleDoc): string[] {
  return [...new Set(rule.anchors.flatMap((anchor) => expandBraces(toRepoPath(anchor))))];
}

// Braces go first: a comma inside one would split the pattern in the comma-separated formats.
function expandBraces(glob: string): string[] {
  const match = /\{([^{}]*,[^{}]*)\}/.exec(glob);
  if (match === null) {
    return [glob];
  }
  const head = glob.slice(0, match.index);
  const tail = glob.slice(match.index + match[0].length);
  return (match[1] ?? '').split(',').flatMap((option) => expandBraces(`${head}${option}${tail}`));
}

// A checkout with CRLF files must not change what gets committed from another system.
function normalizedBody(rule: RuleDoc): string {
  return rule.body.replaceAll('\r\n', '\n').trim();
}
