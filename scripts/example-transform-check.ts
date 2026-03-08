#!/usr/bin/env node

import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

class CommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const exampleDir = path.join(repoRoot, 'example');

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}

function run(command: string, args: string[], options: childProcess.SpawnSyncOptions = {}): void {
  console.log(`\n> ${formatCommand(command, args)}`);

  const result = childProcess.spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.signal != null) {
    throw new CommandError(`${formatCommand(command, args)} terminated with signal ${result.signal}`, 1);
  }

  if (result.status !== 0) {
    throw new CommandError(
      `${formatCommand(command, args)} exited with status ${result.status ?? 1}`,
      result.status ?? 1,
    );
  }
}

function printSection(title: string): void {
  console.log(`\n## ${title}`);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function snapshotExample(exampleSnapshotDir: string): Promise<void> {
  await fs.cp(exampleDir, exampleSnapshotDir, {
    recursive: true,
    filter: source => path.basename(source) !== 'node_modules',
  });
}

async function clearDirectoryContents(targetDir: string): Promise<void> {
  if (!(await pathExists(targetDir))) return;

  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  await Promise.all(entries.map(entry => fs.rm(path.join(targetDir, entry.name), { force: true, recursive: true })));
}

function installExampleDependencies(): void {
  run('pnpm', ['--dir', exampleDir, 'install', '--ignore-workspace', '--no-lockfile'], { cwd: repoRoot });
}

function lintExample(): void {
  run('pnpm', ['exec', 'eslint', '--max-warnings', '0', 'example'], { cwd: repoRoot });
}

function typeCheckExample(): void {
  run('pnpm', ['--dir', exampleDir, 'run', 'type-check'], { cwd: repoRoot });
}

function testOriginalExample(): void {
  run('pnpm', ['--dir', exampleDir, 'exec', 'jest'], { cwd: repoRoot });
}

function testTransformedExample(): void {
  run('pnpm', ['--dir', exampleDir, 'exec', 'vitest', 'run'], { cwd: repoRoot });
}

async function removeExampleNodeModules(): Promise<void> {
  await clearDirectoryContents(path.join(exampleDir, 'node_modules'));
}

function transformExample(): void {
  run('pnpm', ['exec', 'tsx', 'src/cli.ts', 'example'], { cwd: repoRoot });
}

async function cleanupExample(exampleSnapshotDir: string): Promise<void> {
  printSection('Restoring example');
  const entries = await fs.readdir(exampleDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(exampleDir, entry.name);
      if (entry.name === 'node_modules') {
        await clearDirectoryContents(entryPath);
        return;
      }

      await fs.rm(entryPath, { force: true, recursive: true });
    }),
  );
  await fs.cp(exampleSnapshotDir, exampleDir, { recursive: true });
}

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const snapshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jtv-example-transform-check-'));
  const exampleSnapshotDir = path.join(snapshotRoot, 'example');
  const hadInitialNodeModules = await pathExists(path.join(exampleDir, 'node_modules'));
  let exitCode = 0;
  let shouldCleanup = false;

  try {
    await snapshotExample(exampleSnapshotDir);
    shouldCleanup = true;

    printSection('Validating original example');
    installExampleDependencies();
    typeCheckExample();
    lintExample();
    testOriginalExample();

    printSection('Transforming example');
    await removeExampleNodeModules();
    transformExample();

    printSection('Validating transformed example');
    installExampleDependencies();
    typeCheckExample();
    lintExample();
    testTransformedExample();
  } catch (error: unknown) {
    exitCode = error instanceof CommandError ? error.exitCode : 1;
    console.error(`\n${getMessage(error)}`);
  } finally {
    if (shouldCleanup) {
      try {
        await cleanupExample(exampleSnapshotDir);

        if (hadInitialNodeModules) {
          printSection('Reinstalling original example dependencies');
          installExampleDependencies();
        }
      } catch (cleanupError: unknown) {
        console.error(`\nCleanup failed: ${getMessage(cleanupError)}`);
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
    }

    await fs.rm(snapshotRoot, { force: true, recursive: true });
  }

  return exitCode;
}

process.exit(await main());
