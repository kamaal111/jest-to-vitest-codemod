#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runCodemod } from '@kamaalio/codemod-kit';

import { JEST_TO_VITEST_CODEMOD } from './codemods/jest-to-vitest/index.js';

export function findProjectRoot(startPath: string): string {
  let dir = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startPath);
    dir = parent;
  }
}

export async function main(): Promise<void> {
  const [target] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: jest-to-vitest-codemod <path>');
    process.exit(1);
  }

  const projectRoot = findProjectRoot(target);
  await runCodemod(JEST_TO_VITEST_CODEMOD, target, { rootPaths: [projectRoot] });
}

const invokedPath = process.argv[1];
const isDirectExecution = invokedPath != null && import.meta.url === pathToFileURL(invokedPath).href;

if (isDirectExecution) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
