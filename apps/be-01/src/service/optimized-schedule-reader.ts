import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import type { Schedule } from '@wbs/domain';

import type { SolverObjectiveName } from '../repository';

/**
 * Everything the plan read knows and the reader needs, and nothing it has to
 * look up again.
 *
 * The **whole `ScheduleInput`** rather than a hash the service computed: the
 * cache key's `inputHash` is 1.2's SHA-256 of 1.1's canonicalisation, and a
 * service that hashed here would be a second caller of that pair whose argument
 * order could drift from the writer's without either side failing. The reader
 * is the one place that turns a plan into a key, so it is the one place that
 * hashes.
 *
 * `objective` is passed rather than read off the project by the reader, because
 * the reader is handed no project: which of the cached pair is published is a
 * **setting** (3b.2's `schedule_objective`), and the service is what holds the
 * project row.
 *
 * `budgetMs` and the contract version are deliberately **absent**. They are key
 * columns the *reader* owns — a release's configured budget and
 * `SCHEDULER_CONTRACT_VERSION` — and a plan read that named either would be a
 * caller that could serve a 60 s answer to a 120 s release.
 */
export interface OptimizedScheduleAsk {
  readonly projectId: string;
  readonly objective: SolverObjectiveName;
  readonly input: ScheduleInput;
}

/**
 * The plan read's one question of the optimized cache: *is there a published
 * schedule for exactly this plan?*
 *
 * `Schedule | null` and not an outcome union, because the answer this seam acts
 * on is binary. A miss, a `failed` row, a superseded generation and a `corrupt`
 * payload are four different facts to the cache (4.1–4.8) and the same fact
 * here: **fall back to Fast**. Widening the return would move those four
 * decisions up into `WorkItemService`, where they would be a second copy of
 * `readOptimizedPair`'s rules and the copy that disagreed after an edit.
 *
 * Synchronous, because every implementation is a SQLite read on the same
 * connection the plan read is already using and 4.1's `readOptimizedPair` is
 * itself synchronous. An `async` port here would make the plan read await a
 * promise that never yields, and would let a future implementation wait on a
 * solve — which is the timer-shaped coupling slice 4 is built to refuse.
 *
 * **It may not throw for anything the cache models.** The plan read calls it
 * outside its own `try`, so a throw is a defect and is reported as one rather
 * than being relabelled "your dependencies run in a circle".
 */
export type OptimizedScheduleReader = (ask: OptimizedScheduleAsk) => Schedule | null;
