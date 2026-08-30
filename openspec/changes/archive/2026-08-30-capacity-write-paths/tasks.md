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

## 1. `maxParallel` reaches the column, and only ever as a whole number

- [x] 1.1 `asOptionalParallelism` on the patch route, and `WorkItemPatch` grows
      the field. `work-item.controller.test.ts`: `refuses a parallelism that is
not a whole number of 1 or more`. **Negative:** the integer guard deleted,
      watched failing on `[500, "0"]` where `[400, "0"]` was owed — the 500 is
      the engine's own refusal downstream, so a `0` past this line takes every
      read of that project with it.
- [x] 1.2 The ceiling. **Negative:** `<= 1000` deleted with the integer guard
      left standing, watched failing on `refuses a parallelism above what a plan
can mean` — `Expected: 400, Received: 200`. Injected apart from 1.1 because
      `1e999` is refused by `Number.isSafeInteger` whether or not a ceiling
      exists, which is how a vacuous range check shipped here before.
- [x] 1.3 `null` resets to 1 in the repository rather than reaching SQLite.
      **Negative:** the normalisation replaced by the plain spread, watched
      failing on `NOT NULL constraint failed: work_item.max_parallel`.

## 2. The parent refusal

- [x] 2.1 `has_children`, decided against the same read `rolled_up` is, 400 by
      the plan's §5.1 table. **Negative:** the check deleted, watched failing on
      `refuses a parallelism on a row that has children` —
      `Expected: 400, Received: 200`, the parent taking a number no slice reads.
- [x] 2.2 `leaves an inert parallelism standing on a leaf that gains a child` —
      the other direction, and deliberately not a cascade.

## 3. Undo, on the same machinery every other field uses

- [x] 3.1 `fieldsOf` names the field. **Negative:** the line deleted so the
      patch journals nothing, watched failing on `refused: stale_undo — “Strip”
has changed since then` — the undo reaches past the unjournalled write to an
      entry that write had already made stale.
- [x] 3.2 `revertTo` carries the before-value. **Negative:** the line deleted so
      the inverse is the empty patch, watched failing the same way at the
      **first** undo: an inverse naming no field takes the whole stack down.
- [x] 3.3 `refuses to undo a parallelism onto a row somebody else has since
edited`, against real SQLite, because the mechanism is `work_item.revision`.

## 4. A team's size, and who has to be told

- [x] 4.1 `PATCH /api/teams/:id/size`, hand-parsed, with `sizeOf`.
      **Negative:** the integer guard deleted, watched failing on `[200, "0"]` —
      a team of no slots written; and the ceiling deleted on its own, watched
      failing with `status: 200` and the row coming back `size: 1001`.
- [x] 4.2 `DirectoryRepository.resizeTeam`, refusing a team that is not there
      from the update's own empty `returning`. **Negative:** the branch replaced
      by a fallback row, watched failing on `ok: true` for an id nothing holds.
- [x] 4.3 The fan-out: `tells both projects the team labels work in, and not a
third`, through the `announce` a rename already uses.
- [x] 4.4 Inheritance needs no widening, and the line that makes that true is
      `projectsLabelled` reading **every** labelled row. **Negative:** narrowed
      to rows nothing calls a parent, watched failing on `tells a project the
team reaches only through inheritance` with `[]` where one event was owed.
- [x] 4.5 `records the size change where a reconnecting client replays it`,
      through the real `GatewayBroadcaster` and `ReplayOrchestrator`.
- [x] 4.6 `lets the later of two sizes win, and announces each of them` — a
      characterisation of last-write-wins, labelled as one rather than dressed
      as a gate. The directory carries no revision by design.

## 5. Removing a sized team says what it takes

- [x] 5.1 `DirectoryUsageRows` carries the team row, read in the transaction
      that refused. `capacity_released` on every row whose **effective** team is
      the one going. **Negative:** the effective-team read replaced by
      `row.serviceTeamId === teamId`, watched failing on `names the capacity a
sized team takes with it, inherited rows included` — the inheriting leaf
      vanished from the confirmation.
- [x] 5.2 An unsized team names no capacity effect. **Negative:** the null-size
      arm replaced by a default of 1, watched failing on `says nothing about
capacity when the team was never sized` — two rows told their dates would move
      when nothing could move them.
- [x] 5.3 `recounts the capacity effect when a size lands between two refusals`.

## 6. The engine refuses a width below one

- [x] 6.1 `groupByWorkItem` refuses a width that is not a whole number of at
      least 1, beside its existing non-leaf refusal. **Negative:** the check
      deleted, watched failing on `refuses a slice claiming no people at all`
      with `duration: Infinity`, `latestStart: NaN` and `float: NaN`; and on
      `refuses a width that is not a whole number of people` with
      `duration: 2.4`. The open P2 of #48's cross-review, closed so that
      validation is not the sole guard.

## 7. The C2-before-C3 landmine, recorded where it will be read

- [x] 7.1 `puts a capacity floor on the wire, which nothing this change ships
can draw` — two HTTP requests are now all it takes to make be-01 emit
      `boundBy: 'capacity'`, which fe-01's `floorWordsOf` throws on by design.
- [x] 7.2 The landmine in `LLM_README.md`, the shipping-order section in
      `design.md`, and the same sentence in the PR body.

## 8. The artifacts

- [x] 8.1 The delta spec and `design.md`, including the 400-versus-409 split
      against `rolled_up` and why inheritance widened nothing.
- [x] 8.2 `verify.md`: the gate's actual output and the failure-proof table —
      one row per injected fault, all thirteen watched.
