# Repository Guidelines

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
- `pnpm quality`: run the main pre-merge checks.
