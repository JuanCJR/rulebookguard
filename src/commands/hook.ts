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
      `Business rules anchored to ${path} (rulebookguard). They are the source of truth: keep the code consistent with them, and change the rule first if this edit changes its behavior.`,
    ruleFile: 'Rule file',
    omitted: `Rule texts omitted (over ${HOOK_BODY_LIMIT} characters); run \`rulebookguard show <id>\` for the full text.`,
  },
  es: {
    header: (path) =>
      `Reglas de negocio ancladas a ${path} (rulebookguard). Son la fuente de verdad: mantén el código coherente con ellas y, si esta edición cambia su comportamiento, cambia primero la regla.`,
    ruleFile: 'Archivo de la regla',
    omitted: `Se omitió el texto de las reglas (más de ${HOOK_BODY_LIMIT} caracteres); ejecuta \`rulebookguard show <id>\` para verlo completo.`,
  },
};

// A PreToolUse hook must never block an edit: every failure ends with no output and exit 0.
export async function hookCommand(io: CliIo): Promise<void> {
  try {
    const context = await hookContext(await (io.stdin?.() ?? Promise.resolve('')), io.cwd);
    if (context !== undefined) {
      io.stdout(
        `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } })}\n`,
      );
    }
  } catch {
    // Deliberately silent: see above.
  }
}

async function hookContext(input: string, cwd: string): Promise<string | undefined> {
  const event = parseEvent(input);
  if (event === undefined) {
    return undefined;
  }
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

function parseEvent(input: string): { filePath: string; cwd?: string } | undefined {
  let event: unknown;
  try {
    event = JSON.parse(input);
  } catch {
    return undefined;
  }
  if (typeof event !== 'object' || event === null) {
    return undefined;
  }
  const { tool_input: toolInput, cwd } = event as { tool_input?: unknown; cwd?: unknown };
  const filePath = (toolInput as { file_path?: unknown } | undefined)?.file_path;
  if (typeof filePath !== 'string' || filePath === '') {
    return undefined;
  }
  return typeof cwd === 'string' ? { filePath, cwd } : { filePath };
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
