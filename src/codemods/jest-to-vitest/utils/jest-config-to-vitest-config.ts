import { Lang, parseAsync } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes.js';

const JEST_TO_VITEST_TEST_PROPERTY_MAPPINGS: Array<[string, string]> = [
  ['testEnvironment', 'environment'],
  ['testTimeout', 'testTimeout'],
  ['clearMocks', 'clearMocks'],
  ['resetMocks', 'mockReset'],
  ['restoreMocks', 'restoreMocks'],
  ['testMatch', 'include'],
  ['testPathIgnorePatterns', 'exclude'],
  ['setupFiles', 'setupFiles'],
  ['setupFilesAfterEnv', 'setupFiles'],
];

const JEST_TO_VITEST_COVERAGE_PROPERTY_MAPPINGS: Array<[string, string]> = [
  ['coverageDirectory', 'dir'],
  ['collectCoverageFrom', 'include'],
  ['coverageReporters', 'reporter'],
];

function findPairValue(root: SgNode<TypesMap>, keyName: string): string | null {
  const pairs = root.findAll({ rule: { kind: 'pair' } });
  for (const pair of pairs) {
    const children = pair.children();
    const keyNode = children.find(c => c.kind() === 'property_identifier' || c.kind() === 'string');
    if (keyNode == null) continue;

    const keyText = keyNode.kind() === 'string' ? keyNode.text().replace(/^['"]|['"]$/g, '') : keyNode.text();

    if (keyText !== keyName) continue;

    return children.at(-1)?.text() ?? null;
  }
  return null;
}

function isEmptyCollection(value: string): boolean {
  return value.trim() === '[]' || value.trim() === '{}';
}

function extractCoverageThresholds(root: SgNode<TypesMap>): string | null {
  const pairs = root.findAll({ rule: { kind: 'pair' } });
  const coverageThresholdPair = pairs.find(pair => {
    const children = pair.children();
    return children[0]?.text() === 'coverageThreshold';
  });
  if (coverageThresholdPair == null) return null;

  const valueNode = coverageThresholdPair.children().at(-1);
  if (valueNode == null) return null;

  const innerPairs = valueNode.findAll({ rule: { kind: 'pair' } });
  const globalPair = innerPairs.find(pair => pair.children()[0]?.text() === 'global');
  if (globalPair == null) return null;

  return globalPair.children().at(-1)?.text() ?? null;
}

export interface VitestConfigMapping {
  testProperties: ReadonlyArray<readonly [string, string]>;
  coverageProperties: ReadonlyArray<readonly [string, string]>;
  coverageThresholds: string | null;
}

export async function extractVitestConfigFromJestConfig(jestConfigContent: string): Promise<VitestConfigMapping> {
  const ast = await parseAsync(Lang.TypeScript, jestConfigContent);
  const root = ast.root();

  const testProperties: Array<readonly [string, string]> = [];
  const coverageProperties: Array<readonly [string, string]> = [];
  const seenVitestKeys = new Set<string>();

  for (const [jestKey, vitestKey] of JEST_TO_VITEST_TEST_PROPERTY_MAPPINGS) {
    if (seenVitestKeys.has(vitestKey)) continue;
    const value = findPairValue(root, jestKey);
    if (value == null || isEmptyCollection(value)) continue;
    testProperties.push([vitestKey, value] as const);
    seenVitestKeys.add(vitestKey);
  }

  for (const [jestKey, vitestKey] of JEST_TO_VITEST_COVERAGE_PROPERTY_MAPPINGS) {
    const value = findPairValue(root, jestKey);
    if (value == null || isEmptyCollection(value)) continue;
    coverageProperties.push([vitestKey, value] as const);
  }

  const coverageThresholds = extractCoverageThresholds(root);

  return { testProperties, coverageProperties, coverageThresholds };
}

export function buildVitestConfigContent(mapping: VitestConfigMapping): string {
  const { testProperties, coverageProperties, coverageThresholds } = mapping;

  const hasCoverageProps = coverageProperties.length > 0 || coverageThresholds != null;
  const hasAnyProps = testProperties.length > 0 || hasCoverageProps;

  if (!hasAnyProps) {
    return [
      "import { defineConfig } from 'vitest/config';",
      '',
      'export default defineConfig({',
      '  // Configure Vitest (https://vitest.dev/config/)',
      '  test: {},',
      '});',
    ].join('\n');
  }

  const testLines: string[] = [];

  for (const [key, value] of testProperties) {
    testLines.push(`    ${key}: ${value},`);
  }

  if (hasCoverageProps) {
    testLines.push('    coverage: {');
    for (const [key, value] of coverageProperties) {
      testLines.push(`      ${key}: ${value},`);
    }
    if (coverageThresholds != null) {
      testLines.push(`      thresholds: ${coverageThresholds},`);
    }
    testLines.push('    },');
  }

  return [
    "import { defineConfig } from 'vitest/config';",
    '',
    'export default defineConfig({',
    '  // Configure Vitest (https://vitest.dev/config/)',
    '  test: {',
    ...testLines,
    '  },',
    '});',
  ].join('\n');
}
