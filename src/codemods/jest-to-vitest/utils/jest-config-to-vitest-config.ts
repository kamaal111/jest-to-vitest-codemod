import { Lang, parseAsync } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes.js';

// Simple 1-to-1 Jest → Vitest property mappings (setupFiles* and collectCoverageFrom need special handling)
const JEST_TO_VITEST_TEST_PROPERTY_MAPPINGS: Array<[string, string]> = [
  ['testEnvironment', 'environment'],
  ['testTimeout', 'testTimeout'],
  ['clearMocks', 'clearMocks'],
  ['resetMocks', 'mockReset'],
  ['restoreMocks', 'restoreMocks'],
  ['testMatch', 'include'],
];

const JEST_TO_VITEST_COVERAGE_PROPERTY_MAPPINGS: Array<[string, string]> = [
  ['coverageDirectory', 'dir'],
  ['coverageReporters', 'reporter'],
];

// Locate the top-level Jest config object that is the default export.
// This prevents false matches from nested objects (e.g. globals, coverageThreshold).
function findConfigObjectNode(root: SgNode<TypesMap>): SgNode<TypesMap> | null {
  // Pattern: const config = { ... }; export default config;
  const exportDefault = root.find({ rule: { pattern: 'export default $NAME' } });
  if (exportDefault != null) {
    const nameNode = exportDefault.getMatch('NAME');
    if (nameNode != null && nameNode.kind() === 'identifier') {
      const name = nameNode.text();
      const varDecl = root.find({
        rule: {
          kind: 'lexical_declaration',
          has: {
            kind: 'variable_declarator',
            has: { kind: 'identifier', regex: `^${name}$` },
          },
        },
      });
      if (varDecl != null) {
        return varDecl.find({ rule: { kind: 'object' } });
      }
    }
  }

  // Pattern: export default { ... };
  const inlineExport = root.find({
    rule: { kind: 'export_statement', has: { kind: 'object' } },
  });
  if (inlineExport != null) {
    return inlineExport.find({ rule: { kind: 'object' } });
  }

  // Pattern: module.exports = { ... };
  const moduleExports = root.find({ rule: { pattern: 'module.exports = $OBJ' } });
  if (moduleExports != null) {
    const obj = moduleExports.getMatch('OBJ');
    if (obj != null && obj.kind() === 'object') return obj;
  }

  return null;
}

// Return only the immediate pair children of an object node, avoiding nested objects.
function getDirectPairs(objectNode: SgNode<TypesMap>): Array<SgNode<TypesMap>> {
  return objectNode.children().filter(c => c.kind() === 'pair');
}

// Punctuation node kinds used as delimiters in array and object literals.
const COLLECTION_DELIMITER_KINDS: ReadonlySet<string> = new Set(['[', ']', '{', '}', ',']);

// Use AST node kind + child count to detect empty arrays/objects,
// correctly handling whitespace variants like `[  ]` or `{   }`.
function isEmptyCollectionNode(valueNode: SgNode<TypesMap>): boolean {
  const kind = valueNode.kind();
  if (kind !== 'array' && kind !== 'object') return false;
  const meaningfulChildren = valueNode.children().filter(c => !COLLECTION_DELIMITER_KINDS.has(c.kind() as string));
  return meaningfulChildren.length === 0;
}

function getPairKeyText(pair: SgNode<TypesMap>): string | null {
  const children = pair.children();
  const keyNode = children.find(c => c.kind() === 'property_identifier' || c.kind() === 'string');
  if (keyNode == null) return null;
  return keyNode.kind() === 'string' ? keyNode.text().replace(/^['"]|['"]$/g, '') : keyNode.text();
}

function findValueNodeInPairs(pairs: Array<SgNode<TypesMap>>, keyName: string): SgNode<TypesMap> | null {
  for (const pair of pairs) {
    if (getPairKeyText(pair) !== keyName) continue;
    return pair.children().at(-1) ?? null;
  }
  return null;
}

// Merge setupFiles and setupFilesAfterEnv into a single vitest setupFiles array.
function extractSetupFiles(configPairs: Array<SgNode<TypesMap>>): readonly [string, string] | null {
  const setupFilesNode = findValueNodeInPairs(configPairs, 'setupFiles');
  const setupFilesAfterEnvNode = findValueNodeInPairs(configPairs, 'setupFilesAfterEnv');

  const spreads: string[] = [];
  if (setupFilesNode != null && !isEmptyCollectionNode(setupFilesNode)) {
    spreads.push(`...${setupFilesNode.text()}`);
  }
  if (setupFilesAfterEnvNode != null && !isEmptyCollectionNode(setupFilesAfterEnvNode)) {
    spreads.push(`...${setupFilesAfterEnvNode.text()}`);
  }

  if (spreads.length === 0) return null;
  return ['setupFiles', `[${spreads.join(', ')}]`] as const;
}

// Split collectCoverageFrom: non-negated patterns → coverage.include,
// negated patterns (starting with '!') → coverage.exclude (with '!' removed).
function extractCoverageIncludeAndExclude(configPairs: Array<SgNode<TypesMap>>): {
  include: readonly [string, string] | null;
  exclude: readonly [string, string] | null;
} {
  const valueNode = findValueNodeInPairs(configPairs, 'collectCoverageFrom');
  if (valueNode == null || isEmptyCollectionNode(valueNode)) return { include: null, exclude: null };

  const elements = valueNode.children().filter(c => !COLLECTION_DELIMITER_KINDS.has(c.kind() as string));

  const includeItems: string[] = [];
  const excludeItems: string[] = [];

  for (const el of elements) {
    const text = el.text().trim();
    const isNegatedString = el.kind() === 'string' && (text.startsWith("'!") || text.startsWith('"!'));
    if (isNegatedString) {
      const quote = text[0];
      excludeItems.push(`${quote}${text.slice(2)}`);
    } else {
      includeItems.push(text);
    }
  }

  return {
    include: includeItems.length > 0 ? (['include', `[${includeItems.join(', ')}]`] as const) : null,
    exclude: excludeItems.length > 0 ? (['exclude', `[${excludeItems.join(', ')}]`] as const) : null,
  };
}

function extractCoverageThresholds(configPairs: Array<SgNode<TypesMap>>): string | null {
  const coverageThresholdNode = findValueNodeInPairs(configPairs, 'coverageThreshold');
  if (coverageThresholdNode == null) return null;

  const thresholdPairs = coverageThresholdNode.children().filter(c => c.kind() === 'pair');
  const globalPair = thresholdPairs.find(pair => getPairKeyText(pair) === 'global');
  if (globalPair == null) return null;

  return globalPair.children().at(-1)?.text() ?? null;
}

export interface VitestConfigMapping {
  testProperties: ReadonlyArray<readonly [string, string]>;
  coverageProperties: ReadonlyArray<readonly [string, string]>;
  coverageThresholds: string | null;
  pathAliases?: ReadonlyArray<readonly [string, string]>;
}

export function extractTsconfigPathAliases(tsconfigContent: string): ReadonlyArray<readonly [string, string]> {
  let tsconfig: unknown;
  try {
    tsconfig = JSON.parse(tsconfigContent);
  } catch {
    return [];
  }

  if (typeof tsconfig !== 'object' || tsconfig === null) return [];
  const compilerOptions = (tsconfig as Record<string, unknown>)['compilerOptions'];
  if (typeof compilerOptions !== 'object' || compilerOptions === null) return [];
  const paths = (compilerOptions as Record<string, unknown>)['paths'];
  if (typeof paths !== 'object' || paths === null) return [];

  const result: Array<readonly [string, string]> = [];
  for (const [key, value] of Object.entries(paths as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const alias = key.replace(/\/\*$/, '');
    const resolvedPath = String(value[0]).replace(/\/\*$/, '');
    result.push([alias, resolvedPath] as const);
  }
  return result;
}

export async function extractVitestConfigFromJestConfig(jestConfigContent: string): Promise<VitestConfigMapping> {
  const ast = await parseAsync(Lang.TypeScript, jestConfigContent);
  const root = ast.root();

  const configObjectNode = findConfigObjectNode(root);
  const configPairs = configObjectNode != null ? getDirectPairs(configObjectNode) : [];

  const testProperties: Array<readonly [string, string]> = [];
  const coverageProperties: Array<readonly [string, string]> = [];

  for (const [jestKey, vitestKey] of JEST_TO_VITEST_TEST_PROPERTY_MAPPINGS) {
    const valueNode = findValueNodeInPairs(configPairs, jestKey);
    if (valueNode == null || isEmptyCollectionNode(valueNode)) continue;
    testProperties.push([vitestKey, valueNode.text()] as const);
  }

  const setupFilesEntry = extractSetupFiles(configPairs);
  if (setupFilesEntry != null) {
    testProperties.push(setupFilesEntry);
  }

  for (const [jestKey, vitestKey] of JEST_TO_VITEST_COVERAGE_PROPERTY_MAPPINGS) {
    const valueNode = findValueNodeInPairs(configPairs, jestKey);
    if (valueNode == null || isEmptyCollectionNode(valueNode)) continue;
    coverageProperties.push([vitestKey, valueNode.text()] as const);
  }

  const { include: coverageInclude, exclude: coverageExclude } = extractCoverageIncludeAndExclude(configPairs);
  if (coverageInclude != null) coverageProperties.push(coverageInclude);
  if (coverageExclude != null) coverageProperties.push(coverageExclude);

  const coverageThresholds = extractCoverageThresholds(configPairs);

  return { testProperties, coverageProperties, coverageThresholds };
}

export function buildVitestConfigContent(mapping: VitestConfigMapping): string {
  const { testProperties, coverageProperties, coverageThresholds } = mapping;
  const pathAliases = mapping.pathAliases ?? [];

  const hasCoverageProps = coverageProperties.length > 0 || coverageThresholds != null;
  const hasPathAliases = pathAliases.length > 0;
  const hasAnyProps = testProperties.length > 0 || hasCoverageProps;

  const importLines = ["import { defineConfig } from 'vitest/config';"];
  if (hasPathAliases) {
    importLines.push("import { fileURLToPath } from 'node:url';");
  }

  if (!hasAnyProps && !hasPathAliases) {
    return [
      ...importLines,
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

  const resolveLines: string[] = [];
  if (hasPathAliases) {
    resolveLines.push('  resolve: {');
    resolveLines.push('    alias: {');
    for (const [alias, aliasPath] of pathAliases) {
      resolveLines.push(`      '${alias}': fileURLToPath(new URL('${aliasPath}', import.meta.url)),`);
    }
    resolveLines.push('    },');
    resolveLines.push('  },');
  }

  const testBlock = testLines.length > 0 ? ['  test: {', ...testLines, '  },'] : ['  test: {},'];

  return [
    ...importLines,
    '',
    'export default defineConfig({',
    '  // Configure Vitest (https://vitest.dev/config/)',
    ...resolveLines,
    ...testBlock,
    '});',
  ].join('\n');
}
