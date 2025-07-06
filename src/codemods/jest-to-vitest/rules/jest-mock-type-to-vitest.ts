import {
  findAndReplaceConfigModifications,
  type FindAndReplaceConfig,
  type Modifications,
} from '@kamaalio/codemod-kit';
import { asserts } from '@kamaalio/kamaal';

const TEST_FRAMEWORK_NAMES = ['jest', 'vi'];

const EDIT_CONFIG: FindAndReplaceConfig = {
  rule: {
    any: TEST_FRAMEWORK_NAMES.map(prefix => ({ kind: 'nested_type_identifier', regex: `${prefix}\\.Mock` })),
  },
  transformer: node => {
    const parent = node.parent();
    asserts.invariant(parent != null, 'Mock identifier should have a parent');

    const defaultReplacement = 'Mock';
    const hasFunctionGenericParam = parent.find({ rule: { kind: 'function_type' } }) != null;
    if (hasFunctionGenericParam) return defaultReplacement;

    const parentText = parent.text();
    const genericParamStart = parentText.indexOf('<');
    const doesNotHaveAGenericParam = genericParamStart === -1;
    if (doesNotHaveAGenericParam) return defaultReplacement;

    let modifiedText =
      `${parentText.slice(0, genericParamStart + 1)}(...params: Array<unknown>) => ${parentText.slice(genericParamStart + 1)}`.trim();
    for (const testFrameworkName of TEST_FRAMEWORK_NAMES) {
      if (!modifiedText.startsWith(testFrameworkName)) continue;

      modifiedText = modifiedText.slice(testFrameworkName.length + 1);
      break;
    }

    return parent.replace(modifiedText);
  },
};

async function jestMockTypeToVitest(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, [EDIT_CONFIG]);
}

export default jestMockTypeToVitest;
