/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  // relative base: the build works from any path (Vercel Drop, a sub-folder, file servers)
  build: { target: 'es2022', chunkSizeWarningLimit: 1200, sourcemap: false },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
