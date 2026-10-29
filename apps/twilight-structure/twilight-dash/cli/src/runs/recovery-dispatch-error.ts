import type { RecoveryFence } from './recovery-records';
import type { RuntimeIntent } from './runtime-records';

/** Correlates bounded exhaustion or an unexpected post-discovery failure with detached immutable provenance. */
export class RecoveryDispatchError extends Error {
  readonly recoveryId: string;
  readonly original: RuntimeIntent;
  readonly fence: RecoveryFence | null;
  readonly code: 'exhausted' | 'unexpected';

  constructor(
    recoveryId: string,
    original: RuntimeIntent,
    fence: RecoveryFence | null,
    code: 'exhausted' | 'unexpected',
    cause: unknown,
  ) {
    super('Recovery dispatch failed', { cause });
    this.name = 'RecoveryDispatchError';
    this.recoveryId = recoveryId;
    // Proof: T7E02 removed detachment; 'unexpected error correlation' observed its caller original frozen.
    this.original = freezeRecord(structuredClone(original));
    // Proof: T7E03 removed detachment; the same test observed its caller fence frozen.
    this.fence = freezeRecord(structuredClone(fence));
    this.code = code;
    // Proof: T7E04 removed this freeze; the same test observed mutable correlation fields.
    Object.freeze(this);
  }
}

function freezeRecord<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    // Proof: T7E01 removed recursion; the same test observed mutable nested owner/context provenance.
    for (const nested of Object.values(value)) freezeRecord(nested);
    Object.freeze(value);
  }
  return value;
}
