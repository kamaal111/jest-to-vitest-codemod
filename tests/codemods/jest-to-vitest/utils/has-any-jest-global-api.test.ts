import { describe, expect, it } from 'vitest';
import { parseAsync } from '@ast-grep/napi';

import { JEST_TO_VITEST_LANGUAGE } from '../../../../src/codemods/jest-to-vitest/index.js';
import hasAnyJestGlobalAPI from '../../../../src/codemods/jest-to-vitest/utils/has-any-jest-global-api.js';

describe('hasAnyJestGlobalAPI', () => {
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

    expect(hasAnyJestGlobalAPI(root)).toBe(true);
  });

  it('finds jests global apis imported', async () => {
    const source = `
import { describe, it, expect } from '@jest/globals'

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

    expect(hasAnyJestGlobalAPI(root)).toBe(true);
  });

  it('does not find jests-like apis if they are imported from somewhere else', async () => {
    const source = `
import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
`.trim();
    const ast = await parseAsync(JEST_TO_VITEST_LANGUAGE, source);
    const root = ast.root();

    expect(hasAnyJestGlobalAPI(root)).toBe(false);
  });
});
