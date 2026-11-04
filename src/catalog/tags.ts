import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { findRuleRegions, findRuleTags, type RuleTagProblemCode } from '../format/tag.ts';
import { expandGlobs, resolvesInside, type GitFallbackListener } from './files.ts';

export interface TagLocation {
  file: string;
  line: number;
}

export interface TagRegion extends TagLocation {
  endLine: number;
}

export interface TagProblem extends TagLocation {
  code: RuleTagProblemCode;
  id: string;
}

export type TagIndex = Map<string, TagLocation[]>;

export type RegionIndex = Map<string, TagRegion[]>;

export interface TagScan {
  tags: TagIndex;
  regions: RegionIndex;
  problems: TagProblem[];
}

export async function scanTestTags(
  root: string,
  testGlobs: string[],
  onGitFallback?: GitFallbackListener,
): Promise<TagIndex> {
  return (await scanTestRegions(root, testGlobs, onGitFallback)).tags;
}

export async function scanTestRegions(
  root: string,
  testGlobs: string[],
  onGitFallback?: GitFallbackListener,
): Promise<TagScan> {
  const tags: TagIndex = new Map();
  const regions: RegionIndex = new Map();
  const problems: TagProblem[] = [];
  const realRoot = await realpath(root);
  for (const file of await expandGlobs(root, testGlobs, onGitFallback)) {
    const path = join(root, file);
    if (!(await resolvesInside(path, realRoot))) {
      continue;
    }
    const source = await readFile(path, 'utf8');
    for (const { id, line } of findRuleTags(source)) {
      push(tags, id, { file, line });
    }
    const found = findRuleRegions(source);
    for (const { id, line, endLine } of found.regions) {
      push(regions, id, { file, line, endLine });
    }
    problems.push(...found.problems.map((problem) => ({ ...problem, file })));
  }
  return { tags: sortById(tags), regions: sortById(regions), problems };
}

export interface ImplementationScan {
  regions: RegionIndex;
  problems: TagProblem[];
}

// A path that does not exist or is not a file has no regions, so a Write to a new file reads as empty.
export async function scanImplementations(
  root: string,
  files: string[],
): Promise<ImplementationScan> {
  const regions: RegionIndex = new Map();
  const problems: TagProblem[] = [];
  const realRoot = await realpath(root);
  for (const file of files) {
    const path = join(root, file);
    if (!(await resolvesInside(path, realRoot))) {
      continue;
    }
    if (!(await stat(path)).isFile()) {
      continue;
    }
    const found = findRuleRegions(await readFile(path, 'utf8'), 'implements');
    for (const { id, line, endLine } of found.regions) {
      push(regions, id, { file, line, endLine });
    }
    problems.push(...found.problems.map((problem) => ({ ...problem, file })));
  }
  return { regions: sortById(regions), problems };
}

function push<T>(index: Map<string, T[]>, id: string, value: T): void {
  const values = index.get(id) ?? [];
  values.push(value);
  index.set(id, values);
}

function sortById<T>(index: Map<string, T>): Map<string, T> {
  return new Map([...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
