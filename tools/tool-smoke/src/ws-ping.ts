import { SignJWT } from 'jose';

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
 * Opens a socket, sends a `ping`, and waits for a `pong`.
 *
 * What this proves: the target answers a WS ping/pong round trip right now,
 * over whatever route/auth `opts.connect` set up. What it does NOT prove:
 * that an ALREADY-OPEN socket survives a Caddy config reload.
 * `stream_close_delay` (site.caddy.tmpl) only protects sockets that are open
 * at the moment `caddy reload` runs — this check opens and closes within a
 * single run, entirely before or after any reload, so it never has a socket
 * open across one. That specific guarantee belongs to the deploy rehearsal
 * (a real swap with a socket held open through it), not to this check.
 *
 * Must fail (not skip) on timeout: a check that cannot reach the server has
 * to report that loudly, the same as one that gets a bad reply.
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

// ---------------------------------------------------------------------------
// Routing through Caddy, not straight to the container.
//
// `stream_close_delay 310s` (site.caddy.tmpl) lives ONLY inside Caddy's
// reverse_proxy block for `/ws*`. A socket that connects straight to
// `gw-01-<colour>:3200` never traverses that block at all, so it cannot
// exercise the setting the zero-downtime story depends on, and would still
// pass even if `/ws*` were unrouted or `stream_close_delay` were deleted
// entirely. (That container-direct shape came from the task brief — noted
// in the fix-round report as the plan's defect, not an implementer choice.)
//
// Reaching Caddy correctly requires the request to look like a real
// client's: TLS SNI *and* the HTTP Host header both set to the public site
// address (SITE_ADDRESS, e.g. "wbs.bulletpoints.club") — Caddy selects
// which site block, and which certificate, to serve based on those, not on
// whatever container-DNS name was used to open the TCP connection (verified
// live against a throwaway Caddy: a mismatched SNI gets no certificate at
// all and the TLS handshake is rejected outright).
//
// Bun's high-level `WebSocket` class cannot do this: verified against a
// throwaway Caddy + stub gw-01 that identical `tls: { serverName,
// rejectUnauthorized }` options that work for `fetch()` (200 OK, correct
// site block reached, confirmed via the response coming from the right
// backend) fail for `new WebSocket(...)` every time with a generic "TLS
// handshake failed" / close code 1015 — reproduced against both a
// self-signed cert AND a real, publicly-trusted one (an unrelated public
// wss:// endpoint, connected via its own IP with an SNI override), so this
// is not a trust problem, it is the WebSocket class's TLS/SNI wiring
// specifically (Bun 1.3.14). `Bun.connect()`'s raw TLS socket — the
// primitive `fetch` itself sits on — does not have this bug (verified same
// environment: handshake completes, SNI-based routing reaches the right
// site block). So this speaks the WS handshake and RFC 6455 text-frame
// protocol by hand over a raw `Bun.connect()` socket instead of `new
// WebSocket()`. It talks to `caddy:443` (the container-DNS alias Compose
// gives the `caddy` service on wbs-net — verified live, resolves via
// wbs-net's embedded DNS) and sets serverName/Host to SITE_ADDRESS, exactly
// what a browser client hitting the real hostname would present.
function encodeTextFrame(payload: string): Uint8Array {
  const data = new TextEncoder().encode(payload);
  const mask = crypto.getRandomValues(new Uint8Array(4));
  const masked = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];

  const header =
    data.length < 126
      ? new Uint8Array([0x81, data.length])
      : new Uint8Array([0x81, 126, data.length >> 8, data.length & 0xff]);
  const frame = new Uint8Array(header.length + mask.length + masked.length);
  frame.set(header, 0);
  frame.set(mask, header.length);
  frame.set(masked, header.length + mask.length);
  return frame;
}

/**
 * Consumes one WS frame off the front of `buf` if a complete one is
 * present. Text/binary frames (opcode 1/2) are reported as a message;
 * control frames (WS-protocol-level close/ping/pong, distinct from this
 * check's own JSON-level `{"type":"ping"}`) are silently consumed and
 * skipped. Returns `null` when `buf` doesn't yet hold a whole frame — the
 * caller should wait for more bytes. Only handles payloads up to 65535
 * bytes (the 16-bit extended-length form): plenty for this protocol's small
 * JSON messages, not a general-purpose WS parser.
 */
function consumeFrame(buf: Uint8Array): { message: string | null; rest: Uint8Array } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = (buf[2] << 8) | buf[3];
    offset = 4;
  } else if (len === 127) {
    return null; // 64-bit length: not needed for this protocol, treat as incomplete
  }
  if (masked) offset += 4;
  if (buf.length < offset + len) return null;

  const payload = buf.subarray(offset, offset + len);
  const rest = buf.subarray(offset + len);
  const isData = opcode === 0x1 || opcode === 0x2;
  return { message: isData ? new TextDecoder().decode(payload) : null, rest };
}

export interface CaddyWsTarget {
  host: string;
  port: number;
  path: string;
  /** Sent as both the HTTP Host header and the TLS SNI — see module doc. */
  siteAddress: string;
  rejectUnauthorized: boolean;
}

function connectThroughCaddy(target: CaddyWsTarget): SocketLike {
  const listeners: {
    open: ((e: { data: string }) => void)[];
    message: ((e: { data: string }) => void)[];
  } = { open: [], message: [] };
  let pending = new Uint8Array(0);
  let upgraded = false;
  let sock: Bun.Socket | null = null;

  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  const append = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  };

  Bun.connect({
    hostname: target.host,
    port: target.port,
    tls: { serverName: target.siteAddress, rejectUnauthorized: target.rejectUnauthorized },
    socket: {
      open(s) {
        sock = s;
        const req =
          `GET ${target.path} HTTP/1.1\r\n` +
          `Host: ${target.siteAddress}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n';
        s.write(req);
      },
      data(_s, chunk) {
        pending = append(pending, new Uint8Array(chunk));
        if (!upgraded) {
          const headerEnd = Buffer.from(pending).indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          const statusLine = Buffer.from(pending.subarray(0, headerEnd))
            .toString('utf8')
            .split('\r\n')[0];
          pending = pending.subarray(headerEnd + 4);
          if (!statusLine.includes(' 101 ')) {
            console.error(`[smoke/ws] caddy did not upgrade the connection: ${statusLine}`);
            sock?.end();
            return;
          }
          upgraded = true;
          for (const cb of listeners.open) cb({ data: '' });
        }
        for (;;) {
          const decoded = consumeFrame(pending);
          if (decoded === null) break;
          pending = decoded.rest;
          if (decoded.message !== null) {
            for (const cb of listeners.message) cb({ data: decoded.message });
          }
        }
      },
      error(_s, err) {
        console.error(`[smoke/ws] connection to caddy failed: ${err.message}`);
      },
      close() {
        /* runPingSmoke owns closing; nothing to react to here */
      },
    },
  }).catch((err: unknown) => {
    console.error(
      `[smoke/ws] could not connect to caddy: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  return {
    send: (data) => {
      sock?.write(encodeTextFrame(data));
    },
    close: () => {
      sock?.end();
    },
    addEventListener: (ev, cb) => {
      if (ev === 'open') listeners.open.push(cb);
      if (ev === 'message') listeners.message.push(cb);
    },
  };
}

/**
 * Runs the WS ping/pong suite and reports the result to the console.
 * Returns pass/fail rather than calling `process.exit` itself — see
 * `health.ts`'s `runHealthSuite` doc comment for why: `main.ts` runs this
 * alongside the health suite and decides the process exit code once, after
 * both have reported. `main()` below is the thin standalone-CLI wrapper for
 * `nx run tool-smoke:ws-ping`.
 */
export async function runWsSuite(): Promise<boolean> {
  const token = await mintToken();

  // SMOKE_WS_URL remains available as an explicit escape hatch (e.g. ad hoc
  // local testing against a container directly). Using it deliberately opts
  // OUT of the proxy verification above and reverts to the plain WebSocket
  // client — fine for that narrower purpose, but it does not exercise
  // Caddy's routing or stream_close_delay.
  const override = process.env['SMOKE_WS_URL'];
  const res =
    override !== undefined
      ? await runPingSmoke({
          connect: () =>
            new WebSocket(`${override}${override.includes('?') ? '&' : '?'}token=${token}`),
          timeoutMs: 5000,
        })
      : await runPingSmoke({
          connect: () =>
            connectThroughCaddy({
              host: process.env['SMOKE_CADDY_HOST'] ?? 'caddy',
              port: 443,
              path: `/ws?token=${token}`,
              siteAddress: process.env['SITE_ADDRESS'] ?? 'wbs.bulletpoints.club',
              // Secure by default — production has a real, publicly-trusted
              // cert once DNS+ACME are live. Only relax for a deliberate,
              // explicit opt-in (e.g. rehearsing against a self-signed cert
              // before DNS exists), never silently.
              rejectUnauthorized: process.env['SMOKE_TLS_INSECURE'] !== '1',
            }),
          timeoutMs: 5000,
        });

  console.log(`[smoke/ws] ${res.ok ? 'ok' : 'FAIL'} — ${res.detail}`);
  return res.ok;
}

async function main(): Promise<void> {
  if (!(await runWsSuite())) process.exit(1);
}

if (import.meta.main) {
  await main();
}
