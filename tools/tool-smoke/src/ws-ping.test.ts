import { describe, expect, it } from 'bun:test';

import { runPingSmoke } from './ws-ping';

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
});
