import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { createEvidenceResolver } from '../../src/catalog/evidence.ts';
import { scratchDir } from '../scratch.ts';

async function repo(): Promise<string> {
  const dir = await scratchDir();
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'src/clients.ts'),
    [
      'export class Clients {',
      '  create(input: string) {',
      '    return input;',
      '  }',
      '}',
      '',
      'export const LIMIT = 3;',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'src/clients.test.ts'),
    ["it('creates a client', () => {", '  expect(1).toBe(1);', '});', ''].join('\n'),
  );
  return dir;
}

describe('createEvidenceResolver', () => {
  it('gives full ranges when @rulebookguard/symbols is installed', async () => {
    const resolve = await createEvidenceResolver(await repo());

    expect(await resolve('src/clients.ts Clients.create')).toMatchObject({ line: 2, endLine: 4 });
    expect(await resolve('src/clients.ts Clients')).toMatchObject({ line: 1, endLine: 5 });
    expect(await resolve('src/clients.test.ts "creates a client"')).toMatchObject({
      line: 1,
      endLine: 3,
    });
  });

  it('falls back to the regex for what the tags query does not name', async () => {
    const resolve = await createEvidenceResolver(await repo());

    expect(await resolve('src/clients.ts LIMIT')).toMatchObject({ line: 7, endLine: 7 });
  });

  it('finds the definition line without the package', async () => {
    const dir = await repo();
    const resolve = await createEvidenceResolver(dir, async () => undefined);

    expect(await resolve('src/clients.ts Clients.create')).toMatchObject({ line: 2, endLine: 2 });
    expect(await resolve('src/clients.test.ts "creates a client"')).toMatchObject({
      line: 1,
      endLine: 1,
    });
  });

  it('keeps resolving with the regex when the package fails to read a file', async () => {
    const resolve = await createEvidenceResolver(await repo(), async () => ({
      readSymbols: () => Promise.reject(new Error('grammar failed to load')),
    }));

    expect(await resolve('src/clients.ts Clients.create')).toMatchObject({ line: 2, endLine: 2 });
  });

  it('reports a missing file or symbol and a directory named with a symbol', async () => {
    const resolve = await createEvidenceResolver(await repo());

    expect(await resolve('src/gone.ts Clients')).toMatchObject({ problem: 'missing-file' });
    expect(await resolve('src/clients.ts Gone')).toMatchObject({
      problem: 'missing-symbol',
      symbol: 'Gone',
      line: null,
    });
    expect(await resolve('src Clients')).toMatchObject({ problem: 'missing-file' });
    expect(await resolve('src')).toEqual({ entry: 'src', file: 'src', line: null, endLine: null });
  });
});
