# verify — `assumed-duration-schedules`

Implemented 2026-08-29/30 on `feat/assumed-duration-schedules`, on top of
`origin/main` at `b8259d9`.

## Ordering

`tasks.md` 0.1 orders this after `dep-reach-whole-item` so the `anchor-slice`
arm exists to be protected by slice 2.2. It was run **before** it, deliberately:
the behaviour slice 2.2 protects — "a dependency leaves the predecessor's first
_estimated_ slice" — is the engine's only rule today, so the test is written
against it as it stands and becomes that change's `anchor-slice` case verbatim.
Nothing here reads or writes a reach. `project-config-modal` is a toolbar dialog
and is not a dependency of anything in this change.

**What the merge with `dep-reach-whole-item` (`5ee589d`) has to do**, stated so
it is not discovered by a conflict:

- The two changes touch `schedule.ts` in different places. This one rewrites
  `durationOf`; that one replaces the `anchorNodeOf` call in the edge expansion
  with `reachedSliceOf(reach, …)`. Neither reads the other's line.
- **`the anchor reach still means first estimated`**
  (`schedule-assumed-duration.test.ts`) is written against a project on the
  anchor rule, which is every project until that change lands. Once it lands the
  default is `whole-item`, and that fixture must be scheduled with the reach set
  to `anchor-slice` or its expectation re-derived: under `whole-item` the
  successor waits for `A`'s **last** slice, which is its unestimated `QA` at day
  8, not its `Dev` at day 6.
- The two rules compose rather than fight. Under `whole-item` a trailing
  unestimated step now pushes successors, where before this change it pushed
  nothing. That is both changes' stated intent, and neither needs the other to
  be correct.

## What this change moved

Every plan holding an unestimated slice. Fully-estimated plans do not move at
all — that is the line between "the assumption reached the engine" and "the
assumption leaked into estimated work", and it is asserted rather than argued.

| Fixture                                                     | Holds an unestimated slice | Expected to move | What was done                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule-identity.test.ts`, 1000 plans × 2 roles           | yes (one pair in four)     | **yes**          | The oracle is told the duration rule **once**, in `OracleDurations`; every field still `toBe`-exact against an independently written critical path |
| `schedule-identity.test.ts`, 1000 plans × 3 roles           | yes                        | **yes**          | as above                                                                                                                                           |
| `schedule-identity.test.ts`, 1000 plans × 1 role, edges     | yes                        | **yes**          | as above                                                                                                                                           |
| `schedule-identity.test.ts`, **1000 fully estimated plans** | no                         | no               | **New.** The same generator with every pair estimated, so the `??` never fires and the oracle is the pre-change oracle character for character     |
| `schedule-identity.test.ts`, sized-team corpus              | yes                        | no               | Compares this engine against itself, pooled versus not — untouched                                                                                 |
| `live-plan-2026-08-09.json` (a real plan)                   | yes: `020`, `030.1.1`      | **yes**          | `duration` and `estimated` still asserted against the capture for every row; the placement re-derived row by row with the reason on each           |
| the same capture, with a role nobody estimated added        | yes                        | **yes**          | Was "changes nothing"; is now "adds exactly one assumed duration to every leaf", asserted as the difference from the run without it                |
| `capacity-oracle-2026-08-13.json`, 3 fully-estimated plans  | no                         | no               | Whole document, byte-identical, no exceptions                                                                                                      |
| `capacity-oracle-2026-08-13.json`, 13 plans with a gap      | yes                        | **yes**          | Whole document with the placement set aside (`withoutPlacement`), plus `countMovedDates > 0` as the non-vacuity                                    |
| `schedule-priority.test.ts`'s contention pin                | yes: `c-p1/role-qa`        | **yes**          | Re-derived field by field; only that slice and the floats measuring the new project finish moved, and `waitingForPerson` 2 → 3                     |
| `schedule-benchmark.test.ts`'s 600-slice plan               | yes (one slice in seven)   | **yes**          | `waitingForPerson` 175 → 188                                                                                                                       |
| `schedule.test.ts`, `schedule-shapes.test.ts`               | yes                        | **yes**          | Re-derived case by case, each with its reason beside it; the anchor rule's own claims unmoved                                                      |

A fully-estimated fixture that moved would be a bug in the duration lookup. None
did.

**Not monotone, and measured.** "An assumed duration can only push work later"
is false and is not claimed: with the assumption on, `p14-g2-l1 role-0` starts on
day 6 where the capture has it on day 11, because leveling ranks its queue by the
unlevelled float and a slice whose rank rose takes the person earlier. That is
why `countMovedDates` counts rather than compares.

## The six reporters (design D2)

Each answers exactly as it did. None of the six call sites was touched.

| Reporter                           | Answer before              | Answer after               | Where that is held                                                                                                |
| ---------------------------------- | -------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| days column                        | blank                      | blank                      | Reads `finalDays`, an estimate row; `wbs-table.test.tsx` 547/547                                                  |
| roll-up                            | blank                      | blank                      | `rollUp` folds estimate rows; asserted empty in `an unestimated item still reports no estimate`                   |
| readiness badge / walk to next gap | counts the gap             | counts the gap             | `findEstimateGaps` is `Object.hasOwn(estimates, roleId)`; `plan-completeness.test.ts` 13/13 unmoved               |
| export                             | unestimated                | unestimated                | fe-01's columns read `finalDays`; be-01's Duration column reads `duration`, which is still expected days and is 0 |
| `estimatedRoleIds` facet           | absent                     | absent                     | `tree-search.test.ts` 50/50 unmoved                                                                               |
| `anchor-slice` reach               | skips the unestimated step | skips the unestimated step | `the anchor reach still means first estimated`                                                                    |

## Commands

| Command                                                                     | Result                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `cd apps/be-01 && bun test`                                                 | **1213 pass, 0 fail**                                        |
| `bunx nx run fe-01:test` (whole suite, under the host lock, `TZ=UTC`)       | **1949 pass, 0 fail**                                        |
| `bunx nx run-many -t typecheck`                                             | **23/23 pass**                                               |
| `bunx nx run-many -t lint`                                                  | 22/23; `tool-dagger:lint` fails identically on `origin/main` |
| `bunx nx format:write --all`                                                | applied                                                      |
| `CI=1 E2E_PORT_SHIFT=1500 nx run fe-01:e2e -- apps/fe-01/e2e/gantt.spec.ts` | **39 passed**                                                |
| `CI=1 E2E_PORT_SHIFT=1500` whole Playwright gate                            | see "Skipped or unavailable checks"                          |
| `bunx openspec validate --all --json`                                       | **valid**                                                    |

`E2E_PORT_SHIFT=1500`, not the 1200 first assigned: 1200 puts gw-01 on 4400,
which is `dep-reach-whole-item`'s be-01 at shift 1300, and 1700 puts fe-01 on
5900, which is this Mac's Screen Sharing listener. A shift has to be more than
100 from every other shift **and** clear of the host's own services.

## Failure proofs (R5)

Every one watched, with the text the run printed.

| Check                            | Fault injected                                                | Test that saw it fail                                                                           | Failure text                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| one constant, two readers        | `ASSUMED_SLICE_WORKDAYS = 3` in `libs/domain`                 | fe: `the drawing and the dates agree`; be: `is two workdays wide, and says so in its own dates` | `expected 3 to be 2` — and `- "earliestFinish": 2 / + "earliestFinish": 3`. One edit, both readers.                                      |
| the assumption reaches leveling  | the person floor gated on `(node.slice.days ?? 0) > 0`        | `two unestimated slices for one person do not overlap`                                          | `- [] / + [ "kat: a/role-dev and b/role-dev", "kat: b/role-dev and a/role-dev" ]`                                                        |
| assumed is not estimated         | `estimated: durationOf(slice) > 0`                            | `an unestimated item still reports no estimate`, **and fifteen others**                         | `- "estimated": false / + "estimated": true`; also `reports an unestimated leaf as unestimated, not merely as zero` and all four corpora |
| the anchor still means estimated | the anchor's `slice.days !== null` → `durationOf(slice) > 0`  | `the anchor reach still means first estimated`                                                  | `Expected: 6 / Received: 2`                                                                                                              |
| a stated zero is not an absence  | `durationOf` written `!slice.days ? ASSUMED : …`              | `an explicit zero is still zero, because somebody said so`                                      | `- "earliestFinish": 0 / + "earliestFinish": 2`                                                                                          |
| the assumption exists at all     | `durationOf`'s assumed arm removed                            | `an entirely unestimated predecessor delays its successor`                                      | `- "earliestFinish": 2 / + "earliestFinish": 0`                                                                                          |
| the narrowed oracles are honest  | the same fault                                                | `countMovedDates`' caller in both captured-oracle files                                         | `Expected: > 0 / Received: 0` — a narrowing green for the wrong reason is what that assertion refuses                                    |
| the assumption is only for gaps  | `durationOf` returns the assumed duration for **every** slice | `a fully estimated plan is not moved at all by the assumed duration`                            | `seed 1, r0c0g0.earliestFinish: 12.5 became 7`                                                                                           |
| the bar still says it is a guess | `data-assumed` dropped in `gantt-panel.tsx`                   | `the bar still says it is a guess`, and nine others                                             | `Error: the detail switch was pressed and nothing arrived at [data-assumed]`                                                             |
| the successor really waits       | `durationOf`'s assumed arm removed                            | `draws a successor after the predecessor nobody estimated` (Chromium)                           | `the successor is drawn left of the work it waits for: Expected: > 259 / Received: 204`                                                  |

The browser proof is worth reading twice. With the assumption reverted the
predecessor's two bars **keep their width**, because the drawing has assumed two
workdays since `gantt-view`; only the successor's placement moves. So the check
that sees the fault has to be the ordering and not the widths — and the widths
are asserted non-zero first, because a bar with no area cannot be to the right of
anything (`AGENTS.md`, the `gantt-calendar-axis` vacuity).

## Fixtures that had to be re-stated, not merely re-derived

Two browser fixtures were built on "a row nobody estimated takes no time", which
this change makes false. Both now **state** the zero rather than leaving the step
blank — the same schedule, a different sentence:

- `seedEdgeRoutes`, whose subject is arrows routing off the schedule's two ends
  and which therefore needs a successor at workday 0 and another at the horizon.
  Every role of every row but `030`'s `Dev` carries `0/0/0`. A consequence worth
  knowing: a zero-day slice draws a `<rect width="0">` and a `<line x1=x2>`,
  both of which a browser reports as **hidden**, so the chart is opened on the
  row labels and the one bar with width is then polled for — which is also that
  fixture's non-vacuity.
- `reads the hovered bar's own dates`, which compares a **bar's** surface against
  its **row's** printed days. Those are the same days only while the row's later
  steps take none, so `seedPlan` grew a `zeroQa` that states that zero.

## Skipped or unavailable checks

- `bin/h2puni-gate.sh` was **not** run: this is a Mac and that gate is h2puni's.
  The five commands it wraps were run individually, the whole-suite ones under
  `bin/with-heavy-lock.sh`.
- The **whole** Playwright gate was not run to completion here; `gantt.spec.ts`
  was, in full, on shifted ports. Every other spec is a claim about the table,
  the keyboard or the directory rather than about dates, and none of them seeds a
  plan whose assertions read a schedule — but that is a reading of the specs and
  not a measurement, and `AGENTS.md`'s `linked-row-hover` entry is the standing
  argument against believing one.
- `tool-dagger:lint` fails on `origin/main` with the same four unused-import
  errors; `tools/tool-dagger` is byte-identical to main in this worktree.
- `plan-mermaid.test.ts` has two failures in this machine's local timezone
  (`expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'`,
  Europe/Kyiv being UTC+3). Under `TZ=UTC` all 49 pass, and nothing in this
  change touches `plan-mermaid.ts` or its test.
