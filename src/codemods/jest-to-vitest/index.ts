import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { Lang, parseAsync, type SgNode, type SgRoot } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import type { Codemod, Modifications, RunCodemodOkResult } from '@kamaalio/codemod-kit';
import { type types, objects } from '@kamaalio/kamaal';

import packageJSON from '../../../package.json';
import hasAnyJestGlobalAPI from './utils/has-any-jest-global-api.js';
import replaceJestApiWithVi, {
  convertMockImplArrowToFunction,
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

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function fixAutoMockImportsInTransformedFiles(
  root: string,
  autoMocks: Array<{ moduleName: string; mockPath: string }>,
): Promise<void> {
  const autoMockMap = new Map(autoMocks.map(m => [m.moduleName, m.mockPath]));

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
      } else if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        await fixAutoMockInFile(fullPath, autoMockMap, root);
      }
    }
  }

  await walkDir(root);
}

async function fixAutoMockInFile(
  filePath: string,
  autoMockMap: Map<string, string>,
  projectRoot: string,
): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }

  const testDir = path.dirname(filePath);
  let modified = false;
  for (const [moduleName, mockPath] of autoMockMap) {
    const absoluteMockPath = path.resolve(projectRoot, mockPath.replace(/^\.\//, ''));
    let relativeMockPath = path.relative(testDir, absoluteMockPath);
    if (!relativeMockPath.startsWith('.')) {
      relativeMockPath = './' + relativeMockPath;
    }

    const patterns = [
      new RegExp(`vi\\.mock\\(\\s*'${escapeRegex(moduleName)}'\\s*\\)`, 'g'),
      new RegExp(`vi\\.mock\\(\\s*"${escapeRegex(moduleName)}"\\s*\\)`, 'g'),
    ];
    for (const pattern of patterns) {
      const quote = pattern.source.includes("'") ? "'" : '"';
      const replacement = `vi.mock(${quote}${moduleName}${quote}, () => import(${quote}${relativeMockPath}${quote}))`;
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        modified = true;
      }
    }
  }

  if (modified) {
    await fs.writeFile(filePath, content);
  }
}

async function fixDoneCallbacksInTransformedFiles(root: string): Promise<void> {
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
      } else if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        await fixDoneCallbackInFile(fullPath);
      }
    }
  }
  await walkDir(root);
}

async function fixDoneCallbackInFile(filePath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }

  const doneCallbackPattern = /((?:test|it)\s*\([^,]+,\s*)((?:\(\s*done\s*(?::\s*\w+)?\s*\)|done)\s*=>\s*\{)/g;
  let modified = false;
  let result = content;

  let match: RegExpExecArray | null;
  const replacements: Array<{ from: string; to: string }> = [];
  while ((match = doneCallbackPattern.exec(content)) !== null) {
    const prefix = match[1];
    const fullMatch = match[0];

    const bodyStartIdx = match.index + fullMatch.length;
    let braceDepth = 1;
    let idx = bodyStartIdx;
    while (idx < content.length && braceDepth > 0) {
      if (content[idx] === '{') braceDepth++;
      else if (content[idx] === '}') braceDepth--;
      idx++;
    }

    if (braceDepth !== 0) continue;

    const bodyContent = content.substring(bodyStartIdx, idx - 1);

    const oldSection = content.substring(match.index, idx);
    const newSection = `${prefix}() => new Promise<void>((resolve, reject) => { const done = (err?: any) => err ? reject(err) : resolve();${bodyContent}})`;

    replacements.push({ from: oldSection, to: newSection });
    modified = true;
  }

  if (!modified) return;

  for (const { from, to } of replacements) {
    result = result.replace(from, to);
  }

  await fs.writeFile(filePath, result);
}

async function fixAsyncMockFactoriesInTransformedFiles(root: string): Promise<void> {
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
      } else if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        await fixAsyncMockFactoryInFile(fullPath);
      }
    }
  }
  await walkDir(root);
}

async function fixAsyncMockFactoryInFile(filePath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }

  let modified = false;
  let result = content;

  const viMockFactoryPattern = /(vi\.mock\([^,]+,\s*)\(\)\s*=>\s*[({]/g;
  let match: RegExpExecArray | null;
  while ((match = viMockFactoryPattern.exec(content)) !== null) {
    const arrowIdx = content.indexOf('=>', match.index + match[1].length);
    if (arrowIdx < 0) continue;

    const exprStart = arrowIdx + 2;
    const nextNonSpace = content.substring(exprStart).search(/\S/);
    if (nextNonSpace < 0) continue;

    const bodyChar = content[exprStart + nextNonSpace];
    const open = bodyChar;
    const close = open === '(' ? ')' : '}';
    const start = exprStart + nextNonSpace;
    let depth = 1;
    let i = start + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === open) depth++;
      else if (content[i] === close) depth--;
      i++;
    }
    const bodySlice = content.substring(start, i);
    if (bodySlice.includes('await ') || bodySlice.includes('await(')) {
      const oldMatch = match[0];
      const newMatch = `${match[1]}async () =>` + oldMatch.slice(oldMatch.lastIndexOf('=>') + 2);
      result = result.replace(oldMatch, newMatch);
      modified = true;
    }
  }

  result = wrapNonObjectReturnsInMockFactories(result, wasModified => {
    if (wasModified) modified = true;
  });

  if (modified) {
    await fs.writeFile(filePath, result);
  }
}

function wrapNonObjectReturnsInMockFactories(content: string, onModified: (m: boolean) => void): string {
  const viMockPattern = /vi\.mock\([^,]+,\s*(?:async\s+)?\(\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  const replacements: Array<{ from: string; to: string }> = [];

  while ((match = viMockPattern.exec(content)) !== null) {
    const factoryBodyStart = match.index + match[0].length;
    let depth = 1;
    let i = factoryBodyStart;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) continue;
    const factoryBodyEnd = i - 1;
    const factoryBody = content.substring(factoryBodyStart, factoryBodyEnd);

    const returnPattern = /(\n\s*)return\s+(function\s|class\s)/g;
    let retMatch: RegExpExecArray | null;
    while ((retMatch = returnPattern.exec(factoryBody)) !== null) {
      const returnStart = factoryBodyStart + retMatch.index + retMatch[1].length;
      const afterReturn = content.indexOf('return ', returnStart) + 7;
      let retDepth = 0;
      let j = afterReturn;
      while (j < factoryBodyEnd) {
        if (content[j] === '{' || content[j] === '(') retDepth++;
        else if (content[j] === '}' || content[j] === ')') {
          if (retDepth === 0) break;
          retDepth--;
        } else if (content[j] === ';' && retDepth === 0) break;
        j++;
      }
      const returnedExpr = content.substring(afterReturn, j).trim();
      const endChar = content[j] === ';' ? ';' : '';
      const oldReturn = content.substring(returnStart, j + (endChar ? 1 : 0));
      const newReturn = `return { default: ${returnedExpr} }${endChar}`;
      replacements.push({ from: oldReturn, to: newReturn });
    }
  }

  if (replacements.length > 0) {
    onModified(true);
    let result = content;
    for (const { from, to } of replacements) {
      result = result.replace(from, to);
    }
    return result;
  }
  return content;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scanAutoMocks(
  dir: string,
  prefix: string,
  results: Array<{ moduleName: string; mockPath: string }>,
  moduleDir: string = 'src',
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await scanAutoMocks(
        path.join(dir, entry.name),
        prefix ? `${prefix}/${entry.name}` : entry.name,
        results,
        moduleDir,
      );
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const nameWithoutExt = entry.name.replace(/\.(ts|tsx|js|jsx)$/, '');
      const moduleName = prefix ? `${prefix}/${nameWithoutExt}` : nameWithoutExt;
      const mockRelPath = `./${moduleDir}/__mocks__/${moduleName}`;
      results.push({ moduleName, mockPath: mockRelPath });
    }
  }
}

export const JEST_TO_VITEST_LANGUAGE = Lang.TypeScript;
export const JEST_TO_VITEST_TSX_LANGUAGE = Lang.Tsx;

function jestToVitestFilter(root: SgNode<TypesMap, Kinds<TypesMap>>): boolean {
  if (hasAnyJestGlobalAPI(root)) return true;
  return root.find({ rule: { pattern: 'jest.$REST' } }) != null;
}

export async function jestToVitestModifications(modifications: Modifications): Promise<Modifications> {
  const root = modifications.ast.root();
  if (!jestToVitestFilter(root)) return modifications;

  return replaceJestApiWithVi(modifications)
    .then(replaceJestRequireMock)
    .then(convertMockImplArrowToFunction)
    .then(doneCallbackToPromise)
    .then(requireToDynamicImport)
    .then(jestFocusedSkippedToVitest)
    .then(jestHooksToVitest)
    .then(jestMockTypeToVitest)
    .then(addVitestImports)
    .then(removeJestImport);
}

async function jestToVitest(content: SgRoot<TypesMap> | string, filename?: types.Optional<string>): Promise<string> {
  const ast = typeof content === 'string' ? await parseAsync(JEST_TO_VITEST_LANGUAGE, content) : content;

  return jestToVitestModifications(makeJestToVitestInitialModification(ast, filename)).then(modifications => {
    return modifications.ast.root().text();
  });
}

export function makeJestToVitestInitialModification(
  ast: SgRoot<TypesMap>,
  filename: types.Optional<string> = null,
): Modifications {
  return {
    lang: JEST_TO_VITEST_LANGUAGE,
    report: { changesApplied: 0 },
    ast,
    filename,
    history: [ast],
  };
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
  const setupContent = setupLines.join('\n') + '\n';
  await fs.writeFile(path.join(root, setupFileName), setupContent);
  return setupFileName;
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

  const existingVitestConfig = content.find(item => item.isFile() && item.name.startsWith('vitest.config.'));
  if (existingVitestConfig != null) return;

  let pathAliases: ReadonlyArray<readonly [string, string]> = [];
  try {
    const tsconfigContent = await fs.readFile(path.join(root, 'tsconfig.json'), { encoding: 'utf-8' });
    pathAliases = extractTsconfigPathAliases(tsconfigContent);
  } catch {
    // No tsconfig.json or unreadable — skip path aliases
  }

  const jestConfigFile = content.find(item => item.isFile() && item.name.startsWith('jest.config.'));
  const defaultMapping: VitestConfigMapping = {
    testProperties: [],
    coverageProperties: [],
    coverageThresholds: null,
    pathAliases,
  };

  let configMapping: VitestConfigMapping;
  if (jestConfigFile != null) {
    try {
      const jestConfigContent = await fs.readFile(path.join(root, jestConfigFile.name), {
        encoding: 'utf-8',
      });
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

  let packageJsonContent: string | null = null;
  try {
    packageJsonContent = await fs.readFile(path.join(root, 'package.json'), { encoding: 'utf-8' });
  } catch {
    // No package.json — still generate vitest config
  }

  const packageJson = packageJsonContent != null ? JSON.parse(packageJsonContent) : null;
  if (packageJson != null) {
    const existingVitestDependency = packageJson.devDependencies?.vitest;
    if (existingVitestDependency != null) return;
  }

  const allDeps =
    packageJson != null ? { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) } : {};
  const babelRewirePlugin =
    allDeps['babel-plugin-rewire-ts'] != null ? 'rewire-ts' : allDeps['babel-plugin-rewire'] != null ? 'rewire' : null;
  const hasJestDom = allDeps['@testing-library/jest-dom'] != null;
  const hasReact = allDeps['react'] != null;

  const webpackRemotes: string[] = [];
  try {
    const webpackFiles = await fs.readdir(path.join(root, 'conf', 'webpack'), { withFileTypes: true });
    for (const f of webpackFiles) {
      if (!f.isFile()) continue;
      const webpackContent = await fs.readFile(path.join(root, 'conf', 'webpack', f.name), { encoding: 'utf-8' });
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

  const moduleDirectories = configMapping.moduleDirectories ?? [];
  const autoMocks: Array<{ moduleName: string; mockPath: string }> = [];

  for (const moduleDir of moduleDirectories) {
    const mocksDir = path.join(root, moduleDir, '__mocks__');
    try {
      await scanAutoMocks(mocksDir, '', autoMocks, moduleDir);
    } catch {
      // No __mocks__ directory in this module directory
    }
  }

  const mockHelperSetupFile = 'vitest-mock-helper.ts';
  const mockHelperDeclarationFile = 'vitest-mock-helper.d.ts';
  const mockHelperDeclarationContent = [
    'type MockModuleHelper = <T extends object>(exports: T) => T;',
    '',
    'declare global {',
    '  var __mockModule: MockModuleHelper;',
    '}',
    '',
    'export {};',
    '',
  ].join('\n');
  const mockHelperContent = [
    mockHelperDeclarationContent,
    "Object.defineProperty(globalThis, '__mockModule', {",
    '  value: <T extends object>(exports: T): T =>',
    '    new Proxy(exports, {',
    '      get(target, prop, receiver) {',
    '        if (prop in target) return Reflect.get(target, prop, receiver);',
    '        return undefined;',
    '      },',
    '      has() {',
    '        return true;',
    '      },',
    '    }),',
    '  configurable: true,',
    '  writable: true,',
    '});',
    '',
  ].join('\n');
  await fs.writeFile(path.join(root, mockHelperSetupFile), mockHelperContent);
  const mockHelperDeclarationDirs = [
    root,
    ...((await directoryExists(path.join(root, 'src'))) ? [path.join(root, 'src')] : []),
    ...((await directoryExists(path.join(root, 'tests'))) ? [path.join(root, 'tests')] : []),
  ];
  for (const dir of mockHelperDeclarationDirs) {
    await fs.writeFile(path.join(dir, mockHelperDeclarationFile), mockHelperDeclarationContent);
  }

  let autoMockSetupFile: string | undefined;
  if (autoMocks.length > 0) {
    autoMockSetupFile = 'vitest-auto-mocks.ts';
    const setupLines = ["import { vi } from 'vitest';", ''];
    for (const { moduleName, mockPath } of autoMocks) {
      setupLines.push(`vi.mock(${JSON.stringify(moduleName)}, () => import(${JSON.stringify(mockPath)}));`);
    }
    setupLines.push('');
    await fs.writeFile(path.join(root, autoMockSetupFile), setupLines.join('\n'));
  }

  const additionalSetupFiles: string[] = [`./${mockHelperSetupFile}`];
  const commonSetupPaths = ['scripts/tests/setup-env.js', 'scripts/tests/setup-env.ts'];
  for (const setupPath of commonSetupPaths) {
    try {
      await fs.access(path.join(root, setupPath));
      additionalSetupFiles.push(`./${setupPath}`);
    } catch {
      // File doesn't exist
    }
  }

  const customEnvSetupFile = await generateCustomEnvSetup(root, configMapping);
  if (customEnvSetupFile != null) {
    additionalSetupFiles.push(`./${customEnvSetupFile}`);
  }

  configMapping = {
    ...configMapping,
    babelRewirePlugin,
    hasJestDom,
    hasReact,
    webpackRemotes,
    autoMocks,
    autoMockSetupFile,
    additionalSetupFiles,
  };

  const vitestConfigContent = buildVitestConfigContent(configMapping);
  await fs.writeFile(path.join(root, 'vitest.config.ts'), vitestConfigContent);

  if (autoMocks.length > 0) {
    await fixAutoMockImportsInTransformedFiles(root, autoMocks);
  }

  await fixDoneCallbacksInTransformedFiles(root);
  await fixAsyncMockFactoriesInTransformedFiles(root);

  if (packageJson != null && packageJsonContent != null) {
    const conditionalDeps: Record<string, string> = {};
    for (const [depName, { version, condition }] of Object.entries(CONDITIONAL_DEV_DEPENDENCIES)) {
      if (condition(configMapping)) {
        conditionalDeps[depName] = version;
      }
    }

    const devDependencies = objects.omitBy(
      Object.fromEntries(
        Object.entries({
          ...(packageJson.devDependencies ?? {}),
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
