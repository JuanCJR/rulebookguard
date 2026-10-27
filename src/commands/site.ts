import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { siteData } from '../site/data.ts';
import { normalizeBase, sitePages, siteText } from '../site/pages.ts';
import { CliError, gitFallbackWarning, openCatalog, writeLines, type CliIo } from './io.ts';

const execFileAsync = promisify(execFile);

/** Marks an output directory as written by `site`, so a rebuild may replace it. */
const MARKER = '.rulebookguard-site';

export interface SiteOptions {
  out?: string | undefined;
  base?: string | undefined;
}

export async function siteCommand(io: CliIo, options: SiteOptions): Promise<void> {
  const catalog = await openCatalog(io);
  const out = resolve(io.cwd, options.out ?? 'site');
  const fromCwd = relative(io.cwd, out);
  const shown =
    fromCwd === '' ? '.' : fromCwd.startsWith('..') || isAbsolute(fromCwd) ? out : fromCwd;
  await assertReplaceable(out, shown);

  const language = catalog.config.language ?? 'en';
  const base = normalizeBase(options.base ?? '/');
  const files = sitePages(await siteData(catalog, gitFallbackWarning(io)), { language, base });
  const text = siteText(language);
  const sidebar = [
    { label: text.allRules, link: '/rules/' },
    { label: text.health, slug: 'health' },
    ...catalog.contexts
      .map((context) => context.context)
      .sort()
      .map((context) => ({ label: context, items: [{ autogenerate: { directory: context } }] })),
  ];
  files.set('astro.config.mjs', astroConfig(text.title, language, base, sidebar));

  const work = join(siteWorkRoot(), randomUUID());
  try {
    for (const [path, content] of files) {
      await mkdir(dirname(join(work, path)), { recursive: true });
      await writeFile(join(work, path), content);
    }
    await buildWithAstro(work);
    await rm(out, { recursive: true, force: true });
    await cp(join(work, 'dist'), out, { recursive: true });
    await writeFile(join(out, MARKER), '');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  writeLines(io, [shown]);
}

/**
 * Starlight injects its routes as package specifiers that Astro resolves from the project root, so the generated
 * project must live inside the node_modules directory that holds rulebookguard's own dependencies.
 */
export function siteWorkRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!isOwnPackageRoot(directory)) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('rulebookguard package root not found');
    }
    directory = parent;
  }
  const parent = dirname(directory);
  const modules = basename(parent) === 'node_modules' ? parent : join(directory, 'node_modules');
  return join(modules, '.rulebookguard-site');
}

function isOwnPackageRoot(directory: string): boolean {
  const file = join(directory, 'package.json');
  return (
    existsSync(file) &&
    (JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown }).name === 'rulebookguard'
  );
}

async function assertReplaceable(out: string, shown: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(out);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (entries.length > 0 && !entries.includes(MARKER)) {
    throw new CliError(
      `${shown} is not empty and was not written by "rulebookguard site"; choose another --out or empty it first.`,
    );
  }
}

// Astro writes temporary prerender files under the process cwd, so it runs in its own process from the project.
async function buildWithAstro(work: string): Promise<void> {
  const astro = join(dirname(siteWorkRoot()), 'astro');
  const { bin } = JSON.parse(readFileSync(join(astro, 'package.json'), 'utf8')) as {
    bin: { astro: string };
  };
  try {
    await execFileAsync(process.execPath, [join(astro, bin.astro), 'build', '--silent'], {
      cwd: work,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const { stderr, stdout } = error as { stderr?: string; stdout?: string };
    throw new CliError(
      `The site build failed:\n${astroFailureDetail(`${stderr ?? ''}${stdout ?? ''}`)}`,
    );
  }
}

/** The first lines of Astro's error output, without its stack trace. */
export function astroFailureDetail(output: string): string {
  return output
    .split('\n')
    .filter((line) => !/^\s*at /.test(line) && !/^\s*Stack trace:/.test(line))
    .filter((line) => line.trim() !== '')
    .slice(0, 12)
    .join('\n');
}

function astroConfig(title: string, language: string, base: string, sidebar: unknown[]): string {
  return `import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: ${JSON.stringify(base)},
  outDir: './dist',
  cacheDir: './.astro-cache',
  // Bundle the prerender dependencies: left external, Node resolves them from this project, where a package manager
  // may have hoisted other versions (pnpm's node_modules/.pnpm/node_modules) ahead of the ones Astro depends on.
  vite: { environments: { prerender: { resolve: { noExternal: true } } } },
  integrations: [
    starlight({
      title: ${JSON.stringify(title)},
      locales: { root: { label: ${JSON.stringify(language)}, lang: ${JSON.stringify(language)} } },
      sidebar: ${JSON.stringify(sidebar)},
    }),
  ],
});
`;
}
