# Tasks — dual-objective optimized scheduler

TDD slices for the change described in `proposal.md`, `design.md` and
`specs/scheduler-optimization/spec.md`. Every slice names the test that proves
it; every safety check names the negative test watched failing with the check
removed (R5). Nothing here is implemented yet — this is the plan TASK-218
delivers, and implementation lands as its own queue tasks.

**Order matters.** Slices 1–3 are the seam. Slices 4–7 are behaviour. Slice 8
is the UI. Slice 9 is the corpus. A slice is not done until its remote gate on
h2puni is green — no build or autotest runs on the workspace box.

## 1. Canonical input and the exact-input hash

- [ ] 1.1 `canonicalScheduleInput(plan)` in `apps/be-01/src/service/` builds the
      canonical JSON string from work-item tree, dependency edges (leaf
      expansion included) and team pools, reusing the existing
      `sliceKey`/`indexTree`/`expandToLeaves` normalizers.
- [ ] 1.2 `scheduleInputHash(plan)` = SHA-256 of 1.1.
- [ ] 1.3 **Proven by** `schedule-input-hash.test.ts`: identical facts in a
      different row order hash equal; a changed estimate, edge, priority,
      `maxParallel`, `notBefore`, assignee or pool size each change the hash;
      Engine, Objective, the toggle, the display variant, the clock, the acting
      user and `solverBudgetMs` each leave it unchanged.
- [ ] 1.4 **Negative check, watched red** — delete the pool size from the
      canonical string and watch 1.3's "pool size changes the hash" case fail.
      `Proof:` comment names the removed field. A hash that ignores a
      scheduling fact would serve a stale schedule as current.

## 2. Solver contract types and the Bun re-validator

- [ ] 2.1 Request/response types for the one-JSON-line contract:
      `{ objective, slices, edges, pools, baselineOffsets, budgetMs,
      solverVersion }` in, `{ status, offsets, objectiveValue }` out.
- [ ] 2.2 `revalidateSolverResult(request, response)` — every offset present and
      non-negative, no dependency violated, no pool over capacity, no assignee
      double-booked, no unknown `sliceKey`, `status` in
      `{'optimal','feasible'}`, output exactly one well-formed JSON line.
- [ ] 2.3 **Proven by** `solver-contract.test.ts`: a valid response passes; each
      of the seven violations above is rejected as invalid-output, one case
      each.
- [ ] 2.4 **Negative check, watched red** — remove the dependency check from 2.2
      and watch the "dependency violated" case pass when it must fail.
      `Proof:` comment names the removed check. Re-validation is the only thing
      standing between a wrong solver and a published schedule; a check that
      cannot fail is exactly the failure mode AGENTS.md R5 names.

## 3. The cache table (PROD MODE — reviewed PR, no self-merge)

- [ ] 3.1 `optimized_schedule_cache` in `apps/be-01/src/repository/schema.ts`:
      composite PK `(projectId, inputHash, objective, solverVersion)` →
      `status` (`'ok' | 'failed'`), `scheduleJson` (NULL when failed),
      `failureReason` (NULL when ok), `createdAt`.
- [ ] 3.2 Forward migration under `apps/be-01/drizzle/` — additive only. Blue
      and green share one SQLite file during a swap, so the outgoing release
      must keep running against the migrated file untouched.
- [ ] 3.3 **Proven by** `optimized-schedule-cache.db.test.ts`: forward migration
      creates the table; the migration is idempotent on an already-migrated
      file; a rollback and re-apply leave every pre-existing table intact; the
      outgoing release's queries still run after the migration.
- [ ] 3.4 **Negative check, watched red** — make the migration drop a column and
      watch 3.3's backward-compatibility case fail. `Proof:` comment names the
      injected drop.
- [ ] 3.5 This slice touches `apps/be-01/drizzle/**`, a prod-mode path: PR with
      green CI and a real review, `status: review`, no self-merge.

## 4. Cache read/write, validity and the failed marker

- [ ] 4.1 Repository functions: read the pair for `(projectId, inputHash,
      solverVersion)`, upsert an `ok` row, upsert a `failed` row, and retain
      only the latest generation per project.
- [ ] 4.2 **Proven by** `optimized-cache.db.test.ts`: same input → hit with no
      solver spawn; a changed effort, edge or pool → miss; a `solverVersion`
      bump → miss; a `status='failed'` row never satisfies a read, never
      suppresses a later solve, and is overwritten by the next run for that
      key; a new generation replaces the prior rows; a changed
      `solverBudgetMs` still serves the cached pair.
- [ ] 4.3 **Negative check, watched red** — let a `status='failed'` row satisfy
      a read and watch the "never satisfies a read" case fail. `Proof:` comment
      names the relaxed predicate. Serving a failure marker as a schedule would
      publish an empty plan as an optimized one.

## 5. The `wbs-solver` Python package

- [ ] 5.1 New versioned package with a lock file, OR-Tools CP-SAT declared, one
      `solve` entrypoint over stdin/stdout. No import surface, no daemon, no
      port. Version readable by the coordinator for the cache key.
- [ ] 5.2 PRI objective: priority cost, then makespan, then movement from
      `baselineOffsets`. Time objective: makespan, then priority cost, then the
      same movement term. Both are total orders over the same three terms and
      differ only in precedence.
- [ ] 5.3 **Proven by** the Python suite (CI only) — unit: objective math for
      both orderings, request parse round-trip, response serialization.
- [ ] 5.4 **Proven by** the oracle cases: 2–6 slice hand-verified instances with
      known optimal offsets per objective; the solver reproduces them exactly.
- [ ] 5.5 **Proven by** the determinism case under the pinned config only —
      `num_search_workers=1`, fixed `random_seed`, deterministic time limit.
      Production is multi-worker wall-clock and explicitly not reproducible;
      the case asserts the pinned config, never the production one.
- [ ] 5.6 **Proven by** the budget case: a deliberately-too-small budget returns
      `feasible`, never `optimal`, and never crashes.
- [ ] 5.7 **Negative check, watched red** — let the solver read the wall clock
      instead of `baselineOffsets` and watch 5.4's oracle case fail. `Proof:`
      comment names the injected read. Any input the hash does not cover breaks
      cache identity.

## 6. OptimizationCoordinator — spawn, cancel, cap, restart

- [ ] 6.1 Coordinator in `apps/be-01/src/service/`: on a debounced edit with the
      toggle ON, publish Fast, consult the cache, spawn only missing/stale/
      failed variants; child killed at `solverBudgetMs + 5000`; a result is
      written only by the coordinator that spawned its run.
- [ ] 6.2 Ceilings: 4 processes per project, 16 global, a single global FIFO by
      enqueue time with one entry per (project, objective), and a dequeue-time
      hash re-check that discards a stale entry without launching.
- [ ] 6.3 Cancellation: a newer edit or an OFF toggle terminates the pair,
      rejects with a typed `cancelled` outcome, and writes no row. Idempotent
      and project-scoped.
- [ ] 6.4 Restart: nothing resumed, no queue rebuilt, orphaned children killed.
- [ ] 6.5 **Proven by** `optimization-coordinator.test.ts`: a cold input spawns
      exactly two; a full hit spawns none; a second edit mid-solve kills the old
      pair and writes no stale row; the per-project count never exceeds 4 during
      termination overlap; the global queue discards a stale entry at dequeue; a
      simulated restart mid-solve leaves no row and no orphan.
- [ ] 6.6 **Negative check, watched red** — remove the dequeue-time hash
      re-check and watch the "stale entry discarded" case fail. `Proof:` comment
      names the removed re-check. A stale generation occupying a slot is how a
      superseded schedule reaches the cache.

## 7. Failure path and events

- [ ] 7.1 Non-zero exit, timeout, OS kill and failed re-validation each write a
      `status='failed'` row with a typed `failureReason`
      (timeout / invalid-output / no-solution / internal-error), keep Fast
      visible, publish nothing, and never retry on a timer. Failure is
      variant-specific.
- [ ] 7.2 `schedule_optimized` added to `ProjectEvent` in
      `apps/be-01/src/service/broadcast.ts`, carrying `(projectId, inputHash,
      objective, solverVersion)`. Emitted once per newly stored `ok` row and
      never on a cache hit. Toggle/Engine/Objective changes broadcast on the
      existing project-settings channel instead.
- [ ] 7.3 Retry action: recheck the current `inputHash`, then launch only the
      failed or missing variant for that unchanged input.
- [ ] 7.4 **Proven by** `optimization-failure.test.ts` and
      `optimization-events.test.ts`: each of the four failure kinds keeps Fast
      and writes exactly one failed row; PRI failing leaves Time selectable; a
      stored result emits exactly one event with the right payload; a cache hit
      emits none; an Objective switch emits a project-settings event and no
      `schedule_optimized`; Retry after a hash change starts a fresh generation
      rather than the stale variant.
- [ ] 7.5 **Negative check, watched red** — emit `schedule_optimized` on a cache
      hit and watch the "cache hit emits nothing" case fail. `Proof:` comment
      names the added emit. A broadcast per read would make every collaborator
      refetch unchanged data on every read.

## 8. UI — toggle, selectors, indicator

- [ ] 8.1 Project Settings hidden toggle, OFF by default, project-scoped.
- [ ] 8.2 Engine (Fast / Optimized) and Objective (Priority-first /
      Finish-first) selectors, project-scoped and persisted. Switching to an
      already-cached output starts no solve.
- [ ] 8.3 The one compact indicator: Earlier by N days / Later by N days / Same
      deadline + reordered / Same deadline + same order, and
      `Optimization unavailable · Retry` on failure. No toast, no modal, no
      timer retry, no second indicator.
- [ ] 8.4 **Proven by** `optimization-indicator.test.tsx`: each of the four
      comparison outcomes renders its exact wording with the right day count; a
      failed variant renders Retry; no toast or modal role appears in the tree
      in any of those states.
- [ ] 8.5 A user-facing feature: file one lane-q Browser Use Cloud QA task after
      deploy.

## 9. Corpus and regression safety

- [ ] 9.1 Extend the generated corpus to >=1,000 seeds covering
      scheduler → API → Gantt for both objectives and both engines, including
      the people, capacity and priority facts the current generator omits.
- [ ] 9.2 The existing Fast corpus (schedule-shapes / identity / capacity /
      leveling / priority / benchmark) keeps passing unchanged. Fast is the
      preview and fallback, never the optimality claim.
- [ ] 9.3 The known capacity/floor hand-off audit finding (backward-graph
      hand-off dropped → false float) stays open and documented. The optimizer's
      re-validation must not mask it: a corpus case reproducing it is asserted
      to still reproduce.

## 10. Gate and close

- [ ] 10.1 Remote gate on h2puni: the repo's standard Nx gate (see
      `openspec/config.yaml`, "There is no CI. The gate is …") plus the Python
      suite. Record the actual output in `verify.md` with the failure-proof
      table (fault injected, the case that observed it failing, result) for
      every watched-red check in slices 1–8.
- [ ] 10.2 Terminal review of the exact head: the Anthropic↔OpenAI peer plus
      Gemini; every Critical/Important finding dispositioned.
- [ ] 10.3 Slice 3 ships as a reviewed PR (`status: review`, no self-merge). The
      remaining slices are dev-mode and follow the normal PR + green CI + merge
      path.
