import { fileURLToPath } from 'node:url';
import { expect } from 'vite-plus/test';
import { FormatError, type FormatIssue } from '../../src/index.ts';

export function fixture(path: string): string {
  return fileURLToPath(new URL(`../fixtures/format/${path}`, import.meta.url));
}

export function captureIssues(run: () => unknown): FormatIssue[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(FormatError);
    return (error as FormatError).issues;
  }
  throw new Error('expected a FormatError');
}

export async function captureIssuesAsync(run: () => Promise<unknown>): Promise<FormatIssue[]> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(FormatError);
    return (error as FormatError).issues;
  }
  throw new Error('expected a FormatError');
}
