<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.

Slices 1-6 are TASK-231 (storage + API). Slices 7-9 are TASK-232 (history and
comparison UI) and start only after slice 6 is merged.
-->

## 1. The term, and the canonical plan-input value

- [ ] 1.1 CONTEXT.md gains **Saved plan**, next to Plan document, saying what it
      is and what it is not: never exported, never imported, never applied to a
      project. `_Avoid_: snapshot, checkpoint, backup, version`. Plan document's
      own entry is untouched — it already avoids `snapshot`, which is why this
      term exists.
- [ ] 1.2 `CanonicalPlanInput` in `libs/domain/src/saved-plan/` — the closed
      field list from spec.md, which enumerates the project metadata and the
      work-item columns rather than gesturing at them, and includes
      `frozen_number`, `service_team_id`, `service_id`, `person_team`,
      `team_service`, and the referenced `tag` / `work_item_type` /
      `external_system` rows by value (id and name), because the items store only
      ids into live renameable registries. JSDoc says why the list is closed and what is deliberately
      outside it: `project_access` and anything recording who last opened what,
      the audit columns (`created_at`/`updated_at`/`created_by` are about
      editing, not about the plan), `work_item.revision` and `project.revision`
      (write counters — two identical plans would diff as changed), and
      `broadcast.latestSeq`. Types only, no reads.
- [ ] 1.3 `canonicalisePlanInput(values)` — a pure function from already-read
      rows to `CanonicalPlanInput`, with a **stable** key order and a stable
      ordering of every collection, because the SHA-256 is taken over its
      serialization. Test: two calls over the same rows supplied in a different
      row order serialize to identical bytes. Negative: sort dropped from work
      items, watched failing on the byte comparison.
- [ ] 1.4 A round-trip property test over a generated plan: canonicalise,
      serialize, parse, canonicalise again — identical bytes.

## 2. The tables

- [ ] 2.1 `schema.ts`: `saved_plan` and `saved_plan_body` as in design.md.
      `ON DELETE CASCADE` header→project and body→header. `created_by` is a
      **value**, not a reference — the JSDoc says why (an account deletion must
      not orphan a permanent record).
- [ ] 2.2 One additive migration folder plus a `down.sql` that drops both
      tables. Watched: `readMigrationFolders` refuses an empty `down.sql`, so the
      down file is proved by running the rollback and reading `pragma table_info`
      back, not by an exit code.
- [ ] 2.3 **The cascade is enforced, not merely declared.** `steps-schema-rename`
      shipped a `REFERENCES` clause SQLite had not applied and the check written
      for it passed against the broken database. So: write a header and a body,
      delete the project, and assert both rows are gone by reading the tables —
      and assert the delete itself was not blocked.
- [ ] 2.4 **No `UPDATE` ever targets `saved_plan_body`, and none targets any
      `saved_plan` column except `name`.** A source check over `repository/**` in
      the shape of `audit.test.ts`, scoped to both tables — the header scope is
      not optional: `input_sha256`, `schedule_sha256`, `schedule_input_sha256`
      and `scheduler_algorithm_id` live there, and one `UPDATE` of
      `schedule_input_sha256` makes 5.2's check pass for a schedule computed from
      a different input. Negatives, both watched: an `update(savedPlanBody)` call
      added, and an `update(savedPlan).set({ inputSha256 })` added. This is the
      immutability property; a comment cannot hold it.

## 3. The capture, inside one read snapshot

- [ ] 3.0 **The scheduling algorithm identity.** No such constant exists in the
      checkout (no `SCHEDULE_ALGORITHM`, `schedulerAlgorithm` or `algorithmId` in
      `libs/domain` or `apps/be-01`). Define it in `libs/domain` beside
      `schedule()`, with JSDoc stating the rule that moves it: any change to
      `schedule()`'s semantics — TASK-219's dual objective and TASK-240's deadline
      both qualify — bumps it in the same commit. Without the rule the column is a
      constant, stored plans read "same algorithm" across a semantics change, and
      the silent restatement it exists to prevent happens anyway.
- [ ] 3.1 `SavedPlanCaptureRepository.readPlanInput(projectId)` — every read of
      the projection inside one `BEGIN DEFERRED` on a read connection. JSDoc names
      the **twelve** plan reads it replaces (ten at
      `apps/be-01/src/service/work-item.service.ts:1285-1312`, three at
      `:1364-1385`, minus `broadcast.latestSeq`, which is a refresh cursor and is
      not captured), and why a revision counter cannot substitute.
      **All twelve run sequentially on one explicitly held connection inside a
      single transaction block.** A pooled handle checked out per `await` gives
      each read its own connection and therefore its own snapshot, and the
      transaction is torn while every line still reads as if it were not — 3.2's
      test would then be measuring the pool's luck. The JSDoc says this.
- [ ] 3.2 **The torn-read test, which is the Critical this design exists for.**
      Pause the capture at **each** read boundary in turn; commit a work-item
      rename, a directory cascade, a step edit and a setting change in the gap;
      assert the captured input is entirely before or entirely after that write.
      Run it on two connections standing in for blue and green. Negative: replace
      the shared transaction with per-read connections and watch a mixed document
      appear.
- [ ] 3.3 `schedule()` runs over the detached values, outside the read snapshot.
      Test: assert no database handle is live during the scheduling call.
      Negative: run `schedule()` inside the snapshot and watch 3.3 fail — a
      liveness assertion that cannot fail would let a levelling run hold the read
      transaction open, which is the cost slice 3 is shaped to avoid.
- [ ] 3.4 The schedule body carries the **whole** `Scheduled`/`ScheduledSlice`
      field set (`schedule.ts:116-125`, `:156-234`) plus the top-level `Schedule`
      counts `waitingForPerson` and `waitingForCapacity` (`schedule.ts:246-263`),
      in offsets **and** ISO dates. `eventsVisited` (`schedule.ts:264-277`) is
      excluded by decision — it is instrumentation about the run.
      **Assert deep equality** between `schedule()`'s return (minus the excluded
      key and plus the dates) and the parsed stored body, over a generated plan,
      with the key set derived from the value rather than written out here: an
      enumerated list stays green for every field `Scheduled` gains later, which
      is the failure this test exists to prevent. Negative: drop
      `resourcePredecessorId` from the writer and watch the equality fail naming
      the key.

## 4. The write path

- [ ] 4.0 Establish the connection topology before writing any of 4.x: read how
      be-01 hands out write connections and record it in design.md. Three
      distinct requirements come out of it. (i) The save's write connection is
      not the live-edit write handle — otherwise 4.5's guarantee that a live edit
      completes during a save is silently void, whatever `busy_timeout` says.
      (ii) The read snapshot of slice 3 and this write are on **different**
      connections, and the read transaction is committed and released before
      `BEGIN IMMEDIATE` opens; a `DEFERRED` read transaction promoted in place can
      fail `SQLITE_BUSY` under WAL once any other reader has touched the file.
      (iii) The captured values are already detached by then, so releasing the
      read early costs nothing.
- [ ] 4.1 `SavedPlanService.save` — per-body byte checks, then `BEGIN IMMEDIATE`,
      then the count and total quota checks **inside** that transaction, header,
      input body, schedule body, commit. Test: a save writes one header and the
      bodies it should, and the returned record round-trips.
- [ ] 4.2 **Immutability asserted by hash, not by field list.** Save; rename an
      item, delete another, delete a step, change `estimate_method` and
      `start_date`; re-read and assert the stored bytes and both SHA-256 values
      are byte-identical. A field-by-field comparison stays green for every field
      the writer forgot to store, which is why this asserts the hash.
- [ ] 4.3 Atomicity. Inject a failure between header and input body, between
      input body and schedule body, and at commit; assert no header, no body, and
      an untouched live plan in all three.
- [ ] 4.4 **Build** the concurrency refusal, then test it: `BEGIN IMMEDIATE` with
      `busy_timeout` 0, an immediate `SQLITE_BUSY` mapped to the typed refusal, so
      no second save ever waits. It must be **SQLite-visible**, not an in-process
      marker — blue and green are two processes on one file. The test runs on two
      connections like 3.2: exactly one commits, the other is refused, and the
      refusal arrives before the first has finished writing. Negative: replace the
      mechanism with an in-memory in-flight set and watch the two-connection test
      observe two commits.
- [ ] 4.5 `snapshot_busy`: `busy_timeout` **0** on the save's write connection —
      the same setting 4.4 builds, not a second one — and a bounded caller retry
      loop capped at **5 s total**. A single blocking 5 s acquire is the wrong
      shape: it serialises two saves and both commit, which is exactly what
      spec's "refused, not serialised" forbids and what 4.4's two-connection test
      catches. Test holds the write lock from another connection and asserts both
      the refusal **and** that a live edit issued in the same window completes.
      Negative: replace the retry loop with a single 60 s blocking acquire and
      watch the live-edit assertion fail.
- [ ] 4.6 Quota. Each of the three limits refuses **before** any row is written,
      naming which limit was hit; the count and total are read in the same
      transaction that would write. Two negatives, both watched: move the check
      after the header insert and watch the "no partial record" assertion fail;
      move the count check *outside* `BEGIN IMMEDIATE` and watch two concurrent
      saves at 99 of 100 both commit.
- [ ] 4.7 The three limits are configuration read at construction, not literals at
      the call site. Test: raise the count limit in config and watch the same save
      succeed.

## 5. The read path

- [ ] 5.1 `SavedPlanService.read` returns stored bytes. **The no-recompute test:**
      write a body under a recorded older `scheduler_algorithm_id`, read it back,
      and assert the response is the stored bytes with **no call into
      `schedule()`** — a spy on the scheduler, not a comparison of dates, because
      a reader that re-derives from stored settings passes a date comparison.
      Extends `schedule-identity.test.ts` and `live-plan-identity.test.ts` rather
      than re-baselining either.
- [ ] 5.1b **Every read recomputes each body's SHA-256 over the stored bytes**
      and compares it with the header; a mismatch is a typed refusal naming the
      saved plan and the body, never a repair or a default (R5). Negative: flip
      one byte of a stored body with raw SQL and watch the read refuse. Without
      this the stored hashes are decoration — 2.4 is a source scan and cannot see
      a disk fault or an out-of-band write.
- [ ] 5.2 A schedule body whose `schedule_input_sha256` differs from
      `input_sha256` is refused rather than rendered. Negative: make the writer
      store the wrong hash and watch the read refuse. This check only means
      anything because 2.4 makes both header columns unrewritable.
- [ ] 5.3 Readable with `plan_event` truncated entirely — guards against a pointer
      creeping in and against the 365-day prune reaching a saved plan.
- [ ] 5.4 Absent schedule: save with no schedule for each reason (`pending`,
      `infeasible`, `unavailable`); the read reports the reason and never borrows
      the live scheduler's answer. Negative: fall back to the live schedule and
      watch the test name it.
- [ ] 5.5 Body schema version: a body at version *n* still reads after the reader
      moves to *n+1*; an unknown version throws a typed error naming it (R5 —
      never defaulted away). Negative: parse optimistically and watch the unknown
      version slip through.

## 6. Routes, permissions, rollout

- [ ] 6.1 Save, list, read, rename, delete on `savedPlanController`, following
      `projectController`'s authenticated-read / authorised-write split. Rename
      writes `name` and nothing else, and is permissioned like delete (creator or
      project owner) — on an unrestricted project every authenticated account can
      write (`project.service.ts:30-40`), so the ordinary write rule would let any
      account relabel anyone's permanent record.
- [ ] 6.2 Permission matrix test: anonymous, unrestricted, restricted, creator,
      owner, third party against each of the **five** routes. Negative: give
      rename the project's ordinary write rule and watch the third-party case
      fail.
- [ ] 6.3 Account deletion leaves saved plans intact and still naming the creator,
      because `created_by` is a value.
- [ ] 6.4 A node without the routes answers a typed unavailable outcome; the
      client renders "not available on this node yet". Negative: return a bare 404
      and watch the client test show an error state instead.
- [ ] 6.5 Gate: `bunx nx run-many -t test lint typecheck` on h2puni, and
      `bun x @fission-ai/openspec validate --all --json`. Record the output in
      verify.md. **TASK-231 ends here.**

## 7. The diff

- [ ] 7.1 `diffPlans(left, right)` in `libs/domain` over two `CanonicalPlanInput`
      values. One function, both directions.
- [ ] 7.2 Property test: added, removed, renamed, reparented and reordered items;
      changed uncertainty, effort, actuals, progress, measures, ownership,
      dependencies, settings and dates. Reordering siblings is a *change*, and
      re-serializing an unchanged plan is *no* change — assert both.
- [ ] 7.3 `projectCurrentPlan()` materialises the live plan through
      `canonicalisePlanInput`, writes nothing, and consumes no quota. Test:
      compare against `current` and assert no row was written.
- [ ] 7.3b **The compare route**, on `savedPlanController` under the project's
      read rule: two sides, each a saved-plan id or `current`. It has to be a
      route — `current` needs the twelve-read server-side capture of 7.3, so the
      diff cannot run client-side. Extend 6.2's permission matrix to this sixth
      route, including the case where one side is a saved plan the caller may read
      and the other is `current` on a restricted project.
- [ ] 7.4 Cross-version diff: a stored v*n* body against a live v*n+1* projection
      normalises forward in memory; the stored bytes are unchanged afterwards
      (asserted by hash). An unknown version fails loudly. Negative: rewrite the
      stored body during normalisation and watch 4.2's hash assertion fail.

## 8. The surfaces

- [ ] 8.1 A saved-plan list per project: name, who saved it, when, whether a
      schedule was saved. Refreshes on the existing broadcast.
- [ ] 8.2 Save writes immediately with the server timestamp as the default name
      (A-1); renaming is an edit on the created record, not a modal in the way of
      the save.
- [ ] 8.3 The comparison surface: two side pickers, each a saved plan or
      `current`; the diff rendered by category; "no schedule was saved" where a
      side has none.
- [ ] 8.4 **Stale but not replaced.** A broadcast arrives while a comparison is
      open: the refresh affordance appears and the rendered comparison does not
      change until it is used. Negative: refetch into the open comparison and
      watch the test catch the swap.
- [ ] 8.5 Typed refusals surface as themselves: `snapshot_busy` says the plan is
      being written to and to try again; a quota refusal names the limit reached.

## 9. Close

- [ ] 9.1 Measure the largest real plan's body size against the 8 MiB limit and
      record the number (A-3's falsifier).
- [ ] 9.2 Gate: `bunx nx run-many -t test lint typecheck` on h2puni plus
      `bun x @fission-ai/openspec validate --all --json`, output recorded in
      verify.md with the failure-proof table filled in.
