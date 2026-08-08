import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

/**
 * What the edge does with a request, taught to the dev server on its own.
 *
 * `src/lib/api.ts` fetches same-origin paths and says why: one host serves the
 * app and proxies `/api/*` and `/ws`, so a configured base URL would be a
 * second source of truth. Every deployed environment gets that from Caddy
 * (`tools/tool-compose/src/templates/site.caddy.tmpl`), and dev-in-a-container
 * gets it from the same file — so nothing ever asked what a bare `bunx vite`
 * does with `/api/auth/register`. It serves `index.html` and answers 404, which
 * the app reports as "Something went wrong (http_404)".
 *
 * That is exactly the stack the layout gate starts: three servers, no edge.
 * Ten tests timed out in `beforeEach` waiting for a "New project" button behind
 * a signup that had 404'd. So the routing lives here too, matching the template
 * route for route: `/api/*` to be-01 with its prefix intact, `/ws` to gw-01
 * with the upgrade forwarded.
 *
 * Proof: with this proxy removed, `bun run e2e` fails all ten tests in
 * `beforeEach` on `waiting for getByRole('button', { name: 'New project' })`,
 * the page snapshot showing `http_404` under the register form — watched on
 * h2puni, 2026-08-08, and in CI run 31215500819 before it existed.
 *
 * @throws When the app has no `.env`, rather than starting a dev server that
 * proxies nowhere. `bun run dev:setup` writes one; `nx run fe-01:e2e` runs that
 * first for the same reason.
 */
function edgeRoutes(mode: string): Record<string, ProxyOptions> {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = env['VITE_BE_URL'];
  const gateway = env['VITE_GW_URL'];
  // `loadEnv` is typed `Record<string, string>` and returns `undefined` for a
  // variable no `.env` set — the index signature is a lie the compiler cannot
  // see through, which is why the falsy check is on the value rather than a
  // `=== undefined` the type would call dead code. Empty and absent are the
  // same fault here anyway: a dev server that would proxy nowhere.
  if (!backend || !gateway) {
    throw new Error(
      `apps/fe-01/.env must set VITE_BE_URL and VITE_GW_URL; got ` +
        `VITE_BE_URL=${backend || '(unset)'} VITE_GW_URL=${gateway || '(unset)'}. ` +
        `Run \`bun run dev:setup\` to seed it from .env.example.`,
    );
  }
  return {
    // `handle`, not `handle_path`, in the Caddy template: be-01 mounts its
    // controllers under /api already, so the prefix is passed through.
    '/api': { target: backend },
    '/ws': { target: gateway, ws: true },
  };
}

export default defineConfig(({ command, mode }) => ({
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
    // Serve only. `vite build` has no proxy to configure, and the gate job
    // builds fe-01 on a checkout with no `.env` at all — reading one there
    // would turn this into a build that fails for want of a dev setting.
    proxy: command === 'serve' ? edgeRoutes(mode) : undefined,
  },
  build: { outDir: '../../dist/apps/fe-01', emptyOutDir: true },
}));
