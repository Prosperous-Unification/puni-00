import { decodeRuntimeIntent } from './runtime-codecs';
import type { RuntimeIntent } from './runtime-records';

/** Correlates an unexpected post-stage fault without exposing its private cause in the public message. */
export class RuntimeDispatchError extends Error {
  readonly intent: RuntimeIntent;

  constructor(intent: RuntimeIntent, cause: unknown) {
    super('Runtime dispatch failed', { cause });
    this.name = 'RuntimeDispatchError';
    // Proof: A15 omitted detachment; 'error correlation detaches' could not mutate its now-frozen caller input. Exact restoration passed.
    const snapshot = decodeRuntimeIntent(intent);
    // Proof: A16 omitted nested freezing; 'error correlation detaches' observed mutable localOwner. Exact restoration passed.
    Object.freeze(snapshot.localOwner);
    // Proof: A17 omitted top-level freezing; 'error correlation detaches' observed mutable intent. Exact restoration passed.
    this.intent = Object.freeze(snapshot);
  }
}
