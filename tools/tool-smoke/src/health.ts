export interface HealthCheck {
  url: string;
  status: number;
  ok: boolean;
}

export async function checkUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<HealthCheck> {
  try {
    const res = await fetchImpl(url);
    return { url, status: res.status, ok: res.ok };
  } catch {
    return { url, status: 0, ok: false };
  }
}

export async function runHealthChecks(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthCheck[]> {
  const targets = [`${baseUrl}/health`, `${baseUrl}/metrics`];
  const out: HealthCheck[] = [];
  for (const u of targets) out.push(await checkUrl(u, fetchImpl));
  return out;
}

function parseBaseUrl(argv: string[]): string {
  for (const a of argv) {
    const m = /^--remote=(.*)$/.exec(a);
    if (m?.[1] !== undefined) return m[1];
  }
  return process.env['SMOKE_BASE_URL'] ?? '';
}

async function main(): Promise<void> {
  const base = parseBaseUrl(process.argv.slice(2));
  if (!base) {
    console.log('[tool-smoke/health] no --remote=<url> provided — skipping (scaffold only).');
    return;
  }
  const results = await runHealthChecks(base);
  for (const r of results) {
    console.log(`[smoke/health] ${r.ok ? 'ok' : 'FAIL'} ${String(r.status)} ${r.url}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}

if (import.meta.main) {
  void main();
}
