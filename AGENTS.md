# Repository Guidelines

## Build, Test, and Development Commands

Use `pnpm` with Node `>=24`.

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
- The agent's last message must end with `proof of work`, listing the ways it verified the implemented change actually worked.

## Code Style

- Do not use `as any`; prefer explicit types, narrowing, or typed helpers/globals.

## Source Code Queries

- When querying or transforming source code, always use **ast-grep** patterns and AST node traversal rather than manual string searches, character-by-character loops, or text-based heuristics (e.g. `startsWith`, `indexOf`, regex over raw source text).
- Use `node.find({ rule: { pattern: '...' } })`, `node.children()`, `node.kind()`, and related ast-grep APIs to locate and inspect tokens reliably.
- Derive file paths and directory lists from configuration files (e.g. jest config) rather than hardcoding project-specific strings.
