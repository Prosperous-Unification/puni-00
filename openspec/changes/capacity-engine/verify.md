# verify — `capacity-engine`

Branch `change/capacity-engine`, cut from `main` @ `e3918f6` (#41 critical-snap,
#42 dep-add-button, #43 priority-column, #44 gantt-declutter, #45
dep-waits-on-first-role, #46 priority-commit-polish all merged) on 2026-08-12.

be-01's schema, adapter and engine, plus one export from `libs/domain`. Two
additive migrations with their rollbacks. No API shape change, no gw-01 change,
no fe-01 change and no pixel: C1 carries the engine, and everything a person can
see or type is C2 and C3.

## The gate

Run on CI, on PR #48, head `5c94591`, 2026-08-12 — run
[31594532014](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31594532014),
both jobs green. This box (`h1claw`) does not run builds or test suites — the
rule is house policy and a `PreToolUse` hook denies it — so every figure below
is CI's or `h2puni`'s, never this host's.

| Command                                                      | Where  | Result                                                                                 |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | CI     | green, exit 0                                                                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | CI     | green — 21 projects; be-01 **655 tests** in 54 files, `libs/domain` **154** in 7 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | CI     | green — 32 items, **32 passed, 0 failed**                                              |
| secrets scan, doc caps, compose config, migration lint       | CI     | green                                                                                  |
| `bun run e2e` (the `pixels` job)                             | CI     | green — this change touches no pixel, and the job is the reason that can be said       |
| the seventeen fault injections below                         | h2puni | all seventeen observed red, output quoted verbatim                                     |

be-01 was **623** tests when #45 merged: this change adds **32**, of which 23 are
`schedule-capacity.test.ts` and the rest are the migration walk, the adapter's
two width rules and the identity differential's new run. `libs/domain` gains
`effective-team.test.ts`'s 7. fe-01 is untouched — no file under `apps/fe-01`
changed — and its count is not quoted here, because vitest's summary is not in
the gate log to quote.

A first attempt to run the whole gate on `h2puni` wedged: `nx run-many` sat at
0.2% CPU for twenty-three minutes with no child task and no output, alongside
another session's identically wedged run from a different checkout on the same
box. It was killed rather than waited on, and no result is claimed from it. The
fault injections were run instead in a second, clean clone (`~/wbs-reds`), where
each case is one `bun test` invocation and nx is never involved.

`h2puni`'s system `bun` is **1.2.20**; CI pins **1.3.14**. The fault table below
is therefore evidence about the checks, not about the runtime, and CI is the
authority on the gate.

## What moved

- **Two migrations.** `20260812100000_add_team_slots` adds
  `service_team.size` **nullable with no default** — null is _nobody has said_,
  and a default would silently size every team that already exists, which moves
  plans nobody touched. `20260812100001_add_max_parallel` adds
  `work_item.max_parallel` `NOT NULL DEFAULT 1` — the default is what lets the
  **outgoing** release keep inserting rows during a blue/green swap. Both have a
  `down.sql` naming what is lost, and `migrate.test.ts` walks the rollback in
  reverse application order and then reads the result with the outgoing
  release's own statements rather than trusting the CLI's exit code.
- **`effectiveTeamOf`** (`libs/domain/src/effective-team.ts`): a leaf's own team
  label or the nearest ancestor's, with the row it came from, for a whole plan
  at once. Most-specific wins — a label is a statement about whose work this is,
  and the one written closest to the work meant that work. A parent chain that
  runs in a circle is refused rather than defaulted.
- **The slice grew `width` and `poolId`** (`work-item.service.ts`), both
  resolved in `slicesOf` and never re-derived inside the pass — `personId`'s
  rule for `personId`'s reason. Width is the narrowest of three statements the
  plan makes: 1 where a person is named, the team's size where the item asks for
  more people than the team has, the stored `maxParallel` otherwise. Team sizes
  are read through `slotsOf`, which is the seam a per-project allocation goes
  behind (design.md D6).
- **Duration is effort divided by width** (`schedule.ts`), and the prefix sum
  `offsets[]` is computed over it before placement. `ScheduledSlice` now carries
  `effort` beside `duration`, and `width`, so C3 has something true to print.
- **A per-pool usage profile, aggregated by timestamp** — one entry per instant,
  `{ at, delta, acquires, releases }`. Reservations are half-open `[start,
finish)`, so a release at an instant must be seen before an acquisition at the
  same instant; summing every delta at one timestamp first is what makes the
  answer independent of the order entries arrived in.
- **Whole-window placement**: a block takes the earliest instant at or after its
  other floors where its slots are free for **every instant of its duration**. A
  gap too short is stepped over. It never runs narrow and widens later.
- **A `capacity` floor**, entered after `person`, so a tie between the two names
  the person. `Schedule.waitingForCapacity` counts beside `waitingForPerson`,
  which keeps its meaning to the byte.
- **The blocking set**: every reservation active at a violated instant is
  recorded and edged, not only the one whose finish opened the window.
  `resourcePredecessorId` becomes what it always was on screen — a display
  referent, the latest finisher, ties by placement order — and a capacity floor
  arriving with an empty blocking set throws rather than drawing a bar that
  claims a wait and names nothing.
- **`Schedule.eventsVisited`**, an instrumented bound on the scan. A wall-clock
  assertion is not an R5 proof and is flaky in CI; the instrument is asserted and
  the stopwatch is not.

## Failure-proof table

Every check this change adds, with the guarded thing deliberately broken, the
test that observed it, and the literal first failure line. Run on `h2puni` in a
clean clone of `21dcc4f`, 2026-08-12, by `tmp/watched-reds.sh` — which applies
one fault, runs one test, restores from a byte copy, and **refuses to report a
red at all if the fault text did not apply**. That guard exists because it
happened: `git checkout --` over a list containing an untracked file reverts
nothing while exiting non-zero, which silently left a fault applied across three
cases and turned three watched reds green earlier the same day.

| #   | Slice | Fault injected                                                                    | Test that observed it                                                           | Observed                                                                                                                     |
| --- | ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F1  | 4.1   | `duration = effort / width` → `effort`                                            | `compresses six days of effort into two when three may work at once`            | `Expected: 2, Received: 6`                                                                                                   |
| F2  | 3.2   | the clamp to the team's slots, dropped                                            | `clamps a work item's parallelism down to the size of its team`                 | `toMatchObject` failed — `width: 4` on a team of two                                                                         |
| F3  | 3.3   | the named-person arm (`personId !== null ⇒ 1`), dropped                           | `runs a named person's work one at a time however parallel the item is`         | `toMatchObject` failed — `width: 3` on work one person is doing                                                              |
| F4  | 5.2   | the interior walk disabled, so only the start instant is tested                   | `skips a gap it cannot fit inside and waits for the whole window`               | `toMatchObject` failed — the block took a gap it does not fit in                                                             |
| F5  | 5.1   | the per-timestamp merge in `eventAt` removed                                      | `lets a block run through the instant another hands its slot over`              | `toMatchObject` failed — the block came back at 4→8 instead of 0→4, off a slot nobody took                                   |
| F6  | 7.1   | the graph narrowed to the latest finisher alone                                   | **`reports no float on a block whose slack another block's finish is holding`** | `Expected: 2, Received: 5` — a row reported movable that cannot move. **The headline regression.**                           |
| F7  | 6.1   | the `capacity` entry deleted from the floors list                                 | `waits for a team's slots to come free before it starts`                        | `toMatchObject` failed — the third block on a team of two came back at day 0                                                 |
| F8  | 6.2   | the `capacity` entry moved **above** `person`                                     | `names the person, not the pool, when the two land on the same day`             | `error: b role-dev waited for capacity with nothing holding the pool`                                                        |
| F9  | 8.2   | `hasResourceEdges` read as "a pool exists" rather than from emitted edges         | `answers what it answered with a sized team labelling every row`                | `seed 13, r0c0g0 role-0.latestFinish: 2.833333333333334 became 2.8333333333333335`                                           |
| F10 | 5.3   | the `finish === start` guard dropped, so a zero-length block writes events        | `gives a slice nobody has estimated no reservation and no wait`                 | `eventsVisited` `Expected: 2, Received: 4`                                                                                   |
| F11 | 5.4   | the up-front `W <= N` refusal removed                                             | `refuses a block wider than the pool it draws from, before it searches at all`  | `expected function to throw` — the backstop caught the same plan, one scan later                                             |
| F12 | 7.3   | the blocking set emptied **and** the invariant's throw replaced by a fall-through | `waits for a team's slots to come free before it starts`                        | `toEqual` failed — `resourcePredecessorId: null` under `boundBy: 'capacity'`                                                 |
| F13 | 1.1   | `service_team.size` written `integer DEFAULT 1 NOT NULL`                          | `leaves teams that existed before the column unsized`                           | `expect(received).toBeNull()`, `Received: 1`                                                                                 |
| F14 | 1.2   | `work_item.max_parallel`'s `DEFAULT 1` removed                                    | `lets the outgoing release keep inserting work items and teams against both`    | 2 failed — and the **priority** migration's own outgoing-release test with it, which is the same blue/green break seen twice |
| F15 | 2.2   | the `seen` guard in `effectiveTeamOf` removed                                     | `refuses a parent chain that runs in a circle`                                  | the run was **`Killed`** — it never answered, which is the point: the guard's absence is a hang, not a wrong answer          |
| F16 | 2.1   | most-specific-wins replaced by furthest-ancestor-wins                             | `gives the nearer ancestor's label to a leaf between two`                       | `toEqual` failed — the leaf took the root's label over its parent's                                                          |
| F17 | 5.5   | the missing-pool-size refusal replaced by `?? Infinity`                           | `refuses a pooled slice whose pool has no size`                                 | `expected function to throw` — the pool bounded nothing and the plan came back unconstrained                                 |

Three of these deserve their exact wording rather than a summary:

- **F6 is the change.** codex's counterexample in review — pool of 2, width-1
  blocks A and B ending days 5 and 7, width-2 block X starting day 7 — returns
  A's float as **5** under the one-edge graph the plan first specified, and
  **2**, the true answer, under the blocking set. 5 is a false green: a row drawn
  with slack it has none of, which is the class of fault that killed the first
  leveling algorithm.
- **F8 did not fail the way it was predicted to.** The prediction was that the
  tie would name `capacity` where the assignee was owed the sentence. What
  actually happened is that reordering the floors made the referent invariant
  throw — `b role-dev waited for capacity with nothing holding the pool` — so
  the fault is caught one layer earlier than expected. Recorded as observed,
  because a prediction rewritten after the fact is not an observation.
- **F15 was killed rather than timing out.** The script allows 400 seconds and
  the process was killed before then, so the evidence here is "it never
  answered", not "it ran for 400 seconds". Either way the assertion under test
  is the throw, which is why the test asserts a throw rather than a value.

### Not in the table, on purpose

The identity differential of 8.1 injects no fault: it is the claim that a plan
setting neither field does not move, and its negative is every one of F1–F17 —
any of them that changes an unpooled plan's arithmetic fails it. A table of
injected faults is not where a check with none belongs.

## C0's measured answer, and what it constrains

C0 was a throwaway spike (`spike/capacity-fit`, two commits, deleted after this
lands) that put a candidate **In-parallel** column into the real table and
measured it in a real chromium, at both laptop widths, with the roles folded.

**The answer: it does not fit.** A standalone In-parallel column at its
candidate 48px overflows the table frame by **19px** at 1280×800 with the roles
folded — the state a plan is actually read in. `priority-column` had merged
first, so the Prio column is already in the baseline and In-parallel was the only
new column left to measure; the plan's "both columns at their intended widths"
was written before that.

A second round was written to measure the alternative that adds no column at all
— saying the number inside the existing 120px **Team** cell, `Platform ×3` — and
the baseline that −19 is against. **Its probes are committed on the spike branch
and their output was never captured**: the box hard-rebooted before the run was
read, and no round-2 figure is claimed here. Re-running them is one
`bun run e2e -g "SPIKE C0-2"` on a host with a browser, and it is C3's to do if
C3 wants the Team-cell option costed.

**Either way this constrains C3, not this change:** C1 carries `width` out on
`ScheduledSlice` so that whichever surface C3 picks has a true number to print,
and no layout decision is taken here.

## Not verified

- **The browser.** No browser on this host, and this change draws nothing. CI's
  `pixels` job owns the layout gate.
- **A live plan on dev.** C1 adds no write path, so there is no way to set either
  field outside a test yet — that is C2's, and reading a real plan with a real
  team size is Dany's call after C2 lands.
- **Per-project team allocation.** Deliberately absent (design.md D6), with the
  objection to its absence quoted in full. Two projects labelled with the same
  team are each told they have the whole team; the seam to fix it is built and
  the table is not.
