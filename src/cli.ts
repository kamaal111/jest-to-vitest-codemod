#!/usr/bin/env node
import { runCodemod } from '@kamaalio/codemod-kit';

import { JEST_TO_VITEST_CODEMOD } from './codemods/jest-to-vitest/index.js';

async function main(): Promise<void> {
  const [target] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: jest-to-vitest-codemod <path>');
    process.exit(1);
  }

  await runCodemod(JEST_TO_VITEST_CODEMOD, target, { rootPaths: [target] });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
