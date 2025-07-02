import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import jestMockTypeToVitest from '../../../../src/codemods/jest-to-vitest/rules/jest-mock-type-to-vitest';

describe('jestMockTypeToVitest', () => {
  it('removes jest from jest.Mock', async () => {
    const source = `let fn: jest.Mock<(name: string) => number>`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`let fn: Mock<(name: string) => number>`);
  });

  it('removes vi from vi.Mock', async () => {
    const source = `let fn: vi.Mock<(name: string) => number>`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`let fn: Mock<(name: string) => number>`);
  });

  it('removes nothing', async () => {
    const source = `let fn: Mock<(name: string) => number>`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
  });
});
