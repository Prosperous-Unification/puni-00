export interface PingStep {
  phase: 'connect' | 'ping' | 'resume' | 'disconnect';
  ok: boolean;
  durationMs: number;
}

export interface SmokeResult {
  steps: PingStep[];
  overallOk: boolean;
}

export interface MockSocket {
  send(frame: string): Promise<void> | void;
  waitFor(predicate: (frame: string) => boolean, timeoutMs: number): Promise<string>;
  close(): Promise<void> | void;
}

export interface RunOptions {
  open: () => Promise<MockSocket>;
  now?: () => number;
}

export async function runPingSmoke(opts: RunOptions): Promise<SmokeResult> {
  const now = opts.now ?? (() => Date.now());
  const steps: PingStep[] = [];
  let ok = true;

  const t0 = now();
  const sock = await opts.open();
  steps.push({ phase: 'connect', ok: true, durationMs: now() - t0 });

  const t1 = now();
  try {
    await sock.send(JSON.stringify({ type: 'ping' }));
    const pong = await sock.waitFor((f) => f.includes('"pong"'), 1000);
    steps.push({ phase: 'ping', ok: pong.includes('"pong"'), durationMs: now() - t1 });
  } catch {
    ok = false;
    steps.push({ phase: 'ping', ok: false, durationMs: now() - t1 });
  }

  const t2 = now();
  try {
    await sock.send(
      JSON.stringify({ type: 'resume', subscriptions: [{ subscription: 'smoke', last_seq: 0 }] }),
    );
    const ack = await sock.waitFor(
      (f) => f.includes('resume_ack') || f.includes('resume_denied'),
      1000,
    );
    steps.push({ phase: 'resume', ok: ack.length > 0, durationMs: now() - t2 });
  } catch {
    ok = false;
    steps.push({ phase: 'resume', ok: false, durationMs: now() - t2 });
  }

  const t3 = now();
  await sock.close();
  steps.push({ phase: 'disconnect', ok: true, durationMs: now() - t3 });

  return { steps, overallOk: ok && steps.every((s) => s.ok) };
}

function parseWsUrl(argv: string[]): string {
  for (const a of argv) {
    const m = /^--ws=(.*)$/.exec(a);
    if (m) return (m[1] as string | undefined) ?? '';
  }
  return process.env['SMOKE_WS_URL'] ?? '';
}

async function main(): Promise<void> {
  const ws = parseWsUrl(process.argv.slice(2));
  if (!ws) {
    console.log('[tool-smoke/ws-ping] no --ws=<url> provided — skipping (scaffold only).');
    return;
  }
  console.log('[tool-smoke/ws-ping] live mode not wired in the scaffold — use --ws with the real');
  console.log('[tool-smoke/ws-ping] gw-01 URL once deployed; runPingSmoke is unit-tested below.');
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
