import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    ignorePatterns: ['README.md', 'odd/**'],
  },
  pack: {
    entry: ['src/index.ts', 'src/cli.ts'],
    format: ['esm'],
    dts: true,
    platform: 'node',
  },
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
