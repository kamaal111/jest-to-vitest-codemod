import { describe, expect, it } from 'vitest';

import { invalidRuleSignal, validRuleSignal } from '../../../test-utils/detection-theory';
import { JEST_TO_VITEST_LANGUAGE, makeJestToVitestInitialModification } from '../../../../src/codemods/jest-to-vitest';
import replaceJestApiWithVi, {
  convertMockImplArrowToFunction,
  fixViCompatIssues,
  normalizeViMockFactories,
  replaceJestDontMock,
  replaceJestRequireActual,
  replaceJestRequireMock,
} from '../../../../src/codemods/jest-to-vitest/rules/replace-jest-api-with-vi';

describe('jest.requireActual -> vi.importActual', () => {
  it('replaces jest.requireActual with vi.importActual', async () => {
    const source = `jest.requireActual('lodash/cloneDeep')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast)).then(replaceJestRequireActual);
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
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast))
        .then(replaceJestRequireActual)
        .then(normalizeViMockFactories);
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`requireActual`);
    expect(updatedSource).not.toContain('jest');
    expect(updatedSource).toContain(`await vi.importActual('something')`);
    expect(updatedSource).toContain(`vi.mock('something'`);
    expect(updatedSource).toContain('mocked: vi.fn()');
    expect(updatedSource).toContain('const mockedModule = {');
    expect(updatedSource).toContain('default: mockedModule');
  });
});

describe('jest.mock -> vi.mock', async () => {
  it('replaces jest mock with vi', async () => {
    const source = `
    import something from './some-path';

    jest.mock('./some-path', () => 'hello')
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.mock('./some-path', () => ({ default: 'hello' }))`);
  });

  it('replaces jest mock with vi with specific specifiers', async () => {
    const source = `
    import { something } from './some-path';

    jest.mock('./some-path', () => ({ something: jest.fn() }))
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.mock('./some-path'`);
    expect(updatedSource).toContain('something: vi.fn()');
    expect(updatedSource).toContain('const mockedModule = {');
    expect(updatedSource).toContain('default: mockedModule');
  });

  it('replaces jest mock with vi with return', async () => {
    const source = `
    jest.mock('nanoid', () => {
      return jest.fn(() => {
        mockValue += 1;
        return \`key\${mockValue}\`;
      });
    });
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    const expectedUpdatedSource = `
    vi.mock('nanoid', () => {
      return vi.fn(() => {
        mockValue += 1;
        return \`key\${mockValue}\`;
      });
    });
    `.trim();
    expect(updatedSource).toEqual(expectedUpdatedSource);
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

  it('uses vi.doMock for non-hoisted nested jest.mock calls', async () => {
    const source = `
    beforeEach(() => {
      jest.mock('lib/api', () => ({
        post: mockPost,
      }));
    });
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.doMock('lib/api'`);
    expect(updatedSource).not.toContain(`vi.mock('lib/api'`);
  });
});

describe('jest.doMock -> vi.doMock', async () => {
  it('wraps bare function factories as default exports', async () => {
    const source = `
    jest.doMock('lib/local-store', () =>
      jest.fn().mockImplementation(() => ({
        getItem: mockGetItemValue,
      })),
    );
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain("vi.doMock('lib/local-store', () => ({ default:");
    expect(updatedSource).toContain('vi.fn().mockImplementation');
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

  it('adds vi.clearAllMocks in lifecycle hooks', async () => {
    const source = `
    afterEach(() => {
      jest.restoreAllMocks();
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast)).then(fixViCompatIssues);
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('vi.restoreAllMocks(); vi.clearAllMocks()');
  });
});

describe('compatibility fixes', () => {
  it('cache busts expected failing dynamic imports', async () => {
    const source = `
    describe('mainAfterPolyfill', () => {
      test('first import', async () => {
        await expect(import('../mainAfterPolyfill')).rejects.toThrowError('boom');
      });

      test('second import', async () => {
        await import('../mainAfterPolyfill');
      });
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain("expect(import('../mainAfterPolyfill?vitest-expected-error')).rejects");
  });

  it('rewrites auto-mocked export reassignments to vi.mocked calls', async () => {
    const source = `
    ReactDOM.createRoot = vi.fn().mockReturnValue({
      render: mockRender,
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('vi.mocked(ReactDOM.createRoot).mockReturnValue({');
  });

  it('keeps direct DOM API assignments as reassignment', async () => {
    const source = `
    document.queryCommandSupported = vi.fn().mockReturnValue(false);
    `;
    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
  });

  it('waits for nested dynamic imports after standalone imports', async () => {
    const source = `
    test('loads main module', async () => {
      await import('../mainAfterPolyfill');
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain("await import('../mainAfterPolyfill');\nawait vi.dynamicImportSettled()");
  });

  it('pairs vi.resetModules with vi.clearAllMocks', async () => {
    const source = `
    beforeEach(() => {
      vi.resetModules();
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('vi.resetModules(); vi.clearAllMocks()');
  });

  it('does not duplicate vi.clearAllMocks when resetModules is already paired', async () => {
    const source = `
    beforeEach(() => {
      vi.resetModules(); vi.clearAllMocks();
    });
    `;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
  });

  it('uses vi.waitFor in fake-timer files', async () => {
    const source = `
    vi.useFakeTimers();

    test('waits', async () => {
      await waitFor(() => expect(mockFn).toHaveBeenCalled());
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('await vi.waitFor(() => expect(mockFn).toHaveBeenCalled())');
  });

  it('keeps vi.waitFor calls unchanged when they are already migrated', async () => {
    const source = `
    vi.useFakeTimers();

    test('waits', async () => {
      await vi.waitFor(() => expect(mockFn).toHaveBeenCalled());
    });
    `;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
  });

  it('adds advanceTimers to userEvent setup in fake-timer files', async () => {
    const source = `
    vi.useFakeTimers();

    test('hovers', async () => {
      const user = userEvent.setup({ delay: null });
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })');
  });

  it('uses async timer flushing in async fake-timer tests', async () => {
    const source = `
    vi.useFakeTimers();

    test('flushes timers', async () => {
      vi.runAllTimers();
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return fixViCompatIssues(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('await vi.runAllTimersAsync()');
  });

  it('awaits resetModules helper calls in test files', async () => {
    const source = `
    const resetModulesAndMockEnvironment = async () => {
      return (await import('../selectors'));
    };

    test('uses helper', () => {
      const { getAppFeature: getAppFeatureProd } = resetModulesAndMockEnvironment('prod');
      expect(getAppFeatureProd).toBeDefined();
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast =>
      fixViCompatIssues(makeJestToVitestInitialModification(ast, 'selectors.test.ts')),
    );
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`test('uses helper', async () => {`);
    expect(updatedSource).toContain(`await resetModulesAndMockEnvironment('prod')`);
  });

  it('does not double-async an already-async function containing resetModulesAndMockEnvironment', async () => {
    const source = `
    const resetModulesAndMockEnvironment = async () => {
      return (await import('../selectors'));
    };

    test('uses helper', async () => {
      const { getAppFeature } = resetModulesAndMockEnvironment('prod');
      expect(getAppFeature).toBeDefined();
    });
    `;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast =>
      fixViCompatIssues(makeJestToVitestInitialModification(ast, 'selectors.test.ts')),
    );
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('async async');
    expect(updatedSource).toContain(`await resetModulesAndMockEnvironment('prod')`);
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

describe('jest.setTimeout -> vi.setConfig', () => {
  it('replaces jest setTimeout with vi', async () => {
    const source = `jest.setTimeout(50_000)`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`jest.setTimeout`);
    expect(updatedSource).toContain(`vi.setConfig({ testTimeout: 50_000 })`);
  });
});

describe('jest.genMockFromModule -> vi.importMock', () => {
  it('replaces jest genMockFromModule with vi importMock', async () => {
    const source = `jest.genMockFromModule('./path')`;
    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain(`genMockFromModule`);
    expect(updatedSource).toContain(`vi.importMock('./path')`);
  });
});

describe('jest.createMockFromModule -> vi.importMock', () => {
  it('replaces jest.createMockFromModule with vi.importMock', async () => {
    const source = `jest.createMockFromModule('./path')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('createMockFromModule');
    expect(updatedSource).toContain(`vi.importMock('./path')`);
  });
});

describe('jest.mock -> vi.mock with existing default key', () => {
  it('replaces jest.mock preserving the existing default key without __mockModule wrapping', async () => {
    const source = `jest.mock('./some-path', () => ({ default: 'hello', extra: 'world' }))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.mock('./some-path', () => ({ default: 'hello', extra: 'world' }))`);
    expect(updatedSource).not.toContain('__mockModule');
  });
});

describe('EUA-style jest.mock factories', () => {
  it('keeps requireActual object mocks explicit without global helpers', async () => {
    const source = `
import { openModalAction } from 'components/core/modal/actions';

jest.mock('components/core/modal/actions', () => {
  const actual = jest.requireActual('components/core/modal/actions');
  return {
    ...actual,
    openModalAction: jest.fn(function(payload) {
      return ({ type: actual.openModalAction.toString(), payload });
    }),
  };
});
    `;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast))
        .then(replaceJestRequireActual)
        .then(normalizeViMockFactories)
        .then(convertMockImplArrowToFunction);
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain("vi.mock('components/core/modal/actions', async () => {");
    expect(updatedSource).toContain("const actual = (await vi.importActual('components/core/modal/actions'));");
    expect(updatedSource).toContain('openModalAction: vi.fn(function(payload)');
    expect(updatedSource).not.toContain('__mockModule');
    expect(updatedSource).not.toContain('globalThis.');
  });
});

describe('jest.setMock -> vi.mock', () => {
  it('replaces jest.setMock with vi.mock spreading value as default', async () => {
    const source = `jest.setMock('./some-path', { mocked: true })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(
      `vi.mock('./some-path', () => ({ ...{ mocked: true }, default: { mocked: true } }))`,
    );
  });
});

describe('replaceJestDontMock', () => {
  it('replaces jest.dontMock with vi.doUnmock', async () => {
    const source = `jest.dontMock('./some-path')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestApiWithVi(makeJestToVitestInitialModification(ast)).then(replaceJestDontMock);
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain(`vi.doUnmock('./some-path')`);
  });
});

describe('replaceJestRequireMock', () => {
  it('replaces standalone jest.requireMock with dynamic import', async () => {
    const source = `jest.requireMock('some-module')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestRequireMock(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('requireMock');
    expect(updatedSource).toContain(`(await import('some-module'))`);
  });

  it('replaces jest.requireMock inside arrow function and makes it async', async () => {
    const source = `const fn = () => { const mod = jest.requireMock('some-module'); return mod; }`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestRequireMock(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('requireMock');
    expect(updatedSource).toContain('async');
    expect(updatedSource).toContain(`(await import('some-module'))`);
  });

  it('replaces standalone vi.requireMock with dynamic import', async () => {
    const source = `vi.requireMock('some-module')`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestRequireMock(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('requireMock');
    expect(updatedSource).toContain(`(await import('some-module'))`);
  });

  it('replaces vi.requireMock inside arrow function and makes it async', async () => {
    const source = `const fn = () => { const mod = vi.requireMock('some-module'); return mod; }`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return replaceJestRequireMock(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).not.toContain('requireMock');
    expect(updatedSource).toContain('async');
    expect(updatedSource).toContain(`(await import('some-module'))`);
  });
});

describe('convertMockImplArrowToFunction', () => {
  it('converts mockImplementation expression-body arrow to regular function', async () => {
    const source = `mockFn.mockImplementation(arg => doSomething(arg))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('function(arg)');
    expect(updatedSource).toContain('return doSomething(arg)');
    expect(updatedSource).not.toContain('=>');
  });

  it('converts mockImplementation block-body arrow to regular function', async () => {
    const source = `mockFn.mockImplementation(arg => { return doSomething(arg); })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('function(arg)');
    expect(updatedSource).not.toContain('=>');
  });

  it('converts mockImplementationOnce arrow to regular function', async () => {
    const source = `mockFn.mockImplementationOnce(arg => doSomething(arg))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('function(arg)');
    expect(updatedSource).not.toContain('=>');
  });

  it('converts vi.fn arrow to regular function', async () => {
    const source = `vi.fn(arg => doSomething(arg))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('function(arg)');
    expect(updatedSource).not.toContain('=>');
  });

  it('converts async arrow function to async regular function', async () => {
    const source = `mockFn.mockImplementation(async arg => doSomething(arg))`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('async function(arg)');
    expect(updatedSource).not.toContain('=>');
  });

  it('does not convert when argument is already a regular function', async () => {
    const source = `mockFn.mockImplementation(function(arg) { return doSomething(arg); })`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return convertMockImplArrowToFunction(makeJestToVitestInitialModification(ast));
    });
  });
});

describe('normalizeViMockFactories', () => {
  it('normalizes a block-body vi.mock factory that returns an object literal', async () => {
    const source = `vi.mock('some-path', () => { return { foo: bar }; })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return normalizeViMockFactories(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('const mockedModule = { foo: bar }');
    expect(updatedSource).toContain('return { ...mockedModule, default: mockedModule }');
  });

  it('normalizes a block-body vi.mock factory that returns a parenthesized object', async () => {
    const source = `vi.mock('some-path', () => { return ({ foo: bar }); })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return normalizeViMockFactories(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    expect(updatedSource).toContain('const mockedModule = { foo: bar }');
    expect(updatedSource).toContain('return { ...mockedModule, default: mockedModule }');
  });

  it('does not normalize when the returned object already has a default key', async () => {
    const source = `vi.mock('some-path', () => { return { default: foo, bar: baz }; })`;

    await validRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return normalizeViMockFactories(makeJestToVitestInitialModification(ast));
    });
  });

  it('normalizes only the top-level return when a nested block has an identical return', async () => {
    const source = `vi.mock('some-path', () => { if (cond) { return { foo: bar }; } return { foo: bar }; })`;

    const modifications = await invalidRuleSignal(source, JEST_TO_VITEST_LANGUAGE, ast => {
      return normalizeViMockFactories(makeJestToVitestInitialModification(ast));
    });
    const updatedSource = modifications.ast.root().text();

    // The nested return inside if must be untouched
    expect(updatedSource).toContain('if (cond) { return { foo: bar }; }');
    // Only the top-level return is normalized
    expect(updatedSource).toContain('const mockedModule = { foo: bar }');
    expect(updatedSource).toContain('return { ...mockedModule, default: mockedModule }');
  });
});
