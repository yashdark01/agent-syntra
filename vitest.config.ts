import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@syntra/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@syntra/core': path.resolve(__dirname, 'packages/core/src'),
      '@syntra/config': path.resolve(__dirname, 'packages/config/src'),
      '@syntra/providers': path.resolve(__dirname, 'packages/providers/src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      FORCE_COLOR: '1',
    },
  },
});
