import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class SiteBuildError extends Error {
  constructor(detail) {
    super(`The site build failed:\n${detail}`);
    this.name = 'SiteBuildError';
    this.detail = detail;
  }
}

/** Writes `files` as an Astro project, builds it and replaces `out` with the build. */
export async function buildSite(files, out) {
  const work = join(siteWorkRoot(), randomUUID());
  try {
    for (const [path, content] of files) {
      await mkdir(dirname(join(work, path)), { recursive: true });
      await writeFile(join(work, path), content);
    }
    await buildWithAstro(work);
    await rm(out, { recursive: true, force: true });
    await cp(join(work, 'dist'), out, { recursive: true });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Starlight injects its routes as package specifiers that Astro resolves from the project root, so the generated
 * project must live inside the node_modules directory that holds this package's own dependencies.
 */
export function siteWorkRoot() {
  const root = dirname(fileURLToPath(import.meta.url));
  let parent = dirname(root);
  if (basename(parent).startsWith('@')) {
    parent = dirname(parent);
  }
  const modules = basename(parent) === 'node_modules' ? parent : join(root, 'node_modules');
  return join(modules, '.rulebookguard-site');
}

// Astro writes temporary prerender files under the process cwd, so it runs in its own process from the project.
async function buildWithAstro(work) {
  const astro = join(dirname(siteWorkRoot()), 'astro');
  const { bin } = JSON.parse(readFileSync(join(astro, 'package.json'), 'utf8'));
  try {
    await execFileAsync(process.execPath, [join(astro, bin.astro), 'build', '--silent'], {
      cwd: work,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const { stderr, stdout } = error;
    throw new SiteBuildError(astroFailureDetail(`${stderr ?? ''}${stdout ?? ''}`));
  }
}

/** The first lines of Astro's error output, without its stack trace. */
export function astroFailureDetail(output) {
  return output
    .split('\n')
    .filter((line) => !/^\s*at /.test(line) && !/^\s*Stack trace:/.test(line))
    .filter((line) => line.trim() !== '')
    .slice(0, 12)
    .join('\n');
}
