import { describe, expect, it } from 'vitest';

import {
  buildVitestConfigContent,
  extractVitestConfigFromJestConfig,
} from '../../../../src/codemods/jest-to-vitest/utils/jest-config-to-vitest-config.js';

const FULL_JEST_CONFIG = `import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 10000,
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: [],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;`;

describe('extractVitestConfigFromJestConfig', () => {
  it('extracts test environment', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const environment = mapping.testProperties.find(([key]) => key === 'environment');
    expect(environment).toBeDefined();
    expect(environment?.[1]).toBe("'node'");
  });

  it('extracts test timeout', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const testTimeout = mapping.testProperties.find(([key]) => key === 'testTimeout');
    expect(testTimeout).toBeDefined();
    expect(testTimeout?.[1]).toBe('10000');
  });

  it('extracts clearMocks, mockReset, and restoreMocks', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const clearMocks = mapping.testProperties.find(([key]) => key === 'clearMocks');
    expect(clearMocks?.[1]).toBe('true');

    const mockReset = mapping.testProperties.find(([key]) => key === 'mockReset');
    expect(mockReset?.[1]).toBe('false');

    const restoreMocks = mapping.testProperties.find(([key]) => key === 'restoreMocks');
    expect(restoreMocks?.[1]).toBe('true');
  });

  it('maps testMatch to include', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const include = mapping.testProperties.find(([key]) => key === 'include');
    expect(include).toBeDefined();
    expect(include?.[1]).toContain("'**/*.test.ts'");
    expect(include?.[1]).toContain("'**/*.spec.ts'");
  });

  it('maps testPathIgnorePatterns to exclude', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const exclude = mapping.testProperties.find(([key]) => key === 'exclude');
    expect(exclude).toBeDefined();
    expect(exclude?.[1]).toContain("'/node_modules/'");
  });

  it('skips empty setupFilesAfterEnv', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const setupFiles = mapping.testProperties.find(([key]) => key === 'setupFiles');
    expect(setupFiles).toBeUndefined();
  });

  it('maps coverageDirectory to coverage.dir', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const dir = mapping.coverageProperties.find(([key]) => key === 'dir');
    expect(dir?.[1]).toBe("'coverage'");
  });

  it('maps collectCoverageFrom to coverage.include', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const include = mapping.coverageProperties.find(([key]) => key === 'include');
    expect(include).toBeDefined();
    expect(include?.[1]).toContain("'src/**/*.ts'");
  });

  it('maps coverageReporters to coverage.reporter', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const reporter = mapping.coverageProperties.find(([key]) => key === 'reporter');
    expect(reporter).toBeDefined();
    expect(reporter?.[1]).toContain("'text'");
    expect(reporter?.[1]).toContain("'lcov'");
    expect(reporter?.[1]).toContain("'html'");
  });

  it('maps coverageThreshold.global to coverage.thresholds', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    expect(mapping.coverageThresholds).not.toBeNull();
    expect(mapping.coverageThresholds).toContain('branches: 80');
    expect(mapping.coverageThresholds).toContain('functions: 80');
    expect(mapping.coverageThresholds).toContain('lines: 80');
    expect(mapping.coverageThresholds).toContain('statements: 80');
  });

  it('ignores unmapped jest properties like preset, roots, globals, moduleNameMapper', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const keys = mapping.testProperties.map(([key]) => key);
    expect(keys).not.toContain('preset');
    expect(keys).not.toContain('roots');
    expect(keys).not.toContain('globals');
    expect(keys).not.toContain('moduleNameMapper');
  });

  it('returns empty mapping for config with no mappable properties', async () => {
    const minimalConfig = `export default { preset: 'ts-jest' };`;
    const mapping = await extractVitestConfigFromJestConfig(minimalConfig);

    expect(mapping.testProperties).toHaveLength(0);
    expect(mapping.coverageProperties).toHaveLength(0);
    expect(mapping.coverageThresholds).toBeNull();
  });
});

describe('buildVitestConfigContent', () => {
  it('generates basic config when no properties are provided', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
    });

    expect(content).toContain("from 'vitest/config'");
    expect(content).toContain('defineConfig');
    expect(content).toContain('test: {}');
  });

  it('generates config with test properties', () => {
    const content = buildVitestConfigContent({
      testProperties: [
        ['environment', "'node'"],
        ['testTimeout', '10000'],
      ],
      coverageProperties: [],
      coverageThresholds: null,
    });

    expect(content).toContain("environment: 'node'");
    expect(content).toContain('testTimeout: 10000');
  });

  it('generates config with coverage properties', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [['dir', "'coverage'"]],
      coverageThresholds: '{ branches: 80 }',
    });

    expect(content).toContain('coverage:');
    expect(content).toContain("dir: 'coverage'");
    expect(content).toContain('thresholds: { branches: 80 }');
  });
});
