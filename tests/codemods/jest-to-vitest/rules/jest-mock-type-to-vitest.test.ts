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

describe('jest.Mocked -> Mocked', () => {
  it('replaces jest.Mocked with Mocked', async () => {
    const source = `let mocked: jest.Mocked<SomeClass>`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('jest.Mocked');
    expect(updatedSource).toContain('Mocked<SomeClass>');
  });
});

describe('jest.MockedFunction -> MockedFunction', () => {
  it('replaces jest.MockedFunction with MockedFunction', async () => {
    const source = `let fn: jest.MockedFunction<typeof someFunction>`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('jest.MockedFunction');
    expect(updatedSource).toContain('MockedFunction<typeof someFunction>');
  });
});

describe('jest.MockedClass -> MockedClass', () => {
  it('replaces jest.MockedClass with MockedClass', async () => {
    const source = `let cls: jest.MockedClass<typeof SomeClass>`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestMockTypeToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('jest.MockedClass');
    expect(updatedSource).toContain('MockedClass<typeof SomeClass>');
  });
});
