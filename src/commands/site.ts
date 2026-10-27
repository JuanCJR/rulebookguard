import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Catalog } from '../catalog/load.ts';
import type { RuleLanguage } from '../format/types.ts';
import { siteData } from '../site/data.ts';
import { normalizeBase, sitePages, siteText } from '../site/pages.ts';
import { CliError, gitFallbackWarning, openCatalog, writeLines, type CliIo } from './io.ts';

const execFileAsync = promisify(execFile);

/** Marks an output directory as written by `site`, so a rebuild may replace it. */
const MARKER = '.rulebookguard-site';

export interface SiteOptions {
  out?: string | undefined;
  base?: string | undefined;
  serve?: boolean | undefined;
  port?: number | undefined;
}

export const DEFAULT_PORT = 4321;

/**
 * Builds the site into `--out`; with `serve`, also serves it on 127.0.0.1 until `until` settles (Ctrl+C by default).
 */
export async function siteCommand(
  io: CliIo,
  options: SiteOptions,
  until: Promise<void> = untilInterrupted(),
): Promise<void> {
  const catalog = await openCatalog(io);
  const out = resolve(io.cwd, options.out ?? 'site');
  const fromCwd = relative(io.cwd, out);
  const shown =
    fromCwd === '' ? '.' : fromCwd.startsWith('..') || isAbsolute(fromCwd) ? out : fromCwd;
  await assertReplaceable(out, shown);

  const language = catalog.config.language ?? 'en';
  const base = normalizeBase(options.base ?? '/');
  // Claim the port before the build, so a taken port fails in milliseconds rather than after it.
  const server = options.serve ? await listen(out, base, options.port ?? DEFAULT_PORT) : undefined;
  try {
    await buildSite(catalog, out, language, base, io);
  } catch (error) {
    server?.close();
    throw error;
  }
  writeLines(io, [shown]);
  if (server === undefined) {
    return;
  }
  const { port } = server.address() as AddressInfo;
  writeLines(io, [`Serving ${shown} at http://127.0.0.1:${port}${base} (Ctrl+C to stop)`]);
  await until;
  await new Promise<void>((closed) => {
    server.close(() => closed());
    server.closeAllConnections();
  });
}

async function buildSite(
  catalog: Catalog,
  out: string,
  language: RuleLanguage,
  base: string,
  io: CliIo,
): Promise<void> {
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
}

function untilInterrupted(): Promise<void> {
  return new Promise((stop) => {
    process.once('SIGINT', () => stop());
    process.once('SIGTERM', () => stop());
  });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function listen(out: string, base: string, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    serveFile(out, base, request, response).catch(() => {
      response.writeHead(500).end();
    });
  });
  return new Promise((ready, fail) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'EADDRINUSE'
          ? new CliError(`Port ${port} is already in use; pass another --port.`)
          : error,
      );
    });
    server.listen(port, '127.0.0.1', () => ready(server));
  });
}

async function serveFile(
  out: string,
  base: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (`${path}/` === base) {
    response.writeHead(301, { location: base }).end();
    return;
  }
  if (!path.startsWith(base)) {
    if (path === '/') {
      response.writeHead(301, { location: base }).end();
      return;
    }
    await sendNotFound(out, response);
    return;
  }
  let file = resolve(out, `.${sep}${path.slice(base.length)}`);
  if (file !== out && !file.startsWith(`${out}${sep}`)) {
    await sendNotFound(out, response);
    return;
  }
  const info = await stat(file).catch(() => undefined);
  if (info?.isDirectory()) {
    if (!path.endsWith('/')) {
      response.writeHead(301, { location: `${path}/` }).end();
      return;
    }
    file = join(file, 'index.html');
  }
  const body = await readFile(file).catch(() => undefined);
  if (body === undefined) {
    await sendNotFound(out, response);
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
  });
  response.end(body);
}

async function sendNotFound(out: string, response: ServerResponse): Promise<void> {
  const page = await readFile(join(out, '404.html')).catch(() => 'Not found');
  response.writeHead(404, { 'content-type': CONTENT_TYPES['.html'] }).end(page);
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
