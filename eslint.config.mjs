import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const uiFiles = ['packages/ui/ui/**/*.{ts,tsx}', 'packages/ui/viewer/**/*.{js,ts,tsx}'];

export default defineConfig([
  { ignores: ['**/node_modules/**', '.runtime/**', 'dist/**', 'public/**'] },
  {
    files: uiFiles,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/ui/**/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['website/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettier,
]);
