import type { SgNode } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import {
  type FindAndReplaceConfig,
  findAndReplaceConfigModifications,
  type Modifications,
  traverseUp,
} from '@kamaalio/codemod-kit';
import { asserts } from '@kamaalio/kamaal';

const PATH_MATCH_KEY = 'PATH';
const MODULE_MATCH_KEY = 'MODULE';
type AstNode = SgNode<TypesMap, Kinds<TypesMap>>;

function hasDefaultProperty(moduleText: string): boolean {
  return /(?:^|[,{]\s*)default\s*:/.test(moduleText);
}

function normalizeObjectExpressionText(moduleText: string): string {
  if (moduleText.startsWith('({') && moduleText.endsWith('})')) {
    return moduleText.slice(1, -1).trim();
  }

  return moduleText;
}

function buildExplicitMockedModuleFactory(moduleText: string): string {
  const normalizedObject = normalizeObjectExpressionText(moduleText);
  return `() => { const mockedModule = ${normalizedObject}; return { ...mockedModule, default: mockedModule }; }`;
}

function appendVitestExpectedErrorQuery(pathLiteral: string): string {
  const quote = pathLiteral[0];
  const rawPath = pathLiteral.slice(1, -1);
  const separator = rawPath.includes('?') ? '&' : '?';
  return `${quote}${rawPath}${separator}vitest-expected-error${quote}`;
}

function shouldUseViDoMock(node: AstNode): boolean {
  return (
    traverseUp(node, currentNode => {
      const kind = currentNode.kind();
      return (
        kind === 'arrow_function' ||
        kind === 'function_expression' ||
        kind === 'function_declaration' ||
        kind === 'function'
      );
    }) != null
  );
}

function findTopLevelReturnStatement(bodyContent: string): { start: number; end: number; expression: string } | null {
  let blockDepth = 0;

  for (let index = 0; index < bodyContent.length; index += 1) {
    const char = bodyContent[index];

    if (char === '{') {
      blockDepth += 1;
      continue;
    }

    if (char === '}') {
      blockDepth -= 1;
      continue;
    }

    if (blockDepth !== 0 || !bodyContent.startsWith('return', index)) {
      continue;
    }

    const previousChar = index === 0 ? '' : bodyContent[index - 1];
    const nextChar = bodyContent[index + 'return'.length] ?? '';
    if (/\w/.test(previousChar) || /\w/.test(nextChar)) {
      continue;
    }

    let expressionStart = index + 'return'.length;
    while (expressionStart < bodyContent.length && /\s/.test(bodyContent[expressionStart])) {
      expressionStart += 1;
    }

    let expressionDepth = 0;
    let expressionEnd = expressionStart;
    while (expressionEnd < bodyContent.length) {
      const expressionChar = bodyContent[expressionEnd];

      if (expressionChar === '{' || expressionChar === '(' || expressionChar === '[') {
        expressionDepth += 1;
      } else if (expressionChar === '}' || expressionChar === ')' || expressionChar === ']') {
        if (expressionDepth === 0) break;
        expressionDepth -= 1;
      } else if (expressionChar === ';' && expressionDepth === 0) {
        break;
      }

      expressionEnd += 1;
    }

    return {
      start: index,
      end: expressionEnd + (bodyContent[expressionEnd] === ';' ? 1 : 0),
      expression: bodyContent.slice(expressionStart, expressionEnd).trim(),
    };
  }

  return null;
}

function normalizeViMockFactoryCallback(callbackText: string): string | null {
  const bodyStart = callbackText.indexOf('{');
  const bodyEnd = callbackText.lastIndexOf('}');
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
    return null;
  }

  const bodyContent = callbackText.slice(bodyStart + 1, bodyEnd);
  const topLevelReturn = findTopLevelReturnStatement(bodyContent);
  if (topLevelReturn == null) {
    return null;
  }

  const returnedExpression = topLevelReturn.expression;
  const isObjectExpression =
    (returnedExpression.startsWith('{') && returnedExpression.endsWith('}')) ||
    (returnedExpression.startsWith('({') && returnedExpression.endsWith('})'));
  if (!isObjectExpression || hasDefaultProperty(returnedExpression)) {
    return null;
  }

  const normalizedObject = normalizeObjectExpressionText(returnedExpression);
  const replacement = `const mockedModule = ${normalizedObject}; return { ...mockedModule, default: mockedModule };`;
  const updatedBody = bodyContent.slice(0, topLevelReturn.start) + replacement + bodyContent.slice(topLevelReturn.end);

  return `${callbackText.slice(0, bodyStart + 1)}${updatedBody}${callbackText.slice(bodyEnd)}`;
}

const SIMPLE_JEST_TO_VITEST_API_MAPPING: Array<FindAndReplaceConfig> = Object.entries({
  'jest.setTimeout($ARGS)': 'vi.setConfig({ testTimeout: $ARGS })',
  'jest.createMockFromModule': 'vi.importMock',
  'jest.genMockFromModule': 'vi.importMock',
  'jest.fn': 'vi.fn',
  'jest.enableAutomock()': 'vi.enableAutoMock()',
  'jest.disableAutomock()': 'vi.disableAutoMock()',
}).map(([jestApi, vitestApi]) => ({ rule: { pattern: jestApi }, transformer: vitestApi }));

const JEST_DONTMOCK_MAPPING: Array<FindAndReplaceConfig> = [
  {
    rule: {
      any: [{ pattern: 'jest.dontMock($ARG)' }, { pattern: 'vi.dontMock($ARG)' }],
    },
    transformer: node => {
      const argMatch = node.getMatch('ARG')?.text();
      if (argMatch == null) return null;
      return `vi.doUnmock(${argMatch})`;
    },
  },
];

const JEST_REQUIRE_ACTUAL_MAPPING: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'jest.requireActual($ARG)' },
    transformer: node => {
      const argMatch = node.getMatch('ARG');
      if (argMatch == null) return null;
      const argText = argMatch.text().trim();

      const containingFn = traverseUp(node, n => {
        const kind = n.kind();
        return kind === 'arrow_function' || kind === 'function_declaration' || kind === 'function';
      });
      if (containingFn != null) {
        const fnText = containingFn.text();
        const nodeText = node.text();
        const newFnText = fnText.replace(nodeText, `(await vi.importActual(${argText}))`);
        const asyncFnText = newFnText.startsWith('async ') ? newFnText : `async ${newFnText}`;
        return containingFn.replace(asyncFnText);
      }
      return `(await vi.importActual(${argText}))`;
    },
  },
  {
    rule: { pattern: 'vi.requireActual($ARG)' },
    transformer: node => {
      const argMatch = node.getMatch('ARG');
      if (argMatch == null) return null;
      const argText = argMatch.text().trim();

      const containingFn = traverseUp(node, n => {
        const kind = n.kind();
        return kind === 'arrow_function' || kind === 'function_declaration' || kind === 'function';
      });
      if (containingFn != null) {
        const fnText = containingFn.text();
        const nodeText = node.text();
        const newFnText = fnText.replace(nodeText, `(await vi.importActual(${argText}))`);
        const asyncFnText = newFnText.startsWith('async ') ? newFnText : `async ${newFnText}`;
        return containingFn.replace(asyncFnText);
      }
      return `(await vi.importActual(${argText}))`;
    },
  },
];

const JEST_REQUIRE_MOCK: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'jest.requireMock($ARG)' },
    transformer: node => {
      const argMatch = node.getMatch('ARG');
      if (argMatch == null) return null;
      const argText = argMatch.text().trim();

      const containingFn = traverseUp(node, n => {
        const kind = n.kind();
        return kind === 'arrow_function' || kind === 'function_declaration' || kind === 'function';
      });
      if (containingFn != null) {
        const fnText = containingFn.text();
        const nodeText = node.text();
        const newFnText = fnText.replace(nodeText, `(await import(${argText}))`);
        const asyncFnText = newFnText.startsWith('async ') ? newFnText : `async ${newFnText}`;
        return containingFn.replace(asyncFnText);
      }
      return `(await import(${argText}))`;
    },
  },
  {
    rule: { pattern: 'vi.requireMock($ARG)' },
    transformer: node => {
      const argMatch = node.getMatch('ARG');
      if (argMatch == null) return null;
      const argText = argMatch.text().trim();

      const containingFn = traverseUp(node, n => {
        const kind = n.kind();
        return kind === 'arrow_function' || kind === 'function_declaration' || kind === 'function';
      });
      if (containingFn != null) {
        const fnText = containingFn.text();
        const nodeText = node.text();
        const newFnText = fnText.replace(nodeText, `(await import(${argText}))`);
        const asyncFnText = newFnText.startsWith('async ') ? newFnText : `async ${newFnText}`;
        return containingFn.replace(asyncFnText);
      }
      return `(await import(${argText}))`;
    },
  },
];

const JEST_ISOLATE_MODULES: Array<FindAndReplaceConfig> = [
  {
    rule: {
      any: [{ pattern: 'jest.isolateModules($CALLBACK)' }, { pattern: 'vi.isolateModules($CALLBACK)' }],
    },
    transformer: node => {
      const callbackMatch = node.getMatch('CALLBACK');
      if (callbackMatch == null) return null;

      const callbackText = callbackMatch.text().trim();
      const kind = callbackMatch.kind();

      let bodyContent: string;
      if (kind === 'arrow_function') {
        const children = callbackMatch.children();
        const arrowToken = children.find(c => c.kind() === '=>');
        if (arrowToken == null) return null;
        const arrowOffset = arrowToken.range().start.index - callbackMatch.range().start.index;
        bodyContent = callbackText.substring(arrowOffset + 2).trim();
        if (bodyContent.startsWith('{')) {
          bodyContent = bodyContent.substring(1, bodyContent.length - 1);
        }
      } else {
        bodyContent = `${callbackText}();`;
      }

      return `vi.resetModules();\n${bodyContent}`;
    },
  },
];

const JEST_TO_VITEST_API_MAPPING: Array<FindAndReplaceConfig> = [
  ...SIMPLE_JEST_TO_VITEST_API_MAPPING,
  ...JEST_ISOLATE_MODULES,
  {
    rule: {
      any: [
        { pattern: `jest.mock($${PATH_MATCH_KEY}, () => $${MODULE_MATCH_KEY})` },
        { pattern: `jest.mock($${PATH_MATCH_KEY})` },
      ],
    },
    transformer: node => {
      const pathMatch = node.getMatch(PATH_MATCH_KEY)?.text();
      asserts.invariant(pathMatch != null, 'There should be a path match');
      const mockApi = shouldUseViDoMock(node) ? 'vi.doMock' : 'vi.mock';

      const moduleMatchNode = node.getMatch(MODULE_MATCH_KEY);
      if (moduleMatchNode == null) return `${mockApi}(${pathMatch})`;

      if (moduleMatchNode.kind() === 'statement_block') return null;

      const moduleMatch = moduleMatchNode.text().trim();
      const isParenthesizedObject = moduleMatch.startsWith('({') && moduleMatch.endsWith('})');

      if (isParenthesizedObject) {
        const hasDefaultKey = hasDefaultProperty(moduleMatch);
        if (hasDefaultKey) {
          return `${mockApi}(${pathMatch}, () => ${moduleMatch})`;
        }
        return `${mockApi}(${pathMatch}, ${buildExplicitMockedModuleFactory(moduleMatch)})`;
      }

      return `${mockApi}(${pathMatch}, () => ({ default: ${moduleMatch} }))`;
    },
  },
  {
    rule: { pattern: 'jest.mock($PATH, $CALLBACK)' },
    transformer: node => {
      const pathMatch = node.getMatch('PATH')?.text();
      const callbackMatch = node.getMatch('CALLBACK');
      if (pathMatch == null || callbackMatch == null) return null;

      const mockApi = shouldUseViDoMock(node) ? 'vi.doMock' : 'vi.mock';
      return `${mockApi}(${pathMatch}, ${callbackMatch.text().trim()})`;
    },
  },
  {
    rule: {
      any: [
        { pattern: `jest.doMock($${PATH_MATCH_KEY}, () => $${MODULE_MATCH_KEY})` },
        { pattern: `jest.doMock($${PATH_MATCH_KEY})` },
      ],
    },
    transformer: node => {
      const pathMatch = node.getMatch(PATH_MATCH_KEY)?.text();
      asserts.invariant(pathMatch != null, 'There should be a path match');

      const moduleMatchNode = node.getMatch(MODULE_MATCH_KEY);
      if (moduleMatchNode == null) return `vi.doMock(${pathMatch})`;

      if (moduleMatchNode.kind() === 'statement_block') return null;

      const moduleMatch = moduleMatchNode.text().trim();
      const isParenthesizedObject = moduleMatch.startsWith('({') && moduleMatch.endsWith('})');

      if (isParenthesizedObject) {
        const hasDefaultKey = hasDefaultProperty(moduleMatch);
        if (hasDefaultKey) {
          return `vi.doMock(${pathMatch}, () => ${moduleMatch})`;
        }
        return `vi.doMock(${pathMatch}, ${buildExplicitMockedModuleFactory(moduleMatch)})`;
      }

      return `vi.doMock(${pathMatch}, () => ({ default: ${moduleMatch} }))`;
    },
  },
  {
    rule: { pattern: 'jest.doMock($PATH, $CALLBACK)' },
    transformer: node => {
      const pathMatch = node.getMatch('PATH')?.text();
      const callbackMatch = node.getMatch('CALLBACK');
      if (pathMatch == null || callbackMatch == null) return null;

      return `vi.doMock(${pathMatch}, ${callbackMatch.text().trim()})`;
    },
  },
  {
    rule: { pattern: 'jest.setMock($PATH, $VALUE)' },
    transformer: node => {
      const pathMatch = node.getMatch('PATH')?.text();
      const valueMatch = node.getMatch('VALUE')?.text();
      asserts.invariant(pathMatch != null && valueMatch != null, 'setMock requires path and value');
      return `vi.mock(${pathMatch}, () => ({ ...${valueMatch}, default: ${valueMatch} }))`;
    },
  },
  {
    rule: { pattern: 'jest.$REST' },
    transformer: node => {
      const rest = node.getMatch('REST');
      asserts.invariant(rest != null, 'rest should be present at this point');

      return node.replace(`vi.${rest.text()}`);
    },
  },
];

const NORMALIZE_VI_MOCK_FACTORIES: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'vi.mock($PATH, $CALLBACK)' },
    transformer: node => {
      const callbackMatch = node.getMatch('CALLBACK');
      if (callbackMatch == null) return null;

      const callbackKind = callbackMatch.kind();
      if (callbackKind !== 'arrow_function' && callbackKind !== 'function_expression') {
        return null;
      }

      const normalizedCallback = normalizeViMockFactoryCallback(callbackMatch.text().trim());
      if (normalizedCallback == null || normalizedCallback === callbackMatch.text().trim()) {
        return null;
      }

      return node.text().replace(callbackMatch.text(), normalizedCallback);
    },
  },
];

const VI_COMPAT_FIXES: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'vi.restoreAllMocks()' },
    transformer: node => {
      const parentStatement = traverseUp(node, currentNode => currentNode.kind() === 'expression_statement');
      if (parentStatement == null || parentStatement.text().includes('vi.clearAllMocks()')) {
        return null;
      }

      const containingHook = traverseUp(node, currentNode => {
        if (currentNode.kind() !== 'call_expression') return false;
        const callText = currentNode.text().trim();
        return callText.startsWith('afterEach(') || callText.startsWith('beforeEach(');
      });
      if (containingHook == null) {
        return null;
      }

      return node.replace('vi.restoreAllMocks(); vi.clearAllMocks()');
    },
  },
  {
    rule: { pattern: 'vi.dontMock($ARG)' },
    transformer: node => {
      const argMatch = node.getMatch('ARG')?.text();
      if (argMatch == null) return null;
      return `vi.doUnmock(${argMatch})`;
    },
  },
  {
    rule: { pattern: 'ReactDOM.createRoot = vi.fn().$METHOD($$$ARGS)' },
    transformer: node => {
      const methodMatch = node.getMatch('METHOD')?.text();
      const argsText = node
        .getMultipleMatches('ARGS')
        .map(match => match.text())
        .join(', ');
      if (methodMatch == null) {
        return null;
      }

      return `vi.mocked(ReactDOM.createRoot).${methodMatch}(${argsText})`;
    },
  },
  {
    rule: { pattern: 'expect(import($PATH)).rejects.$METHOD($$$ARGS)' },
    transformer: node => {
      const pathMatch = node.getMatch('PATH')?.text();
      if (pathMatch == null || !/^['"].+['"]$/.test(pathMatch)) {
        return null;
      }

      return node.text().replace(`import(${pathMatch})`, `import(${appendVitestExpectedErrorQuery(pathMatch)})`);
    },
  },
  {
    rule: { kind: 'expression_statement', has: { pattern: 'await import($PATH)' } },
    transformer: node => {
      if (node.text().includes('vi.dynamicImportSettled()')) {
        return null;
      }

      const awaitImport = node.find({ rule: { pattern: 'await import($PATH)' } });
      if (awaitImport == null) {
        return null;
      }

      return `${node.text()}\nawait vi.dynamicImportSettled()`;
    },
  },
  {
    rule: { pattern: 'vi.resetModules()' },
    transformer: node => {
      const parentStatement = traverseUp(node, currentNode => currentNode.kind() === 'expression_statement');
      if (parentStatement == null || parentStatement.text().includes('vi.clearAllMocks()')) {
        return null;
      }

      return node.replace('vi.resetModules(); vi.clearAllMocks()');
    },
  },
];

const FAKE_TIMER_COMPAT_FIXES: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'waitFor($$$ARGS)' },
    transformer: node => {
      const callText = node.text();
      if (callText.startsWith('vi.waitFor(')) {
        return null;
      }

      return callText.replace(/^waitFor\(/, 'vi.waitFor(');
    },
  },
  {
    rule: { pattern: 'userEvent.setup({ delay: null })' },
    transformer: `userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })`,
  },
  {
    rule: { kind: 'expression_statement', has: { pattern: 'vi.runAllTimers()' } },
    transformer: node => {
      const containingFunction = traverseUp(node, currentNode => {
        const kind = currentNode.kind();
        return (
          kind === 'arrow_function' ||
          kind === 'function_expression' ||
          kind === 'function_declaration' ||
          kind === 'function'
        );
      });
      if (containingFunction == null || !containingFunction.text().trim().startsWith('async ')) {
        return null;
      }

      return node.text().replace('vi.runAllTimers()', 'await vi.runAllTimersAsync()');
    },
  },
];

const TEST_ASYNC_HELPER_CALL_FIXES: Array<FindAndReplaceConfig> = [
  {
    rule: { pattern: 'const { $$$IMPORTS } = resetModulesAndMockEnvironment($ENV)' },
    transformer: node => {
      const declarationText = node.text();
      const updatedDeclaration = declarationText.replace(
        '= resetModulesAndMockEnvironment(',
        '= await resetModulesAndMockEnvironment(',
      );
      const containingFunction = traverseUp(node, currentNode => {
        const kind = currentNode.kind();
        return (
          kind === 'arrow_function' ||
          kind === 'function_expression' ||
          kind === 'function_declaration' ||
          kind === 'function'
        );
      });
      if (containingFunction == null) {
        return updatedDeclaration;
      }

      const functionText = containingFunction.text();
      const updatedFunction = functionText.replace(declarationText, updatedDeclaration);
      if (updatedFunction.trim().startsWith('async ')) {
        return containingFunction.replace(updatedFunction);
      }
      if (functionText.startsWith('async ')) {
        return containingFunction.replace(updatedFunction);
      }
      if (functionText.startsWith('(') || functionText.startsWith('function') || functionText.startsWith('test')) {
        return containingFunction.replace(`async ${updatedFunction}`);
      }

      if (functionText.startsWith('async(')) {
        return null;
      }

      return containingFunction.replace(`async ${updatedFunction}`);
    },
  },
];

const MOCK_IMPL_ARROW_TO_FUNCTION: Array<FindAndReplaceConfig> = [
  {
    rule: {
      any: [
        { pattern: '$OBJ.mockImplementation($FN)' },
        { pattern: '$OBJ.mockImplementationOnce($FN)' },
        { pattern: 'vi.fn($FN)' },
      ],
    },
    transformer: node => {
      const fnMatch = node.getMatch('FN');
      if (fnMatch == null || fnMatch.kind() !== 'arrow_function') return null;

      const arrowText = fnMatch.text();
      const children = fnMatch.children();
      const arrowToken = children.find(c => c.kind() === '=>');
      if (arrowToken == null) return null;

      const arrowOffset = arrowToken.range().start.index - fnMatch.range().start.index;
      const paramsPart = arrowText.substring(0, arrowOffset).trim();
      const bodyPart = arrowText.substring(arrowOffset + 2).trim();

      const asyncPrefix = paramsPart.startsWith('async ') ? 'async ' : '';
      const rawParams = asyncPrefix ? paramsPart.slice(6).trim() : paramsPart;
      const normalizedParams = rawParams.startsWith('(') ? rawParams : `(${rawParams})`;

      let functionBody: string;
      if (bodyPart.startsWith('{')) {
        functionBody = bodyPart;
      } else {
        functionBody = `{ return ${bodyPart}; }`;
      }

      const regularFn = `${asyncPrefix}function${normalizedParams} ${functionBody}`;
      const fullText = node.text();
      return fullText.replace(arrowText, regularFn);
    },
  },
];

async function replaceJestApiWithViModification(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, JEST_TO_VITEST_API_MAPPING);
}

export async function replaceJestRequireMock(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, JEST_REQUIRE_MOCK);
}

export async function convertMockImplArrowToFunction(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, MOCK_IMPL_ARROW_TO_FUNCTION);
}

export async function fixViCompatIssues(modifications: Modifications): Promise<Modifications> {
  const updatedModifications = await findAndReplaceConfigModifications(modifications, VI_COMPAT_FIXES);
  const source = updatedModifications.ast.root().text();
  const filename = updatedModifications.filename ?? '';

  let nextModifications = updatedModifications;

  if (/\.(test|spec)\.[jt]sx?$/.test(filename) && source.includes('resetModulesAndMockEnvironment(')) {
    nextModifications = await findAndReplaceConfigModifications(nextModifications, TEST_ASYNC_HELPER_CALL_FIXES);
  }

  if (!source.includes('vi.useFakeTimers(')) {
    return nextModifications;
  }

  return findAndReplaceConfigModifications(nextModifications, FAKE_TIMER_COMPAT_FIXES);
}

export async function normalizeViMockFactories(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, NORMALIZE_VI_MOCK_FACTORIES);
}

export async function replaceJestDontMock(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, JEST_DONTMOCK_MAPPING);
}

export async function replaceJestRequireActual(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, JEST_REQUIRE_ACTUAL_MAPPING);
}

export default replaceJestApiWithViModification;
