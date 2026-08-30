# verify — `steps-not-phases`

Branched from `fix/reference-cell-popover` (`7ac1285`) and then merged twice with
`origin/main`, which moved 37 commits under it — `work-item-types` through the
UI, `external-refs`, `estimate-triple-visible`, `gantt-resize-scroll`, the
toolbar budget, the host-wide heavy lock. Base at the second merge: `a4648e4`.

**How the merge was done, because a rename cannot be three-way merged.** Every
conflicting hunk took `-X theirs` — main's code is main's — and the mechanical
rename was then re-run over the whole result. So this branch is exactly
"`origin/main`, renamed", plus the additions below, rather than a merge of two
divergent spellings.

That is checked rather than asserted: `origin/main` is exported to a scratch
tree, the file renames are applied, the rename script is run over it, and the
result is diffed against this worktree. Every difference is one of — the
regenerated `openapi.json`, one of the nine new tests, one of the four
deliberate body changes below, an ARIA or physical-name restoration, an
import-sort or prettier reflow. There is no line of main's that this branch
lost, and nothing renamed that the script would not rename again.

**The rename script cannot be run without the repair pass beside it**, and that
is worth writing down: this change's own artefacts spell the old word on purpose
— the test named `no rendered string says Phase or Role`, the regexes those
tests match with, every `Proof:` quoting the fault, the OpenSpec change names
`phases-ui` and `dep-waits-on-first-role`, the physical `role` in raw SQL and in
SQLite's own error strings, and the change's own name. A second rename pass ate
all of them once; each is restored by name now.

**The enumerated list is 127 `[Rr]ole` tokens, not the 108 `design.md` D1
estimated**, plus 21 `[Pp]hase` ones — `identifiers.txt` holds all of them with
a disposition each. The estimate was made before the list was taken; the list is
what the rename was done from.

## Test-case counts (slices 1.2 and 5.1)

Two readings, because the base moved mid-change.

**The count that answers 5.1** is against the base this branch actually sits on,
`origin/main` at `a4648e4`, statically: every `it(` / `itDom(` / `test(`
declaration in each project, on both refs.

| Project       | Cases on `origin/main` | Cases here | Delta                 |
| ------------- | ---------------------- | ---------- | --------------------- |
| `libs/domain` | 128                    | 128        | 0                     |
| `be-01`       | 1201                   | 1205       | +4, all new and named |
| `fe-01`       | 1834                   | 1837       | +3, all new and named |
| `mcp-01`      | 103                    | 105        | +2, all new and named |

The nine are the nine this change's `tasks.md` asks for and nothing else:

- be-01 `serves a project's steps`, `refuses the old roles route as unknown`
  (3.2), `has no payload field named roleId` (3.3), `the step table's physical
name is still role` (3.1).
- fe-01 `no rendered string says Phase or Role` (4.3), `the dialog is called
Steps`, `the removal sentence says step` (4.2).
- mcp-01 `names no tool the document does not derive`, `spells the example batch
in the fields the commands tool declares` (4.1).

**Cases whose body changed beyond identifier substitution.** Four, and each is
here because leaving it alone would have been the lie:

1. `be-01` `adds slices and moves nothing else in the payload` — the expected
   array is `Object.keys(tree).sort()`, and `roles` → `steps` moves in the sort
   order. The literal was re-sorted; no key was added or dropped. Found by the
   test, which failed on `- "steps"` in the wrong place.
2. `be-01` `schedule-benchmark.test.ts`'s `buildPlan` — its outer loop was
   called `phase` and meant a top-level work item, while its inner loop was
   `role` and meant a step. Renaming both collapsed them into one name, the
   inner shadowed the outer, and the fixture's own arithmetic changed:
   `is the plan it claims to be` failed on `expected 175 to be 173`. The outer
   is `parent` now, which is what it always was, and the figure is 175 again.
   **This is the one place the rename would have changed behaviour**, and the
   suite caught it.
3. `fe-01` `usageSentence` and its three callers' expected strings — the removal
   confirmation now reads `Removing the step QA would delete …`. The delta spec
   requires the sentence to use the word `step`, and a project may well name a
   step after a person, so the sentence names the kind as well as the name.
4. `apps/be-01/src/service/fixtures/capacity-oracle-2026-08-13.json` — the
   captured oracle's **keys** were renamed with the code that reads them. No
   date, day or id in it moved; the identity tests below are what say so.

The counts the runners themselves report (which include cases generated inside
loops, so they are higher than the static count) are in **Commands** below.

The pre-merge baseline, for the record: measured on `7ac1285` before a single
identifier moved — `domain` 118/0 failed, `be-01` 1172/2 failed, `fe-01`
1872/3 failed, `mcp-01` 103/0 failed. Those five failures were that checkout's,
not this change's: `login-throttle.test.ts` timing out at 7187ms against a 5000ms
limit, `priority-band.controller.test.ts` failing to parse JSON downstream of it,
and three in `wbs-table.test.tsx` (`expected 'clip' to be 'hidden'` plus two
5000ms timeouts in a 458-second run).

## Commands

| Command                                                              | Result                                          |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| `bunx nx run-many -t typecheck --projects=domain,be-01,fe-01,mcp-01` | pass                                            |
| `bunx nx run-many -t test --projects=domain,mcp-01`                  | pass — 128 and 105                              |
| `bunx nx run be-01:test`                                             | pending                                         |
| `bunx nx run fe-01:test`                                             | pending                                         |
| `bunx nx run-many -t lint` | pass — one pre-existing `react-hooks/exhaustive-deps` warning from main, 0 errors |
| `bun apps/be-01/src/openapi/emit-openapi-cli.ts`                     | run; `openapi.json` committed beside the routes |
| `bunx openspec validate --all --json` | pass — 92 of 92 |
| `CI=1 E2E_PORT_SHIFT=600 bunx nx run fe-01:e2e`                      | pending                                         |

## Failure proofs (R5)

Every one watched by hand: the fault written in, the named test run, the exact
message read, the fault taken back out, the test run again green. None of these
was injected with `git checkout` — the tree carried uncommitted work throughout.

| Check                                 | Fault injected                                                                                                      | Test that saw it fail                                               | Exact failure                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| the old routes are gone               | `.post('/:id/roles', …)` left mounted beside `/:id/steps` in `step.controller.ts`, forwarding to the same handler   | `refuses the old roles route as unknown`                            | `expect(received).toBe(expected)` — `Expected: 404  Received: 200`                                             |
| no `roleId` on the wire               | `scheduledSlices` given the old spelling back: `.map(([id, placed]) => ({ id, roleId: placed.stepId, ...placed }))` | `has no payload field named roleId`                                 | `expect(received).toEqual(expected)` — `+ [ "slices[0].roleId", "slices[1].roleId" ]`                          |
| the README names tools that exist     | the README's prose spelled back to `the project and role routes`                                                    | `names no tool the document does not derive`                        | `expect(received).not.toMatch(expected)` — `Received: "…undo, redo, the project and role routes, the export…"` |
| the README's example matches the tool | `"stepId"` in the README's `setEstimate` example spelled back to `"roleId"`                                         | `spells the example batch in the fields the commands tool declares` | `expect(received).toEqual(expected)` — `+ [ "setEstimate.roleId" ]`                                            |
| no `Phase`/`Role` on screen           | the trigger's label and `<ModalTitle>` in `steps-dialog.tsx` spelled back to `Phases`                               | `no rendered string says Phase or Role`                             | `expected [ 'text: Phases' ] to deeply equal []`                                                               |
| the dialog is named for what it holds | `<ModalTitle>Steps</ModalTitle>` in `steps-dialog.tsx` spelled back to `Phases`                                      | `the dialog is called Steps`                                        | `TestingLibraryElementError: Unable to find an accessible element with the role "dialog" and name "Steps"`, the dump showing `Name "Phases"` |
| **ARIA `role` was excluded**          | `role="combobox"` on the project picker (`project-page.tsx`) renamed to `step="combobox"`                           | `app-router.test.tsx`, three cases through `projectShowing()`       | `expect(projectShowing()).toBe(true)` — `- true  + false`, 3 failed / 2 passed                                 |

Two of those negatives were **rewritten after they passed with the fault in**,
which is the part worth keeping:

- The wire sweep was first injected at `slicesOf`'s own `slices.push`, and
  passed: the payload's slices are rebuilt from the scheduler's placement, so a
  field added before the schedule never reaches the wire. The injection moved to
  where the fault would live.
- The screen sweep first read `document.body.textContent`, which concatenates
  adjacent elements with no separator — the toolbar reads
  `PrioritiesPhasesFilters`, and `\bPhases\b` matches nothing at all. It walks
  text nodes now, and only then could it see the label.

The ARIA exclusion's negative is the one design D1 asks for. It was aimed at
`project-page.test.tsx` in `tasks.md`; that file holds no `getByRole('combobox')`
case, and the project picker's combobox is asserted in `app-router.test.tsx`
instead, which is where it was watched.

## What the rename does change, and why it is allowed

**One saved view loses one facet, per browser.** A saved view is stored in the
reader's own `localStorage` under `wbs.views.<projectId>` and its criteria object
carried `estimatedRoleIds`. That field is `estimatedStepIds` now, so a view
written before this change loads (the shape check tolerates an absent facet, by
design — "a view from before that facet existed") with its **Estimated for**
selection empty. Nothing crashes, nothing else in the view moves, and the reader
can re-pick.

This is the same decision design D3 made for the wire, applied to the one place
state outlives a deploy: a compatibility read for `estimatedRoleIds` would be a
second parse path for a key no writer will ever produce again. It is recorded
here rather than left for somebody to find. No other stored key carries the word
— the full set is `wbs.project`, `wbs.theme`, `wbs.ganttArrows`,
`wbs.ganttDetail`, and the five per-project keys, none of which name a step.

**One name outside the enumerated list moved.** `work-item.service.ts`'s
`phasesOf(assignees)` does not return steps — it returns a row's `assignees` and
`doesEveryStep`. Renaming it `stepsOf` would have put two unrelated things under
one name in one file, beside `ProjectRepository.stepsOf`. It is
`assignmentFieldsOf` now, with the reason on the symbol.

## Skipped or unavailable checks

- The physical table and column rename is **not** in this change and is not
  verified here. See `steps-schema-rename`.
- No GET route for a project's steps was added. The delta spec's first API
  scenario is worded as a read at `/api/projects/:id/steps`; `stepController`
  deliberately mounts no list route (a second read of one fact), and adding one
  would be the behaviour change this change's own non-goals forbid. The scenario
  now says what the routes do — the write routes serve, the project read lists
  them under `steps`, and every verb at `/roles` is a 404 — and the test asserts
  exactly that.
- `bin/h2puni-gate.sh` is h2puni's; this ran on the Mac, where whole-suite runs
  took `HEAVY_LOCK_WAIT_SECONDS=3600 bin/with-heavy-lock.sh`.
