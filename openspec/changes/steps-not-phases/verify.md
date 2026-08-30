# verify — `steps-not-phases`

Branched from `fix/reference-cell-popover` (`7ac1285`) and then merged **four
times** with `origin/main`, which moved 60-odd commits under it — `work-item-types` through the
UI, `external-refs`, `estimate-triple-visible`, `gantt-resize-scroll`, the
toolbar budget, the host-wide heavy lock. Base at the fourth merge: `a32c94b`.

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
`origin/main` at `ac8c882`, statically: every `it(` / `itDom(` / `test(`
declaration in each project, on both refs.

| Project       | Cases on `origin/main` | Cases here | Delta                 |
| ------------- | ---------------------- | ---------- | --------------------- |
| `libs/domain` | 130                    | 130        | 0                     |
| `be-01`       | 1211                   | 1215       | +4, all new and named |
| `fe-01`       | 1869                   | 1872       | +3, all new and named |
| `mcp-01`      | 103                    | 105        | +2, all new and named |

The nine are the nine this change's `tasks.md` asks for and nothing else:

- be-01 `serves a project's steps`, `refuses the old roles route as unknown`
  (3.2), `has no payload field named roleId` (3.3), `the step table's physical
name is still role` (3.1).
- fe-01 `no rendered string says Phase or Role` (4.3), `says nothing on this
panel that reads Phase or Role`, `the removal sentence says step` (4.2). The
  middle one was `the dialog is called Steps` until `project-config-modal` split
  the dialog into panels — see the reconciliation section.
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

**The runners agree, and every suite is green.** One locked run of all four
projects on the merged tree: `domain` 128 pass / 0 fail, `mcp-01` 105 pass / 0
fail, `be-01` 1207 pass / 0 fail across 88 files, `fe-01` 1900 passed across 60
files — `NX Successfully ran target test for 4 projects`. The runners' totals
run higher than the static counts above because cases generated inside loops
are counted once each there and once per iteration here; what matters is that
nothing is red and nothing is skipped.

That is also **five fewer failures than the base this change started from**: the
old checkout's `login-throttle` timeout, the `priority-band` JSON parse
downstream of it and three in `wbs-table.test.tsx` are all gone, fixed on main
between the two merges. None of the five was this change's.

The pre-merge baseline, for the record: measured on `7ac1285` before a single
identifier moved — `domain` 118/0 failed, `be-01` 1172/2 failed, `fe-01`
1872/3 failed, `mcp-01` 103/0 failed. Those five failures were that checkout's,
not this change's: `login-throttle.test.ts` timing out at 7187ms against a 5000ms
limit, `priority-band.controller.test.ts` failing to parse JSON downstream of it,
and three in `wbs-table.test.tsx` (`expected 'clip' to be 'hidden'` plus two
5000ms timeouts in a 458-second run).

## Commands

| Command                                                                                                                                | Result                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck --projects=domain,be-01,fe-01,mcp-01`                                                                   | pass                                                                                                                                                                                                                |
| `HEAVY_LOCK_WAIT_SECONDS=3600 bin/with-heavy-lock.sh -- bunx nx run-many -t test --projects=domain,mcp-01,be-01,fe-01 --skip-nx-cache` | **pass, all four** — `NX Successfully ran target test for 4 projects`                                                                                                                                               |
| `bunx nx format:check --all`                                                                                                           | pass, after three `--write` passes (it is not idempotent on these docs)                                                                                                                                             |
| `bunx nx run-many -t lint`                                                                                                             | pass — one pre-existing `react-hooks/exhaustive-deps` warning from main, 0 errors                                                                                                                                   |
| `bun apps/be-01/src/openapi/emit-openapi-cli.ts`                                                                                       | run; `openapi.json` committed beside the routes                                                                                                                                                                     |
| `bunx openspec validate --all --json`                                                                                                  | pass — 92 of 92                                                                                                                                                                                                     |
| `HEAVY_LOCK_WAIT_SECONDS=7200 bin/h2puni-gate.sh`                                                                                      | on the ask-3 reconciled tree: `be-01` **1217 pass across 89 files**, `fe-01` **61 of 61 files**, every other project green on test/lint/typecheck/build; the `tool-*` trio fails ten, none of them code — see below |
| `HEAVY_LOCK_WAIT_SECONDS=7200 bin/with-heavy-lock.sh -- env CI=1 E2E_PORT_SHIFT=600 bunx nx run fe-01:e2e`                             | **239 planned, 236 passed, 1 skipped, 2 failed** — the documented date pair, and the count reconciles                                                                                                               |

## Failure proofs (R5)

Every one watched by hand: the fault written in, the named test run, the exact
message read, the fault taken back out, the test run again green. None of these
was injected with `git checkout` — the tree carried uncommitted work throughout.

| Check                                 | Fault injected                                                                                                      | Test that saw it fail                                                 | Exact failure                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| the old routes are gone               | `.post('/:id/roles', …)` left mounted beside `/:id/steps` in `step.controller.ts`, forwarding to the same handler   | `refuses the old roles route as unknown`                              | `expect(received).toBe(expected)` — `Expected: 404  Received: 200`                                             |
| no `roleId` on the wire               | `scheduledSlices` given the old spelling back: `.map(([id, placed]) => ({ id, roleId: placed.stepId, ...placed }))` | `has no payload field named roleId`                                   | `expect(received).toEqual(expected)` — `+ [ "slices[0].roleId", "slices[1].roleId" ]`                          |
| the README names tools that exist     | the README's prose spelled back to `the project and role routes`                                                    | `names no tool the document does not derive`                          | `expect(received).not.toMatch(expected)` — `Received: "…undo, redo, the project and role routes, the export…"` |
| the README's example matches the tool | `"stepId"` in the README's `setEstimate` example spelled back to `"roleId"`                                         | `spells the example batch in the fields the commands tool declares`   | `expect(received).toEqual(expected)` — `+ [ "setEstimate.roleId" ]`                                            |
| no `Phase`/`Role` on screen           | the steps section's tab label in `project-settings-modal.tsx` spelled back to `Phases`                              | `no rendered string says Phase or Role`                               | `expected [ 'text: Phases' ] to deeply equal []`                                                               |
| the panel is named for what it holds  | the steps section's tab label in `project-settings-modal.tsx` spelled back to `Phases`                              | `no rendered string says Phase or Role`, which now opens that surface | `expected [ 'text: Phases' ] to deeply equal []`                                                               |
| **ARIA `role` was excluded**          | `role="combobox"` on the project picker (`project-page.tsx`) renamed to `step="combobox"`                           | `app-router.test.tsx`, three cases through `projectShowing()`         | `expect(projectShowing()).toBe(true)` — `- true  + false`, 3 failed / 2 passed                                 |

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

## Reconciling with `project-config-modal`

Ask 3 landed first, by agreement: it was told to build against `phases-dialog.tsx`
rather than wait, so this reconciliation is this change's to pay. It arrived as a
**rename/rename** — this change renames `phases-dialog.tsx` to `steps-dialog.tsx`,
ask 3 renames it to `phases-panel.tsx` and splits the body into a
`ProjectSettingsModal` with `teams-panel`, `priorities-panel` and the steps one.

Resolved the way every other merge here was: **ask 3's structure wins wholesale**
(`-X theirs`, and the two tree conflicts resolved by hand to its files), then the
rename is re-applied over the result from `identifiers.txt`. The panel is
`steps-panel.tsx` / `steps-panel.test.tsx` now, and `StepsDialog`'s dead import
in `wbs-table.tsx` — a non-conflicting line of this change's that `-X theirs`
could not know was stale — was deleted.

**One test changed shape, because the surface did.** `the dialog is called Steps`
asserted a dialog title; the panel has no title of its own any more. Its two
claims are split where they now live: ask 3's own
`opens on one control and offers every section from its tab list` already asserts
the tab list, and this change turns that assertion from
`['Teams', 'Priorities', 'Phases']` into `['Teams', 'Priorities', 'Steps']` — so
the spec's "its title SHALL read `Steps`" is covered there. What the panel still
owns is asserted on the panel, as `says nothing on this panel that reads Phase or
Role`. No claim was dropped and the case count is unchanged.

**The screen sweep had to follow the surface, and its own anchor said so.**
`no rendered string says Phase or Role` walked the table at rest and ended with a
non-vacuity anchor — the word the fault would corrupt must be among the strings
it read. After the panel split that anchor failed:
`expected [ 'Freeze #', 'Add work item', …(77) ] to include 'Steps'`. Nothing was
broken; the word had moved off the toolbar into a panel behind `Project
settings`, and the sweep was no longer reading the surface it is about. It opens
that surface now, and the negative was re-watched there — the steps section's tab
label spelled back to `Phases`, failing on
`expected [ 'text: Phases' ] to deeply equal []`.

That anchor is the reason this was caught rather than shipped as a sweep of a
page the word had left. A check that can only pass is worth as little as one that
can only fail.

**The one real behaviour fix survived, and was re-measured.**
`schedule-benchmark.test.ts`'s outer loop is still `parent` rather than `step`.
`assumed-duration-schedules` moved the fixture's figure from 175 to 188 on main,
so the old proof no longer described anything; the fault was re-injected —
`parent` and `parentId` renamed to `step` and `stepId` through `buildPlan`, which
restores the shadowing — and watched failing on `Expected: 188  Received: 190`.
The JSDoc now quotes that, and keeps the original 175/173 as the reading when the
fault was first found.

## The browser gate

`Running 239 tests using 1 worker` → **236 passed, 1 skipped, 2 failed**, on shift
600 against the ask-3 reconciled tree. 236 + 1 + 2 = 239, so the planned count and
the summary reconcile: no case was dropped, and the result is not a killed run
being read as a green one.

The two failures are the documented pair, and nothing else:

- `keyboard.spec.ts:516` `Escape leaves the stored day alone, blur and all`
- `keyboard.spec.ts:660` `saves only the year that was typed, digit by digit, in
a real Chrome`

Both are date-segment typing against a non-US host locale, known-failing on this
machine before this change started.

**Two earlier failures were attributed and are now gone.** An earlier run of this
gate showed four. `deps-cell.spec.ts:432` was its own drain, fixed on main by
`26d6166`. `plan-surface.spec.ts:253` was red on `origin/main` itself — proved by
running it on a detached `origin/main`, where it failed with the identical
`Error: 527px between the last row and the chart, against 215px anything asked
for`; it was `unified-scroll-docking`'s test asserting a rule `eb8968d`
deliberately reversed, and `6fe8a26` has since corrected it. Neither was this
change's, and both were attributed by running them rather than by reading a diff.

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
- **The three `tool-*` suites do not pass on this host, and neither reason is
  this change's.** `tool-dagger`, `tool-devsync` and `tool-bootstrap` failed the
  same ten cases on two separate gate runs. `git diff origin/main..HEAD -- tools/ bin/`
  is **empty**, so this change cannot reach a line of any of them. The ten split
  two ways:
  - **Eight are starvation**, not assertions. `configure.sh` cases blowing a
    60000ms limit at 284s, 282s and 287s of wall clock, four more blowing 5000ms
    at 15–17s, and the tell — `with-heavy-lock > refuses **immediately** with
exit 75 while another heavy operation owns the lock` timing out at 5001ms.
    Three other agents' heavy runs were live on this host throughout. The same
    ten reproduced identically on **three** separate gate runs, unchanged by
    anything this branch did between them.
  - **Two are the platform.** `dev MCP preflight` fails in 30ms and 53ms with
    `stat: illegal option -- c`. `bin/dev-mcp-preflight.sh:16` calls
    `stat -c '%a'`, which is GNU syntax; macOS ships BSD `stat`, which wants
    `-f '%Lp'`. These two fail on any Mac and pass on CI's Linux, and they are
    older than this change.
