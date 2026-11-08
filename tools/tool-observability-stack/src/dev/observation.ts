/** Observed application identity, independent of the telemetry producer. */
export interface ObservationIdentity {
  environment: string;
  service: string;
  revision: string;
  observationId: string;
}

/** Adapters preserve query failure separately from successful empty queries. */
export type SignalEvidence =
  | { state: 'missing' }
  | { state: 'unavailable'; reason: string }
  | {
      state: 'found';
      identity: ObservationIdentity;
      observedAt: number;
      proof:
        | { kind: 'record' }
        | {
            kind: 'trace';
            traceId: string;
            parentSpanId: string;
            childSpanId: string;
            childParentSpanId: string;
          };
    };

/** Every required signal is explicit; adapters validate wire formats before constructing it. */
export interface ObservationEvidence {
  log: SignalEvidence;
  metric: SignalEvidence;
  trace: SignalEvidence;
}

/** Reasons remain visible even when a higher precedence summary state wins. */
export interface ObservationHealth {
  state: 'missing' | 'incomplete' | 'stale' | 'complete';
  signals: Record<keyof ObservationEvidence, string[]>;
}

/**
 * Assesses semantic identity, epoch-millisecond times and trace relationships.
 * Freshness includes the exact boundary. Stale takes precedence over incomplete;
 * missing means every query succeeded without evidence. No clock or identity is inferred.
 * Throws for invalid assessment configuration, which is trusted caller state.
 */
export function assessObservation(
  expected: ObservationIdentity,
  evidence: ObservationEvidence,
  now: number,
  freshness: number,
): ObservationHealth {
  // Proof: invalid assessment clock/window tests fail when this guard is removed.
  if (!Number.isFinite(now) || now < 0 || !Number.isFinite(freshness) || freshness <= 0) {
    throw new Error('Observation clock and freshness must be finite and valid');
  }
  const fields = ['environment', 'service', 'revision', 'observationId'] as const;
  // Proof: empty expected identity tests fail when this guard is removed.
  if (fields.some((field) => expected[field].trim().length === 0)) {
    throw new Error('Expected observation identity must be nonempty');
  }
  const signals: ObservationHealth['signals'] = { log: [], metric: [], trace: [] };
  for (const signal of ['log', 'metric', 'trace'] as const) {
    const observation = evidence[signal];
    const reasons = signals[signal];
    // Proof: all absent and partial tests fail when missing evidence is accepted.
    if (observation.state === 'missing') {
      reasons.push('missing');
      continue;
    }
    // Proof: unavailable query test fails when query failure is accepted.
    if (observation.state === 'unavailable') {
      reasons.push(`unavailable: ${observation.reason}`);
      continue;
    }
    // Proof: independent mismatched environment/service/revision/observationId tests fail if identity comparison is removed.
    for (const field of fields) {
      if (observation.identity[field] !== expected[field]) reasons.push(`identity.${field}`);
    }
    // Proof: invalid/future time tests fail when their respective acceptance predicates are removed.
    if (!Number.isFinite(observation.observedAt) || observation.observedAt < 0) {
      reasons.push('invalid-time');
    } else if (observation.observedAt > now) {
      reasons.push('future-time');
    } else if (now - observation.observedAt > freshness) {
      // Proof: stale alongside missing/mismatched evidence test fails when expiry is ignored.
      reasons.push('stale');
    }
    const proof = observation.proof;
    // Proof: partial trace cases fail independently when kind, IDs or relationship checks are removed.
    if (
      signal === 'trace' &&
      (proof.kind !== 'trace' ||
        proof.traceId.trim().length === 0 ||
        proof.parentSpanId.trim().length === 0 ||
        proof.childSpanId.trim().length === 0 ||
        proof.parentSpanId === proof.childSpanId ||
        proof.childParentSpanId !== proof.parentSpanId)
    ) {
      reasons.push('incomplete-trace');
    }
  }
  const reasons = Object.values(signals);
  const state = reasons.every((entries) => entries.length === 1 && entries[0] === 'missing')
    ? 'missing'
    : reasons.some((entries) => entries.includes('stale'))
      ? 'stale'
      : reasons.some((entries) => entries.length > 0)
        ? 'incomplete'
        : 'complete';
  return { state, signals };
}
