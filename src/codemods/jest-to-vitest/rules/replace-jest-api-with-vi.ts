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
  'jest.requireActual($ARG)': '(await vi.importActual($ARG))',
  'jest.setTimeout($ARGS)': 'vi.setTimeout({ testTimeout: $ARGS })',
}).map(([jestApi, vitestApi]) => ({ rule: { pattern: jestApi }, transformer: vitestApi }));

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

      const moduleMatch = node.getMatch(MODULE_MATCH_KEY)?.text().trim();
      if (moduleMatch == null) return `vi.mock(${pathMatch})`;

      const importedAsSpecifier = moduleMatch.startsWith('({');
      if (importedAsSpecifier) {
        asserts.invariant(moduleMatch.endsWith('})'));

        return `vi.mock(${pathMatch}, () => ${moduleMatch})`;
      }

      return `vi.mock(${pathMatch}, () => ({ default: ${moduleMatch} }))`;
    },
  },
  {
    rule: { pattern: 'vi.importActual($ARG)' },
    transformer: node => {
      const arrowFunction = traverseUp(node, n => n.kind() === 'arrow_function');
      if (arrowFunction == null) return null;

      return arrowFunction.replace(`async ${arrowFunction.text()}`);
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

async function replaceJestApiWithViModification(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, JEST_TO_VITEST_API_MAPPING);
}

export default replaceJestApiWithViModification;
