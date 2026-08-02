export interface HealthCheckOptions {
  url: string;
  timeoutMs: number;
  attempts: number;
  intervalMs: number;
  fetchImpl?: typeof fetch;
  /**
   * Extra check beyond `res.ok`, run against the response body text. A
   * static file server can return 200 for a truncated or empty file — no
   * status-only check would notice (design decision 5, added for fe-01).
   * Optional and additive: omitting it leaves be-01/gw-01's plain
   * `res.ok` gate exactly as before.
   */
  isHealthy?: (body: string) => boolean;
}

export async function waitForHealthy(opts: HealthCheckOptions): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => {
        ctl.abort();
      }, opts.timeoutMs);
      const res = await f(opts.url, { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        if (opts.isHealthy === undefined) return true;
        if (opts.isHealthy(await res.text())) return true;
      }
    } catch {
      // keep retrying
    }
    if (i < opts.attempts - 1) await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return false;
}
