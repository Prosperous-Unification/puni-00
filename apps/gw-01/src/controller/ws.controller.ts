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
