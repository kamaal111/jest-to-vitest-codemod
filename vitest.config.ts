import { defineConfig } from 'vitest/config';

const config = defineConfig({
  test: {
    exclude: ['.tmp-example-*/**', 'example/**', 'node_modules/**'],
    coverage: { include: ['src'], exclude: ['src/index.ts'] },
  },
});

export default config;
