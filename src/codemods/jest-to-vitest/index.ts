import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { Lang, parseAsync, type SgNode, type SgRoot } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import {
  findAndReplaceConfigModifications,
  type Codemod,
  type Modifications,
  type RunCodemodOkResult,
} from '@kamaalio/codemod-kit';
import { type types, objects } from '@kamaalio/kamaal';

import packageJSON from '../../../package.json';
import hasAnyJestGlobalAPI from './utils/has-any-jest-global-api.js';
import replaceJestApiWithVi, {
  convertMockImplArrowToFunction,
  fixViCompatIssues,
  normalizeViMockFactories,
  replaceJestDontMock,
  replaceJestRequireActual,
  replaceJestRequireMock,
} from './rules/replace-jest-api-with-vi.js';
import { requireToDynamicImport } from './rules/require-to-dynamic-import.js';
import { doneCallbackToPromise } from './rules/done-callback-to-promise.js';
import jestFocusedSkippedToVitest from './rules/jest-focused-skipped-to-vitest.js';
import jestHooksToVitest from './rules/jest-hooks-to-vitest.js';
import jestMockTypeToVitest from './rules/jest-mock-type-to-vitest.js';
import addVitestImports from './rules/add-vitest-imports.js';
import removeJestImport from './rules/remove-jest-import.js';
import {
  buildVitestConfigContent,
  extractTsconfigPathAliases,
  extractVitestConfigFromJestConfig,
  type VitestConfigMapping,
} from './utils/jest-config-to-vitest-config.js';

interface AutoMockEntry {
  moduleName: string;
  mockPath: string;
}

const TEST_FILE_REGEX = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SOURCE_FILE_REGEX = /\.(ts|tsx|js|jsx)$/;

export const JEST_TO_VITEST_LANGUAGE = Lang.TypeScript;
export const JEST_TO_VITEST_TSX_LANGUAGE = Lang.Tsx;

function detectLanguageFromFilename(filename: types.Optional<string>): Lang {
  if (filename == null) return JEST_TO_VITEST_LANGUAGE;
  if (filename.endsWith('.tsx') || filename.endsWith('.jsx') || filename.endsWith('.js')) {
    return JEST_TO_VITEST_TSX_LANGUAGE;
  }
  return JEST_TO_VITEST_LANGUAGE;
}

function jestToVitestFilter(root: SgNode<TypesMap, Kinds<TypesMap>>): boolean {
  if (hasAnyJestGlobalAPI(root)) return true;
  return root.find({ rule: { pattern: 'jest.$REST' } }) != null;
}

export function makeJestToVitestInitialModification(
  ast: SgRoot<TypesMap>,
  filename: types.Optional<string> = null,
): Modifications {
  return {
    lang: detectLanguageFromFilename(filename),
    report: { changesApplied: 0 },
    ast,
    filename,
    history: [ast],
  };
}

export async function jestToVitestModifications(modifications: Modifications): Promise<Modifications> {
  const root = modifications.ast.root();
  if (!jestToVitestFilter(root)) return modifications;

  return replaceJestApiWithVi(modifications)
    .then(replaceJestDontMock)
    .then(replaceJestRequireActual)
    .then(replaceJestRequireMock)
    .then(normalizeViMockFactories)
    .then(convertMockImplArrowToFunction)
    .then(doneCallbackToPromise)
    .then(requireToDynamicImport)
    .then(jestFocusedSkippedToVitest)
    .then(jestHooksToVitest)
    .then(jestMockTypeToVitest)
    .then(addVitestImports)
    .then(removeJestImport)
    .then(fixViCompatIssues);
}

async function jestToVitest(content: SgRoot<TypesMap> | string, filename?: types.Optional<string>): Promise<string> {
  const lang = detectLanguageFromFilename(filename ?? null);
  const ast = typeof content === 'string' ? await parseAsync(lang, content) : content;

  return jestToVitestModifications(makeJestToVitestInitialModification(ast, filename)).then(modifications => {
    return modifications.ast.root().text();
  });
}

const ALWAYS_VITEST_DEV_DEPENDENCIES: Record<string, string> = {
  vitest: packageJSON.devDependencies.vitest,
  '@vitest/coverage-v8': packageJSON.devDependencies['@vitest/coverage-v8'],
};

const CONDITIONAL_DEV_DEPENDENCIES: Record<
  string,
  { version: string; condition: (mapping: VitestConfigMapping) => boolean }
> = {
  jsdom: {
    version: '^26.1.0',
    condition: mapping =>
      mapping.testProperties.some(([key, value]) => key === 'environment' && value.includes('jsdom')),
  },
  'vite-tsconfig-paths': {
    version: '^6.1.1',
    condition: mapping => (mapping.pathAliases ?? []).length > 0,
  },
  'vitest-canvas-mock': {
    version: '^1.1.3',
    condition: mapping =>
      mapping.testProperties.some(([key, value]) => key === 'setupFiles' && value.includes('vitest-canvas-mock')),
  },
};

async function generateCustomEnvSetup(root: string, configMapping: VitestConfigMapping): Promise<string | null> {
  const testEnvProp = configMapping.testProperties.find(([key]) => key === 'environment');
  if (testEnvProp == null) return null;

  const rawTestEnv = configMapping.rawTestEnvironment;
  if (rawTestEnv == null) return null;

  const stripped = rawTestEnv.replace(/^['"]|['"]$/g, '');
  if (stripped === 'jsdom' || stripped === 'node' || stripped.includes('jest-environment-')) return null;

  let envFilePath = stripped;
  if (envFilePath.startsWith('./')) envFilePath = envFilePath.slice(2);

  let envContent: string;
  try {
    envContent = await fs.readFile(path.join(root, envFilePath), { encoding: 'utf-8' });
  } catch {
    return null;
  }

  const setupLines: string[] = [];

  setupLines.push(
    "if (typeof globalThis.TextEncoder === 'undefined') {",
    "  const { TextEncoder, TextDecoder } = require('util');",
    '  globalThis.TextEncoder = TextEncoder;',
    '  globalThis.TextDecoder = TextDecoder;',
    '}',
    '',
  );

  if (envContent.includes('FontFace')) {
    setupLines.push(
      "Object.defineProperty(globalThis, 'FontFace', {",
      '  value: function FontFace(fontFamilyName: string, fontUrl: string, config: Record<string, string>) {',
      '    return {',
      '      family: fontFamilyName,',
      '      style: config.style,',
      '      weight: config.weight,',
      '      loaded: () => Promise.resolve({ url: fontUrl }),',
      '      load: () => Promise.resolve({}),',
      '    };',
      '  },',
      '  configurable: true,',
      '  writable: true,',
      '});',
    );
  }
  if (envContent.includes('document.fonts')) {
    setupLines.push(
      "if (typeof document !== 'undefined') {",
      "  Object.defineProperty(document, 'fonts', {",
      '    value: { delete: () => {}, add: () => {} },',
      '    writable: true,',
      '    configurable: true,',
      '  });',
      '}',
    );
  }
  if (envContent.includes('URL.createObjectURL')) {
    setupLines.push("if (typeof URL !== 'undefined') {", "  URL.createObjectURL = () => '';", '}');
  }

  if (setupLines.length === 0) return null;

  const setupFileName = 'vitest-custom-env-setup.ts';
  await fs.writeFile(path.join(root, setupFileName), `${setupLines.join('\n')}\n`);
  return setupFileName;
}

async function generateTestingLibraryCompatSetup(root: string): Promise<string> {
  const setupFileName = 'vitest-testing-library-compat.ts';
  const setupLines = [
    "import { screen } from '@testing-library/react';",
    '',
    'const originalFindByText = screen.findByText.bind(screen);',
    'screen.findByText = (async (...args) => {',
    '  try {',
    '    return screen.getByText(...(args as Parameters<typeof screen.getByText>));',
    '  } catch {',
    '    return originalFindByText(...args);',
    '  }',
    '}) as typeof screen.findByText;',
  ];
  await fs.writeFile(path.join(root, setupFileName), `${setupLines.join('\n')}\n`);
  return setupFileName;
}

function vitestConfigNameToSnapshotSerializerSetupName(vitestConfigName: string): string {
  return vitestConfigName.replace(/\.ts$/, '.snapshot-serializers.setup.ts');
}

function vitestConfigNameToSetupFileName(vitestConfigName: string): string {
  return vitestConfigName.replace(/\.ts$/, '.setup.ts');
}

function isQuotedStringLiteral(value: string): boolean {
  return (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  );
}

function toImportStringLiteral(value: string): string {
  return isQuotedStringLiteral(value) ? value : JSON.stringify(value);
}

async function generateSnapshotSerializerSetup(
  root: string,
  setupFileName: string,
  snapshotSerializers: ReadonlyArray<string> | null | undefined,
): Promise<string | null> {
  const serializerLiterals = (snapshotSerializers ?? []).filter(isQuotedStringLiteral);
  if (serializerLiterals.length === 0) return null;

  const setupLines: string[] = [];
  for (const [index, serializer] of serializerLiterals.entries()) {
    setupLines.push(`import * as snapshotSerializer${index}Module from ${serializer};`);
  }

  setupLines.push('');

  for (const [index] of serializerLiterals.entries()) {
    setupLines.push(
      `const snapshotSerializer${index} = 'default' in snapshotSerializer${index}Module ? snapshotSerializer${index}Module.default : snapshotSerializer${index}Module;`,
      `expect.addSnapshotSerializer(snapshotSerializer${index} as Parameters<typeof expect.addSnapshotSerializer>[0]);`,
    );
    if (index < serializerLiterals.length - 1) {
      setupLines.push('');
    }
  }

  await fs.writeFile(path.join(root, setupFileName), `${setupLines.join('\n')}\n`);
  return setupFileName;
}

async function generateVitestSetupFile(
  root: string,
  setupFileName: string,
  setupEntries: ReadonlyArray<string>,
): Promise<string | null> {
  const uniqueSetupEntries = [...new Set(setupEntries.map(toImportStringLiteral))];
  if (uniqueSetupEntries.length === 0) return null;

  const setupLines = uniqueSetupEntries.map(entry => `import ${entry};`);
  await fs.writeFile(path.join(root, setupFileName), `${setupLines.join('\n')}\n`);
  return setupFileName;
}

function jestConfigNameToVitestConfigName(jestConfigName: string): string {
  const match = jestConfigName.match(/^jest\.(.+\.config)\.[jt]s$/);
  if (match != null) return `vitest.${match[1]}.ts`;
  return 'vitest.config.ts';
}

function findAdditionalJestConfigs(content: Array<Dirent<string>>): Array<Dirent<string>> {
  return content.filter(item => item.isFile() && /^jest\..+\.config\.[jt]s$/.test(item.name));
}

async function loadPrimaryVitestConfigMapping(
  root: string,
  content: Array<Dirent<string>>,
  pathAliases: ReadonlyArray<readonly [string, string]>,
): Promise<VitestConfigMapping> {
  const defaultMapping: VitestConfigMapping = {
    testProperties: [],
    coverageProperties: [],
    coverageThresholds: null,
    pathAliases,
  };

  const jestConfigFile = content.find(item => item.isFile() && item.name.startsWith('jest.config.'));
  if (jestConfigFile == null) {
    return defaultMapping;
  }

  try {
    const jestConfigContent = await fs.readFile(path.join(root, jestConfigFile.name), { encoding: 'utf-8' });
    const mapping = await extractVitestConfigFromJestConfig(jestConfigContent);
    return {
      ...mapping,
      pathAliases: pathAliases.length > 0 ? pathAliases : (mapping.pathAliases ?? []),
    };
  } catch {
    return defaultMapping;
  }
}

async function generateVitestConfigFile(
  root: string,
  vitestConfigName: string,
  jestConfigContent: string | null,
  pathAliases: ReadonlyArray<readonly [string, string]>,
  sharedOptions: {
    babelRewirePlugin: string | null;
    hasJestDom: boolean;
    hasReact: boolean;
    webpackRemotes: string[];
    additionalSetupFiles: string[];
  },
): Promise<void> {
  const defaultMapping: VitestConfigMapping = {
    testProperties: [],
    coverageProperties: [],
    coverageThresholds: null,
    pathAliases,
  };

  let configMapping: VitestConfigMapping;
  if (jestConfigContent != null) {
    try {
      const mapping = await extractVitestConfigFromJestConfig(jestConfigContent);
      configMapping = {
        ...mapping,
        pathAliases: pathAliases.length > 0 ? pathAliases : (mapping.pathAliases ?? []),
      };
    } catch {
      configMapping = defaultMapping;
    }
  } else {
    configMapping = defaultMapping;
  }

  const snapshotSerializerSetupFile = await generateSnapshotSerializerSetup(
    root,
    vitestConfigNameToSnapshotSerializerSetupName(vitestConfigName),
    configMapping.snapshotSerializers,
  );
  const setupEntries = [...(configMapping.setupFiles ?? []), ...sharedOptions.additionalSetupFiles];
  if (sharedOptions.hasJestDom) {
    setupEntries.push("'@testing-library/jest-dom/extend-expect'");
  }
  if (snapshotSerializerSetupFile != null) {
    setupEntries.push(`'./${snapshotSerializerSetupFile}'`);
  }
  const generatedSetupFile = await generateVitestSetupFile(
    root,
    vitestConfigNameToSetupFileName(vitestConfigName),
    setupEntries,
  );
  const additionalSetupFiles = generatedSetupFile != null ? [`./${generatedSetupFile}`] : [];
  if (snapshotSerializerSetupFile != null && generatedSetupFile == null) {
    additionalSetupFiles.push(`./${snapshotSerializerSetupFile}`);
  }

  const vitestConfigContent = buildVitestConfigContent({
    ...configMapping,
    setupFiles: null,
    snapshotSerializers: null,
    ...sharedOptions,
    hasJestDom: false,
    additionalSetupFiles,
  });
  await fs.writeFile(path.join(root, vitestConfigName), vitestConfigContent);
}

async function transformAuxiliaryTestFiles(root: string): Promise<void> {
  const auxiliaryDirs = ['test-utils', 'tests', 'scripts/tests'];
  const auxiliaryFiles = ['jest-mock-config.js', 'jest-cucumber-config.js'];

  for (const dirName of auxiliaryDirs) {
    await transformDirFiles(path.join(root, dirName));
  }

  for (const fileName of auxiliaryFiles) {
    await transformSingleFile(path.join(root, fileName));
  }
}

async function transformDirFiles(dirPath: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await transformDirFiles(fullPath);
    } else if (entry.isFile() && SOURCE_FILE_REGEX.test(entry.name)) {
      await transformSingleFile(fullPath);
    }
  }
}

async function transformSingleFile(filePath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }

  const ast = await parseAsync(detectLanguageFromFilename(filePath), content);
  if (jestToVitestFilter(ast.root())) {
    const transformed = await jestToVitest(content, filePath);
    if (transformed !== content) {
      await fs.writeFile(filePath, transformed);
    }
    return;
  }

  const compatibilityOnly = await fixViCompatIssues(makeJestToVitestInitialModification(ast, filePath));
  const updatedSource = compatibilityOnly.ast.root().text();
  if (updatedSource !== content) {
    await fs.writeFile(filePath, updatedSource);
  }
}

async function scanAutoMocks(dir: string, prefix: string, results: AutoMockEntry[], moduleDir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await scanAutoMocks(
        path.join(dir, entry.name),
        prefix ? `${prefix}/${entry.name}` : entry.name,
        results,
        moduleDir,
      );
      continue;
    }

    if (!entry.isFile() || !SOURCE_FILE_REGEX.test(entry.name)) {
      continue;
    }

    const nameWithoutExt = entry.name.replace(SOURCE_FILE_REGEX, '');
    const moduleName = prefix ? `${prefix}/${nameWithoutExt}` : nameWithoutExt;
    results.push({
      moduleName,
      mockPath: `./${moduleDir}/__mocks__/${moduleName}`,
    });
  }
}

async function collectAutoMocks(root: string, moduleDirectories: ReadonlyArray<string>): Promise<AutoMockEntry[]> {
  const autoMocks: AutoMockEntry[] = [];

  for (const moduleDir of moduleDirectories) {
    const mocksDir = path.join(root, moduleDir, '__mocks__');
    try {
      await scanAutoMocks(mocksDir, '', autoMocks, moduleDir);
    } catch {
      // No __mocks__ directory in this module directory
    }
  }

  return autoMocks;
}

async function rewriteAutoMockFactoriesInFile(
  filePath: string,
  autoMocks: ReadonlyMap<string, string>,
  projectRoot: string,
): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }

  const ast = await parseAsync(detectLanguageFromFilename(filePath), content);
  const modifications = await findAndReplaceConfigModifications(makeJestToVitestInitialModification(ast, filePath), [
    {
      rule: { pattern: 'vi.mock($PATH)' },
      transformer: node => {
        const pathMatch = node.getMatch('PATH')?.text().trim();
        if (pathMatch == null) return null;

        const moduleName = pathMatch.replace(/^['"]|['"]$/g, '');
        const mockPath = autoMocks.get(moduleName);
        if (mockPath == null) return null;

        const absoluteMockPath = path.resolve(projectRoot, mockPath.replace(/^\.\//, ''));
        let relativeMockPath = path.relative(path.dirname(filePath), absoluteMockPath);
        if (!relativeMockPath.startsWith('.')) {
          relativeMockPath = `./${relativeMockPath}`;
        }

        return `vi.mock(${pathMatch}, () => import(${JSON.stringify(relativeMockPath)}))`;
      },
    },
  ]);

  const updatedSource = modifications.ast.root().text();
  if (updatedSource !== content) {
    await fs.writeFile(filePath, updatedSource);
  }
}

async function rewriteAutoMockFactoriesInTransformedFiles(root: string, autoMocks: AutoMockEntry[]): Promise<void> {
  const autoMockMap = new Map(autoMocks.map(entry => [entry.moduleName, entry.mockPath]));

  async function walkDir(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile() && TEST_FILE_REGEX.test(entry.name)) {
        await rewriteAutoMockFactoriesInFile(fullPath, autoMockMap, root);
      }
    }
  }

  await walkDir(root);
}

async function jestToVitestPostTransform(
  {
    root,
  }: {
    root: string;
    results: Array<RunCodemodOkResult>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codemod: Codemod,
): Promise<void> {
  let content: Array<Dirent<string>>;
  try {
    content = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  let pathAliases: ReadonlyArray<readonly [string, string]> = [];
  try {
    const tsconfigContent = await fs.readFile(path.join(root, 'tsconfig.json'), { encoding: 'utf-8' });
    pathAliases = extractTsconfigPathAliases(tsconfigContent);
  } catch {
    // No tsconfig.json or unreadable — skip path aliases
  }

  let packageJsonContent: string | null = null;
  try {
    packageJsonContent = await fs.readFile(path.join(root, 'package.json'), { encoding: 'utf-8' });
  } catch {
    // No package.json — still generate vitest config
  }

  const packageJson = packageJsonContent != null ? JSON.parse(packageJsonContent) : null;
  const allDeps =
    packageJson != null ? { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) } : {};
  const babelRewirePlugin =
    allDeps['babel-plugin-rewire-ts'] != null ? 'rewire-ts' : allDeps['babel-plugin-rewire'] != null ? 'rewire' : null;
  const hasJestDom = allDeps['@testing-library/jest-dom'] != null;
  const hasTestingLibraryReact = allDeps['@testing-library/react'] != null;
  const hasReact = allDeps['react'] != null;

  const webpackRemotes: string[] = [];
  try {
    const webpackFiles = await fs.readdir(path.join(root, 'conf', 'webpack'), { withFileTypes: true });
    for (const file of webpackFiles) {
      if (!file.isFile()) continue;

      const webpackContent = await fs.readFile(path.join(root, 'conf', 'webpack', file.name), { encoding: 'utf-8' });
      const remoteMatches = webpackContent.matchAll(/'(@[^'/]+\/[^']+?-remote)'/g);
      for (const match of remoteMatches) {
        if (!webpackRemotes.includes(match[1])) {
          webpackRemotes.push(match[1]);
        }
      }
    }
  } catch {
    // No webpack config or unreadable
  }

  const primaryConfigMapping = await loadPrimaryVitestConfigMapping(root, content, pathAliases);
  const additionalSetupFiles: string[] = [];
  for (const setupPath of ['scripts/tests/setup-env.js', 'scripts/tests/setup-env.ts']) {
    try {
      await fs.access(path.join(root, setupPath));
      additionalSetupFiles.push(`./${setupPath}`);
    } catch {
      // File doesn't exist
    }
  }

  const customEnvSetupFile = await generateCustomEnvSetup(root, primaryConfigMapping);
  if (customEnvSetupFile != null) {
    additionalSetupFiles.push(`./${customEnvSetupFile}`);
  }
  const testingLibraryCompatSetupFile = hasTestingLibraryReact ? await generateTestingLibraryCompatSetup(root) : null;
  if (testingLibraryCompatSetupFile != null) {
    additionalSetupFiles.push(`./${testingLibraryCompatSetupFile}`);
  }

  const snapshotSerializerSetupFile = await generateSnapshotSerializerSetup(
    root,
    vitestConfigNameToSnapshotSerializerSetupName('vitest.config.ts'),
    primaryConfigMapping.snapshotSerializers,
  );
  const primarySetupEntries = [...(primaryConfigMapping.setupFiles ?? []), ...additionalSetupFiles];
  if (hasJestDom) {
    primarySetupEntries.push("'@testing-library/jest-dom/extend-expect'");
  }
  if (snapshotSerializerSetupFile != null) {
    primarySetupEntries.push(`'./${snapshotSerializerSetupFile}'`);
  }
  const generatedPrimarySetupFile = await generateVitestSetupFile(
    root,
    vitestConfigNameToSetupFileName('vitest.config.ts'),
    primarySetupEntries,
  );
  const primaryAdditionalSetupFiles = generatedPrimarySetupFile != null ? [`./${generatedPrimarySetupFile}`] : [];
  if (snapshotSerializerSetupFile != null && generatedPrimarySetupFile == null) {
    primaryAdditionalSetupFiles.push(`./${snapshotSerializerSetupFile}`);
  }

  const primaryConfigWithSharedOptions: VitestConfigMapping = {
    ...primaryConfigMapping,
    setupFiles: null,
    snapshotSerializers: null,
    babelRewirePlugin,
    hasJestDom: false,
    hasReact,
    webpackRemotes,
    additionalSetupFiles: primaryAdditionalSetupFiles,
  };

  const existingVitestConfig = content.find(item => item.isFile() && item.name.startsWith('vitest.config.'));
  if (existingVitestConfig == null) {
    const vitestConfigContent = buildVitestConfigContent(primaryConfigWithSharedOptions);
    await fs.writeFile(path.join(root, 'vitest.config.ts'), vitestConfigContent);
  }

  const additionalJestConfigs = findAdditionalJestConfigs(content);
  for (const jestConfigFile of additionalJestConfigs) {
    const vitestConfigName = jestConfigNameToVitestConfigName(jestConfigFile.name);
    const alreadyExists = content.find(item => item.isFile() && item.name === vitestConfigName);
    if (alreadyExists != null) continue;

    let jestConfigContent: string | null = null;
    try {
      jestConfigContent = await fs.readFile(path.join(root, jestConfigFile.name), { encoding: 'utf-8' });
    } catch {
      // Unreadable — generate empty config
    }

    await generateVitestConfigFile(root, vitestConfigName, jestConfigContent, pathAliases, {
      babelRewirePlugin,
      hasJestDom,
      hasReact,
      webpackRemotes,
      additionalSetupFiles: testingLibraryCompatSetupFile != null ? [`./${testingLibraryCompatSetupFile}`] : [],
    });
  }

  await transformAuxiliaryTestFiles(root);

  const autoMocks = await collectAutoMocks(root, primaryConfigMapping.moduleDirectories ?? []);
  if (autoMocks.length > 0) {
    await rewriteAutoMockFactoriesInTransformedFiles(root, autoMocks);
  }

  if (packageJson != null && packageJsonContent != null) {
    const conditionalDeps: Record<string, string> = {};
    for (const [depName, { version, condition }] of Object.entries(CONDITIONAL_DEV_DEPENDENCIES)) {
      if (condition(primaryConfigWithSharedOptions)) {
        conditionalDeps[depName] = version;
      }
    }

    const devDependencies = objects.omitBy(
      Object.fromEntries(
        Object.entries({
          ...((packageJson['devDependencies'] as Record<string, string> | undefined) ?? {}),
          ...ALWAYS_VITEST_DEV_DEPENDENCIES,
          ...conditionalDeps,
        }).sort(([a], [b]) => a.localeCompare(b)),
      ),
      item => item == null,
    );

    const indentMatch = packageJsonContent.match(/^(\s+)"/m);
    const indent = indentMatch != null ? indentMatch[1].length : 2;
    const updatedPackageJson = { ...packageJson, devDependencies };
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(updatedPackageJson, null, indent) + '\n');
  }
}

export const JEST_TO_VITEST_CODEMOD: Codemod = {
  name: 'jest-to-vitest-transformer',
  languages: [JEST_TO_VITEST_LANGUAGE, JEST_TO_VITEST_TSX_LANGUAGE],
  transformer: jestToVitest,
  postTransform: jestToVitestPostTransform,
};

export default jestToVitest;
