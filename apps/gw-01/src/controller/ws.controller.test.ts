import { describe, expect, it } from 'bun:test';

import { SubscriptionMap } from '../service/subscription-map';
import { handleWsMessage, isKnownSubscription, type WsSocket } from './ws.controller';

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
      data: JSON.stringify({ subscription: 'presence', message: { hi: true } }),
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
    expect(captured).toEqual({ subscription: 'presence', message: { hi: true } });
  });

  it('responds to resume with the replayed events, then resume_ack', async () => {
    const { sock, sent } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ type: 'resume', resume_points: { presence: 5, 'doc:b': 7 } }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () =>
        Promise.resolve({
          presence: {
            status: 'replaying',
            events: [
              { seq: 6, message: { a: 1 } },
              { seq: 7, message: { a: 2 } },
            ],
          },
          'doc:b': { status: 'denied', reason: 'out_of_range' },
        }),
    });
    const frames = sent.map((s) => JSON.parse(s) as Record<string, unknown>);

    expect(frames.filter((f) => f['type'] === 'resume_denied')).toEqual([
      { type: 'resume_denied', subscription: 'doc:b', reason: 'out_of_range' },
    ]);
    // The events carry the same shape as a live push, so the client needs no
    // replay branch — and they arrive before the acknowledgement that counts them.
    expect(frames.filter((f) => f['seq'] !== undefined)).toEqual([
      { subscription: 'presence', seq: 6, message: { a: 1 } },
      { subscription: 'presence', seq: 7, message: { a: 2 } },
    ]);
    expect(frames.at(-1)).toEqual({ type: 'resume_ack', replayed: { presence: 2 } });
  });

  it('replays only to the socket that asked', async () => {
    // `/internal/push` fans out to every socket on the subscription. Replay must
    // not: one laptop waking from sleep would make every other open browser
    // refetch once per event it had missed.
    const asking = makeSocket();
    const bystander = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    subs.subscribe('doc:a', asking.sock);
    subs.subscribe('doc:a', bystander.sock);

    await handleWsMessage({
      data: JSON.stringify({ type: 'resume', resume_points: { 'doc:a': 0 } }),
      socket: asking.sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () =>
        Promise.resolve({
          'doc:a': { status: 'replaying', events: [{ seq: 1, message: { a: 1 } }] },
        }),
    });

    expect(asking.sent).toHaveLength(2);
    expect(bystander.sent).toEqual([]);
  });

  it('emits backend_unavailable error when forward throws', async () => {
    const { sock, sent } = makeSocket();
    const subs = new SubscriptionMap<WsSocket>();
    await handleWsMessage({
      data: JSON.stringify({ subscription: 'presence', message: {} }),
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
      data: JSON.stringify({ type: 'subscribe', subscription: 'presence' }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });
    expect(subs.socketsFor('presence').has(sock)).toBe(true);

    await handleWsMessage({
      data: JSON.stringify({ type: 'unsubscribe', subscription: 'presence' }),
      socket: sock,
      subs,
      connectionId: 'c-1',
      clientId: 'u-1',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });
    expect(subs.socketsFor('presence').size).toBe(0);
  });
});

describe('subscription names', () => {
  it('accepts presence and a project subscription', () => {
    expect(isKnownSubscription('presence')).toBe(true);
    expect(isKnownSubscription(`project:${crypto.randomUUID()}`)).toBe(true);
  });

  it('refuses anything else', () => {
    // `internal:` is the shape that matters: registering it would hand a client
    // a channel it was never meant to reach.
    expect(isKnownSubscription('internal:push')).toBe(false);
    expect(isKnownSubscription('project:not-a-uuid')).toBe(false);
    expect(isKnownSubscription('')).toBe(false);
  });

  it('does not register a socket for an unknown subscription, and says so', async () => {
    const sent: string[] = [];
    const socket = {
      send(data: string) {
        sent.push(data);
      },
    };
    const subs = new SubscriptionMap<typeof socket>();

    await handleWsMessage({
      data: JSON.stringify({ type: 'subscribe', subscription: 'internal:push' }),
      socket,
      subs,
      connectionId: 'c1',
      clientId: 'someone',
      forward: () => Promise.resolve({ ack: true }),
      resume: () => Promise.resolve({}),
    });

    expect(subs.activeCount()).toBe(0);
    expect(sent.map((s) => JSON.parse(s) as { code?: string })[0]?.code).toBe(
      'unknown_subscription',
    );
  });
});
