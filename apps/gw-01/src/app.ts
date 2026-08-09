import { InternalResumeResponse } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';
import { parseOrThrow } from '@wbs/validation';
import { Elysia } from 'elysia';

import { internalController, type SocketLike } from './controller/internal.controller';
import { handleWsMessage, projectIdOf } from './controller/ws.controller';
import { ForwardClient } from './service/forward-client';
import { GatewayMetrics } from './service/gateway-metrics';
import { JwtVerifier } from './service/jwt-auth';
import { Presence } from './service/presence';
import { SubscriptionMap } from './service/subscription-map';

/** Short: `/health` is polled, and a slow answer is as useless as no answer. */
const HEALTH_PROBE_TIMEOUT_MS = 2_000;

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

  return (
    new Elysia()
      .use(observabilityPlugin({ service: 'gw-01' }))
      .decorate('logger', logger)
      .decorate('subs', subs)
      .decorate('metrics', metrics)
      .use(internalController({ secret: opts.internalAuthSecret, subs, metrics }))
      /**
       * Healthy means "can do the job", and this gateway's job is forwarding.
       *
       * It used to answer `ok` unconditionally, so a container with a wrong
       * `BE_URL` passed the deploy's health gate, took the socket traffic and
       * failed every forward — and the smoke test could not see it either, because
       * that talks to be-01 directly (open finding 4, and finding 1's other half).
       *
       * The backend's own `/health` is the probe, with a short timeout. The gate
       * polls for a minute, so a be-01 restarting inside a swap costs a retry
       * rather than a failed deploy; a be-01 that is genuinely unreachable is a
       * gateway that should not be routed to.
       */
      .get('/health', async ({ set }) => {
        try {
          const res = await fetchImpl(`${opts.beUrl}/health`, {
            signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
          });
          if (!res.ok) {
            set.status = 503;
            return { status: 'backend_unhealthy' as const };
          }
        } catch (err) {
          logger.error({ err, beUrl: opts.beUrl }, 'health probe could not reach be-01');
          set.status = 503;
          return { status: 'backend_unreachable' as const };
        }
        return { status: 'ok' as const };
      })
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
            const username =
              typeof claims['username'] === 'string' ? claims['username'] : claims.sub;
            // A join puts the connection in no project — it has not said which
            // one it is looking at yet, and until it subscribes it belongs to
            // nothing (see {@link Presence}). The broadcast is what hands the
            // newcomer its own empty roster; every other socket's is unchanged
            // by a join, and only `onSubscribed` below moves anybody's.
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
            // A `project:` subscription is what puts this connection in a
            // roster, and the broadcast is what tells the people already in it.
            // `presence` names no project, so it moves nobody.
            onSubscribed: (subscription) => {
              const projectId = projectIdOf(subscription);
              if (projectId === null) return;
              presence.enterProject(d.connectionId, projectId);
              presence.broadcast();
            },
            onUnsubscribed: (subscription) => {
              const projectId = projectIdOf(subscription);
              if (projectId === null) return;
              presence.leaveProject(d.connectionId, projectId);
              presence.broadcast();
            },
            roster: () => presence.rosterFor(d.connectionId),
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
      })
  );
}
