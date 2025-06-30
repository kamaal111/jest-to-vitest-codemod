import type { SgNode } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import { arrays } from '@kamaalio/kamaal';

const JEST_GLOBAL_APIS = [
  'afterAll',
  'afterEach',
  'beforeAll',
  'beforeEach',
  'describe',
  'test',
  'it',
  'fit',
  'expect',
];

function getJestGlobalApis(root: SgNode<TypesMap, Kinds<TypesMap>>): Array<SgNode<TypesMap, Kinds<TypesMap>>> {
  const callExpressions = root.findAll({ rule: { kind: 'expression_statement', has: { kind: 'call_expression' } } });

  return arrays.compactMap(callExpressions, callExpression => {
    return callExpression.children().find(child => {
      return child.find({
        rule: { any: JEST_GLOBAL_APIS.map(identifier => ({ kind: 'identifier', regex: identifier })) },
      });
    });
  });
}

export default getJestGlobalApis;
