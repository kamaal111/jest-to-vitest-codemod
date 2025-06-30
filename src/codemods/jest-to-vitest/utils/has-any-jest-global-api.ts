import type { SgNode } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';

import getJestGlobalApis from './get-jest-global-apis.js';

function hasAnyJestGlobalAPI(root: SgNode<TypesMap, Kinds<TypesMap>>): boolean {
  return getJestGlobalApis(root).length > 0;
}

export default hasAnyJestGlobalAPI;
