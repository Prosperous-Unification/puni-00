import { InternalPushRequest, wsData, wsTransient } from '@wbs/contracts';
import { parseOrThrow, ValidationError } from '@wbs/validation';
import { Elysia } from 'elysia';

import type { GatewayMetrics } from '../service/gateway-metrics';
import type { SubscriptionMap } from '../service/subscription-map';

export interface SocketLike {
  send(data: string): void;
}

export interface InternalDeps {
  secret: string;
  subs: SubscriptionMap<SocketLike>;
  metrics: GatewayMetrics;
}

export const internalController = (deps: InternalDeps) =>
  new Elysia({ prefix: '/internal' }).post('/push', ({ request, body, set }) => {
    if (request.headers.get('x-internal-auth') !== deps.secret) {
      set.status = 401;
      return { error: 'unauthorized' };
    }
    try {
      const req = parseOrThrow(InternalPushRequest, body);
      const sockets = deps.subs.socketsFor(req.subscription);
      // A push without `seq` is a transient announcement (`wbs-claim-display`
      // C21) and goes out as its own frame, with no sequence;
      // `delivers an unsequenced push without a sequence`
      // (fan-out.integration.test.ts) reads it.
      const payload =
        req.seq === undefined
          ? wsTransient(req.subscription, req.message)
          : wsData(req.subscription, req.seq, req.message);
      for (const s of sockets) s.send(payload);
      deps.metrics.fanOut(sockets.size);
      set.status = 202;
      return { delivered_to_sockets: sockets.size };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 400;
        return { error: err.message };
      }
      throw err;
    }
  });
