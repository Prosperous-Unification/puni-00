import { describe, expect, it } from 'bun:test';

import {
  caddyUpgradeRequest,
  consumeFrame,
  runBackendHopSmoke,
  runPingSmoke,
  type SocketEvent,
  type SocketLike,
} from './ws-ping';

describe('caddyUpgradeRequest', () => {
  it('authenticates in headers and keeps the session credential out of the request target', () => {
    const request = caddyUpgradeRequest(
      {
        host: 'caddy',
        port: 443,
        path: '/ws',
        siteAddress: 'wbs.test',
        rejectUnauthorized: true,
        token: 'header.payload.signature',
      },
      'websocket-key',
    );

    expect(request).toContain('GET /ws HTTP/1.1\r\n');
    expect(request).toContain('Origin: https://wbs.test\r\n');
    expect(request).toContain('Cookie: __Host-wbs_access=header.payload.signature\r\n');
    expect(request).not.toContain('?token=');
  });
});

describe('runPingSmoke', () => {
  it('reports ok when the socket echoes a pong', async () => {
    const fake = {
      send: () => undefined,
      close: () => undefined,
      addEventListener: (ev: string, cb: (e: { data: string }) => void) => {
        if (ev === 'message')
          setTimeout(() => {
            cb({ data: '{"type":"pong"}' });
          }, 0);
        if (ev === 'open')
          setTimeout(() => {
            cb({ data: '' });
          }, 0);
      },
    };
    const res = await runPingSmoke({ connect: () => fake, timeoutMs: 100 });
    expect(res.ok).toBe(true);
  });

  it('ignores presence before the pong response', async () => {
    const presenceThenPong = scriptedPingGateway([
      '{"type":"presence","users":["smoke"]}',
      '{"type":"pong"}',
    ]);

    const res = await runPingSmoke({ connect: () => presenceThenPong, timeoutMs: 100 });

    expect(res).toEqual({ ok: true, detail: '{"type":"pong"}' });
  });

  it('reports failure when nothing answers before the timeout', async () => {
    const silent = {
      send: () => undefined,
      close: () => undefined,
      addEventListener: (ev: string, cb: (e: { data: string }) => void) => {
        if (ev === 'open')
          setTimeout(() => {
            cb({ data: '' });
          }, 0);
      },
    };
    const res = await runPingSmoke({ connect: () => silent, timeoutMs: 50 });
    expect(res.ok).toBe(false);
  });

  it('reports failure when the socket replies with something other than pong', async () => {
    const wrongReply = {
      send: () => undefined,
      close: () => undefined,
      addEventListener: (ev: string, cb: (e: { data: string }) => void) => {
        if (ev === 'message')
          setTimeout(() => {
            cb({ data: '{"type":"error","code":"invalid_payload"}' });
          }, 0);
        if (ev === 'open')
          setTimeout(() => {
            cb({ data: '' });
          }, 0);
      },
    };
    const res = await runPingSmoke({ connect: () => wrongReply, timeoutMs: 100 });
    expect(res.ok).toBe(false);
  });

  it('reports malformed response data instead of waiting for timeout', async () => {
    const malformed = scriptedPingGateway(['not-json']);

    const res = await runPingSmoke({ connect: () => malformed, timeoutMs: 100 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('not JSON');
  });
});

/** A gw-01 that answers the ping probe with a fixed list of frames once it opens. */
function scriptedPingGateway(replies: readonly string[]): SocketLike {
  const listeners: Record<'open' | 'message', ((e: SocketEvent) => void)[]> = {
    open: [],
    message: [],
  };
  return {
    send: () => undefined,
    close: () => undefined,
    addEventListener: (ev, cb) => {
      if (ev === 'open' || ev === 'message') listeners[ev].push(cb);
      if (ev !== 'message') return;
      setTimeout(() => {
        for (const open of listeners.open) open({ data: '' });
        for (const reply of replies)
          for (const message of listeners.message) message({ data: reply });
      }, 0);
    },
  };
}

/**
 * A gw-01 that answers the probe with a fixed script.
 *
 * `onOpen` frames arrive as soon as the socket opens (a forward error lands
 * there); `onResume` frames, and then `closeOnResume`, arrive only once the
 * probe has sent its resume, as gw-01 answers it. Records what was sent,
 * because "the probe asked the right question" is half of what makes its
 * answer mean anything.
 */
function scriptedGateway(script: {
  onOpen?: readonly string[];
  onResume?: readonly string[];
  closeOnResume?: { code: number; reason: string };
}): SocketLike & { sent: string[] } {
  const sent: string[] = [];
  const listeners: Record<'open' | 'message' | 'close', ((e: SocketEvent) => void)[]> = {
    open: [],
    message: [],
    close: [],
  };
  const deliver = (frames: readonly string[] = []) => {
    for (const frame of frames) for (const message of listeners.message) message({ data: frame });
  };
  return {
    sent,
    send: (data) => {
      sent.push(data);
      if (!data.includes('"type":"resume"')) return;
      setTimeout(() => {
        deliver(script.onResume);
        const closed = script.closeOnResume;
        if (closed !== undefined)
          for (const close of listeners.close) close({ data: '', ...closed });
      }, 0);
    },
    close: () => undefined,
    addEventListener: (ev, cb) => {
      if (ev === 'open' || ev === 'message' || ev === 'close') listeners[ev].push(cb);
      if (ev !== 'close') return;
      // Queued once every listener is attached; the open handler sends the probe.
      setTimeout(() => {
        for (const open of listeners.open) open({ data: '' });
        deliver(script.onOpen);
      }, 0);
    },
  };
}

const OUT_OF_RANGE =
  '{"type":"resume_denied","subscription":"project:00000000-0000-0000-0000-000000000000","reason":"out_of_range"}';
const UNAVAILABLE =
  '{"type":"resume_denied","subscription":"project:00000000-0000-0000-0000-000000000000","reason":"unavailable"}';
const ACK = '{"type":"resume_ack","replayed":{}}';
const FORWARD_REFUSED = '{"type":"error","code":"backend_unavailable","retry_after":5}';

describe('runBackendHopSmoke', () => {
  it('asks be-01 something only be-01 can answer', async () => {
    const gw = scriptedGateway({ onResume: [OUT_OF_RANGE, ACK] });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(true);
    // The forward envelope first, then the resume. Without the first there is
    // nothing exercising gw-01's ForwardClient at all, which is the finding this
    // check exists for.
    expect(gw.sent[0]).toContain('"subscription"');
    expect(gw.sent[0]).toContain('"message"');
    expect(gw.sent[1]).toContain('"type":"resume"');
  });

  it('succeeds when be-01 refuses the smoke principal', async () => {
    // gw-01 verified the smoke token at the upgrade; only be-01's project
    // access check can refuse it now, so the 1008 close is be-01's answer.
    const gw = scriptedGateway({ closeOnResume: { code: 1008, reason: 'unauthenticated' } });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(true);
    expect(res.detail).toContain('be-01 refused the smoke principal');
  });

  it('fails when gw-01 could not reach be-01 to resume', async () => {
    // `unavailable` is gw-01's own catch — an unreachable be-01, a non-2xx, or a
    // rejected internal secret. `out_of_range` above is be-01's answer and can
    // only come from a call that arrived. That is the whole distinction the
    // check rests on.
    const gw = scriptedGateway({ onResume: [UNAVAILABLE, ACK] });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('could not reach be-01');
  });

  it('fails when gw-01 closes because the access check went unanswered', async () => {
    const gw = scriptedGateway({
      closeOnResume: { code: 1013, reason: 'project access unavailable' },
    });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('could not reach be-01');
  });

  it('fails when the forward is refused', async () => {
    const gw = scriptedGateway({ onOpen: [FORWARD_REFUSED] });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('could not forward');
  });

  it('fails when the forward error arrives after the resume settled', async () => {
    // The drain after `resume_ack` is what catches a forward error that lands
    // late; without it this run would report ok.
    const gw = scriptedGateway({ onResume: [OUT_OF_RANGE, ACK, FORWARD_REFUSED] });
    const res = await runBackendHopSmoke({ connect: () => gw, timeoutMs: 3000 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('could not forward');
  });

  it('fails when nothing answers at all', async () => {
    const silent = scriptedGateway({});
    const res = await runBackendHopSmoke({ connect: () => silent, timeoutMs: 100 });

    expect(res.ok).toBe(false);
    expect(res.detail).toContain('no resume_ack');
  });
});

describe('consumeFrame', () => {
  it('reports a close frame’s code and reason', () => {
    const reason = new TextEncoder().encode('unauthenticated');
    const frame = new Uint8Array([0x88, 2 + reason.length, 0x03, 0xf0, ...reason]);

    // Proof: dropping the close branch reported null here, and the caddy path
    // would have read gw-01's 1008 as silence (2026-10-11).
    expect(consumeFrame(frame)?.close).toEqual({ code: 1008, reason: 'unauthenticated' });
  });
});
