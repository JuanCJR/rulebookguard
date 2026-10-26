import { fileURLToPath } from 'node:url';

export function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
