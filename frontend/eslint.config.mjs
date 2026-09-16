import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * ESLint 9 flat config.
 *
 * There was no config file at all, so `next lint` dropped into its interactive
 * setup prompt and the "lint" script could never run -- which is why CI never
 * ran it. `next lint` is also removed in Next 16, so the script now calls the
 * ESLint CLI directly.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
