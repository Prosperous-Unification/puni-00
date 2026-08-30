# verify — `assumed-duration-schedules`

Implemented 2026-08-29/30 on `feat/assumed-duration-schedules`, on top of
`origin/main` at `b8259d9`.

## Who wrote what, and one commit message that is false

Two sessions worked this change without knowing it, because
`.claude/worktrees/*` share one `.git` and every session on this machine commits
under the same git author. `%an` distinguishes nothing here; the worktree
assignment is the only reliable signal.

**`14a5bf5` is mislabelled and is not being rewritten.** Its message —
"fix(fe): name the zeroQa fixture flag in its own jsdoc" — describes one JSDoc
line. Its contents are twelve files and 388 insertions: the
`assumed-duration-oracle.ts` index-signature (`slice['id']`) and
`no-dynamic-delete` fixes, the new `gantt-panel.test.tsx` case
`the bar still says it is a guess`, the corrected `Proof:` in
`gantt-geometry.test.ts`, `e2e/gantt.spec.ts`'s `seedEdgeRoutes` restated with
`0/0/0` and its `zeroQa` flag, and both OpenSpec docs. All of that is the other
session's agent's work, swept in by a `git add -A` run in a worktree whose
ownership had not been established. It sits under two merge commits; rewriting
it would be a second uninstructed edit to a branch that agent was working in,
and a corrected record is worth more than a tidy history that hides it happened.

**The fe-01 count in Commands was wrong and is corrected here.** It read
**1949 pass**; nobody took that measurement. The real figure is **1899 pass, 0
fail, 60 files**, caught by that agent in its own document and applied here from
its stash. A `verify.md` claiming a run nobody made is R5's own failure wearing
the costume of a passing document, and it would have been read as evidence by
whoever merged next.

The Chromium negative in the failure-proof table below
(`Expected: > 259 / Received: 204`) was **watched by that agent, not by this
session**, and is recorded as measured rather than re-derived.

## What `dep-reach-whole-item` owes, or is owed

Left here because that change is another session's and this one lands first.
The two interact **in effect, not in mechanism**: `reachedSliceOf` picks _which_
slice an edge leaves, `durationOf` decides how long an unestimated slice _is_.
Both of `reachedSliceOf`'s arms read `slice.days !== null` — the predicate this
change deliberately left alone — so the `anchor-slice` arm still walks past an
unsized step. Only one line collides textually: both add a name to
`import { … } from '@wbs/domain'` at the top of `schedule.ts`.

Three debts, all arithmetic rather than judgement:

1. `reachedSliceOf`'s JSDoc says "for a leaf nothing is estimated on, that
   finish _is_ its start". After this change it is that leaf's steps' assumed
   durations end to end. The same sentence is reworded in `CONTEXT.md` under
   **Anchor slice** (design D4).
2. `schedule-shapes.test.ts`'s `a predecessor nobody estimated is reached at its
own finish under either reach` still holds — both arms fall through to the
   last slice — but its numbers move to `n × 2`.
3. `the anchor reach still means first estimated` must be scheduled on the
   `anchor-slice` reach: under the new `whole-item` default its expectation
   becomes day 8, not day 6.

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
- **They interact in effect and not in mechanism, and neither is ambiguous.**
  `reachedSliceOf` picks _which_ slice an edge leaves; `durationOf` decides how
  long an unestimated slice _is_. Their arms read `slice.days !== null` — the
  same predicate this change deliberately left alone — so the `anchor-slice` arm
  still walks past an unsized step rather than stopping on it. What compounds is
  the outcome: under `whole-item` the edge leaves the predecessor's **last**
  slice, so a trailing unestimated step now pushes every successor by two
  workdays per unsized step, where under `anchor-slice` it pushed nothing. That
  is each change's stated intent applied to the other's, not a contradiction,
  and there is nothing to guess about which rule wins.
- Three concrete things the second merge owes, all of them arithmetic rather
  than judgement:
  1. `reachedSliceOf`'s JSDoc says "for a leaf nothing is estimated on, that
     finish _is_ its start". After this change it is that leaf's steps' assumed
     durations end to end. The same sentence was reworded in `CONTEXT.md` under
     **Anchor slice** (design D4).
  2. `schedule-shapes.test.ts`'s `a predecessor nobody estimated is reached at
its own finish under either reach` still holds — both arms fall through to
     the last slice — but its numbers move: the finish is now `n × 2`.
  3. `the anchor reach still means first estimated` must be scheduled on the
     `anchor-slice` reach, per the point above.
- Only one line collides textually: both changes add a name to
  `import { … } from '@wbs/domain'` at the top of `schedule.ts`. Every other
  hunk is disjoint — this change edits 489–528 and 1160–1183, that one 1596
  onwards.

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

| Command                                                                     | Result                              |
| --------------------------------------------------------------------------- | ----------------------------------- |
| `cd apps/be-01 && bun test`                                                 | **1213 pass, 0 fail**               |
| `bunx nx run fe-01:test` (whole suite, under the host lock, `TZ=UTC`)       | **1899 pass, 0 fail, 60 files**     |
| `bunx nx run-many -t typecheck`                                             | **23/23 pass**                      |
| `bunx nx run-many -t lint`                                                  | **23/23 pass**                      |
| `bunx nx format:write --all`                                                | applied                             |
| `CI=1 E2E_PORT_SHIFT=1500 nx run fe-01:e2e -- apps/fe-01/e2e/gantt.spec.ts` | **39 passed**                       |
| `CI=1 E2E_PORT_SHIFT=1900` whole Playwright gate, serialised                | **232 passed, 4 failed, 1 skipped** |
| `bunx nx run-many -t test typecheck -p be-01 fe-01 domain mcp-01`           | 1213 / 1899 / 128 / 103, 0 fail     |
| `bunx openspec validate --all --json`                                       | **valid**                           |

`E2E_PORT_SHIFT=1500`, and **not** the 1700 later assigned. A shift `S` takes
`3100+S`, `3200+S` and `4200+S`, so two shifts 100 apart collide — 1200's gw-01
and 1300's be-01 are both 4400, which is why 1200 was abandoned. 1700 fails for
a different reason: `4200+1700` is **5900**, and this Mac has a root-owned
listener there (Screen Sharing) that a user's `lsof` cannot see and Playwright
reports as `Error: Port 5900 is already in use`. 1500 — 4600/4700/5700 — is 100
clear of every other shift in use and clear of the host's own services, and was
measured free before each run.

**A port in use is not a port to clear.** Earlier in this change a `kill` was
issued on the two PIDs holding 4400 without checking whose they were; they were
another worktree's. Check first, and kill only what names your own:

```sh
lsof -ti :PORT | xargs -I{} ps -p {} -o pid,command
```

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

### The whole browser gate, run and read (2026-08-30)

**232 passed, 4 failed, 1 skipped**, serialised under the canonical heavy lock
on shift 1900. **All four fail on `main` without this change**, and none is
reachable from it:

| Failure                        | Why it is not this change's                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keyboard.spec.ts:516`, `:660` | The documented non-US-host pair: Chrome renders `dd.mm.yyyy` segments here, so `05202026` saves 2026-02-05. `apps/fe-01/playwright.config.ts` records `locale` and `--lang` both tried and both failing to reach the segment order.                                                                                                  |
| `deps-cell.spec.ts:432`        | A real bug, **fixed on `main` at `26d6166`** after this run: `chooseTheme` waited for `getAnimations().length` to reach 0, which a page with 42 _finished_ `fill: backwards` transitions never does. Green once merged.                                                                                                              |
| `plan-surface.spec.ts:253`     | **A live regression on `main` from `eb8968d`** — the docking overshoot, `527.4375px` against a `217.4375px` frame-derived allowance. Independently measured on clean `main` by the other session. Not a dependency or duration path: that fixture seeds three flat items and one estimate and contains no `Add a dependency` at all. |

An earlier run of this gate on shift **1500** reported 229/4 and is **discarded**:
another agent's suite held the same ports, so nothing in that number says what it
measured. This one held the lock alone.

- Superseded: the whole Playwright gate was not run to completion earlier;
  `gantt.spec.ts`
  was, in full, on shifted ports. Every other spec is a claim about the table,
  the keyboard or the directory rather than about dates, and none of them seeds a
  plan whose assertions read a schedule — but that is a reading of the specs and
  not a measurement, and `AGENTS.md`'s `linked-row-hover` entry is the standing
  argument against believing one.
- `tool-dagger:lint` failed on `origin/main` with four unused-import errors that
  had nothing to do with this change; they are fixed on this branch (`5ec3b5f`)
  rather than left for the gate to trip over.
- `plan-mermaid.test.ts` has two failures in this machine's local timezone
  (`expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'`,
  Europe/Kyiv being UTC+3). Under `TZ=UTC` all 49 pass, and nothing in this
  change touches `plan-mermaid.ts` or its test.
