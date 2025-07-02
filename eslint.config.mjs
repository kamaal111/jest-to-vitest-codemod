import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  { languageOptions: { globals: globals.browser } },
  js.configs.recommended,
  ...ts.configs.recommended,
  { ignores: ['dist/', 'coverage'] },
  eslintConfigPrettier,
];
