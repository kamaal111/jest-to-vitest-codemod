import { describe, expect, it } from 'vitest';

import { invalidRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import jestFocusedSkippedToVitest from '../../../../src/codemods/jest-to-vitest/rules/jest-focused-skipped-to-vitest';

describe('fit -> it.only', () => {
  it('replaces fit with it.only', async () => {
    const source = `fit('test name', () => { expect(true).toBe(true) })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestFocusedSkippedToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('fit(');
    expect(updatedSource).toContain(`it.only('test name', () => { expect(true).toBe(true) })`);
  });
});

describe('fdescribe -> describe.only', () => {
  it('replaces fdescribe with describe.only', async () => {
    const source = `fdescribe('group name', () => { it('test', () => {}) })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestFocusedSkippedToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('fdescribe(');
    expect(updatedSource).toContain(`describe.only('group name', () => { it('test', () => {}) })`);
  });
});

describe('xit -> it.skip', () => {
  it('replaces xit with it.skip', async () => {
    const source = `xit('test name', () => { expect(true).toBe(true) })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestFocusedSkippedToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('xit(');
    expect(updatedSource).toContain(`it.skip('test name', () => { expect(true).toBe(true) })`);
  });
});

describe('xtest -> it.skip', () => {
  it('replaces xtest with it.skip', async () => {
    const source = `xtest('test name', () => { expect(true).toBe(true) })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestFocusedSkippedToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('xtest(');
    expect(updatedSource).toContain(`it.skip('test name', () => { expect(true).toBe(true) })`);
  });
});

describe('xdescribe -> describe.skip', () => {
  it('replaces xdescribe with describe.skip', async () => {
    const source = `xdescribe('group name', () => { it('test', () => {}) })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return jestFocusedSkippedToVitest(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('xdescribe(');
    expect(updatedSource).toContain(`describe.skip('group name', () => { it('test', () => {}) })`);
  });
});
