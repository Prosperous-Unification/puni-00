# Verify — arrow-dodge

## Commands

The gate is **CI's**, run on a clean ubuntu runner at commit `3895f5d` on PR #47
— run [31593978796][ci]. The author's box is barred from running builds and
tests (`AGENTS.md`, "Red lines"), and h2puni was carrying four other worktrees'
suites, so a green from either would have been measured under load rather than
under a gate.

| Step (`.github/workflows/ci.yml`)     | Result  |
| ------------------------------------- | ------- |
| `Format` — `nx format:check`          | success |
| `Gate` — test, lint, typecheck, build | success |
| `Secrets scan`                        | success |
| `Doc caps`                            | success |
| `Compose files`                       | success |
| `Migration lint`                      | success |
| `OpenSpec` — `validate --all`         | success |
| `pixels` job — `Layout gate`          | success |

[ci]: https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31593978796

The browser gate is the `pixels` job's, not a local `bun run e2e`: that script
reuses whatever holds :4200 (`LLM_README.md`'s landmine), and other checkouts
held it throughout this work — a green from it would have measured code this
worktree never built. CI installs its own chromium and serves its own build, so
the layout gate above is the one that means something.

Alongside it, on h2puni (the build host), at the same commit and on a tree `git
status` reports clean: `vitest run gantt-geometry gantt-panel` — **172 passed,
0 failed**, 5.2s. That is the run the failure proof below injects into.

## The fault, and why the old router missed it

The route was chosen on **horizontal room alone**:

```ts
arrow.toX - arrow.fromX >= 2 * approach ? plainElbow : jog;
```

Both branches are correct routes; neither is a decision about what is in the
way. The condition asks whether the two ends stand far enough apart for a turn
to fit, and the answer to that question tells you nothing about the row between
them. So on A10's shape — `020` finishing at workday 5, `040` starting at 7 —
the router took the elbow, turned down one approach short of 7, and drew that
descent through `030`, which runs 3 → 7 on the row in between.

The jog was never a dodge. It exists for the case where the two ends **touch**
(`toStart === fromFinish`, the common finish-to-start), where the elbow collapses
onto the successor's own left edge and is drawn underneath its bar. `030 → 040`
takes it for that reason, not because anything was in its way — which is why the
same chart shows a jog and a crossing side by side, and why the fault reads as
"the dodge is not applied here" when there was no dodge to apply anywhere.

## The invariant now guaranteed

No run of the route `routeArrow` returns passes through the **interior** of any
bar in the list it is given, the two bars the arrow joins included; it touches
those two only on the edge it leaves and the edge it arrives at.

It holds because the last candidate column stands left of every bar on the rows
crossed, and the banded route through it crosses nothing: the bands are air by
construction (no bar is drawn inside `barInset`), the column is clear of every
rectangle, the run into the successor's row descends one approach left of its
start, and no bar on a row starts before that row's own earliest start.

**The bounded exception**, stated precisely: an arrow whose **start** is already
strictly inside another bar on its own row cannot be left without crossing that
bar, and no router can fix it. The chart does not draw that shape — a row's
slices run one after another in role order, so two bars of one row do not
overlap — and `routeArrow` returns the banded fallback as it stands rather than
searching for a route that cannot exist. It is named in the JSDoc on
`routeArrow`.

Two things the invariant deliberately does **not** cover, both in the proposal's
non-goals: arrows are not routed around each other, and marks that are not bars
(heads, person links, not-before flags) are not obstacles.

## Failure proof

Every row below was watched on 2026-08-12 on h2puni, one fault at a time, each
reverted to a clean `git status` before the next. The baseline it is measured
against is the 172-green run above.

| Fault injected                                                                                  | Tests that failed                                | Observed failure                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| **The old router**: `routeArrow`'s body replaced by `toX - fromX >= 2 * approach ? elbow : jog` | **9** — 8 in geometry, 1 in the panel            | `expected [ '020->040 run 2 crosses 030-dev' ] to deeply equal []`        |
| ↳ the same fault, on the sweep                                                                  | both sweep tests                                 | `expected [ …(1323) ] to deeply equal []`, and `…(1225)` on calendar      |
| ↳ the same fault, on the ascending fixture                                                      | `dodges the same way for an arrow that climbs …` | `expected [ '010->030 run 2 crosses 020-dev' ] to deeply equal []`        |
| **Obstacles narrowed to the two endpoint rows** (`rowIndex === firstRow \|\| === lastRow`)      | **8**                                            | the A10 crossing again; sweep down to 557 and 523 crossings               |
| **Touching counted as crossing**: `runCrossesBar`'s four `>`/`<` widened to `>=`/`<=`           | **4**                                            | `still draws the plain elbow …`: `expected […(5)] to deeply equal […(3)]` |
| **The panel hands the router no bars**: `arrowRoute(arrow, [])`                                 | **1**, and `gantt-geometry.test.ts` stayed green | `expected [ '020->040 run 2 crosses 030-dev' ] to deeply equal []`        |

The last two counts are one lower and one higher than an earlier draft of this
file recorded, from a run this box lost to a reboot. The numbers above are the
ones observed in the runs this file was written from; the earlier draft's were
not reproducible and are not kept.

The last row is the one that says the panel test earns its place: it is the only
assertion that can see the panel passing the wrong bars, the wrong inset or the
wrong approach, and the geometry file goes on passing through all three.

## The sweep, and why it is not a check that cannot fail

400 seeded plans — 3–7 leaves, one or two roles each, some unestimated,
dependencies pointing backwards through the build order, and then the rows
**shuffled**, so an arrow climbs the chart as often as it descends — routed on
the workday axis and again on a calendar.

A sweep that asserts an empty list is exactly the shape R5 keeps catching: it
passes just as well over a generator that produced nothing worth crossing. So
the router this change replaced is kept in the test file as the sweep's own
control and asserted to find crossings **before** the new one is asserted to
find none:

- workday axis: control **1323** crossings, `routeArrow` 0
- calendar axis: control **1225** crossings, `routeArrow` 0
- and the sweep is asserted non-empty in its own right: >400 arrows, arrows in
  more than half the plans

The oracle is written apart from the router: `runsInside` in the test branches on
the two cases a route can have — vertical, horizontal — and throws on a diagonal,
rather than sharing `runCrossesBar`'s single overlap formula. A wrong reading
inside the router cannot make the assertion agree with it.

## What did not move

`leaves the three arrows nothing stands under exactly where they were` and
`still draws the plain elbow when the column it turns at is clear` assert exact
corners, not clearance: "it clears" is also true of a route round the whole
chart. The three A10 arrows that already jogged jog identically, and a chart with
nothing under the turn is drawn in the same three points it has been drawn in
since `gantt-view`.
