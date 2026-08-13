<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. The oracle, before anything else

- [x] 0.1 `apps/be-01/tools/capture-capacity-oracle.ts`, run **at `050fd45` with no
      other change in the tree**, writing sixteen plans and be-01's exact
      `/work-items` answer for each into
      `apps/be-01/src/service/fixtures/capacity-oracle-2026-08-13.json`. Its own
      commit, so `git log` shows the oracle predates the code it measures. See
      design.md D7.

## 1. The table and its seeding

- [x] 1.1 `project_team_capacity(project_id, service_team_id, size)`, primary key
      on the pair, `size integer NOT NULL`, both columns cascading. Schema JSDoc
      carries the no-fallback rule; `serviceTeam.size` gains its `retired by`
      comment naming this change.
- [x] 1.2 The seeding: cartesian product of existing projects × sized teams.
      **Negative:** the `WHERE st.size IS NOT NULL` struck, watched failing
      `seeds nothing for a team nobody has sized` on a `NOT NULL` constraint —
      the column shape is what refuses to seed an unstated team as a number.
- [x] 1.3 `down.sql` dropping the table, and the rollback ordering case in
      `migrate.test.ts`. **Negative:** the outgoing release must still read and
      write `service_team` after the rollback, asserted by doing it.
- [x] 1.4 Claim A: `seeds every existing project from the global size it
retires`, real SQLite, rolled back to `add_max_parallel` and forward.
      **Negative:** the `CROSS JOIN` narrowed to the labelling join, watched
      failing the pair that labels nothing.

## 2. The read path, and the differential

- [x] 2.1 `CapacityStore.slotsFor(projectId)` — one indexed read, `Map<teamId,
slots>`. **Negative:** pointed at `service_team.size` (the fallback this
      change refuses), watched failing `answers one project's own numbers` on the
      second project's map.
- [x] 2.2 `work-item.service.ts`: `slotsOf` becomes the lookup. C1's "today's
      only answer is the team's global size" comment replaced by what is true.
      `schedule()` untouched — `git diff --stat` says so.
- [x] 2.3 Claim B, the identity differential: the sixteen captured plans replayed
      through this branch's service with the seeded numbers, every field of every
      work item and every slice. **Negative:** the seeded map emptied, watched
      failing on the first capacity-floored plan; and the corpus's own
      non-vacuity asserted first, so a thinner recapture fails loudly rather
      than making the differential vacuous.

## 3. The write path

- [x] 3.1 `MOST_PEOPLE_AT_ONCE` becomes one export; the two controller copies
      read it. No behaviour change, and the reason is in the JSDoc.
- [x] 3.2 `CapacityStore.set` — upsert on a number, delete on `null`, `not_found`
      for a project or team nothing holds. **Negative:** the existence checks
      removed, watched failing on a row written against an id nothing holds.
- [x] 3.3 `PUT /api/projects/:id/teams/:teamId/capacity` with C2's validation
      reused. **Negative:** the ceiling comparison struck, watched failing
      `refuses a capacity above the limit`; and the whole-number guard struck,
      watched failing on `1.5` stored.
- [x] 3.4 `capacity_changed`, published to the named project and no other.
      **Negative:** the publish widened to every project the team labels,
      watched failing `tells the project written and no other`.
- [x] 3.5 `PATCH /api/teams/:id/size`, `DirectoryService.resizeTeam` and
      `DirectoryRepository.resizeTeam` deleted, with their tests. The grep that
      says nothing reads `serviceTeam.size` is in verify.md.
- [x] 3.6 `directoryUsageOfTeam` reads the **project's** capacity, not the team's
      global size. **Negative:** the per-project lookup replaced by "any project
      stated something" (`[...rows.capacityOf.values()].at(0)`), watched failing
      `names each project's own capacity, and says nothing where a project stated
none` — the second plan's row carrying the first plan's pool. The negative
      first recorded here named an injection that cannot be written (it used the
      team row this change deletes) against a test nobody had written; the
      cross-review of 2026-08-13 caught both, and the test exists now.

## 4. The payload and the plan's own surface

- [x] 4.1 `tree()` carries `teamCapacities`. fe-01's `PlanView` gains it as a
      description of what be-01 sends.
- [x] 4.2 `TeamsDialog` — the teams this plan's work is labelled with, effective
      labels included, one box each. **Negative:** the effective reading replaced
      by the stored label, watched failing `lists a team only an ancestor
carries`.
- [x] 4.3 The box's two local decisions, C3's D6 reused: an empty box is
      _unstated_ (not `Number('') === 0`), and a non-finite draft is refused
      rather than sent as the clear. **Negative:** both, each watched.
- [x] 4.4 The directory's size box, `commitSize`, `sizeShown`, the `resized`
      draft state and `resizeTeam` on the api all deleted. **Negative:** the
      page asserted to offer no such control, watched failing with the box put
      back.
- [x] 4.5 `capacity_released` on the directory's removal confirmation reads the
      per-project number, and a project stating nothing gets no capacity
      sentence.

## 5. The gate

- [x] 5.1 `bunx nx format:check --all`, `bunx nx run-many -t lint typecheck`, both
      suites run directly (bun in `apps/be-01`, vitest in `apps/fe-01`), and
      `openspec validate --all --json`, on h2puni. Nothing on h1claw. **The
      `build` target is not run there** — `tool-bootstrap` and `tool-devsync`
      refuse without `shellcheck`, which h2puni does not have, and CI is the gate
      of record for it. `verify.md`'s gate table says so; this line used to
      disagree with it.
- [x] 5.2 CI `pixels`. Not run on h2puni for this change: no claim here depends on
      real layout the way the In-parallel column's 32px did, so there is nothing for
      a browser to measure that jsdom cannot. `pixels` is the record.
- [x] 5.3 `verify.md`: commands, results, the R5 table, and the grep proving no
      read path consults `serviceTeam.size`.

## 6. The 2026-08-13 cross-review

- [x] 6.1 The no-fallback rule gets the test Dany's second sentence never had:
      `never falls back to a globally sized team nobody stated per project`,
      watched red against the _addition_ fault the suite was blind to (R5 #17).
- [x] 6.2 `directoryUsageOfTeam`'s multi-project case gets the test R5 row 9
      named and nobody wrote (3.6 above, R5 #9).
- [x] 6.3 The retired column leaves the wire: every `service_team` read is
      projected, `ServiceTeam` and `TeamView` lose `size`, and `/api/teams`'
      shape is pinned (R5 #16). The fe-01 fallback becomes a compile error, so
      R5 #11 is a `tsc` output rather than an assertion.
- [x] 6.4 `capacityRefusalSentence` gains the 5xx arm every other refusal helper
      in the app has (R5 #18).
- [x] 6.5 The record: the labelling-join claim reworded to reasoned-not-watched
      in all three places, the blue/green swap window named in "Deployment", the
      oracle recapture recorded, and the four false or dangling comments fixed.
