import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Catalog } from '../catalog/load.ts';
import type { RuleLanguage } from '../format/types.ts';
import { siteData } from '../site/data.ts';
import { normalizeBase, sitePages, siteText } from '../site/pages.ts';
import { CliError, gitFallbackWarning, openCatalog, writeLines, type CliIo } from './io.ts';

type SitePackage = typeof import('@rulebookguard/site');

const SITE_PACKAGE = '@rulebookguard/site';

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

  const site = await importSitePackage([catalog.root, dirname(fileURLToPath(import.meta.url))]);
  const language = catalog.config.language ?? 'en';
  const base = normalizeBase(options.base ?? '/');
  // Claim the port before the build, so a taken port fails in milliseconds rather than after it.
  const server = options.serve ? await listen(out, base, options.port ?? DEFAULT_PORT) : undefined;
  try {
    await buildSite(site, catalog, out, language, base, io);
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

/** Imports the site builder from the first of `from` that resolves it. */
export async function importSitePackage(from: readonly string[]): Promise<SitePackage> {
  for (const directory of from) {
    let entry: string;
    try {
      entry = createRequire(join(directory, 'package.json')).resolve(SITE_PACKAGE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        continue;
      }
      throw error;
    }
    return (await import(pathToFileURL(entry).href)) as SitePackage;
  }
  throw new CliError(
    `The site commands need the ${SITE_PACKAGE} package. Install it next to rulebookguard: npm install --save-dev ${SITE_PACKAGE}`,
  );
}

async function buildSite(
  site: SitePackage,
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

  try {
    await site.buildSite(files, out);
  } catch (error) {
    throw error instanceof site.SiteBuildError ? new CliError(error.message) : error;
  }
  await writeFile(join(out, MARKER), '');
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
