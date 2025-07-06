import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import jestMockTypeToVitest from '../../../../src/codemods/jest-to-vitest/rules/jest-mock-type-to-vitest';

describe('jestMockTypeToVitest', () => {
  it.each([{ frameworkName: 'jest' }, { frameworkName: 'vi' }])(
    'removes jest from jest.Mock [$frameworkName]',
    async ({ frameworkName }) => {
      const source = `let fn: ${frameworkName}.Mock<(name: string) => number>`;

      const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
      });
      const updatedSource = modifications.ast.root().text();

      expect(updatedSource).toContain(`let fn: Mock<(name: string) => number>`);
    },
  );

  it.each([{ frameworkName: 'jest' }, { frameworkName: 'vi' }])(
    'removes jest from jest.Mock and ensure generic param is a function [$frameworkName]',
    async ({ frameworkName }) => {
      const source = `let fn: ${frameworkName}.Mock<string>`;

      const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
      });
      const updatedSource = modifications.ast.root().text();

      expect(updatedSource).toContain(`let fn: Mock<(...params: Array<unknown>) => string>`);
    },
  );

  it.each([{ frameworkName: 'jest' }, { frameworkName: 'vi' }])(
    'removes jest from jest.Mock without generic param [$frameworkName]',
    async ({ frameworkName }) => {
      const source = `let fn: ${frameworkName}.Mock`;

      const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
      });
      const updatedSource = modifications.ast.root().text();

      expect(updatedSource).toContain(`let fn: Mock`);
    },
  );

  it('removes nothing', async () => {
    const source = `let fn: Mock<(name: string) => number>`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
  });
});
