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

## Completion Requirements

- Before completing work, the agent must run `pnpm run ready`.
- If `pnpm run ready` reports any issues, the agent must resolve all of them before finishing.

## Code Style

- Do not use `as any`; prefer explicit types, narrowing, or typed helpers/globals.
