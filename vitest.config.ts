import { defineConfig } from 'vitest/config';

const config = defineConfig({ test: { coverage: { include: ['src'] }, setupFiles: ['tests/setup.ts'] } });

export default config;
