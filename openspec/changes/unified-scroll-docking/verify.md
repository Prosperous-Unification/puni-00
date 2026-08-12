# Verification

Everything below was run for this change, on this branch's own head. Nothing is
quoted from another change's run.

## Where things ran

This box (`h1claw`) runs no test suite and no build — Dany's rule, enforced by a
`PreToolUse` hook. h2puni ran the unit suite under a real node
(`node node_modules/vitest/vitest.mjs run …`) and the browser gate in the
official Playwright image (`mcr.microsoft.com/playwright:v1.62.1-noble`); CI ran
the whole gate plus `pixels`.

The landmine those scripts exist for is unchanged: `bunx vitest` under bun on
h2puni dies in its own worker bootstrap and `nx run fe-01:test` wraps it and
exits 0, so a green `run-many -t test` on that host says nothing about fe-01.

The base is `main@2be2b25`, which is `unfolding-may-scroll` (#55) merged. This
change is built on it rather than beside it: the frame this one resizes is the
frame that one taught to scroll sideways, and the link below refuses to touch
`scrollLeft` for exactly that reason.

## The gate

| command                                           | where  | result                    |
| ------------------------------------------------- | ------ | ------------------------- |
| fe-01 unit suite under node                       | h2puni | **49 files, 1232 passed** |
| `bun run e2e`                                     | h2puni | **168 passed** (5.9m)     |
| `bunx nx format:check --all`                      | h2puni | green (silent)            |
| `bunx nx run-many -t lint typecheck --parallel=2` | h2puni | green, 21 projects        |
| `bunx @fission-ai/openspec@1.3.0 validate --all`  | h2puni | green, **41/41**          |
| the whole gate                                    | CI     | see below                 |
| `bun run e2e` (`pixels`)                          | CI     | see below                 |

168 browser cases against `main`'s 162: the six of `e2e/plan-surface.spec.ts`.

## The faults, watched — the arithmetic and the link

Each injection was reverted with `git checkout -- .` before the next, and every
line below was re-taken at this branch's head on 2026-08-12.

| #   | Fault injected                                                          | Test that went red                                                         | What it said                                                                    |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | the id check in `alignmentMove` deleted                                 | `is nothing when the row at that index is a different row`                 | `expected 168 to be null`                                                       |
| 2   | the carry taken in pixels rather than as a fraction of the row          | `carries a fraction of the row, so a wrapped name cannot overshoot`        | `expected 40 to be close to 24.34782608695652`                                  |
| 3   | the echo not recognised — the `echo === driverPort` arm deleted         | `does not let a follower that ran out of chart drag its driver back`       | `expected 100 to be 196`                                                        |
| 4   | an echo claimed for a write that moved nothing (`echo = followerPort`)  | `leaves a face that could not move free to drive the next gesture`         | `expected 196 to be +0`                                                         |
| 5   | the content top measured from `<thead>` rather than from a heading cell | `refuses a frame whose heading has no cells` **and four of the link's**    | `expected [Function] to throw an error`; `expected 96 to be 196`; three more     |
| 6   | the missing calendar axis defaulted to an empty face                    | `refuses a panel with no calendar axis`                                    | `expected [Function] to throw an error`                                         |
| 7   | every `<tr>` counted as a row of the plan                               | `counts the rows of the plan and not the decoration between them`          | `expected 21 to be 20`                                                          |
| 8   | the link also writes `scrollLeft`                                       | `never writes sideways, on either face`                                    | `expected 320 to be 140`                                                        |

Fault 5 is the one a browser found first, and it is in the record twice on
purpose — see "What the browser corrected" below.

## The faults, watched — the browser

| #   | Fault injected                                                | Tests that went red                                                                                   | What it said                                                                       |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A   | `TABLE_FRAME.flex` back to `1 1 0%` — the frame grows again   | `docks the chart under the last row rather than at the bottom of the window`                          | `553px between the last row and the chart, against 217px anything asked for`       |
| B   | the link never installed (`linkPlanScroll` call removed)      | all four of the link's browser cases                                                                  | `the table is showing … cut by 0.554 of a row and the chart by -8.000`; `the wheel did not scroll the chart` |
| C   | the content top measured from `<thead>` (fault 5, in a browser) | `takes the chart to the row the table was scrolled to`, the keyboard walk, the sideways case          | `cut by 0.554 of a row and the chart by -8.000`                                     |
| D   | `flex: 0 0 auto` — the frame refuses to shrink                | five of the six, including `still ends the chart at the bottom of the window when the plan fills the frame` | `the seeded plan is shorter than the frame, so nothing here is being shrunk`; `the wheel did not scroll the table` |
| E   | `roomForCard` given the window rather than the frame          | `scrolls a note taller than the preview once the pointer is on it`                                    | `the card closed on the way to it: expected 1, received 0`                          |

Fault A is the audit's own number reproduced: **553px** of nothing at 1280×900
against the audit's 508 at whatever the cloud run's viewport was, and 217px once
the frame stops growing. Fault D is why the shrink is half the declaration and
not a leftover: with no shrink the frame never scrolls at all, so every claim
about scrolling goes with it.

## What the browser corrected, and what it cost

The design measured each face's content top from its sticky heading, and the
first implementation read the table's from `<thead>`. `<thead>` is not what is
stuck — `HEADER_CELL` in `table-frame.ts` says so in as many words, "on the
cells rather than on `<thead>`" — so its box rides up with the scroll, every row
measures as showing, and the link puts the chart on row 0 whatever the table
does. Watched at `frameTop 224 panelTop 0`, with the table eight rows down and
the chart on its first. jsdom could not have caught it: it lays nothing out, so
`<thead>` and its cells have the same rectangle there, which is no rectangle.
The unit fixture stubs the **cell** now, and fault 5 is what holds it.

## The checks that could have been vacuous, and what stops them

- Every browser case asserts `[data-gantt-label]` has one label per row of the
  plan before it measures anything. The link pairs rows by index and checks the
  id; a chart one row short would otherwise pair every row off by one and the
  measurements would still agree with each other.
- The docking case asserts `frame.scrollHeight === frame.clientHeight` first —
  a plan that filled its frame would have no dead space to reclaim and any gap
  at all would satisfy the claim.
- The three link cases assert the plan opens on its **first** row, then that the
  scroll moved off it. Both faces start aligned, so a link that did nothing
  would pass a comparison taken at rest.
- The sideways case reads the frame's `scrollLeft` back after setting it and
  asserts it is past zero: 240 is past this frame's own range at 1280 and a
  browser clamps to 223, so pinning the number would have been a check about
  arithmetic rather than about the link.

## Assertions intentionally superseded

| old claim                                                                                          | replacement                                                                                          | fault injected | what was observed                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| `TABLE_FRAME.flex` is `1 1 0%` (`table-frame.test.ts`, `wbs-table.test.tsx`)                       | `0 1 auto`, with the shrink named as the half that keeps the old guarantee                           | A, D           | see the browser table                                                                  |
| `planDragged.height <= planAtRest.height - 140` (`e2e/gantt.spec.ts`, the height drag)             | the plan never grows for the chart, and the page does not scroll — which is what the comment claimed | —              | `expected 320 to be less than or equal to 180`, the frame on its own 20rem floor       |
| `gives a long note the room below rather than 320px of it` measured a two-row plan                 | it fills the frame first, and says why                                                               | —              | `the card is still the old 320px slot: expected 267 to be greater than 321`             |
| `roomForCard(anchor, viewportHeight)` — the window is what clips a card                            | `roomForCard(anchor, container)` — the window **and** the frame, which is what actually clips it      | E              | `the card closed on the way to it: expected 1, received 0`                              |

## What did not change, and is asserted to have not

- The row-for-row pairing of the two faces, which this change turns from an
  invariant into a mechanism. `gantt-panel.test.tsx`'s two ends of it are
  untouched and green.
- The folded fit at every laptop width, and `unfolding-may-scroll`'s sideways
  scroll: `e2e/layout.spec.ts` is untouched, and the sideways case here unfolds
  a role, scrolls the frame sideways and asserts both faces keep their own
  horizontal position.
- The keyboard. The link writes `scrollTop` and calls neither `focus` nor
  `scrollIntoView`; the browser case walks fifteen cells with Ctrl+J, asserts
  the chart followed, and asserts the focus is still in `Name of 160`.
- `e2e/header.spec.ts`'s two frame-height claims — the frame ends at the bottom
  of the window and the page does not scroll — both green, on the 23-row plan
  they were written against.
