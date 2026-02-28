import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  { languageOptions: { globals: globals.browser } },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  { ignores: ['dist/', 'coverage'] },
  {
    files: ['example/**'],
    rules: {
      'no-constant-condition': 'off',
    },
  },
  eslintConfigPrettier,
];
