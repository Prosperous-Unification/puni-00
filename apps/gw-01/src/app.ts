import { InternalResumeResponse } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';
import { parseOrThrow } from '@wbs/validation';
import { Elysia } from 'elysia';

import { internalController, type SocketLike } from './controller/internal.controller';
import { handleWsMessage } from './controller/ws.controller';
import { ForwardClient } from './service/forward-client';
import { GatewayMetrics } from './service/gateway-metrics';
import { JwtVerifier } from './service/jwt-auth';
import { Presence } from './service/presence';
import { SubscriptionMap } from './service/subscription-map';

export interface AppOptions {
  beUrl: string;
  internalAuthSecret: string;
  jwtKey: string;
  previousJwtKey?: string;
  version?: string;
  fetchImpl?: typeof fetch;
}

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'gw-01', version: opts.version });
  const subs = new SubscriptionMap<SocketLike>();
  const metrics = new GatewayMetrics();
  const presence = new Presence();
  const verifier = new JwtVerifier({
    current: new TextEncoder().encode(opts.jwtKey),
    previous: opts.previousJwtKey ? new TextEncoder().encode(opts.previousJwtKey) : undefined,
  });
  const forwarder = new ForwardClient({
    beUrl: opts.beUrl,
    secret: opts.internalAuthSecret,
    fetchImpl: opts.fetchImpl,
  });
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  return new Elysia()
    .use(observabilityPlugin({ service: 'gw-01' }))
    .decorate('logger', logger)
    .decorate('subs', subs)
    .decorate('metrics', metrics)
    .use(internalController({ secret: opts.internalAuthSecret, subs, metrics }))
    .get('/health', () => ({ status: 'ok' }))
    .get('/metrics/snapshot', () => metrics.counters)
    .ws('/ws', {
      async beforeHandle({ query, set }) {
        const token = (query as { token?: string }).token;
        if (!token) {
          set.status = 401;
          return { error: 'missing token' };
        }
        try {
          await verifier.verify(token);
        } catch {
          set.status = 401;
          return { error: 'invalid token' };
        }
        return undefined;
      },
      async open(ws) {
        metrics.connectionOpened();
        const d = ws.data as unknown as {
          connectionId: string;
          socket: SocketLike;
          query?: { token?: string };
        };
        d.connectionId = crypto.randomUUID();
        // One wrapper per connection, kept for its whole life. It used to be
        // allocated per inbound message, so the object `subscribe` stored was
        // one no later code could produce again — leaving every disconnected
        // socket in the map forever, counted in the fan-out and sent to.
        d.socket = { send: (payload) => ws.send(payload) };
        // The token is verified a second time here rather than passed down
        // from beforeHandle: Elysia gives the two hooks separate contexts, and
        // reading a username that beforeHandle "already checked" would mean
        // trusting a value this handler never saw. Same verifier, same key, so
        // a token that reached open cannot fail — but if it does, the socket
        // joins nobody and simply has no presence.
        const token = d.query?.token;
        if (token === undefined) return;
        try {
          const claims = await verifier.verify(token);
          const username = typeof claims['username'] === 'string' ? claims['username'] : claims.sub;
          presence.join(d.connectionId, username, { send: (s) => ws.send(s) });
          presence.broadcast();
        } catch {
          // beforeHandle already rejected invalid tokens; nothing to add.
        }
      },
      async message(ws, data) {
        const d = ws.data as unknown as {
          connectionId: string;
          socket: SocketLike;
          query?: { token?: string };
        };
        const clientId = presence.usernameOf(d.connectionId) ?? 'anon';
        const socket = d.socket;
        await handleWsMessage({
          data: typeof data === 'string' ? data : JSON.stringify(data),
          socket,
          subs,
          connectionId: d.connectionId,
          clientId,
          forward: (m) =>
            forwarder.forward(m, {
              clientId,
              connectionId: d.connectionId,
              traceId: crypto.randomUUID(),
            }),
          resume: async (points) => {
            const res = await fetchImpl(`${opts.beUrl}/internal/resume`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-internal-auth': opts.internalAuthSecret,
                'x-client-id': clientId,
                'x-connection-id': d.connectionId,
              },
              body: JSON.stringify({ resume_points: points, trace_id: crypto.randomUUID() }),
            });
            // Parsed against the shared contract rather than cast. A be-01 that
            // answered with the old count-only shape would otherwise reach the
            // socket as a replay of `undefined` events and throw mid-frame,
            // after the client had already been told to expect them.
            return parseOrThrow(InternalResumeResponse, await res.json());
          },
          onInbound: () => {
            metrics.inbound();
          },
          onReconnect: () => {
            metrics.reconnect();
          },
          onBackendUnavailable: () => {
            metrics.backendUnavailable();
          },
          roster: () => presence.list(),
        });
      },
      close(ws) {
        metrics.connectionClosed();
        const d = ws.data as unknown as { connectionId: string; socket?: SocketLike };
        // Subscriptions first: a socket left in the map is pushed to forever,
        // counted in `delivered_to_sockets`, and joined again by the same
        // browser on its next reconnect.
        if (d.socket !== undefined) subs.removeAll(d.socket);
        presence.leave(d.connectionId);
        // Broadcast after the removal, so the roster the survivors receive is
        // the one that excludes the socket that just went away.
        presence.broadcast();
      },
    });
}
