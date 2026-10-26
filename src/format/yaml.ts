import { parse, YAMLParseError } from 'yaml';
import { FormatError } from './errors.ts';

export function parseYaml(source: string, file: string): unknown {
  try {
    return parse(source);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new FormatError([{ file, message: `invalid YAML: ${error.message}` }]);
    }
    throw error;
  }
}
