import tseslint from 'typescript-eslint';
import obsidian from 'eslint-plugin-obsidianmd';

export default tseslint.config({
  files: ['src/**/*.ts'],
  languageOptions: { parser: tseslint.parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
  plugins: { obsidianmd: obsidian, '@typescript-eslint': tseslint.plugin },
  rules: {
    'obsidianmd/no-unsupported-api': 'error',
    '@typescript-eslint/no-require-imports': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    'no-control-regex': 'error',
  },
});


