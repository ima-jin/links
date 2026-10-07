import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // @ima-jin/auth-client transitively imports 'next/headers' (getSession's
      // cookie read) — not resolvable under plain-Node vitest, only inside a
      // real Next.js runtime. See test/stubs/next-headers.ts.
      'next/headers': fileURLToPath(new URL('./test/stubs/next-headers.ts', import.meta.url)),
      // Next's real `next/server` pulls in a CJS-only dependency that breaks
      // under vitest's SSR module loading; see src/test/next-server-shim.ts.
      'next/server': fileURLToPath(new URL('./src/test/next-server-shim.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    server: {
      // Otherwise vitest hands these packages' ESM imports of 'next/headers'
      // / 'next/server' straight to Node's own resolver, which (a) bypasses
      // resolve.alias above for next/headers, and (b) can't resolve
      // extensionless 'next/server' imports the way Next's own bundler does.
      deps: { inline: ['@ima-jin/auth-client', '@ima-jin/auth', '@ima-jin/config', '@ima-jin/logger'] },
    },
    coverage: {
      // lcov is what SonarCloud ingests (sonar.javascript.lcov.reportPaths).
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['app/**/*.ts', 'app/**/*.tsx', 'src/**/*.ts', 'src/**/*.tsx', 'ecosystem.config.cjs'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        '**/.next/**',
        '**/node_modules/**',
      ],
    },
  },
});
