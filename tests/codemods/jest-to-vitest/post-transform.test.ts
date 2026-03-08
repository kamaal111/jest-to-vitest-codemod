import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JEST_TO_VITEST_CODEMOD } from '../../../src/codemods/jest-to-vitest';

async function runPostTransform(root: string): Promise<void> {
  const postTransform = JEST_TO_VITEST_CODEMOD.postTransform;
  if (postTransform == null) {
    throw new Error('Expected the codemod to expose a postTransform hook');
  }

  await postTransform({ root, results: [] }, JEST_TO_VITEST_CODEMOD);
}

describe('jest-to-vitest postTransform', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jtv-post-transform-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates custom environment setup files and updates package.json dependencies', async () => {
    await mkdir(join(tempDir, 'config'), { recursive: true });
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'fixture', devDependencies: { jest: '^30.0.0' } }, null, 2) + '\n',
    );
    await writeFile(
      join(tempDir, 'jest.config.ts'),
      `export default {
  testEnvironment: './config/custom-env.js',
};`,
    );
    await writeFile(
      join(tempDir, 'config', 'custom-env.js'),
      `
      new FontFace('Inter', 'url(/fonts/inter.woff2)', { weight: '400', style: 'normal' });
      document.fonts.add({ family: 'Inter' });
      URL.createObjectURL = () => '';
      `,
    );

    await runPostTransform(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.config.ts'), 'utf-8');
    const vitestSetup = await readFile(join(tempDir, 'vitest.config.setup.ts'), 'utf-8');
    const customEnvSetup = await readFile(join(tempDir, 'vitest-custom-env-setup.ts'), 'utf-8');
    const packageJson = JSON.parse(await readFile(join(tempDir, 'package.json'), 'utf-8')) as {
      devDependencies?: Record<string, string>;
    };

    expect(vitestConfig).toContain("environment: 'jsdom'");
    expect(vitestConfig).toContain("setupFiles: ['./vitest.config.setup.ts']");
    expect(vitestSetup).toContain('import "./vitest-custom-env-setup.ts";');
    expect(customEnvSetup).toContain('globalThis.TextEncoder');
    expect(customEnvSetup).toContain("Object.defineProperty(globalThis, 'FontFace'");
    expect(customEnvSetup).toContain("if (typeof document !== 'undefined') {");
    expect(customEnvSetup).toContain("URL.createObjectURL = () => '';");
    expect(packageJson.devDependencies).toMatchObject({
      '@vitest/coverage-v8': expect.any(String),
      jsdom: '^26.1.0',
      vitest: expect.any(String),
    });
  });

  it('generates additional Vitest configs and setup files from extra Jest configs', async () => {
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'fixture' }, null, 2) + '\n');
    await writeFile(
      join(tempDir, 'jest.integration.config.js'),
      `module.exports = {
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 60000,
  setupFilesAfterEnv: ['./jest.integration.setup.js'],
};`,
    );
    await writeFile(join(tempDir, 'jest.integration.setup.js'), 'globalThis.__READY__ = true;\n');

    await runPostTransform(tempDir);

    const vitestConfig = await readFile(join(tempDir, 'vitest.integration.config.ts'), 'utf-8');
    const vitestSetup = await readFile(join(tempDir, 'vitest.integration.config.setup.ts'), 'utf-8');

    expect(vitestConfig).toContain("include: ['**/*.integration.test.ts']");
    expect(vitestConfig).toContain('testTimeout: 60000');
    expect(vitestConfig).toContain("setupFiles: ['./vitest.integration.config.setup.ts']");
    expect(vitestSetup).toContain("import './jest.integration.setup.js';");
  });

  it('rewrites vi.mock auto-mock factories using discovered moduleDirectories mocks', async () => {
    await mkdir(join(tempDir, 'tests', '__mocks__'), { recursive: true });
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'fixture' }, null, 2) + '\n');
    await writeFile(
      join(tempDir, 'jest.config.ts'),
      `export default {
  moduleDirectories: ['tests', 'node_modules'],
};`,
    );
    await writeFile(join(tempDir, 'tests', '__mocks__', 'calculator.ts'), 'export const add = () => 99;\n');
    await writeFile(
      join(tempDir, 'tests', 'calculator.test.ts'),
      `
      import { vi } from 'vitest';

      vi.mock('calculator');
      `,
    );

    await runPostTransform(tempDir);

    const updatedTest = await readFile(join(tempDir, 'tests', 'calculator.test.ts'), 'utf-8');

    expect(updatedTest).toContain(`vi.mock('calculator', () => import("./__mocks__/calculator"))`);
  });
});
