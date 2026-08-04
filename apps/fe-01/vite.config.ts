import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 4200,
    // The dev server runs in a container behind the shared Caddy edge. The
    // default localhost bind is unreachable from another container, and Vite
    // rejects Host headers it was not told about -- which surfaces as a 403
    // from the proxy with nothing in Caddy's logs to explain it.
    host: '0.0.0.0',
    allowedHosts: ['dev.wbs.bulletpoints.club'],
  },
  build: { outDir: '../../dist/apps/fe-01', emptyOutDir: true },
});
