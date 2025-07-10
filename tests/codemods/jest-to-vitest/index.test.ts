import { describe, expect, it } from 'vitest';

import { invalidRuleSignal } from '../../test-utils/detection-theory';
import {
  JEST_TO_VITEST_LANGUAGE,
  jestToVitestModifications,
  makeJestToVitestInitialModification,
} from '../../../src/codemods/jest-to-vitest';

describe('jest.SpyInstance -> MockInstance', () => {
  it('replaces jest SpyInstance with vi MockInstance', async () => {
    const source = `
    type Spied = jest.SpyInstance<string>
    
    beforeEach(() => { setActivePinia(createTestingPinia()) })
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestToVitestModifications(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`SpyInstance`);
    expect(updatedSource).toContain(`MockInstance<string>`);
    expect(updatedSource).toContain('type MockInstance');
  });
});
