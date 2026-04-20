import { describe, expect, it } from 'bun:test';

import { SubscriptionMap } from '../service/subscription-map';
import { handleWsMessage, type WsSocket } from './ws.controller';

function makeSocket(): { sock: WsSocket; sent: string[] } {
  const sent: string[] = [];
  return { sock: { send: (s) => sent.push(s) }, sent };
}

describe('handleWsMessage', () => {
  it('responds to ping with pong', async () => {
    const { sock, sent } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ type: 'ping' }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ type: 'pong' });
  });

  it('forwards non-control frames to backend', async () => {
    const { sock } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    let captured: unknown;
    await handleWsMessage({
      data: JSON.stringify({ subscription: 'doc:a', message: { hi: true } }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: (m) => {
        captured = m;
        return Promise.resolve({ ack: true });
      },
      resume: () => Promise.resolve({}),
    });
    expect(captured).toEqual({ subscription: 'doc:a', message: { hi: true } });
  });

  it('responds to resume with resume_ack listing replayed counts', async () => {
    const { sock, sent } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ type: 'resume', resume_points: { 'doc:a': 5, 'doc:b': 7 } }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () =>
        Promise.resolve({
          'doc:a': { status: 'replaying', count: 3 },
          'doc:b': { status: 'denied', reason: 'out_of_range' },
        }),
    });
    const deniedFrame = JSON.parse(sent[0]) as Record<string, unknown>;
    expect(deniedFrame['type']).toBe('resume_denied');
    expect(deniedFrame['subscription']).toBe('doc:b');
    const ack = JSON.parse(sent.at(-1)!) as Record<string, unknown>;
    expect(ack['type']).toBe('resume_ack');
    expect(ack['replayed']).toEqual({ 'doc:a': 3 });
  });

  it('emits backend_unavailable error when forward throws', async () => {
    const { sock, sent } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ subscription: 'doc:a', message: {} }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.reject(new Error('nope')),
      resume: () => Promise.resolve({}),
    });
    expect(JSON.parse(sent[0])).toEqual({
      type: 'error',
      code: 'backend_unavailable',
      retry_after: 5,
    });
  });

  it('honours subscribe/unsubscribe control frames', async () => {
    const { sock } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ type: 'subscribe', subscription: 'doc:a' }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });
    expect(subs.socketsFor('doc:a').has(sock)).toBe(true);

    await handleWsMessage({
      data: JSON.stringify({ type: 'unsubscribe', subscription: 'doc:a' }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });
    expect(subs.socketsFor('doc:a').size).toBe(0);
  });
});
