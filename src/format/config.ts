import { readSource } from './read.ts';
import type { RulebookConfig } from './types.ts';
import { validate, validators } from './validate.ts';
import { parseYaml } from './yaml.ts';

export const CONFIG_FILE_NAME = 'rulebookguard.config.yaml';

export function parseConfig(source: string, file: string): RulebookConfig {
  return validate(validators.config, parseYaml(source, file), file);
}

export async function loadConfig(path: string): Promise<RulebookConfig> {
  return parseConfig(await readSource(path), path);
}
