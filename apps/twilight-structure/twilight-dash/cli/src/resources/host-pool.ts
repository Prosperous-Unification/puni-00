import { type } from '@shared/validation';

/**
 * An exclusive resource id as a catalogue names it (`gate_tree`); slice 3 hands the admitted
 * unit to the payload as `DASH_JOB_UNIT_<ID>`, so the id is a lower-case shell word.
 */
export const EXCLUSIVE_ID = /^[a-z][a-z0-9_]{0,63}$/;

/** A waiter overtaken this many times is a barrier no younger waiter passes (J6). */
export const BARRIER_OVERTAKES = 3;

/** A ticket whose wait budget ended longer ago than this is removed by whoever sees it (J6). */
export const TICKET_RECLAIM_AFTER_MS = 60_000;

/**
 * The port through which the job catalogue reaches admission (`dash-host-jobs` placement):
 * slice 3's loader reads `infra/jobs/catalogue.json` at the payload's revision and supplies
 * one of these; admission trusts the declared envelope, never a measurement (J5).
 */
export const jobTypeDescriptor = type({
  id: /^[a-z][a-z0-9-]{0,63}$/,
  envelope: type({
    cpuCores: 'number.integer >= 0',
    memoryGib: 'number.integer >= 0',
    tmpDiskGib: 'number.integer >= 0',
    exclusive: type(EXCLUSIVE_ID).array(),
  }).onUndeclaredKey('reject'),
  containers: type("'none'").or(
    type({ memoryGib: 'number.integer > 0', cpuCores: 'number.integer > 0' }).onUndeclaredKey(
      'reject',
    ),
  ),
  enforcement: "'observe' | 'cap'",
}).onUndeclaredKey('reject');
export type JobTypeDescriptor = typeof jobTypeDescriptor.infer;

/** The countable dimensions one host pool reserves from; exclusive units are counted apart. */
export interface PoolVector {
  cpuCores: number;
  memoryGib: number;
  diskUnits: number;
  workspaceSlots: number;
}

export const POOL_DIMENSIONS = ['cpuCores', 'memoryGib', 'diskUnits', 'workspaceSlots'] as const;

/** `allocatable[d] − reserved[d] ≥ demand[d]` for every dimension. */
export function vectorFits(demand: PoolVector, reserved: PoolVector, allocatable: PoolVector) {
  return POOL_DIMENSIONS.every(
    (dimension) => reserved[dimension] + demand[dimension] <= allocatable[dimension],
  );
}

/** One waiting ticket as scheduling sees it: arrival order and how often it was overtaken. */
export interface QueuedWaiter {
  sequence: number;
  overtakes: number;
}

/**
 * The waiter admission serves next, or null: the oldest waiter that fits, looking no further
 * than the oldest barrier (a waiter overtaken {@link BARRIER_OVERTAKES} times), so no younger
 * waiter passes a barrier until it runs (J6). `waiters` is every live ticket oldest first.
 */
export function chooseWaiter<W extends QueuedWaiter>(
  waiters: readonly W[],
  fits: (waiter: W) => boolean,
): W | null {
  const barrier = waiters.findIndex((waiter) => waiter.overtakes >= BARRIER_OVERTAKES);
  // Proof: scanning every waiter here admitted the fourth build past the barred gate in
  // `a third gate is overtaken, then barred` (host-jobs.test.ts) and broke the model's
  // reference order in host-jobs.model.test.ts (2026-11-01, verify.md Slice 2).
  const candidates = barrier < 0 ? waiters : waiters.slice(0, barrier + 1);
  return candidates.find(fits) ?? null;
}
