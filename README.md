# Jest to Vitest codemod

`@kamaalio/jest-to-vitest-codemod` is a comprehensive collection of codemods to help migrate from Jest to Vitest. It automatically transforms Jest APIs, imports, types, and project configuration to Vitest equivalents.

- [Jest to Vitest codemod](#jest-to-vitest-codemod)
  - [Features](#features)
    - [Jest API to Vitest API](#jest-api-to-vitest-api)
    - [Hook Transformations](#hook-transformations)
    - [Type Transformations](#type-transformations)
    - [Import Management](#import-management)
    - [Project Configuration](#project-configuration)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Basic String Transformation](#basic-string-transformation)
    - [CLI](#cli)
    - [Advanced Usage with Codemod Framework](#advanced-usage-with-codemod-framework)
    - [File Processing with Filename Context](#file-processing-with-filename-context)
  - [Before/After Examples](#beforeafter-examples)
    - [Complex Jest Test File](#complex-jest-test-file)
  - [API Reference](#api-reference)
    - [Default Export](#default-export)
    - [Named Exports](#named-exports)
  - [Behavior and Limitations](#behavior-and-limitations)
  - [Development](#development)
    - [Running Tests](#running-tests)
    - [Building](#building)
    - [Code Quality](#code-quality)
  - [Contributing](#contributing)
    - [Development Setup](#development-setup)
  - [License](#license)

## Features

This codemod performs the following transformations:

### Jest API to Vitest API

- `jest.mock()` → `vi.mock()` (with proper async handling for `requireActual`)
- `jest.spyOn()` → `vi.spyOn()`
- `jest.requireActual()` → `await vi.importActual()` (automatically wraps functions as async)
- `jest.setTimeout()` → `vi.setTimeout({ testTimeout: ... })`
- `jest.clearAllMocks()` → `vi.clearAllMocks()`
- `jest.resetAllMocks()` → `vi.resetAllMocks()`
- `jest.restoreAllMocks()` → `vi.restoreAllMocks()`
- `jest.useFakeTimers()` → `vi.useFakeTimers()`
- `jest.useRealTimers()` → `vi.useRealTimers()`

### Hook Transformations

- Converts single-expression hooks to block statements for Vitest compatibility
- `beforeEach(() => setup())` → `beforeEach(() => { setup() })`

### Type Transformations

- `jest.Mock<T>` → `Mock<T>`
- `vi.Mock<T>` → `Mock<T>`

### Import Management

- Removes `@jest/globals` imports
- Automatically adds appropriate Vitest imports (`describe`, `it`, `expect`, `vi`, etc.)
- Handles both type and value imports correctly
- Optimizes import statements by combining related imports

### Project Configuration

- Creates `vitest.config.ts` if it doesn't exist
- Updates `package.json` dependencies (removes Jest deps, adds Vitest)
- Removes Jest configuration files

## Requirements

- Node.js ≥ 22.0.0
- TypeScript files (currently supports TypeScript syntax)

## Installation

```bash
npm install @kamaalio/jest-to-vitest-codemod
```

Or using pnpm:

```bash
pnpm add @kamaalio/jest-to-vitest-codemod
```

## Usage

### Basic String Transformation

```typescript
import jestToVitest from '@kamaalio/jest-to-vitest-codemod';

const jestCode = `
  import { describe, it, expect } from '@jest/globals';
  
  jest.mock('fs');
  
  describe('my test', () => {
    beforeEach(() => setup());
    
    it('should work', () => {
      const spy = jest.spyOn(console, 'log');
      expect(true).toBe(true);
      jest.clearAllMocks();
    });
  });
`;

const vitestCode = await jestToVitest(jestCode);
console.log(vitestCode);
```

**Output:**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs');

describe('my test', () => {
  beforeEach(() => {
    setup();
  });

  it('should work', () => {
    const spy = vi.spyOn(console, 'log');
    expect(true).toBe(true);
    vi.clearAllMocks();
  });
});
```

### CLI

Run the codemod over a directory directly from the command line:

```bash
npx jest-to-vitest-codemod ./src
```

### Advanced Usage with Codemod Framework

```typescript
import { JEST_TO_VITEST_CODEMOD, JEST_TO_VITEST_LANGUAGE } from '@kamaalio/jest-to-vitest-codemod';

// Use with @kamaalio/codemod-kit or similar frameworks
const codemod = JEST_TO_VITEST_CODEMOD;
```

### File Processing with Filename Context

```typescript
import jestToVitest from '@kamaalio/jest-to-vitest-codemod';
import { parseAsync } from '@ast-grep/napi';
import { JEST_TO_VITEST_LANGUAGE } from '@kamaalio/jest-to-vitest-codemod';

const fileContent = await fs.readFile('test.spec.ts', 'utf-8');
const ast = await parseAsync(JEST_TO_VITEST_LANGUAGE, fileContent);
const result = await jestToVitest(ast, 'test.spec.ts');
```

## Before/After Examples

### Complex Jest Test File

**Before:**

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  helper: jest.fn(),
}));

describe('Component', () => {
  let mockFn: jest.Mock<(x: number) => string>;

  beforeEach(() => jest.clearAllMocks());

  it('should handle mocks', () => {
    const spy = jest.spyOn(console, 'log');
    jest.setTimeout(10000);
    expect(true).toBe(true);
  });
});
```

**After:**

```typescript
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('./utils', async () => ({
  default: {
    ...(await vi.importActual('./utils')),
    helper: vi.fn(),
  },
}));

describe('Component', () => {
  let mockFn: Mock<(x: number) => string>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle mocks', () => {
    const spy = vi.spyOn(console, 'log');
    vi.setTimeout({ testTimeout: 10000 });
    expect(true).toBe(true);
  });
});
```

## API Reference

### Default Export

```typescript
function jestToVitest(content: string | SgRoot, filename?: string): Promise<string>;
```

Transforms Jest code to Vitest. Accepts either a string of code or a parsed AST from `@ast-grep/napi`.

### Named Exports

```typescript
// Codemod configuration for use with codemod frameworks
export const JEST_TO_VITEST_CODEMOD: Codemod;

// AST language configuration (TypeScript)
export const JEST_TO_VITEST_LANGUAGE: Lang;

// Low-level transformation function
export function jestToVitestModifications(modifications: Modifications): Promise<Modifications>;
```

## Behavior and Limitations

- **File Detection**: Only processes files that contain Jest global APIs (`describe`, `it`, `expect`, etc.)
- **Language Support**: Currently supports TypeScript syntax only
- **Async Handling**: Automatically converts functions to async when `vi.importActual` is used
- **Import Optimization**: Intelligently merges and organizes Vitest imports
- **Project Setup**: Post-transformation hooks set up Vitest configuration and dependencies

## Development

### Running Tests

```bash
pnpm test          # Run tests once
pnpm test:watch    # Run tests in watch mode
pnpm test:cov      # Run tests with coverage
```

### Building

```bash
pnpm build         # Build the package
pnpm dev          # Build in watch mode
```

### Code Quality

```bash
pnpm lint         # Lint code
pnpm format       # Format code
pnpm type-check   # Type check
pnpm quality      # Run all quality checks
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

### Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Run tests: `pnpm test`
4. Make your changes and ensure tests pass
5. Submit a pull request

## License

This project is licensed under the MIT License.
