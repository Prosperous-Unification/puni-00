import {
  WsClientFrame,
  wsData,
  wsError,
  wsPong,
  wsPresence,
  wsResumeAck,
  wsResumeDenied,
} from '@wbs/contracts';
import { type } from '@wbs/validation';

import type { ConnectionAccess } from '../service/connection-access';
import type { SubscriptionMap } from '../service/subscription-map';
import type { UnexpectedBackendFailureReporter } from './unexpected-backend-failure';

export type ResumeStatus =
  | { status: 'replaying'; events: { seq: number; message: unknown }[] }
  | { status: 'denied'; reason: 'out_of_range' | 'forbidden' };

export interface WsSocket {
  send(s: string): void;
}

export interface HandleWsMessageArgs {
  /** The wire adapter has already decoded the JSON value; strings are values, never JSON to parse again. */
  frame: unknown;
  /** Connection lifetime: cancellation suppresses late replies and failure metrics. */
  signal?: AbortSignal;
  socket: WsSocket;
  subs: SubscriptionMap<WsSocket>;
  connectionId: string;
  clientId: string;
  reportUnexpectedBackendFailure: UnexpectedBackendFailureReporter;
  /** This connection's project authorization; see {@link ConnectionAccess}. */
  access: Pick<ConnectionAccess, 'run' | 'admit' | 'hold' | 'release'>;
  forward: (m: unknown) => Promise<{ ack: boolean }>;
  resume: (points: Record<string, number>) => Promise<Record<string, ResumeStatus>>;
  onInbound?: () => void;
  onReconnect?: () => void;
  onBackendUnavailable?: () => void;
  /**
   * The socket joined `subscription`, after the map accepted it.
   *
   * A callback rather than a `Presence` this module imports: what a
   * subscription means to presence is gw-01's composition to decide (`app.ts`
   * scopes the roster by it), and a controller that knew about rosters would
   * have to be handed one in every test that sends a `subscribe`.
   */
  onSubscribed?: (subscription: string) => void;
  /** The socket left `subscription`. */
  onUnsubscribed?: (subscription: string) => void;
  /**
   * The roster for **this** connection — its project's, not the gateway's — for
   * a client that asks instead of waiting.
   */
  roster?: () => string[];
}

/**
 * The subscriptions a socket may join.
 *
 * Without this, `subscribe` registers whatever string it is handed. That was
 * harmless while presence was the only channel; once a subscription names a
 * project it becomes an open door onto internal channels, and a typo becomes a
 * socket that silently receives nothing forever rather than an error.
 *
 * This is the shape check; authorization of a `project:` name is
 * {@link ConnectionAccess.admit}, which asks be-01 about the socket's own
 * principal.
 */
const PROJECT_SUBSCRIPTION = /^project:([0-9a-fA-F-]{36})$/;

/**
 * The project a subscription names, or null when it names none.
 *
 * The one place the `project:` prefix is taken apart, so presence scoping and
 * the shape check below cannot disagree about what counts as a project.
 */
export function projectIdOf(subscription: string): string | null {
  return PROJECT_SUBSCRIPTION.exec(subscription)?.[1] ?? null;
}

export function isKnownSubscription(subscription: string): boolean {
  return subscription === 'presence' || projectIdOf(subscription) !== null;
}

/** Validates the decoded client frame before any indexing, callback or dispatch. */
export async function handleWsMessage(args: HandleWsMessageArgs): Promise<void> {
  // Proof: bypassing this schema with the unchecked cast makes "refuses null before dispatch"
  // throw TypeError; the real-socket malformed-frame test receives only pong, without the refusal.
  const inbound = WsClientFrame(args.frame);
  if (inbound instanceof type.errors) {
    args.socket.send(wsError('invalid_payload'));
    return;
  }
  if (inbound.kind === 'forward') {
    args.onInbound?.();
    try {
      await args.forward(inbound.frame);
    } catch (caught) {
      // Proof: removing this guard emitted failure frames after close in
      // ws-cancellation.test.ts.
      if (args.signal?.aborted === true) return;
      args.reportUnexpectedBackendFailure({
        caught,
        operation: 'forward',
        connectionId: args.connectionId,
        clientId: args.clientId,
      });
      args.onBackendUnavailable?.();
      args.socket.send(wsError('backend_unavailable', { retry_after: 5 }));
    }
    return;
  }
  const msg = inbound.frame;

  if (msg.type === 'ping') {
    args.socket.send(wsPong());
    return;
  }

  // A client that reconnects has missed every broadcast sent while it was
  // away, so it must be able to ask rather than wait for the next join.
  if (msg.type === 'who') {
    args.socket.send(wsPresence(args.roster?.() ?? []));
    return;
  }

  if (msg.type === 'resume') {
    args.onReconnect?.();
    // A resume point is a replay request, and replay is a read: it never
    // grants access on its own. A name that is not a project the principal
    // may read is refused here and never reaches be-01.
    const points: Record<string, number> = {};
    const refused: string[] = [];
    // Proof: forwarding `msg.resume_points` unfiltered made `refuses resume
    // points for a project the socket may not read` in
    // project-authorization.integration.test.ts replay the foreign event.
    const admissions = await admitAll(args.access, Object.keys(msg.resume_points));
    if (admissions === 'closed') return;
    for (const [subscription, seq] of Object.entries(msg.resume_points)) {
      if (admissions.get(subscription) === 'granted') points[subscription] = seq;
      else refused.push(subscription);
    }
    for (const subscription of refused) {
      args.socket.send(wsResumeDenied(subscription, 'forbidden'));
    }
    let result: Record<string, ResumeStatus>;
    try {
      result = await args.resume(points);
    } catch (caught) {
      // Proof: removing this guard emitted failure frames after close in
      // ws-cancellation.test.ts.
      if (args.signal?.aborted === true) return;
      args.reportUnexpectedBackendFailure({
        caught,
        operation: 'resume',
        connectionId: args.connectionId,
        clientId: args.clientId,
      });
      // be-01 unreachable, a non-2xx, or a body that does not match the
      // contract — which is also what a gateway from after a partial rollout
      // sees from a backend from before it. The client is told, rather than
      // left on an open socket with stale rows and no reason to refetch.
      // `unavailable`, not `out_of_range`: nothing is known about the range.
      for (const subscription of Object.keys(points)) {
        args.socket.send(wsResumeDenied(subscription, 'unavailable'));
      }
      args.socket.send(wsResumeAck({}));
      return;
    }
    // Proof: removing this guard emitted replay data and resume_ack after close
    // in the late-success case of ws-cancellation.test.ts.
    if (args.signal?.aborted === true) return;
    // Queued replay is rechecked before delivery: access lost while be-01 was
    // reading the log must not be served from what it read.
    // Proof: skipping this recheck made `withholds replay when access is lost
    // while be-01 reads it` in project-authorization.integration.test.ts
    // deliver the queued event.
    const rechecked = await admitAll(args.access, Object.keys(result));
    if (rechecked === 'closed') return;
    const replayed: Record<string, number> = {};
    for (const [subscription, outcome] of Object.entries(result)) {
      if (rechecked.get(subscription) !== 'granted') {
        args.socket.send(wsResumeDenied(subscription, 'forbidden'));
        continue;
      }
      if (outcome.status === 'denied') {
        args.socket.send(wsResumeDenied(subscription, outcome.reason));
        continue;
      }
      // To `args.socket`, never to `subs.socketsFor(subscription)`. The other
      // sockets on this subscription received these events when they were live;
      // sending them again is a refetch each, per event, per reconnecting peer.
      // Proof: the send below also written to every socket in
      // `subs.socketsFor(subscription)`, and only "replays only to the socket
      // that asked" failed.
      for (const event of outcome.events) {
        args.socket.send(wsData(subscription, event.seq, event.message));
      }
      replayed[subscription] = outcome.events.length;
    }
    // Last, and counted from the events actually written above: an
    // acknowledgement that arrives first would let a client advance its
    // sequence past frames it has not been handed yet.
    args.socket.send(wsResumeAck(replayed));
    return;
  }

  if (msg.type === 'subscribe') {
    if (!isKnownSubscription(msg.subscription)) {
      args.socket.send(wsError('unknown_subscription', { subscription: msg.subscription }));
      return;
    }
    const subscription = msg.subscription;
    const projectId = projectIdOf(subscription);
    await args.access.run(async () => {
      if (projectId !== null) {
        // Proof: skipping this admission made `refuses a project the
        // principal cannot read` in project-authorization.integration.test.ts
        // deliver the foreign push and roster.
        const admission = await args.access.admit(projectId);
        if (admission === 'closed') return;
        if (admission === 'denied') {
          // The same refusal as a malformed name: a foreign project is
          // indistinguishable from one that does not exist.
          args.socket.send(wsError('unknown_subscription', { subscription }));
          return;
        }
        args.access.hold(subscription, projectId);
      }
      args.subs.subscribe(subscription, args.socket);
      // After the map accepted it, and never for a refused name: presence is
      // scoped by the subscription, so telling it about one the fan-out does not
      // hold would put a socket in a roster for a project it receives nothing on.
      args.onSubscribed?.(subscription);
    });
    return;
  }

  const left = msg.subscription;
  await args.access.run(() => {
    args.access.release(left);
    args.subs.unsubscribe(left, args.socket);
    args.onUnsubscribed?.(left);
  });
}

/**
 * Admits every named subscription at once. A name that is not a project is
 * `denied` without asking be-01; `closed` when any check closed the socket.
 */
async function admitAll(
  access: Pick<ConnectionAccess, 'admit'>,
  subscriptions: readonly string[],
): Promise<Map<string, 'granted' | 'denied'> | 'closed'> {
  const verdicts = await Promise.all(
    subscriptions.map(async (subscription) => {
      const projectId = projectIdOf(subscription);
      return [subscription, projectId === null ? 'denied' : await access.admit(projectId)] as const;
    }),
  );
  const admissions = new Map<string, 'granted' | 'denied'>();
  for (const [subscription, verdict] of verdicts) {
    if (verdict === 'closed') return 'closed';
    admissions.set(subscription, verdict);
  }
  return admissions;
}
