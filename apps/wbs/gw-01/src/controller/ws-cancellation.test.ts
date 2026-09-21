import { expect, it } from 'bun:test';

import { SubscriptionMap } from '../service/subscription-map';
import type { UnexpectedBackendFailure } from './unexpected-backend-failure';
import { handleWsMessage } from './ws.controller';

for (const kind of ['forward', 'resume'] as const) {
  it(`closed connection suppresses ${kind} failure frames and metrics`, async () => {
    const cancellation = new AbortController();
    const sent: string[] = [];
    const reports: UnexpectedBackendFailure[] = [];
    let failures = 0;
    let rejectRequest: (error: Error) => void = () => {
      throw new Error('request not started');
    };
    const pending = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const handling = handleWsMessage({
      frame:
        kind === 'forward'
          ? { subscription: 'presence', message: { write: true } }
          : { type: 'resume', resume_points: { presence: 0 } },
      socket: {
        send: (frame) => {
          sent.push(frame);
        },
      },
      subs: new SubscriptionMap(),
      clientId: 'u',
      connectionId: 'c',
      reportUnexpectedBackendFailure: (failure) => reports.push(failure),
      forward: () => pending,
      resume: () => pending,
      signal: cancellation.signal,
      onBackendUnavailable: () => {
        failures++;
      },
    });
    cancellation.abort();
    rejectRequest(new Error('connection closed'));
    await handling;
    expect(sent).toEqual([]);
    expect(failures).toBe(0);
    // Proof: moving the corresponding report above its abort guard added one forward/resume
    // report here after close while frames and the unavailable metric stayed silent (2026-09-21).
    expect(reports).toEqual([]);
  });
}
it('closed connection suppresses a late successful replay', async () => {
  const cancellation = new AbortController();
  const sent: string[] = [];
  let resolveRequest: (
    reply: Record<string, { status: 'replaying'; events: { seq: number; message: unknown }[] }>,
  ) => void = () => {
    throw new Error('request not started');
  };
  const pending = new Promise<
    Record<string, { status: 'replaying'; events: { seq: number; message: unknown }[] }>
  >((resolve) => {
    resolveRequest = resolve;
  });
  const handling = handleWsMessage({
    frame: { type: 'resume', resume_points: { presence: 0 } },
    socket: {
      send: (frame) => {
        sent.push(frame);
      },
    },
    subs: new SubscriptionMap(),
    clientId: 'u',
    connectionId: 'c',
    reportUnexpectedBackendFailure: () => undefined,
    forward: () => Promise.resolve({ ack: true }),
    resume: () => pending,
    signal: cancellation.signal,
  });
  cancellation.abort();
  resolveRequest({
    presence: { status: 'replaying', events: [{ seq: 1, message: { late: true } }] },
  });
  await handling;
  expect(sent).toEqual([]);
});
