/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
