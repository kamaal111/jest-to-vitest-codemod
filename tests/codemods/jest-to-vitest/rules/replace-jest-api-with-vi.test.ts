import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import replaceJestApiWithVi from '../../../../src/codemods/jest-to-vitest/rules/replace-jest-api-with-vi';

describe('jest.requireActual -> vi.importActual', () => {
  it('replaces jest.requireActual with vi.importActual', async () => {
    const source = `jest.requireActual('lodash/cloneDeep')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`requireActual`);
    expect(updatedSource).toContain(`vi.importActual('lodash/cloneDeep')`);
  });

  it('replaces jest.requireActual with vi.importActual in mock', async () => {
    const source = `
    jest.mock('something', () => ({
      ...jest.requireActual('something'),
      mocked: jest.fn()
    }))
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`requireActual`);
    expect(updatedSource).toContain(`await vi.importActual('something')`);
    expect(updatedSource).toContain(`vi.mock('something', async () => ({`);
  });
});

describe('jest.mock -> vi.mock', () => {
  it('replaces jest mock with vi', async () => {
    const source = `jest.mock('./some-path', () => 'hello')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.mock('./some-path', () => ({`);
    expect(updatedSource).toContain(`default: 'hello'`);
  });

  it('replaces jest mock with vi without module override', async () => {
    const source = `
    jest.mock('./some-path')
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.mock('./some-path')`);
  });

  it('does not replace anything', async () => {
    const source = `
    vi.mock('./some-path', () => ({
        default: 'hello',
    }))
    `;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
  });
});

describe('jest.spyOn -> vi.spyOn', () => {
  it('replaces jest spyOn with vi', async () => {
    const source = `jest.spyOn(modules, 'path', 'key')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.spyOn`);
    expect(updatedSource).toContain(`vi.spyOn(modules, 'path', 'key')`);
  });

  it('replaces jest spyOn with vi with a single param', async () => {
    const source = `jest.spyOn(modules)`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.spyOn`);
    expect(updatedSource).toContain(`vi.spyOn(modules)`);
  });
});

describe('jest.restoreAllMocks -> vi.restoreAllMocks', () => {
  it('replaces jest restoreAllMocks with vi', async () => {
    const source = `jest.restoreAllMocks()`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.restoreAllMocks`);
    expect(updatedSource).toContain(`vi.restoreAllMocks()`);
  });
});

describe('jest.resetAllMocks -> vi.resetAllMocks', () => {
  it('replaces jest resetAllMocks with vi', async () => {
    const source = `jest.resetAllMocks()`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.resetAllMocks`);
    expect(updatedSource).toContain(`vi.resetAllMocks()`);
  });
});

describe('jest.clearAllMocks -> vi.clearAllMocks', () => {
  it('replaces jest clearAllMocks with vi', async () => {
    const source = `jest.clearAllMocks()`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.clearAllMocks`);
    expect(updatedSource).toContain(`vi.clearAllMocks()`);
  });
});

describe('jest.useFakeTimers -> vi.useFakeTimers', () => {
  it('replaces jest useFakeTimers with vi', async () => {
    const source = `jest.useFakeTimers()`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.useFakeTimers`);
    expect(updatedSource).toContain(`vi.useFakeTimers()`);
  });
});

describe('jest.useRealTimers -> vi.useRealTimers', () => {
  it('replaces jest useRealTimers with vi', async () => {
    const source = `jest.useRealTimers()`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.useRealTimers`);
    expect(updatedSource).toContain(`vi.useRealTimers()`);
  });
});

describe('jest.setTimeout -> vi.setTimeout', () => {
  it('replaces jest setTimeout with vi', async () => {
    const source = `jest.setTimeout(50_000)`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.setTimeout`);
    expect(updatedSource).toContain(`vi.setTimeout({ testTimeout: 50_000 })`);
  });
});
