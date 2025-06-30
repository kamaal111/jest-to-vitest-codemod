import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import jestHooksToVitest from '../../../../src/codemods/jest-to-vitest/rules/jest-hooks-to-vitest';

describe('beforeEach', () => {
  it('removes return', async () => {
    const source = `beforeEach(() => setActivePinia(createTestingPinia()))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestHooksToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`beforeEach(() => { setActivePinia(createTestingPinia()) })`);
  });

  it("doesn't anything", async () => {
    const source = `beforeEach(() => { setActivePinia(createTestingPinia()) })`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestHooksToVitest(makeJestToVitestInitialModification(ast));
    });
  });
});

describe('beforeAll', () => {
  it('removes return', async () => {
    const source = `beforeAll(() => setActivePinia(createTestingPinia()))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestHooksToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`beforeAll(() => { setActivePinia(createTestingPinia()) })`);
  });

  it("doesn't anything", async () => {
    const source = `beforeAll(() => { setActivePinia(createTestingPinia()) })`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestHooksToVitest(makeJestToVitestInitialModification(ast));
    });
  });
});
