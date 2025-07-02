import {
  findAndReplaceConfigModifications,
  type FindAndReplaceConfig,
  type Modifications,
} from '@kamaalio/codemod-kit';

const EDIT_CONFIG: FindAndReplaceConfig = {
  rule: {
    any: ['jest', 'vi'].map(prefix => ({ kind: 'nested_type_identifier', regex: `${prefix}.Mock` })),
  },
  transformer: 'Mock',
};

async function jestMockTypeToVitest(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, [EDIT_CONFIG]);
}

export default jestMockTypeToVitest;
