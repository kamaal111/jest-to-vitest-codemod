import { defineConfig } from 'vitest/config';

const config = defineConfig({ test: { coverage: { include: ['src'] } } });

export default config;
