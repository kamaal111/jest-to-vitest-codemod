import { defineConfig } from 'vitest/config';

const config = defineConfig({
  test: {
    exclude: ['.tmp-example-*/**', 'example/**', 'node_modules/**'],
    coverage: {
      include: ['src'],
      exclude: ['src/index.ts'],
      thresholds: { statements: 85, branches: 75, functions: 94, lines: 87 },
    },
    disableConsoleIntercept: true,
  },
});

export default config;
