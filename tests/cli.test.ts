import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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

  it('does not generate global mock helpers for object module mocks', async () => {
    const testsDir = join(tempDir, 'tests');
    await mkdir(testsDir, { recursive: true });
    const filePath = join(testsDir, 'test.spec.ts');
    const source = `
      import value from './some-path';

      jest.mock('./some-path', () => ({ value: jest.fn() }));
    `;
    await writeFile(filePath, source);

    runCli(tempDir);

    const updated = await readFile(filePath, 'utf-8');

    await expect(access(join(tempDir, 'vitest-mock-helper.ts'))).rejects.toBeDefined();
    await expect(access(join(tempDir, 'tests', 'vitest-mock-helper.d.ts'))).rejects.toBeDefined();

    expect(updated).toContain('const mockedModule = { value: vi.fn() };');
    expect(updated).toContain('return { ...mockedModule, default: mockedModule };');
    expect(updated).not.toContain('__mockModule');
    expect(updated).not.toContain('as any');
  });

  it('copies tsconfig path aliases from example directory into generated vitest config', async () => {
    await cp(EXAMPLE_DIR, tempDir, {
      recursive: true,
      filter: source => basename(source) !== 'node_modules',
    });

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    expect(vitestConfig).toContain("import tsconfigPaths from 'vite-tsconfig-paths'");
    expect(vitestConfig).toContain('plugins: [tsconfigPaths()]');
  });

  it('generates a vitest config for each additional jest.*.config.* file', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    const integrationConfig = `module.exports = {
  testMatch: ['**/__tests__/**/*.integration.test.+(js|ts)'],
  testTimeout: 60000,
  setupFilesAfterEnv: ['./jest.extended.setup.js'],
};`;
    await writeFile(join(tempDir, 'jest.integration.config.js'), integrationConfig);

    runCli(tempDir);

    const vitestIntegrationConfig = await readFile(join(tempDir, 'vitest.integration.config.ts'), 'utf-8');
    const vitestIntegrationSetup = await readFile(join(tempDir, 'vitest.integration.config.setup.ts'), 'utf-8');
    expect(vitestIntegrationConfig).toContain("from 'vitest/config'");
    expect(vitestIntegrationConfig).toContain('defineConfig');
    expect(vitestIntegrationConfig).toContain("include: ['**/__tests__/**/*.integration.test.+(js|ts)']");
    expect(vitestIntegrationConfig).toContain('testTimeout: 60000');
    expect(vitestIntegrationConfig).toContain("'./vitest.integration.config.setup.ts'");
    expect(vitestIntegrationSetup).toContain("import './jest.extended.setup.js';");
  });

  it('registers snapshot serializers through a generated setup file', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    const jestConfig = `export default {
  testEnvironment: 'jsdom',
  snapshotSerializers: ['enzyme-to-json/serializer', './test-utils/custom-serializer.js'],
};`;
    await writeFile(join(tempDir, 'jest.config.ts'), jestConfig);

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    const vitestSetup = await readFile(join(tempDir, 'vitest.config.setup.ts'), 'utf-8');
    const snapshotSetup = await readFile(join(tempDir, 'vitest.config.snapshot-serializers.setup.ts'), 'utf-8');

    expect(vitestConfig).not.toContain('snapshotSerializers:');
    expect(vitestConfig).toContain("'./vitest.config.setup.ts'");
    expect(vitestSetup).toContain("import './vitest.config.snapshot-serializers.setup.ts';");
    expect(snapshotSetup).toContain("import * as snapshotSerializer0Module from 'enzyme-to-json/serializer';");
    expect(snapshotSetup).toContain("import * as snapshotSerializer1Module from './test-utils/custom-serializer.js';");
    expect(snapshotSetup).toContain('expect.addSnapshotSerializer(snapshotSerializer0');
    expect(snapshotSetup).toContain('expect.addSnapshotSerializer(snapshotSerializer1');
  });

  it('includes discovered root setup files in the generated Vitest setup module', async () => {
    const scriptsTestsDir = join(tempDir, 'scripts', 'tests');
    await mkdir(scriptsTestsDir, { recursive: true });
    await writeFile(join(scriptsTestsDir, 'setup-env.js'), 'globalThis.__SETUP_ENV__ = true;\n');
    await writeFile(
      join(tempDir, 'test.spec.ts'),
      "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });",
    );

    runCli(tempDir);

    const vitestSetup = await readFile(join(tempDir, 'vitest.config.setup.ts'), 'utf-8');
    expect(vitestSetup).toContain('import "./scripts/tests/setup-env.js";');
  });

  it('leaves auxiliary setup files unchanged when they only need repo-specific migration work', async () => {
    const scriptsTestsDir = join(tempDir, 'scripts', 'tests');
    await mkdir(scriptsTestsDir, { recursive: true });
    await writeFile(
      join(scriptsTestsDir, 'setup-env.js'),
      "import messages from '../../i18n/en-US';\nconst intl = createIntl({});\n",
    );
    await writeFile(
      join(tempDir, 'test.spec.ts'),
      "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });",
    );

    runCli(tempDir);

    const updatedSetupEnv = await readFile(join(scriptsTestsDir, 'setup-env.js'), 'utf-8');
    expect(updatedSetupEnv).toContain("import messages from '../../i18n/en-US';");
    expect(updatedSetupEnv).toContain('createIntl({});');
  });

  it('adds a Testing Library compat setup when the dependency is present', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { '@testing-library/react': '^16.0.0' } }, null, 2),
    );
    await writeFile(
      join(tempDir, 'test.spec.tsx'),
      "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });",
    );

    runCli(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    const vitestSetup = await readFile(join(tempDir, 'vitest.config.setup.ts'), 'utf-8');
    const testingLibraryCompat = await readFile(join(tempDir, 'vitest-testing-library-compat.ts'), 'utf-8');

    expect(vitestConfig).toContain("'./vitest.config.setup.ts'");
    expect(vitestSetup).toContain('import "./vitest-testing-library-compat.ts";');
    expect(testingLibraryCompat).toContain('const originalFindByText = screen.findByText.bind(screen);');
    expect(testingLibraryCompat).toContain('return screen.getByText');
  });
});
