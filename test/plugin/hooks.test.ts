import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vite-plus/test';

const HOOK_COMMAND = 'node "${CLAUDE_PLUGIN_ROOT}/bin/rulebookguard.mjs" hook';

interface HookEntry {
  matcher?: string;
  hooks: { type: string; command: string; timeout?: number }[];
}

async function pluginHooks(): Promise<Record<string, HookEntry[]>> {
  const file = new URL('../../rulebookguard/hooks/hooks.json', import.meta.url);
  return (JSON.parse(await readFile(file, 'utf8')) as { hooks: Record<string, HookEntry[]> }).hooks;
}

describe('plugin hooks', () => {
  it('injects the rules of a file after a Read and before a Write', async () => {
    const hooks = await pluginHooks();

    expect(hooks.PostToolUse?.map((entry) => entry.matcher)).toEqual(['Read']);
    expect(hooks.PreToolUse?.map((entry) => entry.matcher)).toEqual(['Write']);
  });

  // @rule R-AGT-005
  it('runs the hook on every SessionStart source, so the protocol survives a compaction', async () => {
    const hooks = await pluginHooks();

    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionStart?.[0]?.matcher).toBeUndefined();
    expect(hooks.SessionStart?.[0]?.hooks.map((hook) => hook.command)).toEqual([HOOK_COMMAND]);
  });
  // @endrule R-AGT-005

  it('runs no hook on every prompt and none that could block the end of a turn', async () => {
    const hooks = await pluginHooks();

    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart']);
  });
});
