import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/pnpm-lock.yaml',
    ],
  },
  // Base configuration for JS/TS
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Global environment
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  // Strict rules for all production source code
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', 8],
      'max-depth': ['error', 3],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 3],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Overrides for test files (allow descriptive tests without artificial fragmentation)
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test-utils/**'],
    rules: {
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-depth': 'off',
      'max-params': 'off',
    },
  },
  // Overrides for scripts and configuration files
  {
    files: ['scripts/**', '*.config.{js,mjs,ts}', '**/*.config.{js,mjs,ts}'],
    rules: {
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-depth': 'off',
      'max-params': 'off',
      'no-console': 'off',
    },
  },
);
