import globals from 'globals';

const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-console': 'warn',
  curly: 'error',
  semi: ['error', 'always'],
  'no-trailing-spaces': 'error',
  'no-multiple-empty-lines': ['error', { max: 1 }],
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules,
  },
  {
    files: ['src/main.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules,
  },
];
