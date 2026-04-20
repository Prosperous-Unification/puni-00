export interface DrainOptions {
  activeConnections: () => Promise<number> | number;
  maxWaitMs: number;
  pollMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function drain(opts: DrainOptions): Promise<{ drained: boolean; elapsedMs: number }> {
  const start = Date.now();
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  while (Date.now() - start < opts.maxWaitMs) {
    const n = await opts.activeConnections();
    if (n <= 0) return { drained: true, elapsedMs: Date.now() - start };
    await sleep(opts.pollMs);
  }
  return { drained: false, elapsedMs: Date.now() - start };
}
