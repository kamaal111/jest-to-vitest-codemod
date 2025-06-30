import {
  findAndReplaceConfigModifications,
  type FindAndReplaceConfig,
  type Modifications,
} from '@kamaalio/codemod-kit';

const EDIT_CONFIG: FindAndReplaceConfig = {
  rule: { kind: 'nested_type_identifier', regex: 'jest.Mock' },
  transformer: 'Mock',
};

async function jestMockTypeToVitest(modifications: Modifications): Promise<Modifications> {
  return findAndReplaceConfigModifications(modifications, [EDIT_CONFIG]);
}

export default jestMockTypeToVitest;
