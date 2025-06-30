import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import addVitestImports from '../../../../src/codemods/jest-to-vitest/rules/add-vitest-imports';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';

describe('addVitestImports', () => {
  it('collects vitest functions and imports them', async () => {
    const source = `
describe('addVitestImports', () => {
  it('collects vitest functions and imports them', async () => {
    const source = '';

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('');
  });
});
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`import { describe, expect, it } from 'vitest'`);
  });

  it('adds describe import', async () => {
    const source = `
import { expect, it } from 'vitest'

describe('addVitestImports', () => {
  it('collects vitest functions and imports them', async () => {
    const source = '';

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('');
  });
});
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`import { describe, expect, it } from 'vitest'`);
  });

  it('adds vitest import at the top of the program', async () => {
    const source = `
import { asserts } from '@kamaalio/kamaal'

describe('addVitestImports', () => {
  it('collects vitest functions and imports them', async () => {
    const source = '';

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('');
  });
});
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`import { describe, expect, it } from 'vitest'`);
  });

  it('collects vitest functions and imports them', async () => {
    const source = `
import { describe, expect, it } from 'vitest'

describe('addVitestImports', () => {
  it('collects vitest functions and imports them', async () => {
    const source = '';

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('');
  });
});
    `;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return addVitestImports(makeJestToVitestInitialModification(ast));
    });
  });
});
