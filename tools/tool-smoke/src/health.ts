import { resolveColor } from './color';

export interface HealthTarget {
  name: string;
  url: string;
  /**
   * Extra check beyond `res.ok`, run against the response body text.
   * fe-01 is a static Caddy server that can return 200 for a truncated or
   * empty index.html — no status-only check would notice (design
   * decision 5). Optional and additive: be-01/gw-01 leave this unset and
   * keep the plain `res.ok` gate.
   */
  isHealthy?: (body: string) => boolean;
}

export interface HealthCheck {
  name: string;
  url: string;
  status: number;
  ok: boolean;
}

function targetUrl(
  env: NodeJS.ProcessEnv,
  overrideKey: string,
  container: string,
  port: number,
  path: string,
): string {
  return env[overrideKey] ?? `http://${container}-${resolveColor(env)}:${String(port)}${path}`;
}

/**
 * These are container-DNS names, resolvable only on `wbs-net` — smoke has to
 * run inside the network (see project.json's `smoke` target), never against
 * a public URL. Caddy deliberately does not expose `/health` (or `/metrics`,
 * `/internal/*`) publicly, so a public check here could only ever fail.
 */
export function resolveTargets(env: NodeJS.ProcessEnv = process.env): HealthTarget[] {
  return [
    { name: 'be-01', url: targetUrl(env, 'SMOKE_BE_URL', 'be-01', 3100, '/health') },
    { name: 'gw-01', url: targetUrl(env, 'SMOKE_GW_URL', 'gw-01', 3200, '/health') },
    {
      name: 'fe-01',
      url: targetUrl(env, 'SMOKE_FE_URL', 'fe-01', 80, '/'),
      isHealthy: (body) => body.length > 0,
    },
  ];
}

export async function checkTarget(
  target: HealthTarget,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthCheck> {
  try {
    const res = await fetchImpl(target.url);
    const ok = res.ok && (target.isHealthy === undefined || target.isHealthy(await res.text()));
    return { name: target.name, url: target.url, status: res.status, ok };
  } catch {
    return { name: target.name, url: target.url, status: 0, ok: false };
  }
}

export async function runHealthChecks(
  targets: HealthTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<HealthCheck[]> {
  const out: HealthCheck[] = [];
  for (const t of targets) out.push(await checkTarget(t, fetchImpl));
  return out;
}

async function main(): Promise<void> {
  const results = await runHealthChecks(resolveTargets());
  for (const r of results) {
    console.log(`[smoke/health] ${r.ok ? 'ok' : 'FAIL'} ${String(r.status)} ${r.name} ${r.url}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (import.meta.main) {
  await main();
}
