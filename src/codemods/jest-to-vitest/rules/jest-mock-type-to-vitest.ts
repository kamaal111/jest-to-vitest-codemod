import {
  findAndReplaceConfigModifications,
  type FindAndReplaceConfig,
  type Modifications,
} from '@kamaalio/codemod-kit';
import { asserts } from '@kamaalio/kamaal';

const TEST_FRAMEWORK_NAMES = ['jest', 'vi'];

const EDIT_CONFIGS: Array<FindAndReplaceConfig> = [
  {
    rule: {
      any: ['Mocked', 'MockedFunction', 'MockedClass'].map(typeName => ({
        kind: 'nested_type_identifier',
        regex: `^jest\\.${typeName}$`,
      })),
    },
    transformer: node => node.text().split('.')[1],
  },
  {
    rule: {
      any: TEST_FRAMEWORK_NAMES.map(prefix => ({ kind: 'nested_type_identifier', regex: `^${prefix}\\.Mock$` })),
    },
    transformer: node => {
      const parent = node.parent();
      asserts.invariant(parent != null, 'Mock identifier should have a parent');

      if (parent.kind() !== 'generic_type') {
        return 'Mock';
      }

      const parentText = parent.text();
      const genericParamStart = parentText.indexOf('<');
      const genericParamEnd = parentText.lastIndexOf('>');
      const hasGenericParams = genericParamStart !== -1 && genericParamEnd > genericParamStart;
      if (!hasGenericParams) {
        return 'Mock';
      }

      const genericText = parentText.slice(genericParamStart + 1, genericParamEnd).trim();
      const isFunctionGeneric = genericText.includes('=>');
      if (isFunctionGeneric) {
        return parent.replace(`Mock<${genericText}>`);
      }

      return parent.replace(`Mock<(...params: Array<unknown>) => ${genericText}>`);
    },
  },
  {
    rule: {
      any: TEST_FRAMEWORK_NAMES.map(prefix => ({ kind: 'nested_type_identifier', regex: `${prefix}\\.SpyInstance` })),
    },
    transformer: 'MockInstance',
  },
];

async function jestMockTypeToVitest(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, EDIT_CONFIGS);
}

export default jestMockTypeToVitest;
