import { defineConfig } from 'vitest/config';

const config = defineConfig({ test: { coverage: { include: ['src'], exclude: ['src/index.ts'] } } });

export default config;
