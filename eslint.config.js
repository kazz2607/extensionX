import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'src/lib/jszip.min.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/shared/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-control-regex': 'off',
    },
  },
);
