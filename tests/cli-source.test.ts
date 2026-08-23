import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runCodemod = vi.hoisted(() => vi.fn());
const loadCodemodConfig = vi.hoisted(() => vi.fn());

vi.mock('@kamaalio/codemod-kit', () => ({
  runCodemod,
  loadCodemodConfig,
}));

import { findProjectRoot, run } from '../src/cli.ts';

describe('src/cli', () => {
  const originalArgv = [...process.argv];
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jtv-cli-source-'));
    runCodemod.mockReset();
    loadCodemodConfig.mockReset();
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

  it('prints the help text instead of transforming when no target path is provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run([]);

    expect(logSpy.mock.calls.map(call => String(call[0])).join('\n')).toContain('USAGE');
    expect(runCodemod).not.toHaveBeenCalled();
  });

  it('passes the discovered project root to runCodemod', async () => {
    const projectRoot = join(tempDir, 'workspace');
    const nestedTarget = join(projectRoot, 'packages', 'feature');
    await mkdir(nestedTarget, { recursive: true });
    await writeFile(join(projectRoot, 'package.json'), '{}\n');

    await run([nestedTarget]);

    expect(runCodemod).toHaveBeenCalledTimes(1);
    expect(runCodemod).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'jest-to-vitest-transformer' }),
      { paths: [nestedTarget], dry_run: false, log: true },
      { rootPaths: [projectRoot] },
    );
  });

  it('resolves a project root for every path listed in a config file', async () => {
    const firstRoot = join(tempDir, 'first');
    const secondRoot = join(tempDir, 'second');
    await mkdir(join(firstRoot, 'tests'), { recursive: true });
    await mkdir(join(secondRoot, 'tests'), { recursive: true });
    await writeFile(join(firstRoot, 'package.json'), '{}\n');
    await writeFile(join(secondRoot, 'package.json'), '{}\n');

    const configPath = join(tempDir, 'migration.json');
    loadCodemodConfig.mockResolvedValue({ paths: [join(firstRoot, 'tests'), join(secondRoot, 'tests')] });

    await run(['--config', configPath]);

    expect(runCodemod).toHaveBeenCalledTimes(1);
    expect(runCodemod).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      rootPaths: [firstRoot, secondRoot],
    });
  });
});
