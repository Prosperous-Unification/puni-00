import {
  decodeOptimizedResult,
  type OptimizedResult,
} from '@wbs/contracts/solver/optimized-result';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readGeneration } from './optimization-generation';
import { toOptimizedScheduleCacheRow, toSolverSlotRow } from './optimizer-rows';
import {
  optimizedScheduleCache,
  type SolverFailureReason,
  type SolverObjectiveName,
  solverSlot,
} from './schema';

/**
 * The read half of tasks.md 4.1: the stored outcome of both objectives for one
 * full cache key.
 *
 * The write half — the conditional inserts, the attempt-token assertion and
 * 4.1b's retention — is deliberately not here yet. This is the side the plan
 * read needs first, and it is the side that decides what `corrupt` means.
 */

/**
 * Everything but the objective, which is what makes this a *pair* read.
 *
 * `budgetMs` is a key column and not a detail (schema.ts): raising the budget
 * changes neither the hash nor the generation, so a read that dropped it would
 * serve a 60 s answer to a release configured for 120 s.
 */
export interface OptimizedCacheKey {
  readonly projectId: string;
  readonly inputHash: string;
  readonly contractVersion: string;
  readonly budgetMs: number;
}

/**
 * What one stored row means to a reader, after the generation predicate and the
 * payload decode have both had their say.
 *
 * These are row states, not the plan read's `VariantState`: `pending`,
 * `retrying` and `idle` are decided by a live slot or queue entry, which this
 * layer does not read. Every member below maps into that union by adding that
 * one fact, and none of them is derivable from it — which is why the two are
 * separate types rather than one shared enum.
 */
export type CachedOutcome =
  | { readonly kind: 'miss' }
  | {
      readonly kind: 'ok';
      readonly result: OptimizedResult;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'failed';
      readonly reason: SolverFailureReason;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'plan-infeasible';
      readonly certificate: Record<string, unknown>;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'corrupt';
      readonly reason: string;
      readonly generation: number;
      readonly createdAt: number;
    };

/** Both objectives' outcomes for one key, which is what a plan read asks for. */
export type OptimizedPair = Readonly<Record<SolverObjectiveName, CachedOutcome>>;

/** No row at all, and the value every objective starts at. */
const MISS: CachedOutcome = { kind: 'miss' };

/**
 * A decode failure as the reader reports it, never as a thrown error.
 *
 * The row is **left in place** (tasks.md 4.8, Sol r7 Important 13). Deleting it
 * and reporting a miss would turn corruption into a read-triggered solve — the
 * timer retry Dany rejected, arriving through the cache instead of the clock —
 * and would destroy the only evidence of the defect at the moment it was found.
 * `corrupt` never satisfies a read and never auto-spawns, exactly like `failed`;
 * an explicit Retry overwrites it through the ordinary admission path.
 */
function corrupt(reason: unknown, generation: number, createdAt: number): CachedOutcome {
  return {
    kind: 'corrupt',
    reason: reason instanceof Error ? reason.message : String(reason),
    generation,
    createdAt,
  };
}

/**
 * `JSON.parse` as an outcome rather than as a throw.
 *
 * A truncated payload fails here and a well-formed one that breaks the codec
 * fails a layer down; both are the same state to a reader, so both funnel into
 * {@link corrupt} and neither escapes this module.
 */
function parsePayload(
  payload: string,
): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(payload) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * One row's payload, dispatched on the row's own `status`.
 *
 * **`plan-infeasible` is decoded only as far as its envelope, and that is a
 * stated hole rather than an oversight.** Assumption A1 (schema.ts) says the
 * row holds a versioned `PlanInfeasibleResult` discriminated by `status`, and
 * that a payload which fails to decode reads as `corrupt` on exactly the rule
 * an `ok` row obeys. The certificate type itself belongs to the failure path
 * (slice 7) and does not exist yet, so what is enforced here is the half A1
 * fixes and this layer can honestly check: valid JSON carrying a numeric
 * `dtoVersion`, which is the read fence both existing codecs already use.
 * The certificate's *contents* are unvalidated until that codec lands.
 * **What would falsify the split:** a `plan-infeasible` payload whose offending
 * item list is malformed reads `plan-infeasible` today and must read `corrupt`
 * once `decodePlanInfeasible` exists — so the case below asserts the envelope
 * rule only, and tightening it is a change to this function, not to its caller.
 */
function decodePayload(
  status: 'ok' | 'plan-infeasible',
  payload: string,
  generation: number,
  createdAt: number,
): CachedOutcome {
  const parsed = parsePayload(payload);
  if (!parsed.ok) return corrupt(parsed.error, generation, createdAt);

  if (status === 'ok') {
    try {
      return { kind: 'ok', result: decodeOptimizedResult(parsed.value), generation, createdAt };
    } catch (error) {
      return corrupt(error, generation, createdAt);
    }
  }

  const value = parsed.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return corrupt(
      new Error('stored certificate: payload is not an object'),
      generation,
      createdAt,
    );
  }
  const certificate = value as Record<string, unknown>;
  if (typeof certificate['dtoVersion'] !== 'number') {
    return corrupt(
      new Error('stored certificate: dtoVersion is missing or not a number'),
      generation,
      createdAt,
    );
  }
  return { kind: 'plan-infeasible', certificate, generation, createdAt };
}

/**
 * One row read into its outcome.
 *
 * **A row that violates the payload `CHECK` reads `corrupt`, not a throw**, and
 * the divergence from 3.8's boundary rule is deliberate. `toOptimizedScheduleCacheRow`
 * throws on an *unknown enum value*, because there is no honest way to answer a
 * question about a token the release has never heard of. A missing payload is a
 * different defect: the value is absent rather than unrecognised, the constraint
 * that forbids it has existed since the table did, and a throw here would wedge
 * the plan read for **both** objectives on one bad row — precisely the outcome
 * 4.8 introduced `corrupt` to prevent. The row is still left in place and still
 * recoverable by Retry. **Falsified if** a `failed` row with no reason ever
 * needs to be distinguished from a decode failure by a caller; today nothing
 * renders them differently, both showing `Optimization unavailable · Retry`.
 */
function outcomeOf(row: {
  status: 'ok' | 'failed' | 'plan-infeasible';
  resultJson: string | null;
  failureReason: SolverFailureReason | null;
  generation: number;
  createdAt: number;
}): CachedOutcome {
  const { status, resultJson, failureReason, generation, createdAt } = row;

  if (status === 'failed') {
    return failureReason === null
      ? corrupt(
          new Error('stored row: a failed row carries no failure_reason'),
          generation,
          createdAt,
        )
      : { kind: 'failed', reason: failureReason, generation, createdAt };
  }

  return resultJson === null
    ? corrupt(
        new Error(`stored row: a ${status} row carries no result_json`),
        generation,
        createdAt,
      )
    : decodePayload(status, resultJson, generation, createdAt);
}

/**
 * Reads both objectives' stored outcomes for one full key.
 *
 * **The generation predicate is part of the read, not of the eviction.**
 * Allocation deletes the superseded rows, but a read that ran between the
 * allocation and its delete would otherwise serve an answer computed against a
 * plan that no longer exists — the ABA the 4.6 fence is about. So a row whose
 * `generation` is not the current one for `(projectId, contractVersion)` is a
 * miss, and a key with no generation row at all serves nothing: nothing can
 * have been admitted before the first allocation, so any row present is a
 * leftover.
 *
 * The generation row's own `inputHash` is deliberately **not** a predicate. It
 * records which hash the last allocation was for, and requiring it to match
 * would make a legitimate read of a key whose reallocation has not happened yet
 * miss on the coordinator's schedule rather than on the plan's. The key already
 * carries `inputHash` as a primary-key column, which is what fences a stale
 * plan; this predicate fences a stale *generation*, and they are different
 * facts.
 */
export function readOptimizedPair(db: SQLiteBunDatabase, key: OptimizedCacheKey): OptimizedPair {
  const pair: Record<SolverObjectiveName, CachedOutcome> = { pri: MISS, time: MISS };

  const current = readGeneration(db, key.projectId, key.contractVersion);
  if (current === null) return pair;

  const rows = db
    .select()
    .from(optimizedScheduleCache)
    .where(
      and(
        eq(optimizedScheduleCache.projectId, key.projectId),
        eq(optimizedScheduleCache.inputHash, key.inputHash),
        eq(optimizedScheduleCache.contractVersion, key.contractVersion),
        eq(optimizedScheduleCache.budgetMs, key.budgetMs),
        eq(optimizedScheduleCache.generation, current.generation),
      ),
    )
    .all();

  for (const stored of rows) {
    // Through the 3.8 boundary, so an enum no `CHECK` was in force for throws
    // here rather than being cast into a typed field.
    const row = toOptimizedScheduleCacheRow(stored);
    pair[row.objective] = outcomeOf(row);
  }

  return pair;
}

/**
 * Who a writer claims to be, and the whole of what {@link writerStillHolds}
 * checks it against.
 *
 * `ownerId` and `attemptToken` are two facts and not one: the slot's primary
 * key names the *seat*, `ownerId` names the coordinator sitting in it, and
 * `attemptToken` names the attempt. A reclaimed owner that re-reserved the same
 * seat has the same `ownerId` and a freshly minted token, which is precisely the
 * case the token exists to fence.
 */
export interface SlotClaim {
  readonly projectId: string;
  readonly contractVersion: string;
  readonly generation: number;
  readonly objective: SolverObjectiveName;
  readonly budgetMs: number;
  readonly ownerId: string;
  readonly attemptToken: string;
}

/**
 * Whether the writer still holds the slot it is about to commit against
 * (tasks.md 4.1's first condition).
 *
 * **This is the check that is not implied by the row existing.** A superseded
 * run's slot row is deleted or re-reserved by whoever reclaimed it, so
 * "my seat has a row in it" is true for the run that replaced me. Only the
 * token distinguishes the two, and it is the fence that keeps a late write from
 * a reclaimed child out of the cache: without it, six real children ran while
 * SQLite counted two, and a stale outcome could overwrite a live one.
 *
 * It reads through {@link toSolverSlotRow}, so a `lifecycle` or `objective` no
 * `CHECK` was in force for throws rather than being cast (tasks.md 3.8) — a
 * corrupted slot row must not silently authorize a write.
 *
 * **`lifecycle` is deliberately not a condition.** A `starting` slot is a real
 * reservation whose process has not been forked yet, and both phases are the
 * writer's own seat; requiring `running` would refuse a legitimate write from a
 * child that committed before its lifecycle row was advanced. **Falsified if**
 * a `starting` row is ever reachable at commit time only through a defect, at
 * which point the lifecycle becomes a fourth condition rather than a comment.
 *
 * The remaining conditions of 4.1's write — the generation still current, the
 * cancel epoch unchanged, and `optimization_enabled` still 1 — are **not** here
 * and cannot all be: `project.optimization_enabled` is slice **3b**, which is
 * unimplemented, so the write half of 4.1 is blocked on a column that does not
 * exist rather than on effort. This function is the condition that is complete
 * today, proved on its own, and composed by that transaction when 3b lands.
 */
export function writerStillHolds(db: SQLiteBunDatabase, claim: SlotClaim): boolean {
  const stored = db
    .select()
    .from(solverSlot)
    .where(
      and(
        eq(solverSlot.projectId, claim.projectId),
        eq(solverSlot.contractVersion, claim.contractVersion),
        eq(solverSlot.generation, claim.generation),
        eq(solverSlot.objective, claim.objective),
        eq(solverSlot.budgetMs, claim.budgetMs),
      ),
    )
    .get();
  if (stored === undefined) return false;

  const row = toSolverSlotRow(stored);
  return row.ownerId === claim.ownerId && row.attemptToken === claim.attemptToken;
}
