import { type } from 'arktype';

// Proof: removing the identity pattern admitted blank IDs in rejects malformed identities.
const identity = type.string.matching(/\S/);
// Proof: removing the timestamp pattern admitted non-UTC syntax in wire schema rejects invalid UTC.
const timestamp = type.string.matching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const nullableTimestamp = timestamp.or('null');
const state = type(
  "'pending' | 'running' | 'passed' | 'failed' | 'cancelled' | 'skipped' | 'unknown'",
);

/** Provider-scoped identity and native provenance, retained without interpretation. */
export const DeliverySourceSchema = type({
  provider: identity,
  id: identity,
  url: identity,
  nativeState: identity,
  observedAt: timestamp,
});
export type DeliverySource = typeof DeliverySourceSchema.infer;

const executionFields = {
  source: DeliverySourceSchema,
  name: identity,
  resource: identity.or('null'),
  state,
  startedAt: nullableTimestamp,
  completedAt: nullableTimestamp,
};
export const DeliveryExecutionSchema = type({
  ...executionFields,
  kind: "'performed' | 'carried'",
  executionId: identity,
})
  .or({ ...executionFields, kind: "'not-performed'", executionId: 'null' })
  .or({ ...executionFields, kind: "'unknown'", executionId: identity.or('null') });
export type DeliveryExecution = typeof DeliveryExecutionSchema.infer;

export const DeliveryAttemptSchema = type({
  source: DeliverySourceSchema,
  startedAt: nullableTimestamp,
  completedAt: nullableTimestamp,
  executionsComplete: 'boolean',
  executions: DeliveryExecutionSchema.array(),
});
export type DeliveryAttempt = typeof DeliveryAttemptSchema.infer;

export const DeliveryRunSchema = type({
  source: DeliverySourceSchema,
  name: identity,
  revision: identity,
  attemptsComplete: 'boolean',
  attempts: DeliveryAttemptSchema.array(),
});
export type DeliveryRun = typeof DeliveryRunSchema.infer;

export const DeliveryCheckSchema = type({
  source: DeliverySourceSchema,
  name: identity,
  revision: identity,
  state,
  startedAt: nullableTimestamp,
  completedAt: nullableTimestamp,
});
export type DeliveryCheck = typeof DeliveryCheckSchema.infer;

/** Versioned wire shape; semantic identity and chronology checks live at {@link validateDeliveryObservation}. */
export const DeliveryObservationSchema = type({
  version: '1',
  observedAt: timestamp,
  change: {
    source: DeliverySourceSchema,
    title: 'string',
    revision: identity,
    state: "'open' | 'closed' | 'merged'",
    mergedRevision: identity.or('null'),
  },
  checks: DeliveryCheckSchema.array(),
  runs: DeliveryRunSchema.array(),
  coverage: { checks: "'complete' | 'partial'", runs: "'complete' | 'partial'", notes: 'string[]' },
});
export type DeliveryObservation = typeof DeliveryObservationSchema.infer;

/** Unavailable is a modeled provider outcome; cancellation remains the caller's controlled exit. */
export const DeliveryReadingSchema = type({
  kind: "'observed'",
  observation: DeliveryObservationSchema,
})
  .or({ kind: "'unsupported'", reason: identity })
  .or({
    kind: "'unavailable'",
    reason:
      "'inaccessible' | 'rate-limited' | 'missing' | 'timeout' | 'invalid-response' | 'revision-changed' | 'budget-exceeded' | 'provider-unavailable'",
    message: identity,
    observedAt: timestamp,
  });
export type DeliveryReading = typeof DeliveryReadingSchema.infer;

/** Reads only a URL resolved from an authorized stored reference. */
export interface DeliveryReader {
  read(url: string, signal?: AbortSignal): Promise<DeliveryReading>;
}

/** Validates provider observations once, including relationships the wire schema cannot express. */
export function validateDeliveryObservation(input: unknown): DeliveryObservation {
  const observation = DeliveryObservationSchema.assert(input);
  assertObservation(observation);
  return observation;
}

/** Validates a reading, applying semantic observation checks only to the observed branch. */
export function validateDeliveryReading(input: unknown): DeliveryReading {
  const reading = DeliveryReadingSchema.assert(input);
  // Proof: removing observed-envelope validation admitted stale checks in validates observed, unsupported and unavailable readings.
  if (reading.kind === 'observed') assertObservation(reading.observation);
  // Proof: removing unavailable timestamp validation admitted February 30 in validates observed, unsupported and unavailable readings.
  if (reading.kind === 'unavailable') assertTimestamp(reading.observedAt);
  return reading;
}

/** Keeps semantic checks shared between direct observations and reading envelopes. */
function assertObservation(observation: DeliveryObservation): void {
  assertTimestamp(observation.observedAt);
  assertTimestamp(observation.change.source.observedAt);
  // Proof: removing this guard admitted a merge revision on an open change in requires merged revision.
  if (observation.change.state !== 'merged' && observation.change.mergedRevision !== null)
    throw new Error('Only merged changes may name a merged revision');
  const executions = new Set<string>();
  for (const check of observation.checks) {
    // Proof: removing this guard admitted an older revision in rejects stale checks.
    if (check.revision !== observation.change.revision)
      throw new Error('Current check revision must match observed change revision');
    assertTimestamp(check.source.observedAt);
    assertTiming(check);
  }
  for (const run of observation.runs) {
    assertTimestamp(run.source.observedAt);
    for (const attempt of run.attempts) {
      assertTimestamp(attempt.source.observedAt);
      assertTiming(attempt);
      for (const execution of attempt.executions) {
        assertTimestamp(execution.source.observedAt);
        assertTiming(execution);
        if (execution.kind !== 'performed') continue;
        const identity = JSON.stringify([execution.source.provider, execution.executionId]);
        // Proof: removing this guard admitted duplicate work in rejects duplicate performed execution identity.
        if (executions.has(identity))
          throw new Error('Observed duplicate performed execution identity');
        executions.add(identity);
      }
    }
  }
}

/** Rejects impossible calendar dates that a JSON-representable timestamp pattern cannot express. */
function assertTimestamp(instant: string): void {
  const epoch = Date.parse(instant);
  // Proof: removing this guard admitted February 30 in rejects malformed and impossible timestamps.
  if (
    !Number.isFinite(epoch) ||
    new Date(epoch).toISOString() !== instant.replace(/Z$/, instant.includes('.') ? 'Z' : '.000Z')
  )
    throw new Error('Delivery timestamp must be a real UTC ISO instant');
}

/** Missing endpoints are unknown; known endpoints must retain chronological ordering. */
function assertTiming(interval: { startedAt: string | null; completedAt: string | null }): void {
  if (interval.startedAt !== null) assertTimestamp(interval.startedAt);
  if (interval.completedAt !== null) assertTimestamp(interval.completedAt);
  // Proof: removing this guard admitted completion before start in rejects reversed execution timing.
  if (
    interval.startedAt !== null &&
    interval.completedAt !== null &&
    Date.parse(interval.completedAt) < Date.parse(interval.startedAt)
  )
    throw new Error('Completion cannot precede start');
}
