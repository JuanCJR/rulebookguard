import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Imports `name` from the first of `from` that resolves it, or returns undefined when none does. */
export async function importOptionalPackage<T>(
  name: string,
  from: readonly string[],
): Promise<T | undefined> {
  for (const directory of from) {
    let entry: string;
    try {
      entry = createRequire(join(directory, 'package.json')).resolve(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        continue;
      }
      throw error;
    }
    return (await import(pathToFileURL(entry).href)) as T;
  }
  return undefined;
}
