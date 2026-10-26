import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findRuleTags } from '../format/tag.ts';
import { expandGlobs } from './files.ts';

export interface TagLocation {
  file: string;
  line: number;
}

export type TagIndex = Map<string, TagLocation[]>;

export async function scanTestTags(root: string, testGlobs: string[]): Promise<TagIndex> {
  const index: TagIndex = new Map();
  for (const file of await expandGlobs(root, testGlobs)) {
    const source = await readFile(join(root, file), 'utf8');
    for (const { id, line } of findRuleTags(source)) {
      const locations = index.get(id) ?? [];
      locations.push({ file, line });
      index.set(id, locations);
    }
  }
  return new Map([...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
