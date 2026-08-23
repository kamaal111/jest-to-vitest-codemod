import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadCodemodConfig, runCodemod, type CodemodConfig } from '@kamaalio/codemod-kit';

import { makeJestToVitestCodemod } from './codemods/jest-to-vitest/index.ts';
import { CliUsageError } from './errors.ts';
import packageJSON from '../package.json' with { type: 'json' };

const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-v', '--version']);

const DEFAULT_DRY_RUN_OPTION = false;
const DEFAULT_NO_LOG_OPTION = false;
const DEFAULT_PATH_ARG = '.';

const UPPERCASE_SHORT_FLAG_ALIASES: Record<string, string> = { '-C': '-c', '-D': '-d', '-N': '-n' };

export const HELP_TEXT = `Rewrites Jest tests and project configuration into their Vitest equivalents.

USAGE
  $ jest-to-vitest-codemod [PATH] [-d] [-n] [-c <value>]

ARGUMENTS
  PATH  The file or directory path to transform (default: ".")

FLAGS
  -c, --config=<value>  Path to a JSON config file listing the paths to migrate (mutually exclusive with the path argument)
  -d, --dry             When enabled the transformer will not write to the file but print what would have changed instead
  -n, --no-log          When enabled no logs will be displayed
  -h, --help            Show this help text
  -v, --version         Show the installed version

EXAMPLES
  $ jest-to-vitest-codemod src

  $ jest-to-vitest-codemod src --dry

  $ jest-to-vitest-codemod --config jest-migration-phase1.json
`;

type RunFlags = { config: string | undefined; dry: boolean; 'no-log': boolean };

export function findProjectRoot(startPath: string): string {
  let dir = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startPath);
    dir = parent;
  }
}

export async function run(argv: Array<string> = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || argv.some(arg => HELP_FLAGS.has(arg))) {
    console.log(HELP_TEXT);
    return;
  }

  if (argv.some(arg => VERSION_FLAGS.has(arg))) {
    console.log(packageJSON.version);
    return;
  }

  try {
    await runCommand(argv);
  } catch (error) {
    handleError(error);
  }
}

export async function runCommand(argv: Array<string>): Promise<void> {
  const start = performance.now();
  const { flags, path: transformationPath } = parseRunArgs(argv);

  if (flags.config != null && transformationPath !== DEFAULT_PATH_ARG) {
    throw new CliUsageError("Cannot use '--config' together with a path argument. Choose one.");
  }

  const config = await resolveConfig(flags, transformationPath);
  const rootPaths = [...new Set(config.paths.map(findProjectRoot))];
  const codemod = makeJestToVitestCodemod({ dryRun: config.dry_run ?? false });

  await runCodemod(codemod, config, { rootPaths });

  const end = performance.now();
  if (config.log !== false) {
    console.log(`✨ transformation took ${(end - start).toFixed(2)} milliseconds`);
  }
}

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = error instanceof CliUsageError ? 2 : 1;
}

function parseRunArgs(argv: Array<string>): { flags: RunFlags; path: string } {
  const normalized = argv.map(arg => UPPERCASE_SHORT_FLAG_ALIASES[arg] ?? arg);

  let values: { dry?: boolean; 'no-log'?: boolean; config?: string };
  let positionals: Array<string>;
  try {
    ({ values, positionals } = parseArgs({
      args: normalized,
      options: {
        dry: { type: 'boolean', short: 'd', default: DEFAULT_DRY_RUN_OPTION },
        ['no-log']: { type: 'boolean', short: 'n', default: DEFAULT_NO_LOG_OPTION },
        config: { type: 'string', short: 'c' },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }

  if (positionals.length > 1) {
    throw new CliUsageError(`Unexpected argument '${positionals[1]}'.`);
  }

  return {
    flags: {
      config: values.config,
      dry: values.dry ?? DEFAULT_DRY_RUN_OPTION,
      'no-log': values['no-log'] ?? DEFAULT_NO_LOG_OPTION,
    },
    path: positionals[0] ?? DEFAULT_PATH_ARG,
  };
}

async function resolveConfig(flags: RunFlags, transformationPath: string): Promise<CodemodConfig> {
  if (flags.config == null) {
    return { paths: [transformationPath], dry_run: flags.dry, log: !flags['no-log'] };
  }

  const config = await loadCodemodConfig(flags.config);

  if (flags.dry && config.dry_run !== undefined) {
    throw new CliUsageError("Cannot use '--dry' together with 'dry_run' in the config file. Choose one.");
  }
  if (flags['no-log'] && config.log !== undefined) {
    throw new CliUsageError("Cannot use '--no-log' together with 'log' in the config file. Choose one.");
  }

  return {
    ...config,
    dry_run: flags.dry || (config.dry_run ?? false),
    log: flags['no-log'] ? false : (config.log ?? true),
  };
}
