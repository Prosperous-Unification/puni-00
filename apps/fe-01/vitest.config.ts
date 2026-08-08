import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // The second pattern is not decoration: `vite-config.test.ts` lives beside
    // the config it describes, `src/**` never reached it, and so it had never
    // run once — its assertions went on reading `config.server` after the
    // default export became a factory, and nothing said so. It is also why that
    // file is not named `vite.config.test.ts`: vitest's default `exclude` ends
    // in `**/{…,vite,vitest,…}.config.*`, which swallows that name whatever the
    // include says.
    include: ['src/**/*.{test,spec}.{ts,tsx}', '*.{test,spec}.{ts,tsx}'],
  },
});
