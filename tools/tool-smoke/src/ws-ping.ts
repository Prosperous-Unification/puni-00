import { SignJWT } from 'jose';

import { resolveColor } from './color';

export interface SocketLike {
  send: (data: string) => void;
  close: () => void;
  addEventListener: (ev: string, cb: (e: { data: string }) => void) => void;
}

export interface PingOptions {
  connect: () => SocketLike;
  timeoutMs: number;
}

export interface PingResult {
  ok: boolean;
  detail: string;
}

/**
 * Opens a socket, sends a `ping`, and waits for a `pong`. This is the only
 * automated check that exercises a real, held-open WebSocket round trip —
 * the property `stream_close_delay` exists to protect during a blue/green
 * cutover. It must fail (not skip) on timeout: a check that cannot reach the
 * server has to report that loudly, the same as one that gets a bad reply.
 */
export async function runPingSmoke(opts: PingOptions): Promise<PingResult> {
  const sock = opts.connect();
  return await new Promise<PingResult>((resolve) => {
    const timer = setTimeout(() => {
      sock.close();
      resolve({ ok: false, detail: `no pong within ${String(opts.timeoutMs)}ms` });
    }, opts.timeoutMs);

    sock.addEventListener('open', () => {
      sock.send(JSON.stringify({ type: 'ping' }));
    });
    sock.addEventListener('message', (e) => {
      clearTimeout(timer);
      sock.close();
      resolve({ ok: e.data.includes('"pong"'), detail: e.data });
    });
  });
}

/**
 * gw-01's `/ws` upgrade is gated by `beforeHandle` on a valid JWT (see
 * apps/gw-01/src/app.ts) — connecting without `?token=` never reaches
 * `open`, it 401s at the HTTP-upgrade step. So a real WS smoke check has to
 * mint a token the same way a real client would, using the same signing key
 * gw-01 itself reads from its env (`JWT_SIGNING_KEY_CURRENT`, shared via
 * `/srv/wbs/.env` per tier.compose.tmpl). `SMOKE_JWT_KEY` is accepted first
 * for a smoke-specific override; without either, fail immediately rather
 * than attempt a connection that can only ever time out for a misleading
 * reason.
 */
async function mintToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const key = env['SMOKE_JWT_KEY'] ?? env['JWT_SIGNING_KEY_CURRENT'];
  if (key === undefined || key === '') {
    throw new Error(
      'SMOKE_JWT_KEY or JWT_SIGNING_KEY_CURRENT must be set — gw-01 rejects the /ws upgrade ' +
        'without a valid token (apps/gw-01/src/app.ts beforeHandle)',
    );
  }
  return await new SignJWT({ sub: 'smoke' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1m')
    .sign(new TextEncoder().encode(key));
}

function resolveWsUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env['SMOKE_WS_URL'] ?? `ws://gw-01-${resolveColor(env)}:3200/ws`;
}

async function main(): Promise<void> {
  const base = resolveWsUrl();
  const token = await mintToken();
  const url = `${base}${base.includes('?') ? '&' : '?'}token=${token}`;
  const res = await runPingSmoke({
    connect: () => new WebSocket(url),
    timeoutMs: 5000,
  });
  console.log(`[smoke/ws] ${res.ok ? 'ok' : 'FAIL'} — ${res.detail}`);
  if (!res.ok) process.exit(1);
}

if (import.meta.main) {
  await main();
}
