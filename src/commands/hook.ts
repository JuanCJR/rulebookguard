import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { rulesForPath } from '../catalog/anchors.ts';
import { findRulebookRoot, loadCatalog } from '../catalog/load.ts';
import type { RuleDoc, RuleLanguage } from '../format/types.ts';
import type { CliIo } from './io.ts';

export const HOOK_BODY_LIMIT = 10_000;

const TEXT: Record<
  RuleLanguage,
  { header: (path: string) => string; ruleFile: string; omitted: string }
> = {
  en: {
    header: (path) =>
      `Business rules anchored to ${path} (rulebookguard). They are the source of truth: keep any change to this file consistent with them, and change the rule first if a change alters its behavior.`,
    ruleFile: 'Rule file',
    omitted: `Rule texts omitted (over ${HOOK_BODY_LIMIT} characters); run \`rulebookguard show <id>\` for the full text.`,
  },
  es: {
    header: (path) =>
      `Reglas de negocio ancladas a ${path} (rulebookguard). Son la fuente de verdad: mantén cualquier cambio a este archivo coherente con ellas y, si un cambio altera su comportamiento, cambia primero la regla.`,
    ruleFile: 'Archivo de la regla',
    omitted: `Se omitió el texto de las reglas (más de ${HOOK_BODY_LIMIT} caracteres); ejecuta \`rulebookguard show <id>\` para verlo completo.`,
  },
};

// A tool hook must never block the tool: every failure ends with no output and exit 0.
export async function hookCommand(io: CliIo): Promise<void> {
  try {
    const event = parseEvent(await (io.stdin?.() ?? Promise.resolve('')));
    const context = event === undefined ? undefined : await hookContext(event, io.cwd);
    if (event !== undefined && context !== undefined) {
      io.stdout(
        `${JSON.stringify({ hookSpecificOutput: { hookEventName: event.name, additionalContext: context } })}\n`,
      );
    }
  } catch {
    // Deliberately silent: see above.
  }
}

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'] as const;

interface ToolEvent {
  name: (typeof TOOL_EVENTS)[number];
  filePath: string;
  cwd?: string;
}

async function hookContext(event: ToolEvent, cwd: string): Promise<string | undefined> {
  const file = resolve(event.cwd ?? cwd, event.filePath);
  const root = await findRulebookRoot(dirname(file));
  if (root === undefined) {
    return undefined;
  }
  const path = relative(root, file);
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return undefined;
  }
  const catalog = await loadCatalog(root);
  const repoPath = path.split(sep).join('/');
  const rules = rulesForPath(catalog.rules, repoPath).filter((rule) => rule.status === 'active');
  if (rules.length === 0) {
    return undefined;
  }
  return render(repoPath, rules, TEXT[catalog.config.language ?? 'en']);
}

function parseEvent(input: string): ToolEvent | undefined {
  let event: unknown;
  try {
    event = JSON.parse(input);
  } catch {
    return undefined;
  }
  if (typeof event !== 'object' || event === null) {
    return undefined;
  }
  const {
    hook_event_name: name,
    tool_input: toolInput,
    cwd,
  } = event as { hook_event_name?: unknown; tool_input?: unknown; cwd?: unknown };
  const filePath = (toolInput as { file_path?: unknown } | undefined)?.file_path;
  const toolEvent = TOOL_EVENTS.find((candidate) => candidate === name);
  if (toolEvent === undefined || typeof filePath !== 'string' || filePath === '') {
    return undefined;
  }
  return typeof cwd === 'string'
    ? { name: toolEvent, filePath, cwd }
    : { name: toolEvent, filePath };
}

function render(path: string, rules: RuleDoc[], text: (typeof TEXT)[RuleLanguage]): string {
  const bodies = rules.reduce((total, rule) => total + rule.body.trim().length, 0);
  const withBodies = bodies <= HOOK_BODY_LIMIT;
  const sections = rules.map((rule) => {
    const lines = [
      `## ${rule.id} (${rule.context}): ${rule.summary}`,
      `${text.ruleFile}: ${rule.file}`,
    ];
    return withBodies ? [...lines, '', rule.body.trim()].join('\n') : lines.join('\n');
  });
  const parts = [text.header(path), ...sections];
  if (!withBodies) {
    parts.push(text.omitted);
  }
  return parts.join('\n\n');
}
