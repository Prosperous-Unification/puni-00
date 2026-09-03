# Tasks — dual-objective optimized scheduler

TDD slices for the change described in `proposal.md`, `design.md` and
`specs/scheduler-optimization/spec.md`. Every slice names the test that proves
it; every safety check names the negative test watched failing with the check
removed (R5). Nothing here is implemented yet — this is the plan TASK-218
delivers, and implementation lands as its own queue tasks.

**Order matters, and there is no corrections appendix.** A later review's
disposition is folded into the slice it changes and the superseded text is
deleted, never appended as a new section — an appendix leaves the old
instruction standing as an earlier ordered checklist item, which is exactly the
fault Sol r7 Critical 4 and 5 named. Slices 1–3 are the seam. Slices 4–7 are behaviour. Slice 8
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
      (c) the `slices` array **grouped by work item, groups ordered by
      `workItemId`, each group's own order preserved as given** — only the
      intra-item order is step precedence; the global order is whatever SQL
      returned, because `WorkItemRepo.listByProject` selects with no
      `ORDER BY` and `slicesOf` emits groups in row order, so hashing it made
      one unchanged project hash differently between reads and between blue
      and green — each
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
- [ ] 1.7 `WorkItemRepo.listByProject` acquires `ORDER BY work_item.id` on its
      work-item select. An argument tuple that varies between reads of an
      unchanged project is a Fast defect before it is a cache one.
- [ ] 1.8 The `ORDER BY` proof asserts the **raw argument tuple**, not the hash
      (Sol r7 Important 11). The earlier plan reversed the stub driver's rows
      and expected two different hashes through
      `listByProject` → `slicesOf` → `canonicalScheduleInput`; that fault is
      normalised away by design, because 1.1(c) reorders groups by
      `workItemId` and sorts rows by `id`, and the spec separately *requires*
      the hash to be equal when only underlying row order differs. A hash
      assertion here can never fail, which is the check-that-cannot-fail
      failure AGENTS.md R5 names. The proof instead runs the same reversed
      driver through `listByProject` → `slicesOf` and asserts the
      `schedule(...)` argument tuple — the `rows` and `slices` arrays as Fast
      receives them — is identical between reads, with a second assertion on
      Fast's own order-sensitive output for that fixture. **Watched red:** drop
      the `ORDER BY` from 1.7 and both assertions must fail while the hash
      assertion in 1.3 stays green.
- [ ] 1.9 Extend 1.3's one-mutation-per-fact set with the two it was missing:
      a `parentId` reparenting that keeps every other field identical (it
      changes leaf expansion, inherited priority and floors), and a `stepId`
      identity swap between two slices of one work item. Extend 1.4's
      watched-red removals to **every** field named in 1.1, not only `reach`
      and slice order — each removal must be observed failing on the
      production path before the field is trusted.

## 2. Solver contract types, request builder, and the Bun re-validator

- [ ] 2.1 `libs/contracts/solver/solver-wire.v1.json` is the **single
      normative definition** of the request and the response — prose in this
      file, in design.md and in the long-form note is descriptive only (Sol r6
      Critical 1, Sol r7 Critical 5). It carries `wireVersion` as a required
      literal, states the unit of every numeric field, and includes every field
      staged solving needs (`fastHint`, `baselineOffsets`, `stageBudgetSplit`,
      `quantum`, `horizonUnits`, and the per-term `objectiveValues` shape).
      Exactly four consumers read that one file: the Bun request builder and
      `parseSolverResponse` in `libs/contracts/solver/src/`, the `wbs-solver`
      entrypoint (validating against the copy installed beside it with the
      pinned `jsonschema` dependency), and a shared golden corpus under
      `libs/contracts/solver/fixtures/` that both suites run. **Watched red:**
      a consumer that accepts a message the schema rejects, or rejects one it
      accepts, fails the contract test; and a TypeScript type that drifts from
      the schema fails it too.
- [ ] 2.2 `buildSolverRequest(plan, objective, baseline)` in
      `libs/contracts/solver/src/` beside the schema it validates against —
      **Bun owns duration and graph derivation, Python owns placement only.**
      Each slice carries `key` (`sliceKey`), an **integer** `durationUnits` (2.7)
      computed exactly as Fast computes it — `ASSUMED_SLICE_WORKDAYS` for a
      null `days` **without** dividing by `width`, `days / width` otherwise
      **without** `snapWorkdays`, then `× SOLVER_QUANTUM` and rounded **up**
      only when the estimate does not divide (2.7) — `width`, `personId`,
      `poolIds`, `priorityWeight`
      (the **dense rank** `(R + 1) − rank(p(s))` over the `R` distinct
      priorities present in this canonical input, `0` when no priority reaches
      the leaf — the absolute priority is never a weight, because
      `asOptionalPriority` accepts any safe integer and `P_max + 1` loses
      precision at `Number.MAX_SAFE_INTEGER`; the builder also computes the
      exact worst case `Σ w(s) × horizonUnits` and fails pre-spawn with
      `objective-overflow` above `2^62`), and
      `notBeforeUnits` (the latest of the leaf's own floor and every
      ancestor's). `edges` are already leaf-expanded with `reach` applied and
      already include the intra-item step-order edges, so Python never receives
      the tree, `parentId`, or `dep_reach`. `horizonUnits` is the **serial
      bound** `max(notBeforeUnits) + Σ durationUnits` — not the Fast makespan
      plus remaining effort, which is not an upper bound once the optimizer may
      idle a slice — checked against `2^31 − 1` before spawn (2.10). The
      request also carries `wireVersion` and `fastHint`; every field and unit
      comes from 2.1's schema rather than from this sentence.
- [ ] 2.3 `parseSolverResponse(raw: string)` — **the named framing seam.**
      Rejects anything that is not exactly one well-formed JSON line: two
      lines, trailing text after a valid line, empty stdout, an unknown
      `status`, an unknown key, a missing key.
- [ ] 2.4 `revalidateSolverResult(request, response)` — every offset present and
      non-negative, every edge respected, every `notBeforeUnits` floor
      respected, no pool over capacity at any instant (checked against **all**
      of a slice's `poolIds`, since the whole width is spent in each), no
      assignee double-booked, and `objectiveValues[T].value` recomputed from
      the final offsets and matched. **`value` is the only recomputed field**
      (Sol r7 Critical 1): `stageValue`, `bound` and `status` are statements
      about a stage, not about the published schedule, and a later stage may
      legitimately improve an earlier term below its own incumbent, so
      recomputing against `stageValue` would reject valid answers. The one
      cross-field relation that must hold **is** checked: `value <= stageValue`
      whenever both are present, because every later stage adds an inequality
      at `stageValue` and a published value worse than it is a real contract
      violation. **Watched red:** a response whose `value` disagrees with the
      offsets is rejected; a response whose `value` is strictly better than
      `stageValue` is **accepted**; a response whose `value` is worse than
      `stageValue` is rejected.
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
      the pre-quantisation `days / width` from 2.2 and watch 2.6's width case fail.
      `Proof:` comment names each removed check. Re-validation is the only thing
      standing between a wrong solver and a published schedule; a check that
      cannot fail is exactly the failure mode AGENTS.md R5 names.
- [ ] 2.8 `SOLVER_QUANTUM = 48` exported from `libs/domain`, and
      `durationUnits(slice)` = `Math.ceil(durationOf(slice) * SOLVER_QUANTUM)`
      with an exact-multiple assertion within `DRIFT` before the ceiling
      applies. **Fast's real arithmetic, restated because the plan had it
      wrong:** `durationOf` returns `ASSUMED_SLICE_WORKDAYS` for `days === null`
      **without** dividing by `width`, and `days / width` otherwise **without**
      calling `snapWorkdays`; `snapWorkdays` only removes drift near an integer
      and preserves genuine fractions. **Watched red:** a `days: 1, width: 2`
      fixture must read 0.5 workdays end to end; a `days: null, width: 3`
      fixture must read `ASSUMED_SLICE_WORKDAYS`, not a third of it.
- [ ] 2.9 The re-validator rejects any offset that is not a non-negative
      integer unit within `horizonUnits`. **Watched red:** feed it a
      fractional offset and a negative one.
- [ ] 2.10 `horizonUnits > 2**31 - 1` fails before spawn with
      `horizon-overflow`, and the `Σ w(s) × horizonUnits` worst case past
      `2^62` fails before spawn with `objective-overflow`; both are It is a **first-class member of the one failure state
      machine** (7.1), not a bare return from request construction: it writes
      the same `status='failed'` marker row and emits the same
      `schedule_optimization_failed` event as any other reason, so a client
      already showing `Optimizing…` reaches Retry rather than waiting on a
      child that was never spawned. **Watched red:** a synthetic plan past each
      bound must not reach a process, and both a connected client and a freshly
      loaded one must reach `Optimization unavailable · Retry`.
- [ ] 2.11 The **quantised Fast baseline**: re-run Fast's placement over the
      rounded durations to produce `fastHint` and `baselineOffsets` in integer
      units, and take stage 1's upper bound from **that**, never from real
      Fast. **Watched red** — the fixture that proves the earlier plan was
      wrong: three serial slices with `days=1, width=5` (real Fast finishes at
      28.8 units, the rounded model needs 30). Assert the hint is feasible,
      `MOVEMENT` is defined against it, and the stored variant's primary term
      measured in the real domain is no worse than real Fast's, falling back to
      Fast's own materialised schedule tagged `'quantisation-floor'` (6.x
      publication guard) when quantisation costs more than the search won.

## 3. Cache, slot and queue tables (PROD MODE — reviewed PR, no self-merge)

- [ ] 3.1 `optimized_schedule_cache` in `apps/be-01/src/repository/schema.ts`:
      composite PK `(projectId, inputHash, objective, contractVersion,
      budgetMs)` → `generation`, `status` (`'ok' | 'failed'`), `resultJson`
      (NULL iff failed), `failureReason` (NULL iff ok), `createdAt`.
      Integrity is declared, not assumed: `projectId` FK to `project(id)`
      `ON DELETE CASCADE`; `CHECK (status IN ('ok','failed'))`;
      `CHECK ((status='ok' AND resultJson IS NOT NULL AND failureReason IS
      NULL) OR (status='failed' AND resultJson IS NULL AND failureReason IS
      NOT NULL))`; `CHECK (objective IN ('pri','time'))`.
- [ ] 3.2 `optimization_generation`: PK `(projectId, contractVersion)` →
      `generation` (integer not null), `inputHash` (text nullable),
      `cancelEpoch` (integer not null default 0), `updatedAt`. This is the sole
      home of the generation identity; it is deliberately **not** on `project`,
      because `SCHEDULER_CONTRACT_VERSION` is bumped while blue and green run
      against one file and a single project-row pair would let the release
      computing H1 and the release computing H2 alternately increment one
      counter and delete each other's rows for ever.
      `solver_slot`: PK `(projectId, contractVersion, generation, objective)` →
      `ownerId`, `attemptToken`, `pid`, `startedAt`, `heartbeatAt`,
      `cancelRequestedAt`. `solver_queue`: PK
      `(projectId, contractVersion, objective)` — **not** keyed by generation,
      so a project holds at most one queued entry per objective per contract
      version and a new generation replaces rather than accumulates — with
      columns `generation`, `admittedCancelEpoch`, `enqueuedAt`, and an index on
      `(enqueuedAt, projectId, contractVersion, objective)`. The dequeue order
      is `ORDER BY enqueuedAt, projectId, contractVersion, objective`, which is
      total (Sol r7 Minor 15): `objective` breaks the tie between a project's
      PRI and Time entries enqueued in the same millisecond, and
      `contractVersion` breaks the tie between blue and green enqueuing the
      same project and objective in that same millisecond. All three companion
      tables carry `projectId` FK to `project(id)` `ON DELETE CASCADE`, so
      deleting a project cannot leave rows consuming the global 16-slot budget.
      Retirement: an `optimization_generation` row untouched for
      `GENERATION_RETENTION_DAYS = 30`, or whose contract version is retired at
      deploy, is deleted with its cache, slot and queue rows.
- [ ] 3.3 Forward migration under `apps/be-01/drizzle/` — additive only. Blue
      and green share one SQLite file during a swap, so the outgoing release
      must keep running against the migrated file untouched.
- [ ] 3.4 **Proven by** `optimized-schedule-cache.db.test.ts`: forward migration
      creates the four tables; it is idempotent on an already-migrated file; a
      rollback and re-apply leave every pre-existing table intact; the outgoing
      release's queries still run after the migration; each CHECK rejects its
      malformed row (an `ok` row with a NULL `resultJson`, a `failed` row
      with one, an unknown `objective`); and deleting a project cascades its
      cache rows away.
- [ ] 3.5 **Negative check, watched red** — drop the status/nullability CHECK
      and watch 3.4's "an `ok` row with a NULL `resultJson` is rejected" case
      fail. `Proof:` comment names the removed constraint. SQLite text columns
      otherwise hold any combination a past bug wrote.
- [ ] 3.6 This slice touches `apps/be-01/drizzle/**`, a prod-mode path: PR with
      green CI and a real review, `status: review`, no self-merge.
- [ ] 3.7 `down.sql` beside `migration.sql` — AGENTS.md mandates it, migration
      lint and `readMigrationFolders` refuse without it, and an aborted
      blue/green deploy cannot return to the applied set. Proved by
      apply → rollback → re-apply against the applied set, not by inspection.
- [ ] 3.8 `CHECK (failure_reason IS NULL OR failure_reason IN
      ('timeout','invalid-output','no-solution','internal-error','oom',
      'horizon-overflow','objective-overflow'))` — any non-null text was
      previously accepted.
- [ ] 3.9 **Proven by** `optimization-generation.db.test.ts`, run through the
      production repositories: a blue/green pair with two distinct
      `contractVersion` values neither reallocates nor deletes the other's
      rows, while a real plan edit still fences both; deleting a project
      cascades its generation, slot and queue rows away; and a retired contract
      version's rows are removed with everything keyed to them. **Watched red:**
      move the generation back onto `project` and the blue/green case must
      fail.

## 3b. Project settings columns and API (PROD MODE — reviewed PR, no self-merge)

- [ ] 3b.1 Additive migration on `project`: `optimization_enabled` boolean not
      null default **false**, `schedule_engine` text not null default `'fast'`,
      `schedule_objective` text not null default `'pri'`. The defaults are
      what make OFF-by-default true for every existing row; no backfill can
      guarantee that retroactively. The generation counter, the input hash and
      the cancel epoch are **not** added here (Sol r7 Critical 4): they are per
      contract version and live in the `optimization_generation` table slice 3
      creates.
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
- [ ] 3b.7 `down.sql` plus rollback-then-re-apply coverage for all three added
      columns.
- [ ] 3b.8 `CHECK (optimization_enabled IN (0,1))`, `CHECK (schedule_engine IN
      ('fast','optimized'))`, `CHECK (schedule_objective IN ('pri','time'))`,
      and explicit read-time validators `isScheduleEngine` /
      `isScheduleObjective` in the project mapper that throw naming column and
      value — the shape `toProject` already uses for `estimateMethod`,
      `depReach` and `estimateRounding`. **Watched red:** write an unknown
      value for each of the three and the boolean directly and read through
      the production path.

## 4. Cache read/write, generations, validity and the failed marker

- [ ] 4.1 Repository functions: read the pair for the full key; write an `ok`
      row; write a `failed` row; allocate the next generation in the
      `optimization_generation` row for `(projectId, contractVersion)` **and**
      delete that contract version's older-generation cache and queue rows in
      one transaction — **slot rows are not deleted**, because freeing the
      count before the children are proved dead is what let six real children
      run while SQLite counted two. Neither write is a blind `upsert`: each is
      a conditional insert whose transaction first asserts the writer's own
      live `solver_slot` row still carries its `attemptToken`, and whose
      `WHERE` also requires the generation still current for that contract
      version, the cancel epoch unchanged, and `optimization_enabled` still 1.
      A superseded run therefore cannot store, evict, overwrite an `ok` with a
      `failed`, or emit a second outcome record for one key.
- [ ] 4.1b Retention, both rules. (1) Allocation deletes that contract
      version's older-generation cache rows. (2) A committing outcome keeps the
      `MAX_LIVE_BUDGETS = 2` most recently written budgets for
      `(projectId, objective, contractVersion, inputHash)` and deletes the
      rest. **Rule 2 is a bound, not an exclusion** (Sol r7 Important 9): the
      earlier "delete every other row whose `(inputHash, budgetMs)` differs"
      made a budget change a livelock, because a config change is not a code
      change, so blue and green can read 60000 and 120000 under one
      `contractVersion` and each deleted the other's row on every store —
      alternating solves for ever on an unchanged plan and holding the 4/16
      ceilings busy. The per-contract generation table cannot fix that; only
      the bound can. **Proven by** (a) raising `budgetMs` three times and
      bumping `contractVersion` with no plan edit, asserting at most two rows
      per project per objective per live contract version; and (b) a two-release
      fixture reading different budgets against one file — each stores once,
      each then hits its own row, and the injected spawner sees exactly two
      solves across ten alternating reads. **Watched red:** restore the
      exclusive rule and (b)'s spawn count must rise with every read.
- [ ] 4.2 **Proven by** `optimized-cache.db.test.ts`: same input → hit with
      **zero calls on the injected spawner** (asserted on the spawner, not on
      elapsed time); a changed effort, edge or pool → miss; a `contractVersion`
      bump → miss; a **raised `budgetMs` → miss** (the old smaller-budget row is
      not served); a `status='failed'` row never satisfies a read and is
      overwritten by the next run for that key; a new generation deletes every
      prior row for that project including its `failed` ones; an undo to a
      previous hash misses; and a row whose `resultJson` fails to decode is
      **left in place** and reads as `corrupt` (4.8), never deleted and never
      treated as a miss.
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
- [ ] 4.8 `isOptimizedStatus` / `isObjective` / `isFailureReason` validators on
      the cache read path, throwing rather than casting or defaulting.
      **Watched red:** an unknown value for each, injected as a stored row.
      A row whose `resultJson` fails to decode is **left in place**, not
      deleted (Sol r7 Important 13): the earlier "delete it and treat it as a
      miss" contradicted the decoder throwing, contradicted AGENTS.md R5, and
      silently turned corruption into a read-triggered solve — the timer retry
      Dany rejected, arriving through the cache instead of the clock. The
      variant reads as the sixth state `corrupt`, carrying the decoder's
      message; it never satisfies a read and never auto-spawns, exactly like
      `failed`, and Retry overwrites it through the ordinary admission path.
      **Watched red:** write a truncated and a wrong-`dtoVersion` `resultJson`
      directly, read through the production path — the row survives, the
      payload reads `corrupt` with the reason, ten reads spawn nothing, one
      Retry produces exactly one child; then restore the delete-and-miss
      behaviour and the spawn-count case must fail.
- [ ] 4.9 `materialiseOptimized(canonicalInput, offsets)` in `libs/domain`
      is what produces the `schedule` member of `resultJson`; the offsets map
      is never persisted or
      returned as a schedule. Fast has **no** annotation-only pass to call, so
      4.7 begins by splitting `placeSlices` into `chooseStarts(canonicalInput)`
      and `annotate(canonicalInput, starts)`, proved behaviour-preserving by
      the existing Fast golden corpus **before** anything optimized is built on
      it (4.9 begins with that split); `materialiseOptimized` is then
      `annotate` over the dequantised
      offsets. `annotate` replays the person and pool ledgers in ascending
      start with ties broken by the canonical slice order, calling the
      **existing** `jointWindowFor(poolIds, …)` and `reserve(poolIds, …)`
      unchanged — the whole width in **every** named pool, which is what
      `Slice.poolIds` and Dany's 2026-08-13 decision 3 say and what Fast does
      (Sol r7 Critical 3). "First pool in sorted `poolIds` with free capacity"
      is struck: it was a different resource model that could accept a
      materialised schedule overbooking a second team, and a different
      resource-successor graph, float and wait count. `capacityPredecessorIds`
      is `jointWindowFor`'s **accumulated** blocking set across rounds and
      pools, never the releases at exactly the pinned start;
      `capacityTeamId` is `binding`'s own rule — the pool whose blocking set
      holds the latest finisher, ties by pool id. A joint window strictly later
      than the pinned start is `invalid-output`. `annotate` derives from those
      ledgers the resource-successor edges `lateTimes` consumes — so `duration`, `estimated`, earliest/latest, `float`,
      `critical`, `boundBy`, `resourcePredecessorId`, `capacityPredecessorIds`,
      `capacityTeamId`, `width`, `effort`, the work-item projections and both
      wait counters come out of the one code path that produces them today,
      with resource edges and late times derived from the **optimized**
      placement rather than copied from Fast.
- [ ] 4.10 The floor precedence is the complete ordered list `projectStart |
      notBefore | predecessor | stepOrder | person | capacity | optimizer`; the
      earlier list stopped at `notBefore` and would have labelled a
      person-bound or capacity-bound optimized slice `optimizer`, erasing its
      resource predecessor, its team and both wait counts.
      `ScheduleFloor` gains the additive member `'optimizer'`, used exactly
      when a start is strictly later than every floor of its slice — an
      optimizer may deliberately idle a low-priority slice and that start has
      no value in today's union. `floorWordsOf` gains its case. The render
      invariant holds: under `'optimizer'`, `resourcePredecessorId` is null,
      `capacityPredecessorIds` is empty and `capacityTeamId` is null, so
      "set exactly when `boundBy === 'capacity'`" is still true.
- [ ] 4.10b **Two orders, not one** (Sol r7 Important 7). Ledger replay is
      chronological (ascending start, canonical tie-break); the order handed to
      `lateTimes` is a **topological** order of the augmented graph — plan
      edges, step-order edges and the reconstructed resource-successor edges —
      computed by Kahn with the ready set drained in ascending
      `(start, canonical slice order)`, so it stays fully determined by the
      hashed input. Chronological order is not topological on legal data:
      `durationOf` preserves an explicit `days: 0`, `windowFor` treats a zero
      duration as legal no-work, so a zero-duration predecessor and its
      successor can share a start and the id tie-break can order them
      backwards — after which `lateTimes`, which walks its `order` backwards
      and immediately reads `late[next].latestStart`, reaches the predecessor
      before the successor has a `Late`. Fast is audited for the same hazard in
      this slice and fixed the same way if `placeSlices`' placement order can
      produce it. **Watched red:** a two-slice fixture with a zero-duration
      predecessor whose id sorts **after** its successor, sharing one start —
      passing chronological order to `lateTimes` must throw or produce a wrong
      `latestStart`, and the topological order must not.
- [ ] 4.11 Materialiser proofs run **through the real plan-read payload**
      (`work-item.service.ts`), not against the domain type. **Watched red:**
      (a) return Fast's own annotations against optimized dates — the float
      and `boundBy` assertions must fail; (b) report a deliberately idled
      slice as `projectStart` instead of `'optimizer'`; (c) set
      `capacityTeamId` on an `'optimizer'` slice — the render invariant test
      must fail; (d) **the contended two-pool case, on the production path**
      (Sol r7 Critical 3): one slice naming two pools that each have room only
      after different reservations end, so the joint window is later than
      either pool's own earliest fit. Reserve into only the first pool and the
      second pool's capacity assertion must fail; take `capacityPredecessorIds`
      from the releases at exactly the pinned start and the accumulated-set
      assertion must fail; take `capacityTeamId` as the first sorted pool and
      the latest-finisher assertion must fail.
- [ ] 4.12b The cached row stores an **`OptimizedResult`, not a bare schedule**
      (Sol r7 Critical 6). `objectiveValues` is what records how far a
      partially staged run got, and the publication guard must persist
      `'quantisation-floor'`, but `Schedule` carries neither and the cache had
      only `scheduleJson`, so both were discarded at storage. The column
      becomes `resultJson` holding
      `{ dtoVersion, publication: 'solver' | 'quantisation-floor',
      objectiveValues: Record<'makespan'|'priority'|'movement', ObjectiveValue>,
      schedule: <encodeSchedule(schedule)> }`, with `ObjectiveValue =
      { value, stageValue, bound, status }` exactly as the matrix defines it,
      and `encodeOptimizedResult` / `decodeOptimizedResult` as the seam.
      `publication` is stored rather than inferred, because a
      `quantisation-floor` row **is** Fast's schedule and the comparison
      indicator must not present it as a solver win. **Watched red:** a
      partially staged row (`status: 'unknown'` on the last term) and a
      `quantisation-floor` row each reload through SQLite and the real plan
      read with every field intact; a `resultJson` holding a bare
      `encodeSchedule` output makes `decodeOptimizedResult` throw naming the
      missing `dtoVersion`; and storing through the old
      `scheduleJson`-shaped write makes the metadata assertions fail.
- [ ] 4.12 `CACHE_DTO_VERSION`, `encodeSchedule`, `decodeSchedule`
      in `libs/domain`: both `Map`s become arrays of entries sorted by key, and
      `waitingForPerson`, `waitingForCapacity` and `eventsVisited` are stored,
      because `JSON.stringify` renders a `Map` as `{}` and an implementation
      could pass every type-level test and store a row that reloads empty.
      `decodeSchedule` throws naming the defect on an unknown `dtoVersion`, a
      duplicate key, a key disagreeing with its entry's own slice key, or a
      missing projection. **Watched red:** a non-empty round trip through
      SQLite and the real plan read, plus those three negatives.

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
      optimize a term, then constrain it for the later stages **exactly as
      the design's stage-status matrix says and never otherwise**: an equality
      only when the stage proved OPTIMAL, `term <= incumbent` for FEASIBLE and
      for UNKNOWN-with-incumbent, stop-and-publish-the-previous-incumbent for
      UNKNOWN-without at a later stage, `no-solution` for UNKNOWN-without at
      the first stage, and `invalid-output` for INFEASIBLE at any stage. That
      matrix is the single authority; this task restates none of it. Never a
      weighted sum, which overflows on realistic horizons. Neither is a total order; ties
      exist and are not broken reproducibly in production.
- [ ] 5.3 **Proven by** the Python suite (CI only) — unit: each of the three
      cost terms computed on a hand-built instance, both stagings, request
      parse round-trip, response serialization.
- [ ] 5.4 **Proven by** the oracle cases: 2–6 slice hand-verified instances with
      known optimal offsets per objective, including one where PRI and Time
      disagree, one exercising `notBeforeUnits`, one exercising a two-pool
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
- [ ] 5.8 Staged optimization implements the exact anytime rule:
      `STAGE_BUDGET_SPLIT = [0.60, 0.25, 0.15]` with early remainder donated
      forward; OPTIMAL fixes an equality; FEASIBLE or UNKNOWN-with-incumbent
      adds `term <= incumbent` (**never** an equality — fixing an unproven
      incumbent is not lexicographic minimisation). **Every remaining outcome
      defers literally to design.md's stage-status matrix, which is the single
      authority** (Sol r7 Critical 2); this task states no rule of its own,
      because the two that were stated here contradicted it. In particular:
      UNKNOWN with no incumbent reports `no-solution` **only at stage 1** and at
      `k > 1` publishes the previous stage's incumbent, and INFEASIBLE reports
      `invalid-output` **at every stage**, not only at stage 1, since Fast
      placed the same input and every later stage only adds inequalities to a
      feasible model. The published result is the last stage's incumbent,
      feasible by construction. `objectiveValues` reports `{ value, bound,
      status }` per term, with `value` defined in 5.8b.
- [ ] 5.9 Fast's placement is supplied as both a CP-SAT solution hint and an
      upper bound on stage 1's term, which is what makes the only guarantee
      the design now claims — *each variant's primary term is no worse than
      Fast's* — true under a wall-clock budget. **Watched red:** remove the
      bound and run a fixture where the search's first incumbent is worse than
      Fast on that term.
- [ ] 5.10 Replace 5.7's weighted-sum mutation, which could stay green: on a
      bounded 2-6 slice fixture, sufficiently large coefficients encode the
      same lexicographic order exactly, so PRI/Time disagreement proves
      nothing about staged versus weighted. The mutation instead substitutes
      the implementation's **own** coefficient constants into a fixture built
      so the second term's swing exceeds the first term's coefficient gap —
      an answer that necessarily changes — plus a separate integer-overflow
      guard test for the weighted form's bound.
- [ ] 5.11 Packaging into the deployed artifact: the Dagger/image path installs
      the pinned Python runtime and the locked OR-Tools environment, copies
      the package and entrypoint into the be-01 runtime, and exposes the
      installed version to the coordinator as the `solverVersion` half of
      `contractVersion`. An Nx target runs the Python suite in the gate.
      **Watched red:** build the image without the package; the spawn proof
      must fail with `internal-error` rather than silently falling back.

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
- [ ] 6.3 `solver_queue` FIFO ordered by `enqueuedAt`, then `projectId`, then
      `contractVersion`, then `objective` — the last two terms are what make
      the order total, because a project's PRI and Time entries can share a
      timestamp and blue and green can enqueue the same project and objective
      in that same millisecond (Sol r7 Minor 15) — one entry per
      `(projectId, contractVersion, objective)`. Enqueue **persists the cancel
      epoch it was admitted under** as `admittedCancelEpoch`; without a stored
      epoch the dequeue re-check has nothing to compare against (Sol r7
      Important 8). Dequeue re-reads the `optimization_generation` row and
      discards the entry without launching if its generation is no longer
      current, `cancelEpoch != admittedCancelEpoch`, or the project's toggle is
      no longer ON. **Watched red:** enqueue PRI and Time at the identical
      timestamp and assert a single deterministic dequeue order; enqueue the
      same project and objective from two contract versions at that same
      timestamp and assert the same; toggle OFF while an entry is queued and
      assert it is discarded without a spawn; drop `admittedCancelEpoch` and
      the OFF-while-queued case must fail.
- [ ] 6.4 Cancellation, and the two paths are **not** the same operation. A
      newer edit changes the hash and therefore allocates the next generation.
      An **OFF toggle does not**: the toggle is excluded from the hash, so
      allocation is required to reuse the generation for an unchanged hash and
      "OFF allocates the next generation" was unimplementable. OFF is one
      transaction that clears `optimization_enabled`, increments `cancelEpoch`
      for every contract version of the project, sets `cancel_requested_at` on
      all of that project's `solver_slot` rows and deletes its queue rows.
      Owners observe the durable signal on their heartbeat round trip and kill
      their child, so a child owned by the *other* backend is cancelled too — a
      local process handle cannot reach it and `PR_SET_PDEATHSIG` is irrelevant
      while that coordinator is alive. Both paths reject with a typed
      `cancelled` outcome and write no row. Idempotent and project-scoped.
- [ ] 6.4b **Proven by** `optimization-cancel.two-coordinator.test.ts`: blue
      owns a live PRI child and a live Time child, green serves the settings
      PATCH turning optimization OFF. **Watched red** with the epoch condition
      removed: both real children exit within one heartbeat interval, and
      neither can store a result, write a failure marker, or emit any event.
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
- [ ] 6.9b **The empty project bypasses both solvers** (Sol r7 Important 12).
      A project with no slices is legal — `schedule` handles it explicitly with
      `projectFinish = Math.max(0, ...placedFinishes)` and empty maps — but
      `MAKESPAN = max finish` and `horizonUnits = max(notBeforeUnits) +
      Σ durationUnits` have no empty-set identity, so both maxima were
      undefined on a plan the product allows. The coordinator short-circuits: a
      canonical input with zero slices, or one whose durations are all zero,
      allocates no slot, spawns nothing, writes no cache row and emits no
      event; the plan read returns Fast with every variant `idle`. **Watched
      red:** a cold read with optimization ON and zero work items — no call on
      the injected spawner, no row, no event, and a renderable payload; then
      add and delete the only work item and assert the same, since that
      transition is what would otherwise leave a stale row. Remove the
      short-circuit and the spawner assertion must fail.
- [ ] 6.10 Generation allocation is one transaction against the
      `optimization_generation` row for `(projectId, contractVersion)`, and
      there is exactly one allocation algorithm in this plan — 4.1's (Sol r7
      Critical 4). Equal `inputHash` reuses the generation; a different or NULL
      hash sets the hash and increments under
      `WHERE project_id = :p AND contract_version = :c AND generation = :seen`,
      deleting that contract version's previous-generation **cache and queue**
      rows in the same transaction and marking its `solver_slot` rows
      `cancel_requested_at` **without deleting them**, so the row count stays
      an upper bound on live children. A first enable, or the first appearance
      of a new `contractVersion`, has no row to compare against: allocation
      therefore begins with an `INSERT … ON CONFLICT DO NOTHING` of
      `(generation = 1, inputHash = :H, cancelEpoch = 0)` and re-reads, so two
      concurrent first writers coalesce onto one generation rather than one
      failing (Sol r7 Important 8).
      **Watched red:** two concurrent allocators for one hash must produce one
      generation and one child per objective; two concurrent *first* allocators
      for a project that has never optimized must produce one row and one
      child per objective; an allocator for a different hash must not coalesce
      onto the current slot; a restart on an unchanged hash must allocate
      nothing; and deleting the slot rows at allocation must make 6.7's
      two-instance ceiling case fail.
- [ ] 6.11 Slot fencing: admission mints an unforgeable 128-bit
      `attemptToken`; heartbeat, release, the outcome write and the event write
      all carry it. Reclamation mints a new token and cannot run before the
      child's own hard deadline —
      `SLOT_HEARTBEAT_TTL_MS = solverBudgetMs + 5000 + SLOT_RECLAIM_MARGIN_MS`
      (15 s) — and the child arms that deadline itself. `PR_SET_PDEATHSIG` is
      followed by a `getppid()` re-check so a parent dying inside that window
      is not missed. **Watched red:** an old owner's late heartbeat, release and
      write each match zero rows; sampled OS process count never exceeds 4 per
      project or 16 globally across rapid generations under two coordinators.

## 7. Failure path and events

- [ ] 7.1 Non-zero exit, timeout, OS kill, OOM and failed re-validation each
      write exactly one `status='failed'` row with a typed `failureReason`
      (`timeout | invalid-output | no-solution | internal-error | oom | horizon-overflow | objective-overflow`), keep
      Fast visible, and never retry — not on a timer, not on a read, and not on
      a same-hash edit. A **cancelled** run writes no row at all. Failure is
      variant-specific. **"Publish nothing" is struck** (Sol r7 Important 14):
      in this codebase `GatewayBroadcaster.publish` *is* the event operation, so
      the phrase read as a prohibition on the failure event that 7.4 and 7.6
      require. The rule is exact — a failure publishes **no**
      `schedule_optimized` and stores no schedule, and it **does** publish
      exactly one `schedule_optimization_failed` in the same transaction as its
      marker row, including for a pre-spawn `horizon-overflow` or
      `objective-overflow`.
- [ ] 7.2 `schedule_optimized` added to `ProjectEvent` in
      `apps/be-01/src/service/broadcast.ts`, carrying `(projectId, generation,
      inputHash, objective, contractVersion, budgetMs)` (7.7). **The cache row
      and the `event_log` record are written in one SQLite transaction** and the
      broadcaster pushes from the committed record, so the guarantee is one
      durable replay record per newly stored outcome plus one best-effort
      post-commit push (7.9), idempotent for receivers. Never emitted on a
      cache hit.
      Toggle/Engine/Objective changes emit `project_settings_changed` (3b.3)
      instead.
- [ ] 7.3 Retry is a route, not an unnamed "action": its contract, statuses
      and authorization are 7.11. It re-reads the current `inputHash`, refuses
      a moved plan with the current hash in the body, then launches only the
      failed or absent variant for the unchanged key. Its `failed` row is
      **overwritten by the replacement outcome, never deleted first**, so
      concurrent reads see `retrying` rather than `failed` or a cold miss that
      would auto-spawn.
- [ ] 7.4 **Proven by** `optimization-failure.test.ts` and
      `optimization-events.test.ts`: each of the seven failure kinds — including the two pre-spawn ones, `horizon-overflow` and `objective-overflow`, which write the marker and emit the failure event although no process ever started — keeps Fast
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
- [ ] 7.6 A newly written failure marker emits `schedule_optimization_failed`
      in the same transaction as the row, carrying `(projectId, generation,
      inputHash, objective, contractVersion, budgetMs, failureReason)` and no
      schedule. Without it the read returns Fast, success emits
      `schedule_optimized`, and failure emitted nothing — so a client on
      screen sat at `Optimizing…` for ever and manual-only Retry was
      unreachable. A cache **hit** still emits nothing; a hit is not a new
      outcome. **Watched red:** both variants fail with no other event; the
      client must reach `Optimization unavailable · Retry` with no refresh.
- [ ] 7.7 `budgetMs` joins both event identities. It is a cache-key column and
      changes neither hash nor generation, so without it a larger-budget
      result announced itself under the smaller-budget identity and a client
      holding that identity ignored the only notice that should move it.
      **Watched red:** raise the budget, store, assert the client refetches.
- [ ] 7.8 Name the seam rather than assume it: `EventLogRepo.recordEventIn(tx,
      subscription, message, createdAt)` writes inside the caller's
      transaction, and `GatewayBroadcaster.pushRecorded(subscription,
      recorded, event)` buffers and pushes an already-recorded sequence
      without recording it twice; today `recordEvent` opens its own
      transaction and `publish` does both. `publish` becomes those two calls.
- [ ] 7.9 The guarantee is narrowed in every artifact to **one durable replay
      record plus one best-effort post-commit push** — `event_log` is a replay
      buffer consulted on resume, not a dispatched-and-acknowledged outbox,
      and a process can die after commit and before the push, so "delivered
      at least once" over a live socket was false. **Watched red:** kill
      between commit and push; the record must exist and a client resuming
      from its last sequence must receive it.
- [ ] 7.10 The plan-read DTO: `tree()` returns an `optimization`
      block — `enabled`, `engine`, `objective`, `inputHash`, `generation`,
      `contractVersion`, `budgetMs`, `displayed`, `variants: { pri, time }`,
      `comparison` present iff `displayed !== 'fast'`. A variant is `ready`,
      `pending`, `retrying`, `failed` with reason, or `idle`, distinguished by
      the cache row **together with** a live slot or queue entry — which is
      what lets a retry in flight read as `retrying` while its marker row
      survives, instead of forcing either a permanent "unavailable" or a
      delete that would make the next read auto-spawn. Arrays hold Fast unless
      the selected variant is `ready`. **Proven through the real controller
      payload** in the cold, queued, retrying, failed, partial-success and
      full-hit states.
- [ ] 7.11 `POST /api/projects/:projectId/optimization/retry`, body
      `{ objective, inputHash }`, under the same project-write authorization as
      the settings PATCH, running the ordinary admission transaction so two
      concurrent retries produce one child. `202` with the new state,
      generation and hash; `409 stale-input-hash` carrying the current hash;
      `409 already-running`; `409 not-failed`. The marker is never deleted
      before its replacement outcome commits.

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
- [ ] 8.7 `sameOrder(a, b)` is the exact relation, computed server-side on the
      **materialised** schedules and shipped as one boolean beside the
      day-count delta: it holds iff for every pair of slices present in both,
      `sign(startA(s) - startA(t)) === sign(startB(s) - startB(t))` compared in
      the **real fractional-workday domain**, never in quantised units (Sol r7
      Important 10) — real Fast's starts need not lie on the 1/48 grid, so two
      distinct Fast starts can collapse to one unit and rounding can reverse a
      tie, and the quantised rule would then label the same pair differently
      from design.md and the spec. It is blind to a uniform shift and to
      iteration order, and it treats ties as first-class — a tie broken and a
      tie created are both reordered. **Watched red / scenarios:** uniform
      two-day shift (same order, later deadline); a tie broken (reordered); a
      tie created (reordered); a zero-duration slice moved across another's
      start (reordered); and a **fractional fixture whose verdict differs
      between the two domains** — two slices 1/96 of a workday apart, same
      order in the real domain and tied after quantisation — which is the only
      case that proves the domain choice, since the whole-day and tie cases
      pass under either rule. Client-side computation is forbidden, so client
      and server cannot label the same pair differently.
- [ ] 8.8 The failure indicator is driven by `schedule_optimization_failed`
      rather than by a refetch, and shows per variant.
- [ ] 8.9 The FE mirror in the same slice as the union change:
      `ScheduleFloor` in `apps/fe-01/src/lib/wbs-api.ts` and the exhaustive
      `floorWordsOf` switch in
      `apps/fe-01/src/components/wbs/gantt-geometry.ts` gain `'optimizer'`.
      **Watched red:** three optimized fixtures whose starts are respectively
      equal to a person floor, equal to a capacity floor, and strictly later
      than both — asserting predecessor edges, late times, both wait counters,
      the API union and the hover words, so a resource-bound optimized slice
      keeps its explanation instead of being labelled `optimizer`.

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

