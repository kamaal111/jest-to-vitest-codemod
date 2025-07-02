import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_PATH = join(process.cwd(), 'dist/cli.js');

function runCli(dir: string) {
  const result = spawnSync('node', [CLI_PATH, dir], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `exit ${result.status}`);
  }
}

beforeAll(() => {
  const build = spawnSync('pnpm', ['build'], { encoding: 'utf-8' });
  if (build.status !== 0) {
    throw new Error(build.stderr || `build failed with exit ${build.status}`);
  }
});

describe('cli', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jtv-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('transforms files in place', async () => {
    const filePath = join(tempDir, 'test.spec.ts');
    const source = "describe('a', () => { it('b', () => { expect(true).toBe(true); }); });";
    await writeFile(filePath, source);

    runCli(tempDir);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain("from 'vitest'");
  });
});
