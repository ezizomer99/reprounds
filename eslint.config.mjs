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
    // Screens and feature components must go through the shared primitives.
    //
    // These four patterns are the ones that actually drifted: the same section
    // rule was redefined in 17 files, the uppercase eyebrow reached seven
    // size/tracking combinations across 58 sites, and activeOpacity reached five
    // values across ~230. Deduplicating them by hand is worth nothing if the
    // next screen starts a sixth copy, so the rules below make that a build
    // failure rather than something a reviewer has to notice.
    //
    // src/components/ui is exempt — it is where the primitives live.
    files: ['frontend/app/**/*.tsx', 'frontend/src/components/**/*.tsx'],
    ignores: ['frontend/src/components/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              // TouchableOpacity only. Pressable is deliberately still allowed:
              // it has no activeOpacity to drift, and the remaining uses are
              // modal backdrops — a full-screen dismiss target is not a button
              // and should not dim on press or announce itself as one.
              importNames: ['TouchableOpacity'],
              message:
                'Use Touchable from src/components/ui — it carries the press feedback, the haptic, and the a11y label requirement.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='activeOpacity']",
          message:
            "Use Touchable's `feedback` prop ('row' | 'card' | 'cta') instead of a raw activeOpacity.",
        },
        {
          // Deliberately narrow: the *card eyebrow* is what drifted (12pt
          // uppercase), and that is the role TYPE.sectionLabel names. Uppercase
          // is legitimate elsewhere at other sizes — badges, sub-block dividers
          // inside a card — and flagging those too would only teach people to
          // add eslint-disable comments.
          selector:
            "ObjectExpression:has(Property[key.name='fontSize'][value.value=12]) > Property[key.name='textTransform'][value.value='uppercase']",
          message:
            'Use TYPE.sectionLabel from src/theme/type — this is the card eyebrow, and it had drifted to seven variants.',
        },
        {
          selector:
            "Property[key.name='borderTopColor'][value.property.name='borderStrong']",
          message:
            'Use <Section> from src/components/ui rather than redefining the broadsheet rule.',
        },
      ],
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
