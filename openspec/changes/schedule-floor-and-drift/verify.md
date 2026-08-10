# verify — `schedule-floor-and-drift`

Branch `change/schedule-floor-and-drift`, off `main` @ `c9dd3fc` (PR #34's
merge). `libs/domain` and be-01 only; no migration, no API shape change.

## The gate

Run from the repo root on this branch, 2026-08-10.

| Command                                                 | Result                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                                          |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green — 21 projects; be-01: **580 tests** in 52 files; domain: **33 tests** in 2 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | green — 19 items, 19 passed, 0 failed                                                  |

**`build` was not run on this host** — the standing rule and the `PreToolUse`
hook forbid local builds here; CI's `checks` job runs the full
`test lint typecheck build` gate and is the proof for `build`. `bun run e2e`
was likewise not run (no browser on this host); nothing in this change touches
fe-01.

`nx` marked `gw-01:test` flaky on one gate run (red once, green on retry and
on every later run). Nothing in this change touches gw-01.

## The two defects, watched both ways

PR #34 left both tests skipped and marked `DEFECT`. Un-skipped first, watched
failing on exactly the documented wrong output, then fixed, then watched
green — all 2026-08-10:

| Test (`work-item.service.test.ts`)                                  | Before the fix                                  | After |
| ------------------------------------------------------------------- | ----------------------------------------------- | ----- |
| `floors every leaf beneath a parent told not to start before a day` | `Expected: "2026-08-12" Received: "2026-08-06"` | pass  |
| `ends a chain of PERT estimates on the day the estimates add up to` | `Expected: "2026-08-28" Received: "2026-08-31"` | pass  |

## What moved

- `schedule.ts`: `notBefore` expands down the tree through
  `TreeIndex.leavesUnder` before the nodes are built; each leaf keeps
  `Math.max` of its own floor and every ancestor's.
- `@wbs/domain` `workday.ts`: `snapWorkdays` (window `1e-9`), applied at both
  discrete calendar boundaries — `addWorkdays`' floor and `datesOf`'s ceil in
  `work-item.service.ts` — and nowhere else; the engine's numbers stay
  verbatim on the wire.
- Review-flagged cleanups: the sweep's chain test asserts the drift bound
  (nonzero, `< 1e-9`) instead of pinning `15.000000000000002`; the two
  parent-edge shape tests now say `canDepend` refuses `ancestor` at the write
  path (asserted in `dependency.test.ts`, both directions) and the engine's
  `/cycle/` throw is a backstop on the `L → L` self-loop `expandToLeaves`
  makes of the stored edge.

## Failure-proof table

Every check this change adds, the fault injected, and what was watched — all
2026-08-10, locally, each fault then reverted and the suite watched green.

| Check                                               | Injected fault                                         | Observed                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Floor expansion (`schedule.ts`, `leafFloors`)       | the shipped state — map read for leaf ids alone        | `floors every leaf beneath a parent…` failed, `Expected: "2026-08-12" Received: "2026-08-06"`                                                                                                                                                    |
| **Floor copy-down overwrites stricter child floor** | `Math.max` replaced with a bare `set(leafId, atLeast)` | `composes ancestor floors with a dependency…` failed on `L2` `earliestStart: 5` where its own day-9 floor was owed; `carries a grandparent's floor two levels down…` failed on `earliestStart: 3` for day 6                                      |
| Ceil-side snap (`datesOf`, `work-item.service.ts`)  | `snapWorkdays` removed from the ceil                   | `ends a chain of PERT estimates…` and `holds the calendar steady when a chained finish drifts above the whole day` both failed, `endsOn "2026-08-31"` where `"2026-08-28"` was owed                                                              |
| Floor-side snap (`addWorkdays`, `workday.ts`)       | `snapWorkdays` removed from the floor                  | `holds the calendar steady when a chained finish drifts below the whole day` failed, successor `startsOn "2026-08-20"` (its predecessor's last day) for `"2026-08-21"`; `reads a whole day arriving with a drifted bit…` failed on the same pair |
| **Snap window too wide swallows real half-day**     | `DRIFT` widened from `1e-9` to `0.5`                   | `keeps a genuine fraction just shy of a boundary as real work` failed — the 14.9-day row's successor `startsOn "2026-08-31"` for `"2026-08-28"`; `still floors a genuine fraction…` same dates; `snapWorkdays` unit case `Received: 15` for 14.9 |

Two assertions in the boundary tests are pinned knowing they cannot fail
through these faults, and the tests say so in their comments: upward drift
cannot fool the floor (`Math.floor(15 + ε)` is 15) and downward drift cannot
fool `ceil − 1` (day 8 either way). The successor's `endsOn` in the upward
case rounds clean by IEEE arithmetic (`15.000000000000002 + 1 === 16`
exactly), which is why the drifted `endsOn` is asserted on the chain end,
where the drift survives — the first draft asserted it on the successor and
was watched **passing** under the injected ceil fault; rewritten, then watched
failing.

The copy-down fault is only visible when an ancestor iterates after the
child, so the composition test lists the stricter child's floor **first** in
its map; with the child last, the same fault was watched passing.

## Not verified

- **`build`** — forbidden on this host; CI's `checks` job is the proof.
- **CI itself** — recorded on the PR after push, not here.
- **fe-01 in a browser** — untouched by this change and no browser claims are
  made.

## Finding, out of scope

fe-01's Gantt repeats the bare boundary arithmetic on the engine's offsets:
`lastWorkdayOf` (`gantt-panel.tsx`, `Math.ceil(finish) - 1`) and `spanWords`
(`addWorkdays(startDate, Math.floor(start))` — floored **before** the call,
so the snap inside `addWorkdays` never sees the fraction). A drifted chain
prints the same wrong day on a bar's hover that this change fixes in the
table. Not fixed here: the change is scoped to the be-01 read path per the
review, and this host cannot run the browser gate that guards that file.
