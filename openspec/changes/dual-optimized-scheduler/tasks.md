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

- [ ] 1.1 `canonicalScheduleInput(plan)` builds the canonical JSON string,
      living beside Fast in `libs/domain/src/` so both read one normalizer —
      Fast is `libs/domain/src/schedule.ts`, not `apps/be-01/src/service/`.
      **The canonical form is the exact argument tuple of
      `schedule(rows, edges, slices, notBefore, poolSizes, reach)`:**
      (a) every `PlannedRow` sorted by `id` with `id`, `parentId`, `position`,
      `frozenNumber` and its **as-written** `priority` — not the resolved leaf
      priority, so a parent's edit that changes no leaf today still rehashes;
      (b) authored `{ predecessorId, successorId }` edges sorted by the pair,
      with the leaf expansion derived rather than hashed;
      (c) the `slices` array **in its given order**, because `groupByWorkItem`
      preserves it and intra-work-item step precedence is read from it, each
      slice carrying `workItemId`, `stepId`, `days` (null distinct from 0),
      `personId`, `width`, and `poolIds` as a **sorted set** (`readonly
      string[]`, never a singular `poolId`);
      (d) `notBefore` as `[workItemId, offsetDays]` sorted, already normalized
      against `project.startDate` into whole days from day zero;
      (e) `poolSizes` as `[poolId, size]` sorted;
      (f) `reach` from `project.dep_reach` (`whole-item | anchor-slice`).
      Reuses the existing `sliceKey`/`indexTree`/`expandToLeaves` normalizers.
- [ ] 1.2 `scheduleInputHash(plan)` = SHA-256 of 1.1.
- [ ] 1.3 **Proven by** `schedule-input-hash.test.ts`, one **tie-sensitive**
      mutation case per canonical fact — each fixture is built so the mutated
      fact actually moves a placement, otherwise a hash that ignores it still
      passes. Cases: estimate, edge, as-written priority on a parent, `width`,
      `notBefore` floor, `personId`, pool size, **`depReach` flipped**, **two
      slices of one work item swapped**, **`poolIds` widened from one pool to
      two**, and `position`/`frozenNumber` changed. Unchanged-hash cases:
      Engine, Objective, the toggle, the display variant, the clock, the acting
      user, and a plan-row reordering that yields the same tree. `budgetMs` and
      `contractVersion` are **not** hash inputs but **are** cache-key columns,
      proven in 4.2 rather than here.
- [ ] 1.4 **Negative check, watched red** — delete `reach` from the canonical
      string and watch 1.3's `depReach` case fail; repeat with the slice-array
      order flattened to a sorted set and watch the swap case fail. `Proof:`
      comment names each removed field. A hash that ignores a scheduling fact
      serves a stale schedule as current.
- [ ] 1.5 `SCHEDULER_CONTRACT_VERSION` exported from `libs/domain`, and
      `contractVersion = "<SCHEDULER_CONTRACT_VERSION>+<solverVersion>"` built
      where the cache key is built. Documented as bumped by any change to Fast
      semantics, `ASSUMED_SLICE_WORKDAYS`, `snapWorkdays`, reach or numbering
      semantics, resource tie-breaks, the canonicalizer, or the duration rule.
- [ ] 1.6 **Proven by** keying the existing Fast golden corpus on
      `SCHEDULER_CONTRACT_VERSION`. **Negative check, watched red** — change
      `ASSUMED_SLICE_WORKDAYS` without bumping the constant and watch the
      corpus fail. This is the guard that makes the cache key honest: without
      it a domain change leaves stale rows matching their key forever.

## 2. Solver contract types, request builder, and the Bun re-validator

- [ ] 2.1 Request/response types for the one-JSON-line contract:
      `{ contractVersion, solverVersion, objective, budgetMs, horizonDays,
      slices, edges, pools, baselineOffsets }` in,
      `{ status, offsets, objectiveValues: { makespan, priority, movement } }`
      out.
- [ ] 2.2 `buildSolverRequest(plan, objective, baseline)` in `libs/domain` —
      **Bun owns duration and graph derivation, Python owns placement only.**
      Each slice carries `key` (`sliceKey`), an **integer** `durationDays`
      computed exactly as Fast computes it (`ASSUMED_SLICE_WORKDAYS` for a null
      `days`, divided by `width`, then `snapWorkdays` — no fraction crosses the
      boundary), `width`, `personId`, `poolIds`, `priorityWeight`
      (`(P_max + 1) − p(s)`, `0` when no priority reaches the leaf), and
      `notBeforeDays` (the latest of the leaf's own floor and every
      ancestor's). `edges` are already leaf-expanded with `reach` applied and
      already include the intra-item step-order edges, so Python never receives
      the tree, `parentId`, or `dep_reach`. `horizonDays` is the Fast makespan
      plus total remaining effort.
- [ ] 2.3 `parseSolverResponse(raw: string)` — **the named framing seam.**
      Rejects anything that is not exactly one well-formed JSON line: two
      lines, trailing text after a valid line, empty stdout, an unknown
      `status`, an unknown key, a missing key.
- [ ] 2.4 `revalidateSolverResult(request, response)` — every offset present and
      non-negative, every edge respected, every `notBeforeDays` floor
      respected, no pool over capacity at any instant, no assignee
      double-booked, and the reported `objectiveValues` recomputed and matched.
- [ ] 2.5 **Proven by** `solver-contract.test.ts`: a valid response passes;
      each violation in 2.4 is rejected as invalid-output, one case each; and
      each of 2.3's six framing cases is fed to `parseSolverResponse` **as a raw
      string**, not through a child process — a process cannot reliably produce
      the two-line and trailing-text cases on demand.
- [ ] 2.6 **Proven by** `solver-request.test.ts`: a null-`days` slice becomes
      `ASSUMED_SLICE_WORKDAYS`; a width-3 slice of 6 days' effort becomes 2
      days; a `whole-item` and an `anchor-slice` plan produce different edge
      sets from identical rows; an unprioritised leaf gets `priorityWeight` 0.
- [ ] 2.7 **Negative check, watched red** — remove the dependency check from 2.4
      and watch the "edge violated" case pass when it must fail; then send
      fractional `days / width` from 2.2 and watch 2.6's width case fail.
      `Proof:` comment names each removed check. Re-validation is the only thing
      standing between a wrong solver and a published schedule; a check that
      cannot fail is exactly the failure mode AGENTS.md R5 names.

## 3. Cache, slot and queue tables (PROD MODE — reviewed PR, no self-merge)

- [ ] 3.1 `optimized_schedule_cache` in `apps/be-01/src/repository/schema.ts`:
      composite PK `(projectId, inputHash, objective, contractVersion,
      budgetMs)` → `generation`, `status` (`'ok' | 'failed'`), `scheduleJson`
      (NULL iff failed), `failureReason` (NULL iff ok), `createdAt`.
      Integrity is declared, not assumed: `projectId` FK to `project(id)`
      `ON DELETE CASCADE`; `CHECK (status IN ('ok','failed'))`;
      `CHECK ((status='ok' AND scheduleJson IS NOT NULL AND failureReason IS
      NULL) OR (status='failed' AND scheduleJson IS NULL AND failureReason IS
      NOT NULL))`; `CHECK (objective IN ('pri','time'))`.
- [ ] 3.2 `solver_slot`: PK `(projectId, generation, objective)` → `ownerId`,
      `pid`, `startedAt`, `heartbeatAt`. `solver_queue`: PK
      `(projectId, objective)` — **not** keyed by generation, so a project holds
      at most one queued entry per objective at a time as the prose claims and a
      new generation replaces rather than accumulates — with columns
      `generation`, `enqueuedAt`, and an index on
      `(enqueuedAt, projectId, objective)`. The dequeue order is
      `ORDER BY enqueuedAt, projectId, objective`, which is total: `objective`
      breaks the tie between a project's PRI and Time entries enqueued in the
      same millisecond.
- [ ] 3.3 Forward migration under `apps/be-01/drizzle/` — additive only. Blue
      and green share one SQLite file during a swap, so the outgoing release
      must keep running against the migrated file untouched.
- [ ] 3.4 **Proven by** `optimized-schedule-cache.db.test.ts`: forward migration
      creates the three tables; it is idempotent on an already-migrated file; a
      rollback and re-apply leave every pre-existing table intact; the outgoing
      release's queries still run after the migration; each CHECK rejects its
      malformed row (an `ok` row with a NULL `scheduleJson`, a `failed` row
      with one, an unknown `objective`); and deleting a project cascades its
      cache rows away.
- [ ] 3.5 **Negative check, watched red** — drop the status/nullability CHECK
      and watch 3.4's "an `ok` row with a NULL `scheduleJson` is rejected" case
      fail. `Proof:` comment names the removed constraint. SQLite text columns
      otherwise hold any combination a past bug wrote.
- [ ] 3.6 This slice touches `apps/be-01/drizzle/**`, a prod-mode path: PR with
      green CI and a real review, `status: review`, no self-merge.

## 3b. Project settings columns and API (PROD MODE — reviewed PR, no self-merge)

- [ ] 3b.1 Additive migration on `project`: `optimization_enabled` boolean not
      null default **false**, `schedule_engine` text not null default `'fast'`,
      `schedule_objective` text not null default `'pri'`,
      `optimization_generation` integer not null default 0. The defaults are
      what make OFF-by-default true for every existing row; no backfill can
      guarantee that retroactively.
- [ ] 3b.2 Repository mapping in `apps/be-01/src/repository/project.ts`; the
      three settings in the project read payload; a PATCH contract in
      `project.controller.ts`/`project.service.ts` under the **existing
      project-write authorization** — these are project settings, so a reader
      may not change them.
- [ ] 3b.3 A `project_settings_changed` variant on `ProjectEvent`, emitted by
      `ProjectService.update` when any of the three change, carrying the new
      values. `schedule_optimized` stays reserved for stored solver results.
- [ ] 3b.4 **Proven by** `project-settings.db.test.ts` and
      `project.controller.test.ts`: an unmigrated row reads
      `false`/`fast`/`pri`; a PATCH of each setting survives a reload; a
      read-only collaborator's PATCH is refused and emits nothing; a successful
      PATCH emits exactly one `project_settings_changed` and no
      `schedule_optimized`.
- [ ] 3b.5 **Negative check, watched red** — make `optimization_enabled`
      default true and watch 3b.4's unmigrated-row case fail. `Proof:` comment
      names the changed default. A toggle that defaults ON silently starts
      solvers for every existing project on deploy.
- [ ] 3b.6 This slice touches `apps/be-01/drizzle/**`, the **second** prod-mode
      path in this change: PR with green CI and a real review, `status:
      review`, no self-merge.

## 4. Cache read/write, generations, validity and the failed marker

- [ ] 4.1 Repository functions: read the pair for the full key; upsert an `ok`
      row; upsert a `failed` row; allocate the next `optimizationGeneration`
      **and** delete every older-generation row for that project in one
      transaction. Every write is conditional — `WHERE generation = (SELECT
      optimization_generation FROM project WHERE id = ?)` — so a superseded run
      cannot store, cannot evict, and cannot overwrite.
- [ ] 4.2 **Proven by** `optimized-cache.db.test.ts`: same input → hit with
      **zero calls on the injected spawner** (asserted on the spawner, not on
      elapsed time); a changed effort, edge or pool → miss; a `contractVersion`
      bump → miss; a **raised `budgetMs` → miss** (the old smaller-budget row is
      not served); a `status='failed'` row never satisfies a read and is
      overwritten by the next run for that key; a new generation deletes every
      prior row for that project including its `failed` ones; an undo to a
      previous hash misses; a row whose `scheduleJson` fails schema validation
      is deleted and treated as a miss.
- [ ] 4.3 **Negative check, watched red** — let a `status='failed'` row satisfy
      a read and watch the "never satisfies a read" case fail. `Proof:` comment
      names the relaxed predicate. Serving a failure marker as a schedule would
      publish an empty plan as an optimized one.
- [ ] 4.4 A `failed` row suppresses an automatic re-spawn for its exact key and
      blocks neither an explicit Retry nor a new hash's generation.
      **Proven by** a case in `optimized-cache.db.test.ts`: ten reads by three
      collaborators against a failed key spawn nothing; **a same-hash edit
      spawns nothing**; a Retry on the same key spawns exactly one; a new hash
      spawns the normal pair.
- [ ] 4.5 **Negative check, watched red** — put `failed` back into the
      auto-spawn set and watch 4.4's "ten reads spawn nothing" case fail.
      `Proof:` comment names the restored branch. Every read becoming a re-solve
      is the timer retry Dany explicitly rejected, wearing a different hat.
- [ ] 4.6 **ABA fence, proven by** `optimization-generation.test.ts`: run hash
      A, edit to B (cancelling A), undo to A, then let the original A child
      return a valid result. Its write is rejected, no rows are deleted, no
      `ok` row becomes `failed`, and no event is emitted.
- [ ] 4.7 **Negative check, watched red** — drop the generation predicate from
      4.1's conditional write and watch 4.6 fail. `Proof:` comment names the
      removed predicate. `inputHash` alone cannot tell a resurrected run from a
      current one, which is the whole reason the generation exists.

## 5. The `wbs-solver` Python package

- [ ] 5.1 New versioned package with a lock file, OR-Tools CP-SAT declared, one
      `solve` entrypoint over stdin/stdout. No import surface, no daemon, no
      port. Version readable by the coordinator for `contractVersion`. The
      entrypoint calls `prctl(PR_SET_PDEATHSIG, SIGKILL)` **before** reading
      stdin, so a reparented child dies with its parent rather than waiting to
      be found.
- [ ] 5.2 Objectives, stated as executable mathematics rather than prose:
      `MAKESPAN = max finish`; `PRIORITY = Σ priorityWeight(s) · finish(s)`;
      `MOVEMENT = Σ |start(s) − baselineOffsets[s]|`. PRI minimizes
      `(PRIORITY, MAKESPAN, MOVEMENT)`, Time minimizes
      `(MAKESPAN, PRIORITY, MOVEMENT)`, each by **staged optimization** —
      optimize a term, add it as an equality constraint at its found value,
      optimize the next within the remaining budget — never a weighted sum,
      which overflows on realistic horizons. Neither is a total order; ties
      exist and are not broken reproducibly in production.
- [ ] 5.3 **Proven by** the Python suite (CI only) — unit: each of the three
      cost terms computed on a hand-built instance, both stagings, request
      parse round-trip, response serialization.
- [ ] 5.4 **Proven by** the oracle cases: 2–6 slice hand-verified instances with
      known optimal offsets per objective, including one where PRI and Time
      disagree, one exercising `notBeforeDays`, one exercising a two-pool
      slice, and one exercising an intra-item step-order edge. The solver
      reproduces each exactly.
- [ ] 5.5 **Proven by** the determinism case under the pinned config only —
      `num_search_workers=1`, fixed `random_seed`, and CP-SAT's
      **deterministic** time limit, never a wall-clock assertion. Production is
      multi-worker wall-clock and explicitly not reproducible; the case asserts
      the pinned config alone.
- [ ] 5.6 **Proven by** the budget case, built to be flake-free: a deterministic
      limit small enough that the instance is provably unsolved at it (an
      instance whose search tree is measured, not guessed) returns `feasible`,
      never `optimal`, and never crashes. A wall-clock "too small" budget is not
      a guarantee and is not used.
- [ ] 5.7 **Negative check, watched red** — let the solver read the wall clock
      instead of `baselineOffsets` and watch 5.4's oracle case fail; separately
      collapse the staged optimization into a weighted sum and watch the
      PRI/Time-disagree oracle fail. `Proof:` comment names each fault. Any
      input the hash does not cover breaks cache identity, and a weighted sum
      silently reorders the terms.

## 6. OptimizationCoordinator — admission, spawn, cancel, restart

- [ ] 6.1 Coordinator in `apps/be-01/src/service/`: on a debounced edit with the
      toggle ON, publish Fast, consult the cache, and request admission only
      for variants that are **absent** — never for one holding a `failed` row
      for that exact key, and never on a read or a same-hash edit; child killed
      at `solverBudgetMs + 5000`; a result is written only under the generation
      predicate of 4.1.
- [ ] 6.2 **Admission in SQLite, not memory**: one transaction that reclaims
      slots whose `heartbeatAt` is older than `budgetMs + 30s`, refuses at 4
      rows for the project and 16 rows globally, then inserts the
      `(projectId, generation, objective)` slot with `ON CONFLICT DO NOTHING`
      so concurrent cold reads coalesce to one spawn. `ownerId` is a UUID
      minted at coordinator boot; `heartbeatAt` is refreshed every 5 s for live
      slots and the row is deleted when the child exits.
- [ ] 6.3 `solver_queue` FIFO ordered by `enqueuedAt` then `projectId`, one
      entry per (project, objective), with a dequeue-time re-check of BOTH the
      entry's generation and the project's toggle that discards the entry
      without launching if either has moved.
- [ ] 6.4 Cancellation: a newer edit or an OFF toggle allocates the next
      generation, terminates the pair, rejects with a typed `cancelled`
      outcome, and writes no row. Idempotent and project-scoped.
- [ ] 6.5 Restart: nothing resumed, no queue rebuilt. Orphan handling is not a
      PID search — 5.1's `PR_SET_PDEATHSIG` kills the child, slot expiry
      restores capacity, and the container/cgroup boundary is recorded as a
      deployment obligation.
- [ ] 6.6 **Proven by** `optimization-coordinator.test.ts`, asserting on an
      injected spawner rather than timing: a cold input spawns exactly two; a
      full hit spawns none; **two concurrent first reads spawn exactly one per
      objective**; a second edit mid-solve kills the old pair (asserting the
      child process actually exited, not that a flag was set) and writes no
      stale row; the per-project count never exceeds 4 during termination
      overlap; the queue discards a stale-generation entry at dequeue; the
      queue discards a still-current-hash entry whose project toggled OFF while
      queued.
- [ ] 6.7 **Proven by** `optimization-admission.db.test.ts`: **two coordinator
      instances against one SQLite file** — the blue/green case — admit 16
      children between them, not 32, and 4 for one project, not 8; and a
      coordinator killed without cleanup has its slots reclaimed by heartbeat
      expiry rather than leaking capacity forever.
- [ ] 6.8 **Proven by** `optimization-orphan.proc.test.ts`, a **real
      process-boundary test**, not a mocked restart: spawn an inert child that
      calls `PR_SET_PDEATHSIG`, kill the coordinator process, and observe (a)
      the child terminates and (b) the slot expires and the count recovers.
- [ ] 6.9 **Negative checks, watched red** — remove the dequeue generation
      re-check and watch 6.6's stale-entry case fail; remove the toggle
      re-check and watch the toggled-OFF case fail; move admission back into an
      in-memory counter and watch 6.7's two-instance case fail; drop
      `PR_SET_PDEATHSIG` and watch 6.8 fail. Four faults, four `Proof:`
      comments, because one check passing does not prove the others exist.

## 7. Failure path and events

- [ ] 7.1 Non-zero exit, timeout, OS kill, OOM and failed re-validation each
      write exactly one `status='failed'` row with a typed `failureReason`
      (`timeout | invalid-output | no-solution | internal-error | oom`), keep
      Fast visible, publish nothing, and never retry — not on a timer, not on a
      read, and not on a same-hash edit. A **cancelled** run writes no row at
      all. Failure is variant-specific.
- [ ] 7.2 `schedule_optimized` added to `ProjectEvent` in
      `apps/be-01/src/service/broadcast.ts`, carrying `(projectId, generation,
      inputHash, objective, contractVersion)`. **The cache row and the
      `event_log` record are written in one SQLite transaction** and the
      broadcaster pushes from the committed record, so the guarantee is exactly
      one durable event record per newly stored result, delivered at least once
      and idempotent for receivers. Never emitted on a cache hit.
      Toggle/Engine/Objective changes emit `project_settings_changed` (3b.3)
      instead.
- [ ] 7.3 Retry action: re-read the current `inputHash`, refuse if the plan
      moved under the user, then launch only the failed or absent variant for
      the unchanged key, overwriting its `failed` row.
- [ ] 7.4 **Proven by** `optimization-failure.test.ts` and
      `optimization-events.test.ts`: each of the five failure kinds keeps Fast
      and writes exactly one failed row; a **cancelled** run writes none; PRI
      failing leaves Time selectable; a stored result writes exactly one
      `event_log` row with the right payload; **a crash injected between the
      cache write and the event write leaves neither** (asserted on the
      `event_log` row, not on a broadcaster spy); a cache hit emits nothing; an
      Objective switch emits `project_settings_changed` and no
      `schedule_optimized`; Retry after a hash change starts a fresh generation
      rather than the stale variant.
- [ ] 7.5 **Negative checks, watched red** — emit `schedule_optimized` on a
      cache hit and watch the "cache hit emits nothing" case fail; then split
      the cache write and the event write into two transactions and watch the
      crash-injection case fail. Two `Proof:` comments. A broadcast per read
      would make every collaborator refetch unchanged data; a split write is a
      result nobody is told about.

## 8. UI — toggle, selectors, indicator

- [ ] 8.1 Project Settings hidden toggle bound to `optimization_enabled` (3b),
      OFF by default, project-scoped and persisted through the PATCH contract —
      **not** component-local state.
- [ ] 8.2 Engine (Fast / Optimized) and Objective (Priority-first /
      Finish-first) selectors bound to `schedule_engine` and
      `schedule_objective`, project-scoped and persisted. Switching to an
      already-cached output starts no solve. Both react to an incoming
      `project_settings_changed` event so collaborators converge.
- [ ] 8.3 The one compact indicator: Earlier by N days / Later by N days / Same
      deadline + reordered / Same deadline + same order, plus
      `Optimization unavailable · Retry` on failure and `Optimizing…` while the
      selected variant is admitted but not stored — with Fast on screen
      throughout, never a blank plan or a spinner over it. No toast, no modal,
      no timer retry, no second indicator.
- [ ] 8.4 **Proven by** `optimization-indicator.test.tsx` and
      `optimization-settings.test.tsx`: each of the four comparison outcomes
      renders its exact wording with the right day count; a failed variant
      renders Retry; a pending variant renders `Optimizing…` over Fast offsets;
      no toast or modal role appears in the tree in any of those states; a
      toggle change issues the PATCH and **survives a remount** (proving it is
      persisted, not local); and an incoming `project_settings_changed` moves
      the selector without a local click.
- [ ] 8.5 **Negative check, watched red** — hold the three settings in
      component state instead of the project row and watch 8.4's remount and
      incoming-event cases fail. `Proof:` comment names the reverted binding.
      Local-only controls are exactly the failure the persistence slice exists
      to prevent.
- [ ] 8.6 A user-facing feature: file one lane-q Browser Use Cloud QA task after
      deploy.

## 9. Corpus and regression safety

- [ ] 9.1 Extend the generated corpus to >=1,000 seeds covering
      scheduler → API → Gantt for both objectives and both engines, including
      the people, capacity, priority, **dependency-reach and manual-floor**
      facts the current generator omits.
- [ ] 9.2 The existing Fast corpus (schedule-shapes / identity / capacity /
      leveling / priority / benchmark) keeps passing unchanged, and is **keyed
      by `SCHEDULER_CONTRACT_VERSION`** (1.5) so a Fast change without a bump
      fails it. Fast is the preview and fallback, never the optimality claim.
- [ ] 9.3 The known capacity/floor hand-off audit finding (backward-graph
      hand-off dropped → false float) stays open and documented. The optimizer's
      re-validation must not mask it: a corpus case reproducing it is asserted
      to still reproduce.

## 10. Gate and close

- [ ] 10.1 Remote gate on h2puni: the repo's standard Nx gate (see
      `openspec/config.yaml`, "There is no CI. The gate is …") plus the Python
      suite. Record the actual output in `verify.md` with the failure-proof
      table (fault injected, the case that observed it failing, result) for
      every watched-red check in slices 1–9.
- [ ] 10.2 Terminal review of the exact head: the Anthropic↔OpenAI peer plus
      Gemini; every Critical/Important finding dispositioned.
- [ ] 10.3 Slices 3 and 3b each ship as a reviewed PR (`status: review`, no
      self-merge) — both touch `apps/be-01/drizzle/**`. The remaining slices
      are dev-mode and follow the normal PR + green CI + merge path.
