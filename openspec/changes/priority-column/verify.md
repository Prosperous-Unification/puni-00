# verify — `priority-column`

Branch `change/priority-column`, off `main` @ `94ed488` (PR #40's merge). One
migration, be-01's engine and write path, fe-01's table, chart hover and export.

## The gate

Run from the repo root on this branch, 2026-08-11.

| Command                                                | Result                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                           | green, exit 0                                                                            |
| `bunx nx run-many -t test lint typecheck --parallel=2` | green — 21 projects; be-01: **601 tests** in 53 files; fe-01: **1097 tests** in 45 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all`       | green — 24 items, 24 passed, 0 failed                                                    |

**`build` was not run on this host** — the standing rule and the `PreToolUse`
hook forbid local builds here; CI's `checks` job runs the full
`test lint typecheck build` gate and is the proof for `build`. `bun run e2e` was
likewise not run (no browser on this host); CI's pixel gate is the proof for the
new column's layout, and the claim it has to carry is stated under **Not
verified** below.

## The semantics

Priority is a **ranking of the leveller's queue**, and nothing else. Where two
slices are both eligible — their dependencies placed, their floors past — and
they want the same person, the one whose work item carries the smaller priority
is placed first and starts earlier; the other waits for that person. It is the
first thing `goesFirst` compares, ahead of the critical-path start, the float,
the work item's number and the role order, which decide as they always did when
two slices carry the same priority or none.

It never decides a **date**. Whichever slice is taken first is still placed at
the latest of its own floors, so a priority cannot put a work item in front of
its predecessors, its `startNoEarlierThan` or its work item's earlier roles: it
decides who goes first where the schedule has a choice, not who defies their
dependencies. A plan with nobody assigned has no contention at all, and so does
not move.

One consequence is worth stating rather than discovering: this leveller places
every slice once and never moves it, and does not backfill. Giving a work item
whose floor is day 4 the smallest priority in the plan therefore **holds its
assignee** — the queue is decided in priority order, and the person waits for it
rather than filling the gap in front of it. That is what "more priority means
start earlier" costs, and `still waits for its own floor` asserts both halves.

## What moved

- `20260811100000_add_priority`: `work_item.priority`, `integer`, nullable, no
  default, with its `down.sql`.
- `schedule.ts`: `SlicePriority.priority` is the first comparison in
  `goesFirst`, `+Infinity` where nobody has set one; `priorityByLeaf` carries a
  priority written on any row down to the leaves beneath it, **most specific
  first** — deliberately not the floor rule's `Math.max`.
- be-01's write path: `WorkItem.priority`, `WorkItemPatch.priority`,
  `asOptionalPriority` at the controller, `fieldsOf`/`revertTo` for undo.
- fe-01: a 48px `Prio` column between Depends on and Service/team, blank at
  rest and edited in place with the table's own keyboard; `priority` on the
  api's row and patch; one hover-card line per bar that has one; a Priority
  column in the CSV and Markdown exports.
- `CONTEXT.md` gains **Priority**.

## Failure-proof table

Every check this change adds, the fault injected, and what was watched — all
2026-08-11, locally, each fault then reverted and the suite watched green.

| Check                                                  | Injected fault                                                            | Observed                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Priority orders the queue** (`goesFirst`)            | the priority comparison deleted                                           | 8 of the 11 in `schedule-priority.test.ts` failed; `starts the smaller priority first when two work items want one person` came back with the priority-1 work item at 2→5, behind the one it outranks             |
| **Unset is last** (`?? Infinity`)                      | `?? 0`                                                                    | `puts a work item nobody has given a priority behind one somebody has` failed — the work item with no priority took the person at day 0 and the priority-9 one waited                                             |
| **Unset is a constant**                                | `?? unleveled.placed[at].finish` — "unset falls back to the plan's order" | the same test **and** `answers what the engine answered before priority existed` failed: a plan that sets no priorities was rescheduled                                                                           |
| **Most-specific wins** (`priorityByLeaf`)              | the floor rule — `Math.min` over the leaf and every ancestor              | `lets a leaf's own priority beat its parent's, in both directions` and `gives the nearer ancestor's priority to a leaf between two` failed, both on the leaf taking the person it does not outrank                |
| **A priority is not a pin**                            | the top priority's `predecessors` cleared and its `notBefore` zeroed      | `still waits for a predecessor`, `still waits for its own floor` and `keeps a work item's own roles in role order` failed — the work item with the smallest priority started on day 0 over the thing it waits for |
| **The write path refuses** (`asOptionalPriority`)      | the throw deleted, the value taken as it arrives                          | `refuses a priority that is not a whole number of 1 or more` failed — `0`, `-1`, `1.5`, `'2'`, `true` and `1e20` each answered 200 and stored, the work item ending on `1e20`                                     |
| **Undo restores a priority** (`fieldsOf` / `revertTo`) | each of the two lines deleted in turn                                     | `puts a replaced priority back…` and `takes a first priority away again…` failed both times — the undo restored nothing                                                                                           |
| **The column is nullable** (migration)                 | `integer NOT NULL DEFAULT 1`                                              | `lets the outgoing release keep inserting work items…` and `leaves work items that existed before the column with no priority` failed on `Received: 1`                                                            |
| **…and has no default**                                | a bare `integer NOT NULL`                                                 | the outgoing release's own `INSERT` failed, `NOT NULL constraint failed: work_item.priority`                                                                                                                      |
| **An emptied cell clears** (`setPriority`)             | the empty-string branch deleted                                           | `clears the priority when the cell is emptied, rather than sending a zero` failed — `Number('')` is 0, and 0 went out                                                                                             |
| **Blank at rest** (the cell)                           | `placeholder="1+"` added                                                  | `is blank on every row of a plan nobody has given priorities` failed                                                                                                                                              |
| **Text is refused here** (the `NaN` guard)             | the guard disabled                                                        | `says so, and sends nothing, when what was typed is not a number at all` failed — `urgent` went out as a request that clears the priority                                                                         |
| **The hover line is conditional** (`barFacts`)         | the null check dropped                                                    | `says the priority where the work item carries one, and nothing where it does not` failed on the card reading `Priority null`, and the order test failed with it                                                  |

Two assertions are pinned knowing what they cannot catch, and say so where they
sit. The unset default cannot be caught by the no-priority regression alone —
with nothing set, `0` and `Infinity` tie identically — which is why that fault
is watched against `puts a work item nobody has given a priority behind one somebody has`
instead, and why the regression's own fault is a default that varies per slice.
And `NaN`/`Infinity` are absent from the controller's refusal list because JSON
carries neither: `JSON.stringify` sends `null` for both, which is the request
that clears a priority. `Number.isSafeInteger` still refuses them for any caller
that is not a request body, and `1e20` is the reachable end of the same
question.

## The regression, in full

`answers what the engine answered before priority existed` pins every field of
every slice of a plan holding three people's queues, a dependency, a floor, a
two-level parent, a work item split across two people and an unestimated slice
— with no priority anywhere. The numbers were taken from this engine on `main`
@ `94ed488` before a line of this change was written, and are in the test as
literals. It is the whole of the claim that a plan with no priorities is scheduled
byte for byte as it was.

## The 48px, and what it costs

The table's declared minimum grows by 48px in every state. A two-phase plan
with both folded needed 1199px and now needs 1247, which is past the ~1214 a
1280px laptop leaves: a plan that used to sit just inside the window now scrolls
its frame by a sliver, with the pinned columns holding the left edge — the
backstop that case already existed for. `table-frame.test.ts` carries the new
figures and the comment that says which change moved them.

## Not verified

- **`build`** — forbidden on this host; CI's `checks` job is the proof.
- **The browser gate** — no browser here. Two claims rest on it: that `Prio`
  sits on one line in a 10px uppercase header at 48px, and that the new cell
  overruns nothing at 1280px. `e2e/layout.spec.ts` measures both from
  `frameLayout` rather than from literals, so it needs no edit to cover the new
  column — but it has not been run here.
- **CI itself** — recorded on the PR after push, not here.
