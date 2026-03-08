import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import { requireToDynamicImport } from '../../../../src/codemods/jest-to-vitest/rules/require-to-dynamic-import';

describe('requireToDynamicImport', () => {
  it('transforms require with single quotes at top-level to dynamic import', async () => {
    const source = `const mod = require('./path');`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    expect(modifications.ast.root().text()).toContain("(await import('./path'))");
  });

  it('transforms require with double quotes at top-level to dynamic import', async () => {
    const source = `const mod = require("./path");`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    expect(modifications.ast.root().text()).toContain('(await import("./path"))');
  });

  it('transforms require inside an arrow function to async arrow function', async () => {
    const source = `const fn = () => { const mod = require('./path'); };`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    const result = modifications.ast.root().text();
    expect(result).toContain('async');
    expect(result).toContain("(await import('./path'))");
  });

  it('does not add duplicate async keyword for already async arrow function', async () => {
    const source = `const fn = async () => { const mod = require('./path'); };`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    const result = modifications.ast.root().text();
    expect(result).toContain("(await import('./path'))");
    expect(result).not.toContain('async async');
  });

  it('transforms require inside a function declaration to async function', async () => {
    const source = `function fn() { const mod = require('./path'); }`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    const result = modifications.ast.root().text();
    expect(result).toContain('async function');
    expect(result).toContain("(await import('./path'))");
  });

  it('transforms require inside a function expression to async function expression', async () => {
    const source = `const fn = function() { const mod = require('./path'); };`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });

    const result = modifications.ast.root().text();
    expect(result).toContain('async function');
    expect(result).toContain("(await import('./path'))");
  });

  it('does not transform require with a variable path', async () => {
    const source = `const mod = require(variableName);`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });
  });

  it('does not transform require with a computed expression path', async () => {
    const source = `const mod = require(getPath());`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return requireToDynamicImport(makeJestToVitestInitialModification(ast));
    });
  });
});
