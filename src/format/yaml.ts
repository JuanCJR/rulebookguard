import { parse, YAMLParseError } from 'yaml';
import { messages } from '../messages.ts';
import { FormatError } from './errors.ts';
import type { ParseOptions } from './types.ts';

export function parseYaml(source: string, file: string, { language }: ParseOptions = {}): unknown {
  try {
    return parse(source);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new FormatError([{ file, message: messages(language).invalidYaml(singleLine(error)) }]);
    }
    throw error;
  }
}

function singleLine(error: YAMLParseError): string {
  const first = (error.message.split('\n')[0] ?? '').replace(/:\s*$/, '');
  const position = error.linePos?.[0];
  if (position === undefined || / at line \d+, column \d+$/.test(first)) {
    return first;
  }
  return `${first} at line ${position.line}, column ${position.col}`;
}
