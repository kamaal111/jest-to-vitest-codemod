import { describe, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import { doneCallbackToPromise } from '../../../../src/codemods/jest-to-vitest/rules/done-callback-to-promise';

describe('doneCallbackToPromise', () => {
  describe('test()', () => {
    it('transforms done callback to promise', async () => {
      const source = `
test('loads data', done => {
  fetchData((data) => {
    expect(data).toBe('peanut butter');
    done();
  });
});
      `;

      await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it('transforms done callback to promise with timeout', async () => {
      const source = `
test('loads data with timeout', done => {
  fetchData((data) => {
    expect(data).toBe('peanut butter');
    done();
  });
}, 1000);
      `;

      await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it("doesn't transform when callback has no params", async () => {
      const source = `test('no params', () => { expect(1).toBe(1); });`;

      await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it("doesn't transform when param is not named done", async () => {
      const source = `test('custom param', (callback) => { callback(); });`;

      await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it("doesn't transform async functions", async () => {
      const source = `test('async', async () => { await fetchData(); });`;

      await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });
  });

  describe('it()', () => {
    it('transforms done callback to promise', async () => {
      const source = `
it('loads data', done => {
  fetchData((data) => {
    expect(data).toBe('peanut butter');
    done();
  });
});
      `;

      await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it('transforms done callback to promise with timeout', async () => {
      const source = `
it('loads data with timeout', done => {
  fetchData((data) => {
    expect(data).toBe('peanut butter');
    done();
  });
}, 5000);
      `;

      await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it("doesn't transform when callback has no params", async () => {
      const source = `it('no params', () => { expect(1).toBe(1); });`;

      await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });

    it("doesn't transform when param is not named done", async () => {
      const source = `it('custom param', (callback) => { callback(); });`;

      await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
        return doneCallbackToPromise(makeJestToVitestInitialModification(ast));
      });
    });
  });
});
