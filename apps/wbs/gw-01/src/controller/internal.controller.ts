import { InternalPushRequest, wsData, wsTransient } from '@wbs/contracts';
import { parseOrThrow, ValidationError } from '@wbs/validation';
import { Elysia } from 'elysia';

import type { DeliverySocket } from '../service/delivery';
import type { GatewayMetrics } from '../service/gateway-metrics';
import type { SubscriptionMap } from '../service/subscription-map';

export type SocketLike = DeliverySocket;

export interface InternalDeps {
  secret: string;
  subs: SubscriptionMap<SocketLike>;
  metrics: GatewayMetrics;
}

export const internalController = (deps: InternalDeps) =>
  new Elysia({ prefix: '/internal' }).post('/push', async ({ request, body, set }) => {
    if (request.headers.get('x-internal-auth') !== deps.secret) {
      set.status = 401;
      return { error: 'unauthorized' };
    }
    try {
      const req = parseOrThrow(InternalPushRequest, body);
      // Proof: appending :wrong to this lookup made the mounted backend→gateway
      // completion test time out on B delivery after its admitted roster (2026-10-23).
      const sockets = deps.subs.socketsFor(req.subscription);
      // A push without `seq` is a transient announcement. It has no replay
      // cursor; the browser rereads the claim state it names. The real-socket
      // unsequenced push case in fan-out.integration.test.ts proves its shape.
      const payload =
        req.seq === undefined
          ? wsTransient(req.subscription, req.message)
          : wsData(req.subscription, req.seq, req.message);
      // Proof: removing this actual send made cross-project-delivery.controller.db.test.ts
      // receive only its admitted presence roster, then fail successor delivery (2026-10-23).
      // Proof: omitting await answers before the blocked recipient in delivery.integration.test.ts.
      const outcomes = await Promise.all([...sockets].map((socket) => socket.send(payload)));
      // Proof: counting recipients reports 2 instead of 1 in the asynchronous recipient failure test.
      const delivered = outcomes.filter(
        (outcome) => outcome === 'sent' || outcome === 'backpressured',
      ).length;
      deps.metrics.fanOut(delivered);
      set.status = 202;
      return { delivered_to_sockets: delivered };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 400;
        return { error: err.message };
      }
      throw err;
    }
  });
