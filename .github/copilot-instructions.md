# Copilot Instructions

## Project Overview

`@kamaalio/jest-to-vitest-codemod` is a CLI tool and library that automatically migrates TypeScript test files from Jest to Vitest. It transforms Jest APIs, imports, types, and project configuration into their Vitest equivalents using AST-based code transformations.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, Node16 module resolution)
- **Runtime**: Node.js ≥ 22
- **Package manager**: pnpm
- **AST parsing**: [`@ast-grep/napi`](https://ast-grep.github.io/) — used for all code transformations
- **Codemod framework**: `@kamaalio/codemod-kit` — provides the `Codemod` and `Modifications` types
- **Build**: `rslib` (outputs ESM + CJS to `dist/`)
- **Test runner**: Vitest
- **Linter**: ESLint with `typescript-eslint`, zero warnings allowed
- **Formatter**: Prettier (config from `@kamaalio/prettier-config`)

## Repository Structure

```
src/
  cli.ts                          # CLI entry point
  index.ts                        # Public library exports
  codemods/
    jest-to-vitest/
      index.ts                    # Codemod definition and transformation pipeline
      rules/                      # Individual AST transformation rules
        add-vitest-imports.ts
        jest-focused-skipped-to-vitest.ts
        jest-hooks-to-vitest.ts
        jest-mock-type-to-vitest.ts
        remove-jest-import.ts
        replace-jest-api-with-vi.ts
      utils/                      # Shared utilities for the codemod
tests/
  cli.test.ts
  codemods/
    jest-to-vitest/               # Tests mirroring the src/ structure
example/                          # A real Jest project used as an integration test
```

## Build, Test, and Development Commands

Use `pnpm` with Node `>=22`.

- `pnpm build`: compile the package into `dist/`.
- `pnpm dev`: rebuild on file changes.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:watch`: run tests in watch mode.
- `pnpm test:u`: update snapshots after intentional output changes.
- `pnpm lint`: run ESLint with zero warnings allowed.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm type-check`: run `tsc --noEmit`.
- `pnpm quality`: run the main pre-merge checks (`lint`, `format:check`, `type-check`).

## Architecture: Transformation Pipeline

Each codemod rule receives a `Modifications` object (containing the current AST and metadata) and returns an updated `Modifications` object. Rules are chained sequentially in `src/codemods/jest-to-vitest/index.ts`:

```
replaceJestApiWithVi
  → jestFocusedSkippedToVitest
  → jestHooksToVitest
  → jestMockTypeToVitest
  → addVitestImports
  → removeJestImport
```

The pipeline only runs on files that contain Jest global APIs (checked by `hasAnyJestGlobalAPI`).

After all files are transformed, a `postTransform` hook creates `vitest.config.ts` (if absent) and updates `package.json` dependencies.

## Code Style and Conventions

- **File naming**: kebab-case for all source files (e.g., `add-vitest-imports.ts`).
- **Imports**: use `.js` extensions in relative imports (Node16 module resolution).
- **TypeScript**: strict mode is enforced — avoid `any`, use explicit return types for exported functions.
- **No unused variables**: enforced by ESLint; prefix with `_` (e.g., `_unused`) only when suppression is genuinely needed.
- **Comments**: minimal; only add comments when logic is non-obvious.
- **Formatting**: Prettier handles all formatting — do not manually adjust spacing or line lengths.

## Adding a New Transformation Rule

1. Create a new file in `src/codemods/jest-to-vitest/rules/` named in kebab-case.
2. Export a default async function with the signature:
   ```ts
   export default async function myRule(modifications: Modifications): Promise<Modifications> { ... }
   ```
3. Import and chain the new rule in `src/codemods/jest-to-vitest/index.ts` at the appropriate position in the pipeline.
4. Add corresponding tests in `tests/codemods/jest-to-vitest/rules/`.

## Testing

- Tests use Vitest and live in the `tests/` directory, mirroring the `src/` structure.
- Snapshot tests are used extensively — run `pnpm test:u` to update snapshots after intentional output changes.
- The `example/` directory is used as an end-to-end integration test in CI: the codemod is run on the example Jest project and the resulting Vitest project is type-checked, linted, and tested.
