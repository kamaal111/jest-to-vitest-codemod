import { describe, expect, it } from 'vitest';

import { invalidRuleSignal } from '../../test-utils/detection-theory';
import {
  default as jestToVitest,
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

  it('keeps JSX parseable when transforming .js test files', async () => {
    const source = `
    const view = jest.fn();
    const Component = () => <div data-testid="component" />;
    `;

    const updatedSource = await jestToVitest(source, 'component.test.js');

    expect(updatedSource).toContain(`import { vi } from 'vitest'`);
    expect(updatedSource).toContain('const view = vi.fn()');
    expect(updatedSource).toContain('<div data-testid="component" />');
  });

  it('returns the original source when no Jest APIs are present', async () => {
    const source = `const component = () => <div />;`;

    await expect(jestToVitest(source, 'component.test.js')).resolves.toBe(source);
  });
});
