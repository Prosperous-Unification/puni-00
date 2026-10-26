import { randomBytes, randomUUID } from 'node:crypto';

import type { ObservationHealth } from './observation';
import type { HealthReader, HealthSource } from './source';

/** A receiver acknowledgement is explicitly separate from stored-backend acceptance. */
export type Publication = { state: 'acknowledged' } | { state: 'failed'; reason: string };
export interface ProbeObservation {
  source: HealthSource;
  observationId: string;
  traceId: string;
  parentSpanId: string;
  childSpanId: string;
  environment: 'dev';
  service: 'be-01';
  producerVersion: string;
  revision: string | null;
  success: boolean;
  reason: string | null;
  startedAt: number;
  finishedAt: number;
  observedAt: number;
  requestStartedAt: number;
  requestFinishedAt: number;
  requestDurationMs: number | null;
  transportDurationMs: number | null;
  publication: Publication;
}
export interface PublicationPort {
  publish(observation: ProbeObservation, signal: AbortSignal): Promise<Publication>;
}
export interface ProbeOptions {
  readHealth: HealthReader;
  publication: PublicationPort;
  producerVersion: string;
  expectedRevision?: string;
  deadlineMs?: number;
  signal?: AbortSignal;
}
/** The next acceptance slice can inspect the previous immutable observation while collection proceeds. */
export interface PreviousObservationPort {
  assess(previous: ProbeObservation, signal: AbortSignal): Promise<ObservationHealth>;
}

/** One real health read and bounded publication; malformed trusted measurements throw. */
export async function collectProbe(options: ProbeOptions): Promise<ProbeObservation> {
  const deadlineMs = options.deadlineMs ?? 20000;
  // Proof: bypassing this guard accepts invalid cadence/deadline/producer state in the trusted-config negative.
  if (
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > 20000 ||
    options.producerVersion.trim() === '' ||
    (options.expectedRevision !== undefined && !/^[a-f0-9]{40}$/.test(options.expectedRevision))
  )
    throw new Error('Invalid probe configuration');
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  // Proof: actual slow HTTP read and slow publication tests exceed their bound if this deadline is removed.
  const timer = setTimeout(cancel, deadlineMs);
  const startedAt = Date.now();
  try {
    const reading = await options.readHealth(controller.signal);
    const finishedAt = Date.now();
    // Proof: removing future-time or before-parent predicates independently accepts the corresponding actual source measurement negative.
    if (
      ![startedAt, finishedAt, reading.startedAt, reading.finishedAt].every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      reading.startedAt < startedAt ||
      reading.startedAt > reading.finishedAt ||
      reading.finishedAt > finishedAt ||
      (reading.requestDurationMs !== null &&
        (!Number.isFinite(reading.requestDurationMs) || reading.requestDurationMs < 0)) ||
      (reading.transportDurationMs !== null &&
        (!Number.isFinite(reading.transportDurationMs) || reading.transportDurationMs < 0))
    )
      throw new Error('Invalid source time measurement');
    // Proof: actual HTTP revision mismatch test becomes successful if this comparison is removed.
    const matchesRevision =
      options.expectedRevision === undefined || reading.revision === options.expectedRevision;
    const observation: ProbeObservation = {
      source: reading.source,
      observationId: randomUUID(),
      traceId: randomBytes(16).toString('hex'),
      parentSpanId: randomBytes(8).toString('hex'),
      childSpanId: randomBytes(8).toString('hex'),
      environment: 'dev',
      service: 'be-01',
      producerVersion: options.producerVersion,
      revision: reading.revision,
      success: reading.success && matchesRevision,
      reason: matchesRevision ? reading.reason : 'revision-mismatch',
      startedAt,
      finishedAt,
      observedAt: reading.finishedAt,
      requestStartedAt: reading.startedAt,
      requestFinishedAt: reading.finishedAt,
      requestDurationMs: reading.requestDurationMs,
      transportDurationMs: reading.transportDurationMs,
      publication: { state: 'failed', reason: 'not-published' },
    };
    observation.publication = controller.signal.aborted
      ? { state: 'failed', reason: 'deadline' }
      : await options.publication.publish(observation, controller.signal);
    return observation;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

/** Sequential cycles recover expected outages; cancellation interrupts both work and interval sleep. */
export async function runProbe(
  options: ProbeOptions & {
    signal: AbortSignal;
    intervalMs?: number;
    previous?: ProbeObservation;
    acceptance?: PreviousObservationPort;
    onCompleted: (observation: ProbeObservation, signal: AbortSignal) => Promise<void>;
    onAssessed?: (health: ObservationHealth) => void;
  },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 30000;
  // Proof: invalid trusted cadence test resolves instead of throwing when this guard is removed.
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('Invalid probe interval');
  let previous = options.previous;
  while (!options.signal.aborted) {
    const cycleStarted = performance.now();
    const cycle = new AbortController();
    const signal = AbortSignal.any([options.signal, cycle.signal]);
    // Proof: extending this timer fails the completion log/storage/publication total-cycle deadline test.
    const cycleTimer = setTimeout(() => {
      cycle.abort();
    }, options.deadlineMs ?? 20000);
    const acceptance =
      previous !== undefined && options.acceptance !== undefined
        ? assessPrevious(options.acceptance, previous, signal, options.deadlineMs ?? 20000)
        : Promise.resolve(undefined);
    let observation: ProbeObservation;
    try {
      // Both promises are joined immediately, including when either rejects before the other completes.
      const [collected, assessed] = await Promise.all([
        collectProbe({ ...options, signal }),
        acceptance,
      ]);
      observation = collected;
      if (assessed !== undefined) options.onAssessed?.(assessed);
      await options.onCompleted(observation, signal);
    } finally {
      clearTimeout(cycleTimer);
      cycle.abort();
    }
    previous = observation;
    if (Object.is(options.signal.aborted, true)) break;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        options.signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(
        finish,
        Math.max(0, intervalMs - (performance.now() - cycleStarted)),
      );
      options.signal.addEventListener('abort', finish, { once: true });
      if (options.signal.aborted) finish();
    });
  }
}

/** An acceptance outage is explicit unavailable evidence, bounded independently from the next collection. */
async function assessPrevious(
  port: PreviousObservationPort,
  previous: ProbeObservation,
  signal: AbortSignal,
  deadlineMs: number,
): Promise<ObservationHealth> {
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unavailable: ObservationHealth = {
    state: 'incomplete',
    signals: {
      log: ['unavailable: deadline'],
      metric: ['unavailable: deadline'],
      trace: ['unavailable: deadline'],
    },
  };
  let stop: () => void = () => {
    throw new Error('Acceptance cancellation is not initialized');
  };
  const expired = new Promise<ObservationHealth>((resolve) => {
    stop = () => {
      controller.abort();
      resolve(unavailable);
    };
    // Proof: extending this timer makes the stuck prior-acceptance test exceed its declared bound.
    timer = setTimeout(stop, deadlineMs);
    // Proof: stuck prior-acceptance shutdown test waits the full deadline when this listener is removed.
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
  });
  try {
    return await Promise.race([port.assess(previous, combined), expired]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    controller.abort();
  }
}
