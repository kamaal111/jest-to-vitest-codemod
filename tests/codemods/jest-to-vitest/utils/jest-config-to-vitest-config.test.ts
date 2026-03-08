import { describe, expect, it } from 'vitest';

import {
  buildVitestConfigContent,
  extractTsconfigPathAliases,
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

  it('does not map testPathIgnorePatterns (semantics differ between jest regex and vitest glob)', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const testPropsKeys = mapping.testProperties.map(([key]) => key);
    expect(testPropsKeys).not.toContain('exclude');
  });

  it('skips empty setupFilesAfterEnv', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    expect(mapping.setupFiles).toBeNull();
  });

  it('merges non-empty setupFiles and setupFilesAfterEnv into a single setupFiles array', async () => {
    const config = `const config = {
  setupFiles: ['./setup1.ts'],
  setupFilesAfterEnv: ['./setupAfterEnv.ts'],
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.setupFiles).toContain("'./setup1.ts'");
    expect(mapping.setupFiles).toContain("'./setupAfterEnv.ts'");
  });

  it('only merges setupFilesAfterEnv when setupFiles is absent', async () => {
    const config = `const config = {
  setupFilesAfterEnv: ['./setupAfterEnv.ts'],
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.setupFiles).toContain("'./setupAfterEnv.ts'");
  });

  it('treats empty array with spaces as an empty collection', async () => {
    const config = `const config = {
  setupFiles: [  ],
  testEnvironment: 'node',
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.setupFiles).toBeNull();

    const environment = mapping.testProperties.find(([key]) => key === 'environment');
    expect(environment).toBeDefined();
  });

  it('treats empty object with spaces as an empty collection', async () => {
    const config = `const config = {
  coverageThreshold: {  },
  testEnvironment: 'node',
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.coverageThresholds).toBeNull();

    const environment = mapping.testProperties.find(([key]) => key === 'environment');
    expect(environment).toBeDefined();
  });

  it('maps coverageDirectory to coverage.dir', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const dir = mapping.coverageProperties.find(([key]) => key === 'dir');
    expect(dir?.[1]).toBe("'coverage'");
  });

  it('maps non-negated collectCoverageFrom entries to coverage.include', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const include = mapping.coverageProperties.find(([key]) => key === 'include');
    expect(include).toBeDefined();
    expect(include?.[1]).toContain("'src/**/*.ts'");
    expect(include?.[1]).not.toContain('!');
  });

  it('maps negated collectCoverageFrom entries to coverage.exclude', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const exclude = mapping.coverageProperties.find(([key]) => key === 'exclude');
    expect(exclude).toBeDefined();
    expect(exclude?.[1]).toContain("'src/**/*.d.ts'");
    expect(exclude?.[1]).not.toContain('!');
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

  it('ignores unmapped jest properties like preset and roots', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    const keys = mapping.testProperties.map(([key]) => key);
    expect(keys).not.toContain('preset');
    expect(keys).not.toContain('roots');
  });

  it('extracts globals as define entries', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    expect(mapping.globals).toBeDefined();
    expect(mapping.globals!.length).toBeGreaterThan(0);
  });

  it('extracts moduleNameMapper aliases', async () => {
    const mapping = await extractVitestConfigFromJestConfig(FULL_JEST_CONFIG);

    expect(mapping.moduleNameMapperAliases).toBeDefined();
    expect(mapping.moduleNameMapperAliases!.length).toBeGreaterThan(0);
    const aliasKeys = mapping.moduleNameMapperAliases!.map(([key]) => key);
    expect(aliasKeys).toContain('@/(.*)');
  });

  it('extracts moduleNameMapper from Object.assign pattern', async () => {
    const config = `module.exports = Object.assign(baseConfig, {
  moduleNameMapper: {
    '^dnd-core$': 'dnd-core/dist/cjs',
    'box-locale-data': '<rootDir>/node_modules/@box/cldr-data/locale-data/en-US',
  },
});`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.moduleNameMapperAliases).toBeDefined();
    const aliases = mapping.moduleNameMapperAliases!;
    expect(aliases.find(([k]) => k === 'dnd-core')?.[1]).toBe('dnd-core/dist/cjs');
    expect(aliases.find(([k]) => k === 'box-locale-data')?.[1]).toBe('./node_modules/@box/cldr-data/locale-data/en-US');
  });

  it('extracts snapshot serializers as literal entries', async () => {
    const config = `const config = {
  snapshotSerializers: ['enzyme-to-json/serializer', './test-utils/custom-serializer.js'],
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.snapshotSerializers).toEqual(["'enzyme-to-json/serializer'", "'./test-utils/custom-serializer.js'"]);
  });

  it('detects CSS patterns in moduleNameMapper and sets hasCssMock', async () => {
    const config = `const config = {
  moduleNameMapper: {
    '\\\\.(css|scss)$': '<rootDir>/test-utils/style-mock.js',
  },
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.hasCssMock).toBe(true);
    const aliasKeys = (mapping.moduleNameMapperAliases ?? []).map(([key]) => key);
    expect(aliasKeys).not.toContain('\\.(css|scss)$');
  });

  it('does not pick up nested properties as top-level config', async () => {
    const config = `const config = {
  globals: {
    testEnvironment: 'wrongvalue',
  },
  testEnvironment: 'node',
};
export default config;`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    const environment = mapping.testProperties.find(([key]) => key === 'environment');
    expect(environment?.[1]).toBe("'node'");
  });

  it('returns empty mapping for config with no mappable properties', async () => {
    const minimalConfig = `export default { preset: 'ts-jest' };`;
    const mapping = await extractVitestConfigFromJestConfig(minimalConfig);

    expect(mapping.testProperties).toHaveLength(0);
    expect(mapping.coverageProperties).toHaveLength(0);
    expect(mapping.coverageThresholds).toBeNull();
  });

  it('extracts custom export conditions, css mocks, transform ignores, and module directories', async () => {
    const config = `export default {
  testEnvironment: './config/custom-jsdom-env.js',
  testEnvironmentOptions: {
    customExportConditions: ['worker'],
  },
  moduleDirectories: ['src', 'node_modules'],
  transformIgnorePatterns: ['/node_modules/(?!(foo-esm-package))/'],
  moduleNameMapper: {
    '\\\\.(css|scss)$': '<rootDir>/tests/style-mock.js',
    '\\\\.(png|svg)$': '<rootDir>/tests/file-mock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};`;
    const mapping = await extractVitestConfigFromJestConfig(config);

    expect(mapping.testProperties.find(([key]) => key === 'environment')?.[1]).toBe("'jsdom'");
    expect(mapping.rawTestEnvironment).toBe("'./config/custom-jsdom-env.js'");
    expect(mapping.customExportConditions).toBe("['worker']");
    expect(mapping.hasTransformIgnorePatterns).toBe(true);
    expect(mapping.hasCssMock).toBe(true);
    expect(mapping.moduleDirectories).toEqual(['src']);
    expect(mapping.moduleNameMapperAliases).toEqual([['@/(.*)', './src/$1']]);
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

  it('generates plugins section with tsconfigPaths when path aliases are provided', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      pathAliases: [['@', './src']],
    });

    expect(content).toContain("import tsconfigPaths from 'vite-tsconfig-paths'");
    expect(content).toContain('plugins: [tsconfigPaths()]');
  });

  it('does not add tsconfigPaths import when no path aliases are provided', () => {
    const content = buildVitestConfigContent({
      testProperties: [['environment', "'node'"]],
      coverageProperties: [],
      coverageThresholds: null,
    });

    expect(content).not.toContain('tsconfigPaths');
  });

  it('generates define block from globals', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      globals: [
        ['__APPNAME__', "'enduserapp'"],
        ['__VERSION__', "'1.0.0'"],
      ],
    });

    expect(content).toContain('define:');
    expect(content).toContain("__APPNAME__: JSON.stringify('enduserapp')");
    expect(content).toContain("__VERSION__: JSON.stringify('1.0.0')");
  });

  it('generates resolve.alias from moduleNameMapperAliases', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      moduleNameMapperAliases: [
        ['dnd-core', 'dnd-core/dist/cjs'],
        ['box-locale-data', './node_modules/@box/cldr-data/locale-data/en-US'],
      ],
    });

    expect(content).toContain('resolve:');
    expect(content).toContain('alias:');
    expect(content).toContain('"dnd-core": "dnd-core/dist/cjs"');
    expect(content).toContain('path.resolve(__dirname, "./node_modules/@box/cldr-data/locale-data/en-US")');
  });

  it('adds css: false when hasCssMock is true', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      hasCssMock: true,
    });

    expect(content).toContain('css: false');
  });

  it('does not emit snapshot serializers directly in the Vitest config', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      snapshotSerializers: ["'enzyme-to-json/serializer'"],
    });

    expect(content).not.toContain('snapshotSerializers:');
  });

  it('emits setupFiles when generated setup modules are provided', () => {
    const content = buildVitestConfigContent({
      testProperties: [],
      coverageProperties: [],
      coverageThresholds: null,
      additionalSetupFiles: ['./vitest.config.setup.ts'],
    });

    expect(content).toContain("setupFiles: ['./vitest.config.setup.ts']");
  });

  it('generates config with both test properties and path aliases', () => {
    const content = buildVitestConfigContent({
      testProperties: [['environment', "'node'"]],
      coverageProperties: [],
      coverageThresholds: null,
      pathAliases: [['@', './src']],
    });

    expect(content).toContain("environment: 'node'");
    expect(content).toContain('plugins: [tsconfigPaths()]');
  });

  it('generates advanced compatibility plugins when the mapping requires them', () => {
    const content = buildVitestConfigContent({
      testProperties: [['environment', "'jsdom'"]],
      coverageProperties: [],
      coverageThresholds: null,
      hasCssMock: true,
      hasTransformIgnorePatterns: true,
      hasReact: true,
      babelRewirePlugin: 'rewire',
      webpackRemotes: ['@scope/app-remote'],
      customExportConditions: "['worker']",
      additionalSetupFiles: ['./vitest.config.setup.ts'],
    });

    expect(content).toContain('function jsxInJsPlugin(): Plugin');
    expect(content).toContain('function babelRewirePlugin(): Plugin');
    expect(content).toContain('function webpackRemotesPlugin(): Plugin');
    expect(content).toContain('function cssMockPlugin(): Plugin');
    expect(content).toContain("conditions: ['import', 'module', 'browser', 'default']");
    expect(content).toContain("setupFiles: ['./vitest.config.setup.ts']");
    expect(content).toContain('css: false');
    expect(content).toContain('inline: true');
    expect(content).toContain(
      'plugins: [jsxInJsPlugin(), babelRewirePlugin(), webpackRemotesPlugin(), cssMockPlugin()]',
    );
  });
});

describe('extractTsconfigPathAliases', () => {
  it('extracts path aliases from compilerOptions.paths', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
        },
      },
    });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toEqual(['@', './src']);
  });

  it('strips /* suffix from both alias key and path value', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          '~components/*': ['src/components/*'],
        },
      },
    });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toEqual(['~components', 'src/components']);
  });

  it('extracts multiple path aliases', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
          '~utils/*': ['./src/utils/*'],
        },
      },
    });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(2);
    expect(aliases.find(([key]) => key === '@')?.[1]).toBe('./src');
    expect(aliases.find(([key]) => key === '~utils')?.[1]).toBe('./src/utils');
  });

  it('returns empty array when compilerOptions.paths is absent', () => {
    const tsconfig = JSON.stringify({ compilerOptions: { target: 'ES2022' } });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(0);
  });

  it('returns empty array when compilerOptions is absent', () => {
    const tsconfig = JSON.stringify({ include: ['src'] });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    const aliases = extractTsconfigPathAliases('not valid json {');

    expect(aliases).toHaveLength(0);
  });

  it('parses tsconfig files with comments and trailing commas (JSONC)', () => {
    const jsoncTsconfig = `{
  // TypeScript configuration with comments
  "compilerOptions": {
    "target": "ES2022", // compile target
    "paths": {
      "@/*": ["./src/*"], // main alias
      "~utils/*": ["./src/utils/*"],
    },
  },
}`;

    const aliases = extractTsconfigPathAliases(jsoncTsconfig);

    expect(aliases).toHaveLength(2);
    expect(aliases.find(([key]) => key === '@')?.[1]).toBe('./src');
    expect(aliases.find(([key]) => key === '~utils')?.[1]).toBe('./src/utils');
  });

  it('skips path entries with an empty array value', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          '@/*': [],
        },
      },
    });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(0);
  });

  it('uses only the first element from the paths value array', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: {
        paths: {
          '@/*': ['./src/*', './fallback/*'],
        },
      },
    });

    const aliases = extractTsconfigPathAliases(tsconfig);

    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toEqual(['@', './src']);
  });
});
