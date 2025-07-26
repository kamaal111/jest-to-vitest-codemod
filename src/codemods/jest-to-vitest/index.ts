import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { Lang, parseAsync, type SgNode, type SgRoot } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import type { Codemod, Modifications, RunCodemodOkResult } from '@kamaalio/codemod-kit';
import { type types, objects } from '@kamaalio/kamaal';

import hasAnyJestGlobalAPI from './utils/has-any-jest-global-api.js';
import replaceJestApiWithVi from './rules/replace-jest-api-with-vi.js';
import jestHooksToVitest from './rules/jest-hooks-to-vitest.js';
import jestMockTypeToVitest from './rules/jest-mock-type-to-vitest.js';
import addVitestImports from './rules/add-vitest-imports.js';
import removeJestImport from './rules/remove-jest-import.js';

export const JEST_TO_VITEST_LANGUAGE = Lang.TypeScript;

const ESLINT_VERSION = '^3.2.4';

function jestToVitestFilter(root: SgNode<TypesMap, Kinds<TypesMap>>): boolean {
  return hasAnyJestGlobalAPI(root);
}

export async function jestToVitestModifications(modifications: Modifications): Promise<Modifications> {
  const root = modifications.ast.root();
  if (!jestToVitestFilter(root)) return modifications;

  return replaceJestApiWithVi(modifications)
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

async function jestToVitestPostTransform(
  {
    root,
    results,
  }: {
    root: string;
    results: Array<RunCodemodOkResult>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codemod: Codemod,
): Promise<void> {
  if (results.length === 0) return;

  let content: Array<Dirent<string>>;
  try {
    content = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  const existingVitestConfig = content.find(item => item.isFile() && item.name.startsWith('vitest.config.'));
  if (existingVitestConfig != null) return;

  const vitestConfigContent = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Configure Vitest (https://vitest.dev/config/)
  test: {},
});
  `.trim();

  await fs.writeFile(path.join(root, 'vitest.config.ts'), vitestConfigContent);

  let packageJsonContent: string;
  try {
    packageJsonContent = await fs.readFile(path.join(root, 'package.json'), { encoding: 'utf-8' });
  } catch {
    // Just a project without a package.json
    return;
  }

  const packageJson = JSON.parse(packageJsonContent);
  const existingVitestDependency = packageJson.devDependencies?.vitest;
  if (existingVitestDependency != null) return;

  const devDependencies = objects.omitBy(
    Object.fromEntries(
      Object.entries({
        ...(packageJson.devDependencies ?? {}),
        vitest: ESLINT_VERSION,
      }).sort(([a], [b]) => a.localeCompare(b)),
    ),
    item => item == null,
  );
  const updatedPackageJson = { ...packageJson, devDependencies };
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(updatedPackageJson, null, 2) + '\n');
}

export const JEST_TO_VITEST_CODEMOD: Codemod = {
  name: 'jest-to-vitest-transformer',
  languages: [JEST_TO_VITEST_LANGUAGE],
  transformer: jestToVitest,
  postTransform: jestToVitestPostTransform,
};

export default jestToVitest;
