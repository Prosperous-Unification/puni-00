import { createConnection, type Socket } from 'node:net';

import { parseParticipantAddress } from './dependency-participant-endpoint';

export type ParticipantTcpObservation = 'connected' | 'not-listening';
/** Terminal transport outcome; the caller must retain barriers and perform no later observer/start/policy effect. */
export class ParticipantTcpCleanupUnproved extends Error {
  constructor() {
    super('participant startup TCP cleanup unproved');
  }
}
interface SocketLifecycle {
  outcome: ParticipantTcpObservation | undefined;
  hasFailed: boolean;
  isClosed: boolean;
  closedAt: number | undefined;
  closeCutoff: number | undefined;
  cleanupTimer: ReturnType<typeof setTimeout> | undefined;
}
function openProbeSocket(
  address: string,
  port: number,
  deadline: number,
  workCutoff: number,
  signal?: AbortSignal,
): { readonly socket: Socket; readonly attemptCutoff: number } {
  try {
    const target = parseParticipantAddress(address);
    const now = performance.now();
    // Proof: removing admission created a socket without the original observer reserve; the controlled allocation counter failed.
    if (
      !Number.isFinite(deadline) ||
      deadline - now <= 41000 ||
      !Number.isFinite(workCutoff) ||
      workCutoff <= now ||
      workCutoff > deadline - 41000 ||
      workCutoff - now > 30000 ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65535 ||
      signal?.aborted
    )
      throw new Error('participant TCP admission refused');
    return {
      attemptCutoff: Math.min(workCutoff, now + 1000),
      socket: createConnection({
        host: target.address,
        port,
        family: target.family === 'ipv4' ? 4 : 6,
        autoSelectFamily: false,
      }),
    };
  } catch {
    // This admission boundary discards raw constructor/endpoint diagnostics before any public error.
    throw new Error('participant startup TCP refused');
  }
}

/** Internal timing IO only: sends no bytes and grants no readiness. The private coordinator supplies its original deadline and fixed work cutoff; only actual ECONNREFUSED after exact socket close can be pending. Close observation must meet the immutable first-destroy cutoff even when timer delivery lags. */
export async function probeParticipantTcp(
  address: string,
  port: number,
  deadline: number,
  workCutoff: number,
  signal?: AbortSignal,
): Promise<ParticipantTcpObservation> {
  const { socket, attemptCutoff } = openProbeSocket(address, port, deadline, workCutoff, signal);
  const work = Promise.withResolvers<undefined>();
  const close = Promise.withResolvers<undefined>();
  const lifecycle: SocketLifecycle = {
    outcome: undefined,
    hasFailed: false,
    isClosed: false,
    closedAt: undefined,
    closeCutoff: undefined,
    cleanupTimer: undefined,
  };
  const destroySocket = () => {
    // Proof: anchoring close expiry to the attempt end instead of first destroy doubled the connected-socket cleanup window; the native bound test failed.
    lifecycle.closeCutoff ??= Math.min(deadline, performance.now() + 1000);
    try {
      socket.destroy();
    } catch {
      // Proof: dropping this failure mark returned pending after an actual destroy call threw; the destroy-error watch failed.
      lifecycle.hasFailed = true;
    }
  };
  // Proof: dropping the event cutoff accepted a real late connection while timer delivery was faulted; the late-connect watch failed.
  const recordConnection = () => {
    if (
      lifecycle.outcome !== undefined ||
      lifecycle.hasFailed ||
      performance.now() >= attemptCutoff
    )
      lifecycle.hasFailed = true;
    else lifecycle.outcome = 'connected';
    destroySocket();
    work.resolve(undefined);
  };
  // Proof: separately dropping Error shape, ECONNREFUSED classification or event cutoff admitted malformed/reset/late-refused events as pending; all three watches failed.
  const recordFailure = (cause: unknown) => {
    if (
      cause instanceof Error &&
      'code' in cause &&
      cause.code === 'ECONNREFUSED' &&
      lifecycle.outcome === undefined &&
      !lifecycle.hasFailed &&
      performance.now() < attemptCutoff
    )
      lifecycle.outcome = 'not-listening';
    else lifecycle.hasFailed = true;
    destroySocket();
    work.resolve(undefined);
  };
  const recordClose = () => {
    lifecycle.closedAt ??= performance.now();
    lifecycle.isClosed = true;
    if (lifecycle.outcome === undefined) lifecycle.hasFailed = true;
    work.resolve(undefined);
    close.resolve(undefined);
  };
  const cancelProbe = () => {
    lifecycle.hasFailed = true;
    destroySocket();
    work.resolve(undefined);
  };
  socket.on('connect', recordConnection);
  socket.on('error', recordFailure);
  socket.on('close', recordClose);
  // Proof: omitting timeout ownership let a later actual connection become connected; the socket-timeout watch failed.
  socket.on('timeout', cancelProbe);
  // Proof: omitting cancellation ownership let a later actual connection become connected; the cancel watch failed.
  signal?.addEventListener('abort', cancelProbe, { once: true });
  // Proof: omitting this timer delayed refusal until the independent 1600ms connection; the fixed-attempt bound test failed without a global timeout.
  const timer = setTimeout(cancelProbe, Math.max(0, attemptCutoff - performance.now()));
  if (signal?.aborted) cancelProbe();
  const removeListeners = () => {
    socket.off('connect', recordConnection);
    socket.off('error', recordFailure);
    socket.off('close', recordClose);
    socket.off('timeout', cancelProbe);
  };
  try {
    await work.promise;
    clearTimeout(timer);
    destroySocket();
    // Proof: omitting the close join returned before a real delayed Socket close; the ordinary-return counter failed.
    if (!lifecycle.isClosed) {
      const cutoff = lifecycle.closeCutoff;
      if (cutoff === undefined) throw new ParticipantTcpCleanupUnproved();
      const settled = await Promise.race([
        close.promise.then(() => true),
        new Promise<false>((resolve) => {
          lifecycle.cleanupTimer = setTimeout(
            () => {
              resolve(false);
            },
            Math.max(0, cutoff - performance.now()),
          );
        }),
      ]);
      // Proof: suppressing this refusal returned connected while the established owned socket was still open; connected-unproved failed.
      if (!settled) throw new ParticipantTcpCleanupUnproved();
    }
    const cutoff = lifecycle.closeCutoff;
    // Proof: omitted close-time guard returned connected after real 1500ms close with delayed timer delivery; connected-only guarding also returned pending after late close observation. Both watched negatives failed.
    if (cutoff === undefined || lifecycle.closedAt === undefined || lifecycle.closedAt >= cutoff)
      throw new ParticipantTcpCleanupUnproved();
    // Proof: omitting the closed-outcome guard returned undefined on cancellation; the outcome watch failed.
    if (lifecycle.hasFailed || lifecycle.outcome === undefined)
      throw new Error('participant startup TCP refused');
    return lifecycle.outcome;
  } finally {
    clearTimeout(timer);
    if (lifecycle.cleanupTimer !== undefined) clearTimeout(lifecycle.cleanupTimer);
    signal?.removeEventListener('abort', cancelProbe);
    // Keep error ownership on an unproved still-live socket until its eventual close.
    if (lifecycle.isClosed) removeListeners();
    else socket.once('close', removeListeners);
  }
}
