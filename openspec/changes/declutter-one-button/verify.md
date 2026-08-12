# verify — declutter-one-button

Run 2026-08-12, branch `change/declutter-one-button`, worktree
`~/wd/puni/wt-declutter-one-button` off `origin/main` at `3d35499`. Every command below
ran on **h2puni**, not on h1claw: builds and autotests are banned on that box
(AGENTS.md, 2026-08-04 and 2026-08-12), and a `PreToolUse` hook denies them
there.

## Commands

| Command                                                      | Result                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | pass, exit 0                                                                                                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | test/lint/typecheck pass for all 21 projects; **two build tasks fail for want of `shellcheck` on h2puni** — see below |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | 32 items, 32 passed                                                                                                   |
| `bun run e2e`                                                | **NOT RUN here.** CI's `pixels` job is the browser gate — see below.                                                  |

`apps/fe-01` vitest: **1132 passed across 46 files**, 49s.
`gantt-panel.test.tsx` holds **91** cases, one above the 90 it started at.

**The two failing builds are the host, not the branch.** `tool-bootstrap:build`
and `tool-devsync:build` are `command -v shellcheck || exit 1` guards, and
h2puni has no shellcheck and no sudo to install one. CI installs it and asserts
its presence in a step of its own (`Assert shellcheck present`). Nothing in this
change touches a shell script.

**On running anything on h2puni at all.** `ssh h2puni '<cmd>'` runs a
non-login shell, and `node` is on the PATH only through volta's login-shell
hook. Without it `bunx vitest` starts, prints `RUN`, and hangs forever with no
error — two runs were lost to this before the cause was found. Every command
above went through `ssh h2puni "bash -lc '…'"`. Worth writing down: the failure
looks exactly like a hung test suite.

## What the chart draws, measured

A fresh ten-leaf, two-phase plan — one parent, ten leaves, Dev estimated and QA
not on every leaf, nine finish-to-start dependencies — rendered through
`GanttPanel` and its marks counted at rest and again with the switch pressed.
The same fixture `gantt-declutter`'s verify.md measured, so the three columns
line up: **at rest is that change's "After" to the mark, and detail on is its
"Before" to the mark.**

| Mark                            | At rest | Detail on |
| ------------------------------- | ------: | --------: |
| Rows (`data-gantt-label`)       |  **11** |    **11** |
| Bars                            |      10 |        20 |
| — of them assumed               |       0 |        10 |
| On-bar labels                   |      10 |        20 |
| Parent brackets                 |       0 |         1 |
| Arrows                          |       0 |         9 |
| Arrow heads                     |       0 |         9 |
| **Drawn marks (rows excluded)** |  **20** |    **59** |

Measured with a throwaway vitest file, deleted after the run. The row count is
the number that must not move, and it does not: the chart draws a row per row
of the plan in both states, the parent's included.

Carets and person links are 0/0 on this fixture — it seeds no not-before dates
and no cross-row person bindings. Both are counted in
`gantt-panel.test.tsx > the detail switch`, which asserts 1 caret at rest and 3
once asked, and 1 person link at rest and 2 once asked.

## Failure proofs (R5)

Every fault injected on the real production call path on h2puni, watched
failing, then reverted with `git checkout`. Each `Proof:` comment beside the
code quotes the same output. **Both directions of every gate**: a gate wired to
nothing passes the at-rest half of each pair, and a gate wired backwards passes
neither.

| #   | Check                                       | Injected fault                                        | Observed failure                                                                                                                                                         |
| --- | ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The uncosted slice is not drawn **at rest** | `drawnBars` pinned to `placed.bars`                   | `6 failed \| 85 passed` — five absence cases on `expected SVGElement{…} to be null`, and `the detail switch` on `expected 1 to be +0`                                    |
| 2   | The switch really draws it                  | `drawnBars` pinned to the filtered arm                | `7 failed \| 84 passed` — four on `askForTheDetail`'s own throw, `the detail switch was pressed and nothing arrived at [data-assumed]`, plus `expected +0 to be 1` twice |
| 3   | The parent's ghost is behind the switch     | `detailShown &&` dropped from both bracket blocks     | `6 failed \| 85 passed` — `expected <line …(7)></line> to have a length of +0 but got 1`, the same for the `<rect>`, and four counts on `expected 1 to be +0`            |
| 4   | The carets follow the switch, not the bars  | `drawnFlags`'s ternary pinned to the filtered arm     | `2 failed \| 89 passed` — the caret case on `expected <path …(3)><title></title></path>` not to be null, and `the detail switch` on `expected 2 to be 3`                 |
| 5   | The retired key is really removed           | `localStorage.removeItem(RETIRED_ARROWS_KEY)` deleted | `1 failed \| 90 passed` — `drops the key the arrows switch wrote, without reading it` on `expected 'true' to be null`                                                    |

Watched on this branch on h2puni, 2026-08-12, in that order. The proofs the
implementing sessions recorded in the code comments — the storage type refusal,
the `setItem` outside the updater, the assumed bar's paint, its `?` label, its
`not estimated` words and its `data-assumed` hook — are quoted there and were
not re-injected here; the five above are the ones that gate this change's own
decision, and each was re-watched from scratch after a hard reboot lost the
sessions that first ran them.

## The browser half

**Every e2e edit in this change is unwatched locally.** h2puni has no sudo for
`playwright install-deps`, and the one docker harness on the box belongs to a
concurrent session and shares its database. CI's `pixels` job is therefore the
first browser run of:

- `askForTheArrows` → `askForTheDetail`, which now asserts `aria-pressed` on
  both sides of the press as well as the arrow-head count,
- the three declutter cases turned into at-rest/asked-for pairs, each measuring
  the restored marks for real area rather than counting nodes,
- `[data-gantt-bar]:not([data-assumed])` in the two places that used to be able
  to assume every drawn bar was costed.

## The rebase onto `#47`, and the cross-review round

This branch was cut from `3d354998` and had **never seen `#47`**
(`arrow-dodge`). `gh` said `MERGEABLE`/`CLEAN`, a trial merge said `Automatic
merge went well` on all four source files, and CI was green — against a base two
hours stale. The merge product was red.

`#47` added a panel test that calls the helper `askForTheArrows()`; this branch
renamed that helper to `askForTheDetail()` and the button hook to
`[data-gantt-detail-toggle]`. Git took both sides. The merged
`gantt-panel.test.tsx` referenced an identifier defined nowhere, which fails
`typecheck` and stops the **whole file** running under vitest — killing, among
91 other cases, the single assertion `#47`'s own review called the only one that
can see the panel handing the router the wrong bars, inset or approach. Found by
the cross-review (`notes/wbs-cross-review-2026-08-12-declutter-one-button.md`),
which was the only reader looking at the merge rather than at the branch.
Reconciled on the rebase; the whole fe-01 suite runs on the rebased tree,
**46 files, 1146 passed**, on h2puni.

Four holds came with it. Each got a test, and each test was watched red against
the code it is about, on h2puni under vitest in the Playwright image:

| #   | Fault injected                                                    | Test that went red                                                        | What it said                                                                       |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M1  | the merge as git produced it (`askForTheArrows` undefined)        | every one of the 91 in `gantt-panel.test.tsx`                             | `Cannot find name 'askForTheArrows'` — `typecheck`, and the file does not run      |
| M2  | `openBar` resolved against `chart.bars` rather than `drawnBars`   | `takes an open surface away with the bar the switch stops drawing`        | `the surface outlived the bar it belongs to: expected false to be true`            |
| M3  | the canvas measured off the drawn set instead of `placed.horizon` | `declares the same canvas across the switch, on the axis that could move` | `the canvas is a different width with the detail on: expected 4.857… to be 2.857…` |
| M4  | `readDetail` pointed back at `rememberedDetail`                   | _(none — see below)_                                                      | —                                                                                  |

**M3's first fixture could not fail, and that is worth recording.**
`routeOffBothEnds` holds an unestimated slice, so it looked like the right one;
its ghost is placed at day 0, _inside_ the estimated bar's own span, so a canvas
sized off the drawn marks alone comes out the same width in both states and the
injection went green. The test now builds a fixture whose ghost starts where the
costed work finishes and therefore reaches past every bar somebody estimated,
and it asserts that precondition before the equality it is there to make. That
is the seventh-odd instance of this repository's own failure mode, caught this
time by injecting before trusting.

**M4 has no test, deliberately.** The `removeItem`s moved out of the lazy
`useState` initialiser and into a mount effect, because an initialiser is a
render and StrictMode double-invokes it on purpose — the rule this file already
states over the switch's own handler, eleven hundred lines below where it was
being broken. Nothing observable changed: `removeItem` is idempotent, and the
`DETAIL_KEY` drop only fires on a stored value this panel refuses. Both existing
key tests (`drops the key the arrows switch wrote, without reading it` and the
two refusals) stay green across the move, which is the whole claim. A test
asserting "no write happened during the render phase" would be asserting the
rule rather than any behaviour, and there is nothing for it to protect.

### Reported, not fixed: ghost bars are obstacles now

`#47` hands the router the drawn set, and since this change that set depends on
the switch — so **with `Detail` on, every unestimated bar is also an obstacle.**
`#47` was cleared partly on the argument that `arrow.fromX` is never strictly
inside a drawn bar, and that argument was load-bearing on the assumed bars being
absent. It is reachable now: a leaf whose slices in role order are an
unestimated one and then an estimated one of under two workdays puts `fromX`
inside the ghost's own span on the arrow's own row, every candidate route reads
as crossing, and `routeArrow` falls through to the banded fallback that `#47`'s
review proved dead and found untested.

The consequence is cosmetic — an elbow over a translucent dashed ghost, which is
what the chart did before `gantt-declutter` — and it is left alone: the
alternative is a second, switch-independent obstacle list, and the honest
version of that is a geometry change with its own proposal. What it costs is a
dead fallback becoming a live path in one state. Written into `arrowRoute`'s
docstring, where the next reader of that argument will be.

Same shape, one mark along: `#47`'s review dismissed "parent brackets are an
unlisted obstacle class" on the ground that since `gantt-declutter` a parent's
row paints nothing at all. This change puts the bracket back on `Detail` on, so
that dismissal has expired. Also cosmetic, also out of `#47`'s declared
non-goals, and also worth knowing before anyone cites that note again.

## Not done

- The `wbs.ganttArrows` answer is **dropped, not migrated**. A reader who
  pressed `Arrows` on Tuesday asks once more. Reasoned in `proposal.md`; #44 is
  one day old and its default was off.
- No change to `gantt-geometry.ts` beyond four doc comments that said the marks
  were gone for good. `placeGantt` places every bracket and assumed span in both
  states, which is what keeps the canvas, the axis and every y-position
  identical either side of the switch.
