import type { TransactionalStores } from '@wbs/core';

import { inertMemoryLateWriteSeam } from './late-write-seam';
import { bindStores, MemoryState } from './memory-stores';

/**
 * Raw synchronous fixture stores over one explicit current state. They acquire
 * no Source owner, public queue or close capability. Tests needing those
 * guarantees must use openMemorySource and retain its actual close obligation.
 * The shared state gives first-child writes genuine private staging rather than
 * a missing-method fallback on the old non-atomic subtree fixture.
 */
export function inMemoryStores(): TransactionalStores {
  // Historical independent fixture wiring before this shared-state delegation:
  // Proof: a separate parallel table let legacy fixture removal erase the step; both cascade tests failed, 2026-10-17.
  // The shared bindStores route requires its own current regression observations.
  return bindStores(new MemoryState(), inertMemoryLateWriteSeam);
}
