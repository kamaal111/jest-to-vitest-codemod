import { commitEditModifications, type Modifications } from '@kamaalio/codemod-kit';

async function removeJestImport(modifications: Modifications): Promise<Modifications> {
  const root = modifications.ast.root();
  const jestGlobalImports = root.findAll({
    rule: {
      all: [
        { kind: 'import_statement' },
        {
          any: [
            { pattern: "import $SPECIFIER from '@jest/globals'" },
            { pattern: 'import $SPECIFIER from "@jest/globals"' },
          ],
        },
      ],
    },
  });
  const edits = jestGlobalImports.map(node => node.replace(''));

  return commitEditModifications(edits, modifications);
}

export default removeJestImport;
