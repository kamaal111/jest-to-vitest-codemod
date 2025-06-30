import { describe, expect, it } from 'vitest';
import removeJestImport from '../../../../src/codemods/jest-to-vitest/rules/remove-jest-import';
import { invalidRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';

describe('removeJestImport', () => {
  it('removes jest import', async () => {
    const source = `import { describe } from '@jest/globals'`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return removeJestImport(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest`);
  });

  it('removes jest import with default import specifier', async () => {
    const source = `import jestGlobals from '@jest/globals'`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return removeJestImport(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest`);
  });
});
