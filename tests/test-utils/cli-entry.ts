import path from 'node:path';

import type { run as srcRun, runCommand as srcRunCommand } from '../../src/cli.ts';

const useCompiled = process.env['CLI_ENTRY'] === 'dist';

export const CLI_BIN: string = path.join(process.cwd(), useCompiled ? 'bin/run.mjs' : 'bin/dev.mjs');
export const USES_COMPILED_ENTRY: boolean = useCompiled;

const cliSpecifier: string = useCompiled ? '../../dist/cli.js' : '../../src/cli.ts';

export const run: typeof srcRun = (await import(cliSpecifier)).run;
export const runCommand: typeof srcRunCommand = (await import(cliSpecifier)).runCommand;
