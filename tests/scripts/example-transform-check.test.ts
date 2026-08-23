import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from 'vitest';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/example-transform-check.ts');

test("that example-transform-check.ts loads under Node's native TypeScript stripping", () => {
  const result = spawnSync(
    'node',
    ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(SCRIPT_PATH).href)});`],
    { encoding: 'utf-8' },
  );

  expect(result.stderr).not.toContain('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX');
  expect(result.status).toBe(0);
});
