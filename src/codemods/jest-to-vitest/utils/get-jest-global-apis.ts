import type { SgNode } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';

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

function getJestGlobalApis(root: SgNode<TypesMap, Kinds<TypesMap>>): Array<string> {
  const callExpressions = root.findAll({ rule: { kind: 'expression_statement', has: { kind: 'call_expression' } } });

  return JEST_GLOBAL_APIS.filter(apiName => {
    const callExpressionFound = callExpressions.some(callExpression => {
      return callExpression.children().some(child => {
        return (
          child.find({
            rule: { kind: 'identifier', regex: apiName },
          }) != null
        );
      });
    });
    if (!callExpressionFound) return false;

    const importedByJest =
      root.find({
        rule: {
          kind: 'import_specifier',
          regex: apiName,
          inside: {
            stopBy: 'end',
            any: ["import { $$$IMPORTS } from '@jest/globals'", 'import { $$$IMPORTS } from "@jest/globals"'].map(
              pattern => ({ pattern }),
            ),
          },
        },
      }) != null;
    if (importedByJest) return true;

    const importedByAnythingElse =
      root.find({
        rule: {
          kind: 'import_specifier',
          regex: apiName,
        },
      }) != null;

    return !importedByAnythingElse;
  });
}

export default getJestGlobalApis;
