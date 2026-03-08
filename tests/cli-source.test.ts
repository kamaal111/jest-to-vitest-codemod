import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runCodemod = vi.hoisted(() => vi.fn());

vi.mock('@kamaalio/codemod-kit', () => ({
  runCodemod,
}));

import { findProjectRoot, main } from '../src/cli';

describe('src/cli', () => {
  const originalArgv = [...process.argv];
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jtv-cli-source-'));
    runCodemod.mockReset();
    process.argv = [...originalArgv];
  });

  afterEach(async () => {
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('finds the nearest package.json when resolving the project root', async () => {
    const nestedDir = join(tempDir, 'packages', 'feature', 'tests');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(tempDir, 'package.json'), '{}\n');

    expect(findProjectRoot(nestedDir)).toBe(tempDir);
  });

  it('falls back to the provided path when no package.json is found', async () => {
    const nestedDir = join(tempDir, 'packages', 'feature', 'tests');
    await mkdir(nestedDir, { recursive: true });

    expect(findProjectRoot(nestedDir)).toBe(nestedDir);
  });

  it('prints usage and exits when no target path is provided', async () => {
    process.argv = ['node', 'src/cli.ts'];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      throw new Error(`process.exit:${code ?? ''}`);
    }) as typeof process.exit);

    await expect(main()).rejects.toThrow('process.exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Usage: jest-to-vitest-codemod <path>');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(runCodemod).not.toHaveBeenCalled();
  });

  it('passes the discovered project root to runCodemod', async () => {
    const projectRoot = join(tempDir, 'workspace');
    const nestedTarget = join(projectRoot, 'packages', 'feature');
    await mkdir(nestedTarget, { recursive: true });
    await writeFile(join(projectRoot, 'package.json'), '{}\n');
    process.argv = ['node', 'src/cli.ts', nestedTarget];

    await main();

    expect(runCodemod).toHaveBeenCalledTimes(1);
    expect(runCodemod).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'jest-to-vitest-transformer' }),
      nestedTarget,
      { rootPaths: [projectRoot] },
    );
  });
});
