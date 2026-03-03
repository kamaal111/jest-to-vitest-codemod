import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_PATH = join(process.cwd(), 'dist/cli.js');

function runCli(dir: string) {
  const result = spawnSync('node', [CLI_PATH, dir], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `exit ${result.status}`);
  }
}

beforeAll(() => {
  const build = spawnSync('pnpm', ['build'], { encoding: 'utf-8' });
  if (build.status !== 0) {
    throw new Error(build.stderr || `build failed with exit ${build.status}`);
  }
});

describe('cli', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jtv-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('transforms files in place', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    runCli(tempDir);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain("from 'vitest'");
  });

  it('generates vitest config from jest config properties', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    const jestConfig = `import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testTimeout: 10000,
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;`;
    await writeFile(join(tempDir, 'jest.config.ts'), jestConfig);

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("environment: 'node'");
    expect(vitestConfig).toContain('testTimeout: 10000');
    expect(vitestConfig).toContain('clearMocks: true');
    expect(vitestConfig).toContain('mockReset: false');
    expect(vitestConfig).toContain('restoreMocks: true');
    expect(vitestConfig).toContain("include: ['**/*.test.ts']");
    expect(vitestConfig).toContain("dir: 'coverage'");
    expect(vitestConfig).toContain("include: ['src/**/*.ts']");
    expect(vitestConfig).toContain("reporter: ['text', 'lcov']");
    expect(vitestConfig).toContain('thresholds:');
    expect(vitestConfig).toContain('branches: 80');
  });

  it('copies tsconfig path aliases to resolve.alias in vitest config', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    // Use JSONC-style tsconfig with comments and trailing commas (typical real-world format)
    const jsoncTsconfig = `{
  // TypeScript configuration
  "compilerOptions": {
    "target": "ES2022",
    "paths": {
      "@/*": ["./src/*"], // main alias
      "~utils/*": ["./src/utils/*"],
    },
  },
}`;
    await writeFile(join(tempDir, 'tsconfig.json'), jsoncTsconfig);

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("import { fileURLToPath } from 'node:url'");
    expect(vitestConfig).toContain('resolve:');
    expect(vitestConfig).toContain('alias:');
    expect(vitestConfig).toContain('"@": fileURLToPath(new URL("./src", import.meta.url))');
    expect(vitestConfig).toContain('"~utils": fileURLToPath(new URL("./src/utils", import.meta.url))');
  });

  it('generates a basic vitest config when no jest config is present', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("from 'vitest/config'");
    expect(vitestConfig).toContain('defineConfig');
    expect(vitestConfig).toContain('test:');
  });
});
