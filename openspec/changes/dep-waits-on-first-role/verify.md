# verify — `dep-waits-on-first-role`

Branch `change/dep-waits-on-first-role`, cut from `main` @ `94ed488`.

be-01's engine and fe-01's Gantt geometry. No migration, no API shape change,
no gw-01 change; the wire is untouched — the fe anchor is _selection_ over
slices the payload already carries (design.md D6). The geometry's own input,
`GanttPlan`, gains `tree` (ids and parents), which the panel's caller already
held in the tree read.

## The gate

Run from the repo root on this branch, 2026-08-11.

| Command                                                | Result                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `bunx nx format:check --all`                           | green, exit 0                                                                                          |
| `bunx nx run-many -t test lint typecheck --parallel=2` | green, exit 0 — 21 projects; be-01: **593 tests** in 52 files, fe-01: **1097 tests** in 45 files fresh |
| `bunx @fission-ai/openspec@1.3.0 validate --all`       | green — 24 items, 24 passed, 0 failed                                                                  |

Re-run after the cross-review fixes below, 2026-08-11; the counts are that
run's (588 and 1096 before them).

`build` is off the local run-many by house rule — builds go to CI, not this
box — and `bun run e2e` likewise: the browser gate is CI's `pixels` job (and a
local run here reuses another checkout's dev server, the landmine
`gantt-calendar-axis` recorded). Neither was run locally and no local result
is claimed for them (R5).

## What moved

- **The join** (`schedule.ts`, the adjacency loop): `endsOf(predecessorId).last`
  → `.first`. A dependency now waits on the predecessor's **anchor slice** —
  its first slice in role order — and the predecessor's later roles run in
  parallel with the successor. Successor-side attachment, parent expansion,
  floors, cycle detection at the write, and the item-anchored arithmetic are
  untouched; the backward pass walks the adjacency as built (design.md D5).
- **The words with it, same commit**: the `schedule()` contract paragraph and
  the anchoring corollary ("only the last has an external successor" — now
  false; what holds is that external edges still _arrive_ only at first
  slices), `repository/schema.ts`'s dependency-table JSDoc, and `CONTEXT.md`
  (**Dependency** reworded, **Anchor slice** added).
- **The oracle narrowed** (`schedule-identity.test.ts`): the two- and
  three-role parity runs drop their generated edges — parity vs the pre-slice
  oracle holds only where the rules coincide (design.md D7). A new single-role
  run keeps its edges (first slice _is_ last slice) and stays `toBe`-exact
  over 1000 seeds. The property the old rule could never satisfy is pinned
  directly: doubling every predecessor's non-first slice durations moves no
  successor's start, over the same corpus, with a non-vacuity floor of 500+
  grown plans.
- **The live capture did not move** (`live-plan-identity.test.ts`): its one
  dependency — `030` waiting on `010` — has a single-role predecessor, so the
  two rules are the same rule on that plan. Said in a comment on the test;
  every fixture number is still the live server's, unedited.
- **Two downstream pins moved with the rule, and only those**:
  `schedule.test.ts`'s `waits for the predecessor's last role, not its first`
  is now `waits for the predecessor's anchor and runs beside its later roles`
  (`b` at 3→4 where it sat at 5→6, `a`'s QA 3→5 beside it), and
  `schedule-benchmark.test.ts`'s `waitingForPerson` is 175 where it was 159 —
  successors released at first-role finishes contend for the same people
  sooner. Every other be-01 test passed unchanged, the floors-compose cases
  and `dependency.test.ts` among them (single-role fixtures; the write-path
  cycle rule is untouched).
- **The arrow leaves the anchor** (`gantt-geometry.ts`): `GanttPlan` gains
  `tree` — every work item with its parent, the full row set the shown rows
  were cut from — and the arrow builder selects the predecessor's anchor from
  the payload's slices through it: a leaf's first slice in role order, a
  parent's latest-finishing anchor among its leaves, a collapsed branch
  anchored through leaves `plan.rows` no longer holds. The
  `fromStart === fromFinish` calendar reading that already existed for
  zero-day projections now carries an unestimated anchor. A dependency
  between shown rows whose predecessor has no slice in the payload throws
  `GanttDataError` into the error boundary; a row not among `plan.rows` is
  still the modeled collapse and still skipped.

## Failure-proof table

Every fault injected for this change's checks, the test that observed it, and
the literal output. Each restored check carries a `Proof:` comment naming its
fault. All watched 2026-08-11.

| Slice | Check                                                                                           | Injected fault                                                                       | Observed                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1   | `waits for the first role, not the last` (pre-implementation red)                               | none — the last-slice rule still in place                                            | `Expected: 3, Received: 5`                                                                                                                                                            |
| 1.1   | `a zero-length anchor clears immediately` (pre-implementation red)                              | none — as above                                                                      | `Expected: 0, Received: 4`                                                                                                                                                            |
| 1.1   | `a branch releases at its anchors` (pre-implementation red)                                     | none — as above                                                                      | `Expected: 4, Received: 5`                                                                                                                                                            |
| 1.3   | the two named engine tests, after the flip                                                      | the join reverted to `endsOf(predecessorId).last`                                    | `waits for the first role, not the last`: `Expected: 3, Received: 5`; `a branch releases at its anchors`: `Expected: 4, Received: 5` (and the zero-length test with them, `0` vs `4`) |
| 2.2   | `never moves a successor when a predecessor’s later slices grow`                                | the same revert to `.last`                                                           | `seed 3: r1c0 moved from 8.666666666666666 to 11.333333333333332 when only later slices grew` — this test **alone**; the narrowed parity runs cannot see the revert                   |
| CR-6  | `anchors a parent of parents through the leaves two levels down`                                | `leavesUnder`'s recursion shallowed to direct children (`children.map`, no `walk`)   | `1 failed \| 67 passed`, on `GanttDataError: dependency hull → rig: deck has no slice in this payload`; watched 2026-08-11                                                            |
| 3.1   | `the arrow does not overshoot a parallel successor` (pre-implementation red)                    | none — arrows still read the projection                                              | `"fromFinish": 3` expected, `5` received                                                                                                                                              |
| 3.1   | `an arrow from a branch leaves its latest anchor` (pre-implementation red)                      | none — as above                                                                      | `"fromFinish": 4` expected, `5` received                                                                                                                                              |
| 3.1   | `anchors a collapsed branch through the full tree, not the shown rows` (pre-implementation red) | none — as above                                                                      | `"fromFinish": 4` expected, `5` received                                                                                                                                              |
| 3.1   | `a zero-length anchor draws from its own day` (pre-implementation red)                          | none — as above                                                                      | `"fromFinish": 5` expected, `9` received                                                                                                                                              |
| 3.2   | `throws when a shown predecessor has no slice in the payload at all` (pre-implementation red)   | none — no throw existed                                                              | `expected function to throw an error, but it didn't`                                                                                                                                  |
| 3.2   | the same check, after the implementation                                                        | the throw replaced by a skip — the anchorless edge dropped the way a hidden row's is | `1 failed \| 66 passed`, on `expected function to throw an error, but it didn't`: the chart came back quietly short one arrow                                                         |

Not in the table, on purpose: `an unestimated first role does not escape the
wait` (1.1) injects no fault and is green under **both** rules — it is the
guard that the successor side did not move (design.md D2), a scope pin rather
than a failure proof, and a table of injected faults is not where a test with
none belongs.

The 2.4 rule held: every downstream failure the flip produced was explained by
the anchor rule before any expectation was touched. The full be-01 run after
the flip failed exactly four tests — the two parity runs (seed 1, a
`latestStart` moved by a dependency wait), the last-role pin, and the
benchmark's `waitingForPerson` — and nothing else; no defect was found hiding
among them.

## Cross-review fixes (2026-08-11)

Two reviews of this branch (disposition with per-finding verdicts and
evidence: `tmp/review-disposition-dep-anchor.md`). What they added here:

- **The promised critical/float split, pinned** (`schedule-shapes.test.ts`,
  `splits critical from slack inside the predecessor when the successor runs
on`): A [3d Dev, 2d QA], B→A [10d Dev]; the project ends day 13, A's Dev is
  float 0 and critical, A's QA finishes day 5 with latest start 11 — float 8,
  no red — and the row projects the min-slice rule: A critical with slack 0,
  B critical. This is the `lateTimes` adjacency behaviour after the flip,
  asserted at slice level for the first time.
- **Multi-role composition, direct** (`schedule-shapes.test.ts`), replacing
  what the narrowed parity corpus used to exercise: a multi-role dependency
  beside a `notBefore` floor, both ways (floor at 5 over an anchor at 2 →
  `boundBy: 'notBefore'`; anchor at 4 over a floor at 2 → `boundBy:
'predecessor'`); a three-item anchor chain (rows 0→5, 2→8, 6→12, each QA
  tail beside its successor); a multi-role diamond whose branches both
  project to day 8 while their anchors end 4 and 7 — the join at 7 is what
  tells the anchor rule from the projection rule.
- **The depth-3 arrow** (`gantt-geometry.test.ts`, `anchors a parent of
parents through the leaves two levels down`): leaves under a nested child,
  the arrow leaving the latest leaf anchor (day 4); negative in the table
  above (CR-6).
- **Dead weight out**: the `ends` map's unread `.last` (`schedule.ts`) is
  gone — the map holds first-node indices alone, `firstNodeOf` — with the
  Proof comments reworded to name the injectable fault rather than the
  deleted spelling.
- **Words with the rule**: the P→Q branch comment and test name in
  `schedule-shapes.test.ts`, `addDependency`'s JSDoc, and `GanttRow`'s arrow
  sentence now say the anchor rule; the delta spec's "Slices SHALL NOT appear
  on the wire" clause — false since `gantt-view` put them there — now defers
  to that change's `Slices cross the wire` requirement.

## Not verified

- **The browser assertions** — no browser on this host; CI's `pixels` job owns
  the drawn arrow. The geometry is pinned at the data layer
  (`gantt-geometry.test.ts`), and the panel renders `PlacedArrow` untouched.
- **Task 4.2-style eyes on dev** — how the parallel-QA chart reads at arm's
  length is Dany's to judge after merge; what is pinned is that the arrow
  leaves the anchor and never points backwards past the start it lands on.
