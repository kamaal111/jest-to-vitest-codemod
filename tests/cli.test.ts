import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_PATH = join(process.cwd(), 'dist/cli.js');
const EXAMPLE_DIR = join(process.cwd(), 'example');

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

  it('copies tsconfig path aliases to vitest config with tsconfigPaths plugin', async () => {
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
    expect(vitestConfig).toContain("import tsconfigPaths from 'vite-tsconfig-paths'");
    expect(vitestConfig).toContain('plugins: [tsconfigPaths()]');
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

  it('generates typed helper files without as any', async () => {
    const testsDir = join(tempDir, 'tests');
    await mkdir(testsDir, { recursive: true });
    const filePath = join(testsDir, 'test.spec.ts');
    const source = `
      import value from './some-path';

      jest.mock('./some-path', () => ({ value: jest.fn() }));
    `;
    await writeFile(filePath, source);

    runCli(tempDir);

    const helper = await readFile(join(tempDir, 'vitest-mock-helper.ts'), 'utf-8');
    const declaration = await readFile(join(tempDir, 'tests', 'vitest-mock-helper.d.ts'), 'utf-8');
    const updated = await readFile(filePath, 'utf-8');
    expect(helper).toContain('var __mockModule: MockModuleHelper;');
    expect(declaration).toContain('var __mockModule: MockModuleHelper;');
    expect(declaration).not.toContain('as any');
    expect(helper).not.toContain('as any');
    expect(updated).toContain('__mockModule');
    expect(updated).not.toContain('as any');
  });

  it('copies tsconfig path aliases from example directory into generated vitest config', async () => {
    await cp(EXAMPLE_DIR, tempDir, { recursive: true });

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("import tsconfigPaths from 'vite-tsconfig-paths'");
    expect(vitestConfig).toContain('plugins: [tsconfigPaths()]');
  });
});
