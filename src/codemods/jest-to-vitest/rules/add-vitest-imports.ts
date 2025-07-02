import type { Edit, Rule } from '@ast-grep/napi';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import { commitEditModifications, type Modifications } from '@kamaalio/codemod-kit';
import { arrays, asserts } from '@kamaalio/kamaal';

const VITEST_IMPORT_NAMES = [
  'describe',
  'expect',
  'it',
  'beforeEach',
  'beforeAll',
  'afterEach',
  'afterAll',
  'vi',
  'test',
];
const VITEST_TYPE_IMPORT_NAMES = ['Mock'];
const IMPORT_SPECIFIERS_SEARCH_RULE: Rule<TypesMap> = {
  any: VITEST_IMPORT_NAMES.map<Rule<TypesMap>>(importName => ({
    pattern: importName,
    kind: 'identifier',
  })).concat(VITEST_TYPE_IMPORT_NAMES.map(importName => ({ kind: 'type_identifier', regex: importName }))),
};

async function addVitestImports(modifications: Modifications): Promise<Modifications> {
  const root = modifications.ast.root();
  const names = arrays
    .uniques(root.findAll({ rule: IMPORT_SPECIFIERS_SEARCH_RULE }).map(name => name.text()))
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return modifications;

  const existingVitestImports = root.findAll({
    rule: { any: [{ pattern: 'import { $$$ } from "vitest"' }, { pattern: "import { $$$ } from 'vitest'" }] },
  });
  const replacement = !names.some(name => !VITEST_TYPE_IMPORT_NAMES.includes(name))
    ? `import type { ${names.join(', ')} } from 'vitest';`
    : `import { ${names.map(name => (VITEST_TYPE_IMPORT_NAMES.includes(name) ? `type ${name}` : name)).join(', ')} } from 'vitest';`;
  const edits: Array<Edit> = [];
  if (existingVitestImports.length > 0) {
    const importedVitestSpecifiers = existingVitestImports
      .map(existingVitestImport => {
        return existingVitestImport
          .findAll({ rule: { kind: 'import_specifier' } })
          .map(importSpecifier => importSpecifier.text());
      })
      .flat(1)
      .sort((a, b) => a.localeCompare(b));
    if (arrayEquals(names, importedVitestSpecifiers)) return modifications;

    edits.push(existingVitestImports[0].replace(replacement));
    if (existingVitestImports.length > 1) {
      edits.push(...existingVitestImports.map(vitestImport => vitestImport.replace('')).slice(1));
    }
  } else {
    const firstImportStatement = root.find({ rule: { kind: 'import_statement' } });
    if (firstImportStatement != null) {
      edits.push(firstImportStatement.replace(`${replacement}\n${firstImportStatement.text()}`));
    } else {
      const program = root.find({ rule: { kind: 'program' } });
      asserts.invariant(program != null, 'There should be a program in root');

      edits.push(program.replace(`${replacement}\n\n${program.text()}`));
    }
  }

  return commitEditModifications(edits, modifications);
}

function arrayEquals<T>(array1: Array<T>, array2: Array<T>): boolean {
  if (array1.length !== array2.length) return false;

  for (let index = 0; index < array1.length; index += 1) {
    if (array1[index] !== array2[index]) return false;
  }

  return true;
}

export default addVitestImports;
