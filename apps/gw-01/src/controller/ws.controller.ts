import type { SubscriptionMap } from '../service/subscription-map';

export type ResumeStatus =
  | { status: 'replaying'; count: number }
  | { status: 'denied'; reason: 'out_of_range' };

export interface WsSocket {
  send(s: string): void;
}

export interface HandleWsMessageArgs {
  data: string;
  socket: WsSocket;
  subs: SubscriptionMap<WsSocket>;
  connectionId: string;
  clientId: string;
  forward: (m: unknown) => Promise<{ ack: boolean }>;
  resume: (points: Record<string, number>) => Promise<Record<string, ResumeStatus>>;
  onInbound?: () => void;
  onReconnect?: () => void;
  onBackendUnavailable?: () => void;
  /** Current presence roster, for a client that asks instead of waiting. */
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
 * Project reads are open to every authenticated account by design, so this is a
 * shape check rather than an authorisation one — the socket is already
 * authenticated when it gets here.
 */
const PROJECT_SUBSCRIPTION = /^project:[0-9a-fA-F-]{36}$/;

export function isKnownSubscription(subscription: string): boolean {
  return subscription === 'presence' || PROJECT_SUBSCRIPTION.test(subscription);
}

export async function handleWsMessage(args: HandleWsMessageArgs): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(args.data) as Record<string, unknown>;
  } catch {
    args.socket.send(JSON.stringify({ type: 'error', code: 'invalid_payload' }));
    return;
  }

  if (msg['type'] === 'ping') {
    args.socket.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  // A client that reconnects has missed every broadcast sent while it was
  // away, so it must be able to ask rather than wait for the next join.
  if (msg['type'] === 'who') {
    args.socket.send(JSON.stringify({ type: 'presence', users: args.roster?.() ?? [] }));
    return;
  }

  if (msg['type'] === 'resume') {
    args.onReconnect?.();
    const points = (msg['resume_points'] as Record<string, number> | undefined) ?? {};
    const result = await args.resume(points);
    const replayed: Record<string, number> = {};
    const denied: string[] = [];
    for (const [sub, r] of Object.entries(result)) {
      if (r.status === 'replaying') replayed[sub] = r.count;
      else denied.push(sub);
    }
    for (const sub of denied) {
      args.socket.send(
        JSON.stringify({ type: 'resume_denied', subscription: sub, reason: 'out_of_range' }),
      );
    }
    args.socket.send(JSON.stringify({ type: 'resume_ack', replayed }));
    return;
  }

  if (msg['type'] === 'subscribe' && typeof msg['subscription'] === 'string') {
    if (!isKnownSubscription(msg['subscription'])) {
      args.socket.send(
        JSON.stringify({
          type: 'error',
          code: 'unknown_subscription',
          subscription: msg['subscription'],
        }),
      );
      return;
    }
    args.subs.subscribe(msg['subscription'], args.socket);
    return;
  }

  if (msg['type'] === 'unsubscribe' && typeof msg['subscription'] === 'string') {
    args.subs.unsubscribe(msg['subscription'], args.socket);
    return;
  }

  if ('subscription' in msg && 'message' in msg) {
    args.onInbound?.();
    try {
      await args.forward(msg);
    } catch {
      args.onBackendUnavailable?.();
      args.socket.send(
        JSON.stringify({ type: 'error', code: 'backend_unavailable', retry_after: 5 }),
      );
    }
    return;
  }

  args.socket.send(JSON.stringify({ type: 'error', code: 'invalid_payload' }));
}
