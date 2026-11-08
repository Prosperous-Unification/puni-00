import { type } from 'arktype';

import type { ObservationIdentity } from './observation';

const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
export const fingerprint = /^[a-f0-9]{64}$/;
const Reference = type({ '+': 'reject', id: token, fingerprint });
const Identity = type({
  '+': 'reject',
  environment: token,
  service: token,
  revision: token,
  observationId: token,
});
const Observation = type({
  '+': 'reject',
  version: '1',
  operationId: /^[a-f0-9-]{36}$/,
  identity: Identity,
  observedAt: 'number',
  capturedAt: 'number',
  signals: {
    '+': 'reject',
    log: Reference.array(),
    metric: Reference.array(),
    trace: Reference.array(),
  },
  authority: "'evidence-only'",
});
/** Vendor-independent frozen signal references; never migration or runtime admission authority. */
export interface RetainedObservation extends Omit<typeof Observation.infer, 'identity'> {
  identity: ObservationIdentity;
}
/** Decodes the closed neutral format and enforces nonempty, unique, bounded signal witnesses. */
export function readRetainedObservation(wire: unknown): RetainedObservation {
  const checked = Observation(wire);
  // Proof: bypassing Observation validation made the actual CLI forged inner-version test accept an unsupported core format.
  if (checked instanceof type.errors) throw new Error('history-format'); // guard: core-format
  const references = Object.values(checked.signals).flat();
  // Proof: removing this guard made neutral log/trace/metric reference tests accept empty and over-cap witness sets.
  if (
    !Number.isFinite(checked.observedAt) ||
    checked.observedAt < 0 ||
    !Number.isFinite(checked.capturedAt) ||
    checked.capturedAt < checked.observedAt ||
    checked.capturedAt > Date.now() ||
    checked.signals.log.length < 1 ||
    checked.signals.log.length > 16 ||
    checked.signals.trace.length < 1 ||
    checked.signals.trace.length > 16 ||
    checked.signals.metric.length < 1 ||
    checked.signals.metric.length > 512 ||
    new Set(references.map((reference) => reference.id)).size !== references.length
  )
    throw new Error('history-references'); // guard: core-references
  return checked;
}
