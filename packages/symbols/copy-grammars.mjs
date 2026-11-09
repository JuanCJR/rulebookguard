// Copies the grammar files into grammars/ before the package is packed, so installing it never
// installs the grammar packages themselves: their install script builds a native addon.
import { cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grammarFiles } from './grammars.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = join(here, 'grammars');

await rm(out, { recursive: true, force: true });
for (const [name, file] of grammarFiles()) {
  const from = join(dirname(require.resolve(`${name}/package.json`)), file);
  await cp(from, join(out, name, file));
}
