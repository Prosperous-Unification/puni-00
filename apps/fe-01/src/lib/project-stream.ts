import { websocketUrl } from './api';

export interface SocketHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
}

export interface StreamSocket {
  send(data: string): void;
  close(): void;
}

/**
 * Opens a socket and wires it to `handlers`.
 *
 * Handlers are passed in rather than a `WebSocket`-shaped object being returned,
 * so a test can supply a socket without emulating `EventTarget` — and so nothing
 * here has to cast a fake into a `WebSocket`.
 */
export type OpenSocket = (url: string, handlers: SocketHandlers) => StreamSocket;

export interface ProjectStreamDeps {
  openSocket: OpenSocket;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  random: () => number;
}

export interface ProjectStreamOptions {
  token: string;
  projectId: string;
  /** Where the caller's last read of this project left off; `-1` for none. */
  sinceSeq: number;
  /** Something changed on the server — refetch. */
  onChange: () => void;
  /** Whether a socket is currently open, so the caller can say so on screen. */
  onConnectionChange?: (connected: boolean) => void;
}

export interface ProjectStream {
  /**
   * The sequence a fresh read of the project happened at.
   *
   * The caller reports it because the caller is the one doing the reading. After
   * a refused resume the stream has no idea where the stream now is; without
   * this it would ask for the same dropped range on every reconnect and be
   * refused every time.
   */
  seen(seq: number): void;
  unsubscribe(): void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

const browserDeps: ProjectStreamDeps = {
  openSocket: (url, handlers) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      handlers.onOpen();
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      handlers.onMessage(event.data);
    });
    socket.addEventListener('close', () => {
      handlers.onClose();
    });
    return {
      send: (data) => {
        socket.send(data);
      },
      close: () => {
        socket.close();
      },
    };
  },
  schedule: (fn, ms) => setTimeout(fn, ms),
  // The handle is opaque to callers by design — only this pairing of `schedule`
  // and `cancel` knows it came from `setTimeout`.
  cancel: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  random: Math.random,
};

/**
 * Subscribes to a project's edits and calls `onChange` when any arrive, across
 * as many sockets as it takes.
 *
 * The payload is deliberately ignored. be-01 sends either the changed work items
 * or the whole tree, and applying either one locally would be a second
 * implementation of the numbering and the roll-up — the two things most likely
 * to disagree with the server. Refetching is one request and always right, which
 * is also why a replayed event and a live one need no distinguishing here.
 *
 * Reconnect lives in this function rather than in the component that calls it: a
 * component would restart the backoff on any render that changed the closure,
 * which is how reconnect storms get written by accident.
 */
export function subscribeToProject(
  options: ProjectStreamOptions,
  deps: ProjectStreamDeps = browserDeps,
): ProjectStream {
  const subscription = `project:${options.projectId}`;
  let sinceSeq = options.sinceSeq;
  let attempt = 0;
  let unsubscribed = false;
  let socket: StreamSocket | null = null;
  let pendingReconnect: unknown = null;

  /** `500ms · 2ⁿ`, capped, then jittered down by up to half. */
  function delayFor(attemptIndex: number): number {
    const uncapped = BASE_DELAY_MS * 2 ** attemptIndex;
    const capped = Math.min(uncapped, MAX_DELAY_MS);
    return Math.round(capped * (0.5 + deps.random() * 0.5));
  }

  function receive(raw: string): void {
    let frame: { subscription?: string; seq?: number; type?: string };
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      // gw-01 also carries presence and control frames; anything unparseable is
      // not this subscription's business.
      return;
    }
    if (frame.subscription !== subscription) return;
    if (frame.type === 'resume_denied') {
      // The server cannot say what was missed, so the only honest response is to
      // read the whole project again — and the caller reports the new sequence
      // through `seen`.
      options.onChange();
      return;
    }
    if (typeof frame.seq !== 'number') return;
    sinceSeq = Math.max(sinceSeq, frame.seq);
    options.onChange();
  }

  function connect(): void {
    // `cancel` cannot unfire a callback the event loop has already picked up, so
    // the flag is read here too.
    if (unsubscribed) return;
    pendingReconnect = null;
    socket = deps.openSocket(websocketUrl(options.token), {
      onOpen: () => {
        attempt = 0;
        socket?.send(JSON.stringify({ type: 'subscribe', subscription }));
        // Subscribe first, resume second. The other order leaves a window in
        // which the replay has been sent and a live edit arriving behind it has
        // no socket registered to receive it.
        socket?.send(
          JSON.stringify({ type: 'resume', resume_points: { [subscription]: sinceSeq } }),
        );
        options.onConnectionChange?.(true);
      },
      onMessage: receive,
      onClose: () => {
        options.onConnectionChange?.(false);
        if (unsubscribed) return;
        pendingReconnect = deps.schedule(connect, delayFor(attempt));
        attempt += 1;
      },
    });
  }

  connect();

  return {
    seen(seq) {
      sinceSeq = Math.max(sinceSeq, seq);
    },
    unsubscribe() {
      // Set before closing: `close()` runs the close handler synchronously on a
      // fake socket and on some real ones, and an unset flag there schedules a
      // reconnect for a subscription nobody is watching any more.
      //
      // Proof: this assignment deleted, and both "stops reconnecting once the
      // caller unsubscribes" and "opens nothing when a reconnect fires after the
      // caller unsubscribed" failed — the loop outlived its subscriber.
      unsubscribed = true;
      if (pendingReconnect !== null) deps.cancel(pendingReconnect);
      socket?.close();
    },
  };
}
