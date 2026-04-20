import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';
import { Elysia } from 'elysia';

import { internalController, type SocketLike } from './controller/internal.controller';
import { handleWsMessage } from './controller/ws.controller';
import { ForwardClient } from './service/forward-client';
import { GatewayMetrics } from './service/gateway-metrics';
import { JwtVerifier } from './service/jwt-auth';
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
      open(ws) {
        metrics.connectionOpened();
        (ws.data as { connectionId: string }).connectionId = crypto.randomUUID();
      },
      async message(ws, data) {
        const d = ws.data as { connectionId: string; query?: { token?: string } };
        const clientId = 'anon';
        const socket: SocketLike = { send: (s) => ws.send(s) };
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
            return (await res.json()) as Record<
              string,
              { status: 'replaying'; count: number } | { status: 'denied'; reason: 'out_of_range' }
            >;
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
        });
      },
      close() {
        metrics.connectionClosed();
      },
    });
}
