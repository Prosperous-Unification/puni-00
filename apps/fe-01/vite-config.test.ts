// @vitest-environment node
//
// The suite-wide jsdom environment breaks this one file: importing the real
// `vite` pulls in esbuild, which refuses to load where
// `new TextEncoder().encode('') instanceof Uint8Array` is false — jsdom's
// TextEncoder comes from a different realm, so it is. A config module has no
// DOM to test anyway. The tag is read by a regex over the whole file
// (`groupFilesByEnv`), so a line comment carries it as well as a docblock —
// and a docblock would need a `@vitest-environment` the jsdoc lint rejects.
import type * as Vite from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `edgeRoutes` reads `.env` off the disk through Vite's `loadEnv`. A test that
// let it do that would assert the developer's own `apps/fe-01/.env` — present
// here, absent in CI — so the two cases below (env set, env missing) would each
// only ever run on one of the two machines. The stub is the whole point of the
// mock; `defineConfig` stays the real one.
const loadEnv = vi.hoisted(() =>
  vi.fn<(mode: string, envDir: string, prefix: string) => Record<string, string>>(),
);

vi.mock('vite', async (importOriginal) => ({
  ...(await importOriginal<typeof Vite>()),
  loadEnv,
}));

const { default: config } = await import('./vite.config');

const BE_URL = 'http://be-01:3000';
const GW_URL = 'http://gw-01:3001';

function serveConfig(env: Record<string, string>, mode = 'development') {
  loadEnv.mockReturnValue(env);
  return config({ command: 'serve', mode });
}

function proxyOf(env: Record<string, string>) {
  const { proxy } = serveConfig(env).server ?? {};
  if (!proxy) throw new Error('the serve config has no proxy to assert on');
  return proxy;
}

/**
 * Vite's own rule for whether a proxy key claims a URL, copied from
 * `doesProxyContextMatchUrl` in `vite/src/node/server/middlewares/proxy.ts` so
 * that the prefix-vs-subtree assertions below run against the key we ship
 * rather than against a paraphrase of it. Only the `^` test is spelt
 * differently there (`key[0] === '^'`), for a lint rule.
 */
function claimsUrl(key: string, url: string): boolean {
  return (key.startsWith('^') && new RegExp(key).test(url)) || url.startsWith(key);
}

beforeEach(() => {
  loadEnv.mockReset();
});

// These assert deployment facts, not preferences. The dev server runs inside a
// container behind Caddy, so a localhost bind or a rejected Host header makes
// the dev site fail in a way that looks like a proxy misconfiguration.
describe('vite dev server config', () => {
  it('binds all interfaces so a reverse proxy outside the container can reach it', () => {
    expect(serveConfig({ VITE_BE_URL: BE_URL, VITE_GW_URL: GW_URL }).server?.host).toBe('0.0.0.0');
  });

  it('accepts the public dev hostname', () => {
    expect(
      serveConfig({ VITE_BE_URL: BE_URL, VITE_GW_URL: GW_URL }).server?.allowedHosts,
    ).toContain('dev.wbs.bulletpoints.club');
  });

  it('keeps port 4200 so the compose mapping and the Caddy upstream stay correct', () => {
    expect(serveConfig({ VITE_BE_URL: BE_URL, VITE_GW_URL: GW_URL }).server?.port).toBe(4200);
  });
});

// Proof: five faults, injected one at a time into `vite.config.ts` and
// reverted — the `server.proxy` line deleted (4 failed), the key back at the
// plain `'/api'` this replaced (2 failed, the routing one on `/apiary`), the
// `/ws` entry deleted (2 failed), the `command === 'serve'` guard dropped (1
// failed, on the env a build must not read), and the `!backend || !gateway`
// guard dropped (2 failed). Lines in
// `openspec/changes/table-geometry-and-tab-order/verify.md`.
describe('vite dev server proxy', () => {
  it('sends the two edge subtrees to the services the env names', () => {
    const proxy = proxyOf({ VITE_BE_URL: BE_URL, VITE_GW_URL: GW_URL });

    expect(proxy).toEqual({
      '^/api/': { target: BE_URL },
      '/ws': { target: GW_URL, ws: true },
    });
    expect(loadEnv).toHaveBeenCalledWith('development', expect.any(String), 'VITE_');
  });

  it('claims the paths Caddy routes and leaves the ones it does not', () => {
    const keys = Object.keys(proxyOf({ VITE_BE_URL: BE_URL, VITE_GW_URL: GW_URL }));
    // Which key claims a path is asserted above; here only whether any does,
    // so that a key of a different shape still has to route the same set.
    const routes = (url: string) => keys.some((key) => claimsUrl(key, url));

    // `handle /api/*` and `handle /ws*` in site.caddy.tmpl.
    expect(routes('/api/auth/register')).toBe(true);
    expect(routes('/ws')).toBe(true);
    expect(routes('/ws/socket?projectId=1')).toBe(true);
    // Neither matches `/api/*` there, so `handle {}` hands both to the SPA —
    // which is what an unclaimed path means here too.
    expect(routes('/apiary')).toBe(false);
    expect(routes('/api')).toBe(false);
    expect(routes('/projects')).toBe(false);
  });

  it('configures no proxy for a build, and does not read an env to decide', () => {
    loadEnv.mockImplementation(() => {
      throw new Error('a build must not read apps/fe-01/.env');
    });

    expect(config({ command: 'build', mode: 'production' }).server?.proxy).toBeUndefined();
    expect(loadEnv).not.toHaveBeenCalled();
  });

  it('refuses to serve with an env that names no backend, and says how to seed one', () => {
    loadEnv.mockReturnValue({});

    expect(() => config({ command: 'serve', mode: 'development' })).toThrowError(
      /apps\/fe-01\/\.env must set VITE_BE_URL and VITE_GW_URL; got VITE_BE_URL=\(unset\) VITE_GW_URL=\(unset\)\..*bun run dev:setup/s,
    );
  });

  it('refuses a half-set env too, naming the half that is missing', () => {
    loadEnv.mockReturnValue({ VITE_BE_URL: BE_URL });

    expect(() => config({ command: 'serve', mode: 'development' })).toThrowError(
      new RegExp(`VITE_BE_URL=${BE_URL} VITE_GW_URL=\\(unset\\)`),
    );
  });
});
