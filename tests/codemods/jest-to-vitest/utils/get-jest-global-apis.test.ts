// To get the extended jest matchers
import type {} from '../../../vitest';

import { describe, expect, it } from 'vitest';
import { parseAsync } from '@ast-grep/napi';

import { JEST_TO_VITEST_LANGUAGE } from '../../../../src/codemods/jest-to-vitest/index.js';
import getJestGlobalApis from '../../../../src/codemods/jest-to-vitest/utils/get-jest-global-apis.js';

describe('getJestGlobalApis', () => {
  it('finds jests global apis', async () => {
    const source = `
import chunked from './chunked';

describe('chunked', () => {
  it('chunks in to uneven pieces', () => {
    const result = chunked([1, 2, 3, 4], 3);

    expect(result).toEqual([[1, 2, 3], [4]]);
  });
});
`;
    const ast = await parseAsync(JEST_TO_VITEST_LANGUAGE, source);
    const root = ast.root();

    const jestGlobalApis = getJestGlobalApis(root);

    expect(jestGlobalApis.length).toBe(3);
    expect(jestGlobalApis[0].text()).toStartWith('describe(');
    expect(jestGlobalApis[1].text()).toStartWith('it(');
    expect(jestGlobalApis[2].text()).toStartWith('expect(');
  });
});
