# Repository Guidelines

## Build, Test, and Development Commands

Use `pnpm` on Node.js `>=26` (see `.node-version`); the pnpm version comes from
`devEngines.packageManager` in `package.json`.

- `pnpm build`: compile TypeScript into `dist/`.
- `pnpm clean:build`: wipe `dist/` and rebuild.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:watch`: run tests in watch mode.
- `pnpm test:cov`: collect coverage for `src/`.
- `pnpm test:u`: update snapshots after intentional output changes.
- `pnpm lint` and `pnpm format:check`: enforce oxlint and oxfmt rules.
- `pnpm lint:example`: lint the example app with its own oxlint config.
- `pnpm type-check`, `pnpm type-check:test`, `pnpm type-check:scripts`: verify TypeScript without emitting.
- `pnpm example:transform-check`: validate the example app before and after transformation, then restore it.
- `just quality`: run the main local quality gate (`lint`, `format-check`, and every `type-check`).

The CLI has two entry points: `bin/dev.mjs` runs `src/` directly through Node's native TypeScript
type stripping, and `bin/run.mjs` runs the compiled `dist/`. Set `CLI_ENTRY=dist` to point the test
suite and `just` recipes at the compiled output.

## Completion Requirements

- Before completing work, the agent must run `pnpm run ready`.
- If `pnpm run ready` reports any issues, the agent must resolve all of them before finishing.
- The agent's last message must end with `proof of work`, listing the ways it verified the implemented change actually worked.

## Code Style

- Do not use `as any`; prefer explicit types, narrowing, or typed helpers/globals. oxlint rejects
  type assertions outright in `src/`.
- Source files import each other with explicit `.ts` extensions, which `tsc` rewrites to `.js` on
  build. Node's type stripping is strip-only, so no enums, namespaces, or constructor parameter
  properties.
