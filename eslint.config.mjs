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
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/pnpm-lock.yaml',
      '**/next-env.d.ts',
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
  // Frontend-scoped browser environment (strictly scoped to web and ui)
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
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
  // React TSX components: allow up to 75 lines to accommodate declarative JSX markup
  {
    files: ['apps/web/src/**/*.tsx', 'packages/ui/src/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
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
