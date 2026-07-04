import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.wrangler/**',
      'backend/src/db/migrations/**',
      'frontend/scripts/**',
      'patches/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase legitimately narrows unknown API/JSON shapes in places;
      // keep `any` a warning so new code avoids it without failing the build
      // on the existing spots.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Metro resolves static assets and optional native modules via require().
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Plain-JS config files (metro, tailwind, babel, jest) are CommonJS.
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
