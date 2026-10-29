#!/usr/bin/env node
// Runs the project's own rulebookguard when it is recent enough, else the version this plugin ships with.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(
  readFileSync(join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'),
);
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const args = process.argv.slice(2);
if (args[0] === 'mcp' && !args.includes('--project')) {
  args.push('--project', project);
}

const local = findLocal(project);
const result = local
  ? spawnSync(process.execPath, [local, ...args], { stdio: 'inherit', cwd: project })
  : spawnSync('npx', ['--yes', `rulebookguard@${version}`, ...args], {
      stdio: 'inherit',
      cwd: project,
      shell: process.platform === 'win32',
    });

// Exit code 2 would block a PreToolUse hook; anything else is a non-blocking error.
const status = result.status ?? 1;
process.exitCode = status === 2 ? 1 : status;

function findLocal(start) {
  for (let directory = resolve(start); ; directory = dirname(directory)) {
    // In a checkout of rulebookguard itself, npx takes the project as the package and runs nothing.
    const own = ownBin(directory);
    if (own) {
      return own;
    }
    const pkgFile = join(directory, 'node_modules/rulebookguard/package.json');
    if (existsSync(pkgFile)) {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.rulebookguard;
      return bin && atLeast(pkg.version, version) ? join(dirname(pkgFile), bin) : undefined;
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
}

function ownBin(directory) {
  const pkgFile = join(directory, 'package.json');
  if (!existsSync(pkgFile)) {
    return undefined;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  } catch {
    return undefined;
  }
  if (pkg?.name !== 'rulebookguard') {
    return undefined;
  }
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.rulebookguard;
  const path = bin && join(directory, bin);
  return path && existsSync(path) ? path : undefined;
}

function atLeast(actual, minimum) {
  const a = String(actual).split('-')[0].split('.').map(Number);
  const m = minimum.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (m[i] ?? 0)) {
      return (a[i] ?? 0) > (m[i] ?? 0);
    }
  }
  return true;
}
