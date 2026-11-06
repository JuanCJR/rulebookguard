import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { toRepoPath } from '../catalog/files.ts';
import type { Catalog } from '../catalog/load.ts';
import { splitFrontmatter } from '../format/frontmatter.ts';
import { messages, type Messages } from '../messages.ts';
import { handWrittenFiles, RULE_FILE_PREFIX } from './export-agents.ts';
import { CliError, shownPath, type CliIo, writeLines } from './io.ts';

export const KIRO_AGENTS_FORMAT = 'kiro-agents';

const AGENTS_DIR = '.kiro/agents';
const AGENT_NAMES = ['rule-author', 'rule-miner'];
const WRITING_GUIDE = 'skills/rule-writing/SKILL.md';
const KIRO_TOOLS = ['read', 'write', 'shell', '@rulebookguard'];

// The plugin agents run inside Claude Code; a Kiro agent gets neither its skills nor its launcher.
const PRELOADED_GUIDE = 'the preloaded `rulebookguard:rule-writing` skill says';
const INLINE_GUIDE = 'the writing guide at the end of these instructions says';
const LAUNCHER_NEW =
  '`rulebookguard.mjs new <context>` (on PATH while the plugin is enabled; if the command is not found, `npx rulebookguard new <context>`)';

export async function exportKiroAgents(
  catalog: Catalog,
  io: CliIo,
  out: string | undefined,
): Promise<void> {
  const text = messages(catalog.config.language);
  const dir = out === undefined ? join(catalog.root, AGENTS_DIR) : resolve(io.cwd, out);
  const fileName = (name: string): string => `${RULE_FILE_PREFIX}${name}.md`;
  const handWritten = await handWrittenFiles(dir, KIRO_AGENTS_FORMAT, AGENT_NAMES.map(fileName));
  if (handWritten.length > 0) {
    throw new CliError(
      handWritten
        .map((name) =>
          text.handWrittenExport(
            toRepoPath(shownPath(io.cwd, join(dir, name))),
            KIRO_AGENTS_FORMAT,
          ),
        )
        .join('\n'),
    );
  }
  const { version } = JSON.parse(await readPluginFile('plugin.json')) as { version: string };
  const guide = bodyOf(await readPluginFile(WRITING_GUIDE), WRITING_GUIDE);
  const lines: string[] = [];
  await mkdir(dir, { recursive: true });
  for (const name of AGENT_NAMES) {
    const file = join(dir, fileName(name));
    await writeFile(file, await kiroAgent(name, guide, version, text));
    lines.push(toRepoPath(shownPath(io.cwd, file)));
  }
  writeLines(io, lines);
}

async function kiroAgent(
  name: string,
  guide: string,
  version: string,
  text: Messages,
): Promise<string> {
  const source = `agents/${name}.md`;
  const { data, body } = splitFrontmatter(await readPluginFile(source), source);
  const { description } = data as { description: string };
  const instructions = normalized(body)
    .replaceAll(PRELOADED_GUIDE, INLINE_GUIDE)
    .replaceAll(LAUNCHER_NEW, `\`npx --yes rulebookguard@${version} new <context>\``);
  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    `tools: ${JSON.stringify(KIRO_TOOLS)}`,
    'mcpServers:',
    '  rulebookguard:',
    '    command: npx',
    `    args: ${JSON.stringify(['--yes', `rulebookguard@${version}`, 'mcp'])}`,
    '---',
    '',
    `<!-- ${text.generatedKiroAgent(KIRO_AGENTS_FORMAT, version)} -->`,
    '',
    instructions,
    '',
    `${guide}\n`,
  ].join('\n');
}

function bodyOf(source: string, file: string): string {
  return normalized(splitFrontmatter(source, file).body);
}

// A checkout with CRLF files must not change what gets committed from another system.
function normalized(text: string): string {
  return text.replaceAll('\r\n', '\n').trim();
}

// The plugin sits next to dist in the published package, and two levels up from this source file.
async function readPluginFile(path: string): Promise<string> {
  try {
    return await readFile(new URL(`../plugin/${path}`, import.meta.url), 'utf8');
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'ENOENT') {
      throw error;
    }
    return readFile(new URL(`../../plugin/${path}`, import.meta.url), 'utf8');
  }
}
