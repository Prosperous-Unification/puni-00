export interface HealthCheckOptions {
  url: string;
  timeoutMs: number;
  attempts: number;
  intervalMs: number;
  fetchImpl?: typeof fetch;
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
      if (res.ok) return true;
    } catch {
      // keep retrying
    }
    if (i < opts.attempts - 1) await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return false;
}
