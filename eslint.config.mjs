import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['migrations/**', '.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },
  {
    // next.config.js is loaded by Next.js itself via require() before any
    // ESM interop is available, so it must stay CommonJS. Likewise
    // ecosystem.config.cjs is loaded by pm2 as CommonJS.
    files: ['next.config.js', 'ecosystem.config.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];

export default eslintConfig;
