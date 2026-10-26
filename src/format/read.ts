import { readFile } from 'node:fs/promises';
import { FormatError } from './errors.ts';

export async function readSource(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new FormatError([{ file: path, message: `cannot read file (${code})` }]);
  }
}
