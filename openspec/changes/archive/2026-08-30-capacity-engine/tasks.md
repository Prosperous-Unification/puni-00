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

## 1. The two columns, and a rollback that reads what it rolled back to

- [x] 1.1 `20260812100000_add_team_slots`: `service_team.size`, nullable, no
      default. `migrate.test.ts`'s `leaves teams that existed before the column
unsized` watched failing with the column written `integer NOT NULL DEFAULT 1`
      (`Received: 1` where null was owed). **Negative:** the same fault also
      moves the identity differential on plans nobody touched, which is the
      reason the default is refused rather than a preference.
- [x] 1.2 `20260812100001_add_max_parallel`: `work_item.max_parallel`,
      `NOT NULL DEFAULT 1`. `migrate.test.ts`'s `lets the outgoing release keep
inserting work items and teams against both` watched failing with the
      `DEFAULT 1` removed — the outgoing release's own `INSERT` fails
      `NOT NULL constraint failed: work_item.max_parallel`, which is the
      blue/green swap breaking.
- [x] 1.3 Both `down.sql` files, with the house preamble naming what is lost,
      and `migrate.test.ts` walks the rollback **in reverse application order**
      back to the prior applied set and then reads the result with the outgoing
      release's statements — rather than trusting the CLI's exit code.
- [x] 1.4 `schema.ts`, `repository/index.ts` and every fixture that builds a
      `WorkItem` or a `ServiceTeam` carry the two fields.

## 2. `effectiveTeamOf`, in `libs/domain`, read by everybody

- [x] 2.1 `effective-team.test.ts`: a parent's label reaches an unlabelled
      leaf; the leaf's own beats it; the nearer of two ancestors beats the
      further. **Negative:** most-specific-wins replaced by
      furthest-ancestor-wins, watched failing on `gives the nearer ancestor's
label to a leaf between two`.
- [x] 2.2 The parent-cycle refusal. **Negative:** the `seen` guard removed and
      `refuses a parent chain that runs in a circle` hangs rather than
      answering wrongly — watched under the test timeout, which is why the
      assertion is on the throw.

## 3. The slice grows a width and a pool, and the adapter is the only place that decides them

- [x] 3.1 `Slice.width` and `Slice.poolId`, resolved in `slicesOf` and never
      re-derived in the pass — `personId`'s rule for `personId`'s reason.
- [x] 3.2 `work-item.service.test.ts`: `clamps a work item's parallelism down
to the size of its team`. **Negative:** the clamp dropped, watched failing with
      `width: 4` on a team of two.
- [x] 3.3 `runs a named person's work one at a time however parallel the item
is`. **Negative:** the named-person arm dropped, watched failing with
      `width: 3` on work one person is doing.
- [x] 3.4 The adapter reads team sizes through `slotsOf`, which is the seam a
      per-project allocation goes behind (design.md D6).

## 4. Duration is effort divided by width

- [x] 4.1 `durationOf`, and `groupByWorkItem`'s prefix sum over it.
      `schedule-capacity.test.ts`: `compresses six days of effort into two when
three may work at once`. **Negative:** the division dropped, watched failing
      with a duration of 6 where 2 was owed.
- [x] 4.2 `divides exactly, so a plan that sets no parallelism is untouched
arithmetic`, and `holds a subnormal and a tiny estimate at width 1 and at width
1000` — the class D1 narrows the identity claim to, recorded rather than
      assumed.
- [x] 4.3 `ScheduledSlice` carries `effort` beside `duration`, and `width`, so
      C3 has something true to print.

## 5. The profile, aggregated, and the whole-window search

- [x] 5.1 The per-pool event list, aggregated by timestamp.
      **Negative:** the merge in `eventAt` removed so each reservation writes
      its own entry, watched failing on `lets a block run through the instant
another hands its slot over` — the block came back at 4→8 instead of 0→4,
      pushed off a slot that was never taken.
- [x] 5.2 The forward window scan. `waits for a team's slots to come free
before it starts`, `waits rather than running narrow and widening later`, and
      `fits a block exactly as wide as its pool`. **Negative:** the interior
      walk disabled so only the start instant is tested, watched failing on
      `skips a gap it cannot fit inside and waits for the whole window`.
- [x] 5.3 A zero-length or unpooled block reserves nothing and waits for
      nothing. **Negative:** the `finish === start` guard dropped, watched
      failing on `eventsVisited` — 4 where 2 was owed. The fixture puts the
      zero-length block at an instant the plan has nothing else at, because an
      earlier one where it landed on the finish of the role before it stayed
      **green** under the same fault: two events at one instant aggregate to
      nothing and merge into whatever is already there.
- [x] 5.4 The `W <= N` refusal before the search, and the backstop inside it,
      told apart by the clause each ends with. **Negative:** the up-front check
      deleted, watched failing on `refuses a block wider than the pool it draws
from, before it searches at all` — while the two shared one message the
      backstop caught the same plan and the test could not tell, which made the
      check a claim.
- [x] 5.5 The missing-pool-size refusal. **Negative:** replaced with
      `?? Infinity`, watched failing on `refuses a pooled slice whose pool has
no size` — the pool bounded nothing and the plan came back unconstrained.

## 6. The `capacity` floor, and where it sits

- [x] 6.1 `ScheduleFloor` gains `capacity`, entered after `person`.
      **Negative:** the entry deleted from the floors list, watched failing on
      `waits for a team's slots to come free before it starts` — the third
      block on a team of two came back at day 0, `boundBy: 'projectStart'`.
- [x] 6.2 The order. `needs both the person and the slot, whichever binds` and
      `names the person, not the pool, when the two land on the same day`.
      **Negative:** the capacity entry moved above `person`, watched failing on
      the tie naming capacity where the assignee was owed the sentence.
- [x] 6.3 `Schedule.waitingForCapacity`, counted per work item beside
      `waitingForPerson`, which keeps its meaning to the byte.

## 7. The blocking set, and the display referent

- [x] 7.1 Every reservation active at a violated instant is recorded and edged.
      `schedule-capacity.test.ts`: **codex's counterexample** — pool 2, A→day 5,
      B→day 7, X width 2 — asserting A's float is 2. **Negative:** the graph
      narrowed to the latest finisher alone, watched failing with A's float
      coming back 5: a row reported as movable that cannot move. This is the
      change's headline regression test.
- [x] 7.2 `under-reports float rather than over-reporting it, and says so` —
      the one-sided error direction, asserted rather than only argued.
- [x] 7.3 The display referent: latest finisher, ties by placement order, and
      the refusal of a capacity floor with an empty set. **Negative:** the
      search made to hand back an empty set **and** the throw replaced by the
      fall-through it refuses, watched failing on `resourcePredecessorId: null`
      with `boundBy: 'capacity'` — a bar claiming a wait and naming nothing.
- [x] 7.4 `keeps the backward walk topological when pop order and start order
are reversed`, and `paints a compressed chain that ends the project red, drift
and all` — `critical-snap` composed rather than assumed.

## 8. Identity: a plan that sets neither field does not move

- [x] 8.1 The thousand-plan corpus and the captured live plan carry `width: 1`
      and `poolId: null` and answer exactly what the pre-change engine answers,
      every field of every slice and every projection.
- [x] 8.2 `answers what it answered with a sized team labelling every row` —
      the corpus again, pooled at a size that never binds, against this engine
      unpooled. **Negative:** `hasResourceEdges` read as "a pool exists"
      instead of from the edges emitted, watched failing at seed 13
      (`latestFinish` 2.833333333333334 became 2.8333333333333335). It is a
      corpus and not a fixture because the fixture-sized version of this check
      was watched staying **green** under the same fault.
- [x] 8.3 `leaves a sized team that never contends with no resource edge at
all` keeps the fixture-scale half: the edges themselves, which the corpus does
      not look at.

## 9. Determinism, refusals, and a bound that is not a stopwatch

- [x] 9.1 `answers the same for a shuffled copy of the same plan`, and
      `answers the same however the rows arrived`.
- [x] 9.2 `terminates on a plan whose every slice is on one full pool`, and
      `still throws a cycle error on a cyclic graph, pools and all`.
- [x] 9.3 `Schedule.eventsVisited`, and `visits a bounded number of pool events
on a plan the size of a real one` — an instrumented bound rather than a
      wall-clock assertion, which is not an R5 proof and is flaky in CI. The
      wall-clock figures are recorded in `verify.md`, where an observation
      belongs.

## 10. The artifacts

- [x] 10.1 The delta spec, `design.md` with D6's quoted objection, D8's
      one-sided-error claim and D10's termination argument, and the
      plan-versus-merged-reality table.
- [x] 10.2 `verify.md`: the gate's actual output, C0's measured answer, and the
      failure-proof table — one row per injected fault, all seventeen watched.
