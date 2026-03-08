import {
  type FindAndReplaceConfig,
  findAndReplaceConfigModifications,
  type Modifications,
  traverseUp,
} from '@kamaalio/codemod-kit';
import { asserts } from '@kamaalio/kamaal';

const PATH_MATCH_KEY = 'PATH';
const MODULE_MATCH_KEY = 'MODULE';

const SIMPLE_JEST_TO_VITEST_API_MAPPING: Array<FindAndReplaceConfig> = Object.entries({
  'jest.requireMock($ARG)': '(await import($ARG))',
  'jest.requireActual($ARG)': '(await vi.importActual($ARG))',
  'jest.setTimeout($ARGS)': 'vi.setConfig({ testTimeout: $ARGS })',
  'jest.createMockFromModule': 'vi.importMock',
  'jest.genMockFromModule': 'vi.importMock',
  'jest.fn': 'vi.fn',
}).map(([jestApi, vitestApi]) => ({ rule: { pattern: jestApi }, transformer: vitestApi }));

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

const JEST_TO_VITEST_API_MAPPING: Array<FindAndReplaceConfig> = [
  ...SIMPLE_JEST_TO_VITEST_API_MAPPING,
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

      const moduleMatchNode = node.getMatch(MODULE_MATCH_KEY);
      if (moduleMatchNode == null) return `vi.mock(${pathMatch})`;

      if (moduleMatchNode.kind() === 'statement_block') return null;

      const moduleMatch = moduleMatchNode.text().trim();
      const isParenthesizedObject = moduleMatch.startsWith('({');

      if (isParenthesizedObject) {
        asserts.invariant(moduleMatch.endsWith('})'));
        const hasDefaultKey = /(?:^|[,{]\s*)default\s*:/.test(moduleMatch);
        if (hasDefaultKey) {
          return `vi.mock(${pathMatch}, () => ${moduleMatch})`;
        }
        return `vi.mock(${pathMatch}, () => { const __mock = ${moduleMatch}; return globalThis.__mockModule({ ...__mock, default: __mock }); })`;
      }

      return `vi.mock(${pathMatch}, () => ({ default: ${moduleMatch} }))`;
    },
  },
  {
    rule: { pattern: 'jest.mock($PATH, $CALLBACK)' },
    transformer: node => {
      const pathMatch = node.getMatch('PATH')?.text();
      const callbackMatch = node.getMatch('CALLBACK');
      if (pathMatch == null || callbackMatch == null) return null;

      return `vi.mock(${pathMatch}, ${callbackMatch.text().trim()})`;
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

export default replaceJestApiWithViModification;
