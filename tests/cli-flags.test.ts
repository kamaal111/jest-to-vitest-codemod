import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { captureCli, captureLog } from './test-utils/capture-output.ts';
import { run, runCommand } from './test-utils/cli-entry.ts';

const JEST_SOURCE = "it('a', () => { const spy = jest.fn(); expect(spy).toBeDefined(); });\n";

let tempDir: string;
let sourcePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jtv-flags-'));
  sourcePath = join(tempDir, 'sample.test.ts');
  await writeFile(sourcePath, JEST_SOURCE);
  await writeFile(join(tempDir, 'package.json'), '{ "name": "fixture", "devDependencies": {} }\n');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeConfig(name: string, config: Record<string, unknown>): Promise<string> {
  const configPath = join(tempDir, name);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

test('that it transforms a directory and reports the timing', async () => {
  const { stdout } = await captureLog(() => runCommand([tempDir]));

  expect(stdout).include('transformation took ');
  expect(await readFile(sourcePath, 'utf-8')).include("from 'vitest'");
});

test('that it transforms a single file', async () => {
  const { stdout } = await captureLog(() => runCommand([sourcePath]));

  expect(stdout).include('transformation took ');
  expect(await readFile(sourcePath, 'utf-8')).include('vi.fn()');
});

test('that --dry leaves the project untouched', async () => {
  const { stdout } = await captureLog(() => runCommand([tempDir, '--dry']));

  expect(stdout).include('transformation took ');
  expect(await readFile(sourcePath, 'utf-8')).toBe(JEST_SOURCE);
  await expect(readFile(join(tempDir, 'vitest.config.ts'), 'utf-8')).rejects.toBeDefined();
  expect(await readFile(join(tempDir, 'package.json'), 'utf-8')).not.include('"vitest"');
});

test('that --no-log suppresses the timing line', async () => {
  const { stdout } = await captureLog(() => runCommand([tempDir, '-d', '--no-log']));

  expect(stdout).not.include('transformation took ');
});

test('that uppercase short flag aliases work', async () => {
  const { stdout } = await captureLog(() => runCommand([tempDir, '-D', '-N']));

  expect(stdout).not.include('transformation took ');
  expect(await readFile(sourcePath, 'utf-8')).toBe(JEST_SOURCE);
});

test('that it errors on a path that does not exist', async () => {
  const { error } = await captureLog(() => runCommand([join(tempDir, 'does-not-exist.ts'), '-d']));

  expect(error?.message).include('No file or directory found at ');
});

test('that an unknown flag is rejected', async () => {
  const { error } = await captureLog(() => runCommand([tempDir, '--not-a-flag']));

  expect(error?.message).toBeDefined();
});

test('that an unexpected extra positional argument is rejected', async () => {
  const { error } = await captureLog(() => runCommand([tempDir, 'extra']));

  expect(error?.message).include("Unexpected argument 'extra'.");
});

test('that it runs with a config file', async () => {
  const configPath = await writeConfig('migration.json', { paths: [tempDir] });

  const { stdout } = await captureLog(() => runCommand(['--config', configPath, '-d']));

  expect(stdout).include('transformation took ');
});

test('that it runs with a config listing multiple paths', async () => {
  const otherPath = join(tempDir, 'other.test.ts');
  await writeFile(otherPath, JEST_SOURCE);
  const configPath = await writeConfig('multi.json', { paths: [sourcePath, otherPath] });

  const { stdout } = await captureLog(() => runCommand(['--config', configPath, '-d']));

  expect(stdout).include('transformation took ');
});

test('that it errors when both --config and a path argument are given', async () => {
  const configPath = await writeConfig('migration.json', { paths: [tempDir] });

  const { error } = await captureLog(() => runCommand([tempDir, '--config', configPath, '-d']));

  expect(error?.message).include("Cannot use '--config' together with a path argument. Choose one.");
});

test('that it errors when a config path does not exist', async () => {
  const { error } = await captureLog(() =>
    runCommand(['--config', 'tests/resources/jest-migration-invalid.json', '-d']),
  );

  expect(error?.message).include("No file or directory found at 'tests/resources/does-not-exist.ts'");
});

test('that it errors when the config file itself does not exist', async () => {
  const { error } = await captureLog(() => runCommand(['--config', 'tests/resources/does-not-exist.json', '-d']));

  expect(error?.message).include("No config file found at 'tests/resources/does-not-exist.json'");
});

test('that it errors when the config file fails schema validation', async () => {
  const { error } = await captureLog(() =>
    runCommand(['--config', 'tests/resources/jest-migration-bad-schema.json', '-d']),
  );

  expect(error?.message).include(
    "Config file at 'tests/resources/jest-migration-bad-schema.json' failed schema validation",
  );
});

test('that a config dry_run runs without the --dry flag', async () => {
  const configPath = await writeConfig('dry.json', { paths: [tempDir], dry_run: true });

  const { stdout } = await captureLog(() => runCommand(['--config', configPath]));

  expect(stdout).include('transformation took ');
  expect(await readFile(sourcePath, 'utf-8')).toBe(JEST_SOURCE);
});

test('that it errors when both --dry and a config dry_run are given', async () => {
  const configPath = await writeConfig('dry.json', { paths: [tempDir], dry_run: true });

  const { error } = await captureLog(() => runCommand(['--config', configPath, '-d']));

  expect(error?.message).include("Cannot use '--dry' together with 'dry_run' in the config file. Choose one.");
});

test('that a config log: false suppresses the timing line without --no-log', async () => {
  const configPath = await writeConfig('log.json', { paths: [tempDir], log: false });

  const { stdout } = await captureLog(() => runCommand(['--config', configPath, '-d']));

  expect(stdout).not.include('transformation took ');
});

test('that it errors when both --no-log and a config log are given', async () => {
  const configPath = await writeConfig('log.json', { paths: [tempDir], log: false });

  const { error } = await captureLog(() => runCommand(['--config', configPath, '-d', '--no-log']));

  expect(error?.message).include("Cannot use '--no-log' together with 'log' in the config file. Choose one.");
});

test('that no arguments prints the help text', async () => {
  const { stdout, exitCode } = await captureCli(() => run([]));

  expect(stdout).include('USAGE');
  expect(stdout).include('FLAGS');
  expect(exitCode).toBeUndefined();
});

test('that --help prints the help text', async () => {
  const { stdout, exitCode } = await captureCli(() => run(['--help']));

  expect(stdout).include('USAGE');
  expect(exitCode).toBeUndefined();
});

test('that --version prints the package version', async () => {
  const { stdout, exitCode } = await captureCli(() => run(['--version']));

  expect(stdout).match(/^\d+\.\d+\.\d+$/);
  expect(exitCode).toBeUndefined();
});

test('that a usage error exits with code 2', async () => {
  const configPath = await writeConfig('migration.json', { paths: [tempDir] });

  const { stderr, exitCode } = await captureCli(() => run([tempDir, '--config', configPath]));

  expect(stderr).include("Cannot use '--config' together with a path argument. Choose one.");
  expect(exitCode).toBe(2);
});

test('that a non-usage error exits with code 1', async () => {
  const { stderr, exitCode } = await captureCli(() => run([join(tempDir, 'does-not-exist.ts')]));

  expect(stderr).include('No file or directory found at ');
  expect(exitCode).toBe(1);
});

test('that it dispatches to the transformation on success', async () => {
  const { stdout, exitCode } = await captureCli(() => run([tempDir, '-d']));

  expect(stdout).include('transformation took ');
  expect(exitCode).toBeUndefined();
});
