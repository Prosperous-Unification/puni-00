import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  // The dev server does not read tsconfig paths; the contracts barrel's only package is @noble/hashes.
  resolve: {
    alias: {
      '@website/contracts': fileURLToPath(
        new URL('../../../libs/website/domain/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 4201, host: 'localhost' },
  build: { outDir: 'dist', emptyOutDir: true, license: { fileName: 'licenses.md' } },
});
