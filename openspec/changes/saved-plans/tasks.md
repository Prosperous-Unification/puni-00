<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.

Slices 1-6 are TASK-231 (storage + API). Slices 7-9 are TASK-232 (history and
comparison UI) and start only after slice 6 is merged.
-->

## 1. The term, and the canonical plan-input value

- [x] 1.1 CONTEXT.md gains **Saved plan**, next to Plan document, saying what it
      is and what it is not: never exported, never imported, never applied to a
      project. `_Avoid_: snapshot, checkpoint, backup, version`. Plan document's
      own entry is untouched — it already avoids `snapshot`, which is why this
      term exists.
- [x] 1.2 `CanonicalPlanInput` in `libs/domain/src/saved-plan/` — the closed
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
- [x] 1.3 `canonicalisePlanInput(values)` — a pure function from already-read
      rows to `CanonicalPlanInput`, with a **stable** key order and a stable
      ordering of every collection, because the SHA-256 is taken over its
      serialization. Test: two calls over the same rows supplied in a different
      row order serialize to identical bytes. Negative: sort dropped from work
      items, watched failing on the byte comparison.
- [x] 1.4 A round-trip property test over a generated plan: canonicalise,
      serialize, parse, canonicalise again — identical bytes.

## 2. The tables

- [x] 2.1 `schema.ts`: `saved_plan` and `saved_plan_body` as in design.md.
      `ON DELETE CASCADE` header→project and body→header. `created_by` is a
      **value**, not a reference — the JSDoc says why (an account deletion must
      not orphan a permanent record).
- [x] 2.2 One additive migration folder plus a `down.sql` that drops both
      tables. Watched: `readMigrationFolders` refuses an empty `down.sql`, so the
      down file is proved by running the rollback and reading `pragma table_info`
      back, not by an exit code.
- [x] 2.3 **The cascade is enforced, not merely declared.** `steps-schema-rename`
      shipped a `REFERENCES` clause SQLite had not applied and the check written
      for it passed against the broken database. So: write a header and a body,
      delete the project, and assert both rows are gone by reading the tables —
      and assert the delete itself was not blocked.
- [x] 2.4 **No `UPDATE` ever targets `saved_plan_body`, and none targets any
      `saved_plan` column except `name`.** A source check over `repository/**` in
      the shape of `audit.test.ts`, scoped to both tables — the header scope is
      not optional: `input_sha256`, `schedule_sha256`, `schedule_input_sha256`
      and `scheduler_algorithm_id` live there, and one `UPDATE` of
      `schedule_input_sha256` makes 5.2's check pass for a schedule computed from
      a different input. Negatives, both watched: an `update(savedPlanBody)` call
      added, and an `update(savedPlan).set({ inputSha256 })` added. This is the
      immutability property; a comment cannot hold it.

## 3. The capture, inside one read snapshot

- [x] 3.0 **The scheduling algorithm identity.** No such constant exists in the
      checkout (no `SCHEDULE_ALGORITHM`, `schedulerAlgorithm` or `algorithmId` in
      `libs/domain` or `apps/be-01`). Define it in `libs/domain` beside
      `schedule()`, with JSDoc stating the rule that moves it: any change to
      `schedule()`'s semantics — TASK-219's dual objective and TASK-240's deadline
      both qualify — bumps it in the same commit. Without the rule the column is a
      constant, stored plans read "same algorithm" across a semantics change, and
      the silent restatement it exists to prevent happens anyway.
- [x] 3.1 `SavedPlanCaptureRepository.readPlanInput(projectId)` — **every read the
      canonical input requires**, inside one `BEGIN DEFERRED` on a read
      connection. The bound is `CanonicalPlanInput`'s field list, **not** the live
      projection's: the projection is where twelve of the reads come from, and the
      capture list is a strict superset of it. JSDoc enumerates both halves and
      says why a revision counter cannot substitute.
      **(i) The twelve plan reads it replaces** — ten at
      `apps/be-01/src/service/work-item.service.ts:1285-1312`, three at
      `:1364-1385`, minus `broadcast.latestSeq`, which is a refresh cursor and is
      not captured.
      **(ii) The capture-only reads, which the projection never makes** — the
      three registries `tag` (`schema.ts:968`), `work_item_type` (`:1063`) and
      `external_system` (`:1085`), and the junctions and rows behind the
      ownership and labelling fields spec.md requires: `work_item_tag` (`:1020`),
      the work-item/type reference (`typeId`, `:1131`),
      `work_item_external_ref` (`:1170`), `work_item_team` (`:921`),
      `work_item_service` (`:1343`), `person_team` (`:1546`), `team_service`
      (`:1273`), and **the team, service and person rows named by those junctions
      or by the capacity map**. The last clause is not a flourish: `slotsFor`
      (`work-item.service.ts:1381`) is keyed by team id, so a team with stated
      capacity and no junction row at all — ordinary in early planning, which is
      this feature's target window — has no captured name; and the projection's
      people read is filtered to *assigned* ids (`:1309-1311`), so a
      `person_team` row for an unassigned person names someone captured nowhere.
      Either leaves a stored id whose label needs a live read the first
      requirement forbids, and is unrecoverable once the row is deleted.
      **The inventory behind that list, taken 2026-09-03 — every table cited
      above is real at the line given, but they are not ten reads.** Five of them
      are already inside the projection's own `workItems.listByProject`
      (`:1288`): `LabelledWorkItem` (`repository/index.ts:404`) carries
      `teamIds`, `tagIds`, `serviceIds`, `typeIds` and `externalRefs`, so
      `work_item_team`, `work_item_tag`, `work_item_service`, the type reference
      and `work_item_external_ref` need no read of their own. What is genuinely
      capture-only is **six calls on the directory store**, each already written:
      `listTags()` (`directory.ts:323`), `listWorkItemTypes()` (`:809`),
      `listExternalSystems()` (`:798`) for the three registries;
      `listTeams()` (`:282`), which folds `team_service` in through a second
      query of its own; `listServices()` (`:356`); and `listPeople()` (`:538`),
      which folds `person_team` in the same way. `listPeople()` is the one that
      earns its place twice over — it is **unfiltered**, where the projection's
      use of it at `:1310` is narrowed to assigned ids, which is exactly the
      unassigned-member hole named above. So 3.1 writes no new SQL: it is six
      existing reads plus the thirteen, ordered on one held connection.
      **Counted off the landed call sites, that is seventeen distinct calls, not
      nineteen.** `listPeople()` is named in both halves — it is one call the
      projection already makes and the capture reuses unfiltered — so the union
      of twelve projection reads and the capture-only half is twelve plus five;
      and 13 - 1 + 6 was itself 18, not 19. Corrected here rather than left to
      read as a count somebody could check against
      `repository/saved-plan-capture.ts` and find wrong.
      **All of them, both halves, run sequentially on one explicitly held
      connection inside a single transaction block** — and that connection is a
      **dedicated** one from `openConnection(dbPath)`, not the process handle.
      The pooled-handle hazard this task was first written against does not
      exist here and the real one is worse; the topology was read off the
      checkout on 2026-09-03 and is recorded in design.md under "The topology
      found". In short: `boot.ts:64` opens exactly one connection for the whole
      process, `bun:sqlite` has no pool, and every store read opens with `await
      Promise.resolve()` — a real microtask yield before the query. A
      `BEGIN DEFERRED` held on that shared handle therefore encloses every
      statement any other in-flight request issues until it commits, which makes
      a stranger's write the capture's to commit or to roll back. Take the
      dedicated connection and the snapshot is the capture's alone. A
      capture-only read left outside the snapshot is a separate defect wearing a
      different table: a tag renamed between the item read and the registry read
      stores pre-edit items beside post-edit labels. The JSDoc says all of it,
      including that the dedicated connection is closed on every path.
- [x] 3.2 **The torn-read test, which is the Critical this design exists for.**
      Pause the capture at **each** read boundary in turn — including every
      capture-only boundary from 3.1(ii), not just the twelve projection ones;
      commit a work-item rename, a directory cascade, a step edit, a setting
      change, **a registry rename (`tag.name`) and a junction write
      (`work_item_tag`)** in the gap; assert the captured input is entirely
      before or entirely after that write. Run it on two connections standing in
      for blue and green. Negative: run the capture on the **shared process
      handle** instead of its own connection and watch a foreign write land
      inside the capture's transaction — the enclosure design.md states as a
      hypothesis, which this negative is what settles. (The per-read-connections
      negative it once named is gone: `bun:sqlite` has no pool, so it could only
      ever have been staged, and a staged negative proves nothing about this
      codebase.) Second negative: move the
      registry reads outside the transaction, leaving the twelve inside, and
      watch the registry-rename case produce items and labels from either side of
      one write — the case that stays green while every projection-boundary
      assertion still passes.
      **Landed 2026-09-03, and the last sentence above turned out to be wrong in
      the guard's favour.** The seventeen boundary cases are one `it` each, so
      the fixture reseeds — a single `it` looping over all seventeen would leave
      the database post-edit after the first pass and assert nothing after it.
      The edit committed in the gap is **one transaction on a second
      connection** touching the project row (read 1), the work item and its
      `work_item_tag` junction (read 2), a step (read 9), a person and the
      `person_team` row that cascades with it (read 12) and the `tag` registry
      (read 15); the assertion reads seven values back off the capture, one per
      read, and requires a single side between them. `missing` is a third
      answer, not folded into `after`, so a dropped read cannot impersonate a
      post-edit one.
      The second negative was run as a **watched red** rather than committed as
      a second implementation — a test that reimplements the method proves
      things about the reimplementation. With `tx.commit()` moved above
      `listTags`, **17 fail and 1151 pass**: the enclosure test, and boundaries
      **2 through 17**. Not just the registry boundary — because one edit spans
      both halves, every projection boundary tears too, so the guard is sharper
      than this task predicted. Boundary 1 stays green on purpose: the write
      lands before the snapshot is taken, so the whole capture is legitimately
      `after`. Every other test in `be-01` stays green.
- [x] 3.3 `schedule()` runs over the detached values, outside the read snapshot.
      Test: assert no database handle is live during the scheduling call.
      Negative: run `schedule()` inside the snapshot and watch 3.3 fail — a
      liveness assertion that cannot fail would let a levelling run hold the read
      transaction open, which is the cost slice 3 is shaped to avoid.
- [x] 3.4 The schedule body carries the **whole** `Scheduled`/`ScheduledSlice`
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

- [x] 4.0 Establish the connection topology before writing any of 4.x: read how
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
      The retry does **not** contradict 4.4: 4.4 asserts the refusal arrives
      while the rival's transaction is still open, and a retry that acquires
      after that transaction committed is a fresh save over a new read snapshot,
      which spec allows explicitly. Second test: let the rival commit inside the
      5 s window and assert the retry succeeds and the project holds two
      records with different `created_at` values. **Interleave a live edit
      between the refusal and the retry's acquisition and assert the retry's
      stored input contains it** — two records with different `created_at` is
      also what a retry reusing the *refused* attempt's already-detached values
      produces, so without this the "fresh save over a new read snapshot" SHALL
      stays green while unimplemented and a user's retry stores the plan as of
      the attempt that failed.
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

- [ ] 7.1 `diffPlans(left, right)` in `libs/domain`. Each side is a
      `CanonicalPlanInput`, **its schedule body** (or the recorded absent
      reason), **and its `scheduler_algorithm_id`** — because spec requires
      schedule-side differences to be reported and a schedule is not a field of
      the input: a signature taking only the inputs cannot see a date at all.
      The identity is named separately because it is a `saved_plan` **header**
      column, not part of the `Scheduled`/`ScheduledSlice` body 7.2c derives its
      field set from, so a side object carrying only input + body would drop the
      one field spec names explicitly. On the `current` side these three come
      from 7.3, not from a stored record. One function, both directions.
- [ ] 7.2 Property test: added, removed, renamed, reparented and reordered items;
      changed uncertainty, effort, actuals, progress, measures, ownership,
      dependencies, settings, dates, **and freeze** (`frozen_number` set, cleared
      and changed — spec names it and this list omitted it). Reordering siblings
      is a *change*, and re-serializing an unchanged plan is *no* change — assert
      both.
- [ ] 7.2b **The diff-completeness property, which is what stops the capture
      becoming write-only data.** Over a generated plan, mutate **any single
      field** of `CanonicalPlanInput` in turn and assert the diff is non-empty and
      names the field — with the field set **derived from the value**, not written
      out here, exactly as 3.4 does for the writer. An enumerated list stays green
      for every field the capture gains later, which is how a changed type, tag,
      external reference, note or `start_no_earlier_than` would come to compare as
      "no change" while being faithfully stored. Negative: drop `frozen_number`
      and then a tag id from `diffPlans`' comparison and watch the property name
      each missing field.
- [ ] 7.2c **The schedule-side analogue of 7.2b.** Mutate any single field of the
      stored schedule body in turn — dates, offsets, every `Scheduled` /
      `ScheduledSlice` key, the top-level counts, the absent reason and
      `scheduler_algorithm_id` — and assert the diff is non-empty and names it,
      with the field set derived from the stored value rather than written out,
      as 3.4 does for the writer. The case that motivates it: two saves whose
      input bodies are **byte-identical** and whose schedules differ because
      `schedule()`'s semantics changed between them. Negative: build `diffPlans`
      over the inputs alone and watch every schedule mutation report "no change"
      — which is what the pre-6056baf2 signature would have shipped.
- [ ] 7.3 `projectCurrentPlan()` materialises the live plan through
      `canonicalisePlanInput`, writes nothing, and consumes no quota. **It reuses
      `SavedPlanCaptureRepository.readPlanInput` — 3.1's read set, both halves,
      inside one `BEGIN DEFERRED` snapshot — rather than reads of its own.** Spec
      requires `current` to come through the same canonical function the save
      uses, so a `current` built from the projection's twelve reads lacks the
      registry and junction rows by value and every saved-vs-current comparison
      reports the saved side's tags, types and external systems as removed;
      7.2b never catches it, because it mutates `CanonicalPlanInput` values
      directly and never runs this path. Reuse also gives `current` the one read
      snapshot, without which a torn `current` renders a comparison against a
      live plan that never existed — the display-side twin of the defect 3.2
      exists to catch. Test: compare against `current`, assert no row was
      written, and assert the `current` value carries the registry rows by value.
- [ ] 7.3a **`current` carries a schedule, produced here.** `projectCurrentPlan()`
      returns the third side-field 7.1 takes as well as the input: `schedule()`'s
      return over the values it just captured, run **outside** the read snapshot
      as 3.3 requires of the save path, labelled with the algorithm identity
      currently in force, with a `ScheduleCycleError` mapped to the `infeasible`
      absent reason on 5.4's derivation. Test: a saved plan and `current` whose
      canonical inputs are equal but whose schedules differ report the date
      differences and both identities. Negative: return the absent reason
      `unavailable` for `current` — which is what spec's stored-schedule bound
      lawfully permits until 7.3a exists — and watch that test report "no
      schedule was saved" on the live side while every input-side assertion,
      7.2b and 7.2c all stay green, because none of them runs this path.
      **Second case: a saved plan with an *absent* schedule against `current`.**
      Assert `current` still carries its live schedule and identity beside the
      saved side's absent reason. Nothing else exercises that shape, and the
      "saved while optimization was pending" scenario governs it, so a build
      that suppresses the live side's dates whenever the saved side has none
      would otherwise ship with every named test green.
      **3.3's handle-liveness assertion runs on this scheduling call too**, with
      the same watched negative: spec requires `current`'s schedule to be
      computed *outside* the read snapshot exactly as the save path computes its
      own, and 3.3's spy covers the save path only. Without it an implementer
      calling `schedule()` inside 7.3's held `BEGIN DEFERRED` ships green and
      every saved-vs-current comparison — this feature's hot path — holds the
      read snapshot open for the length of a levelling run.
- [ ] 7.3b **The compare route**, on `savedPlanController` under the project's
      read rule: two sides, each a saved-plan id or `current`. It has to be a
      route — `current` needs 7.3's server-side capture over 3.1's read set, so
      the diff cannot run client-side. Extend 6.2's permission matrix to this sixth
      route, including the case where one side is a saved plan the caller may read
      and the other is `current` on a restricted project. Negative: mount the
      compare route without the read rule and watch the matrix's anonymous and
      third-party cases fail — this is the one permission that can expose a
      restricted project's *live* plan, through `current`, so its guard owes the
      same proof every other check here does.
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
      `current`; the diff rendered by category; **the absent reason rendered per
      side**, "no schedule was saved" only for a *saved* side with no body, and
      `current` + `infeasible` saying the live plan cannot be scheduled —
      nothing about `current` was ever saved, so the saved-side copy would state
      the wrong fact about a cyclic live plan.
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
