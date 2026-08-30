# verify — gantt-handle-z

Run 2026-08-12, branch `change/gantt-handle-z`, worktree
`~/wd/puni/wt-gantt-handle` off `origin/main` at `7a26663`. Every command below
ran on **h2puni**; h1claw is barred from builds and autotests.

## Commands

| Command                                                      | Result                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | pass, after `prettier --write` on `e2e/gantt.spec.ts` and this change's `tasks.md`                             |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | test/lint/typecheck pass for 21 projects; **`build` fails on `tool-bootstrap` and `tool-devsync`** — see below |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | 37 items, 37 passed                                                                                            |
| `bun run e2e` (official Playwright image, `CI=1`)            | **159 passed**, 5.7m — the whole browser gate, not only this change's case                                     |

Test counts: fe-01 **1205** across 48 files, be-01 **655** across 54 files,
gw-01 **45** across 8 files.

**The two build failures are the host, not the branch.** Both targets are a
`command -v shellcheck` guard and h2puni has no shellcheck installed:
`[tool-bootstrap] shellcheck is required but not installed`. This change edits
no shell script — the diff is one CSS keyword in `gantt-panel.tsx`, one e2e
case, and this change's four artifacts. CI installs shellcheck and is the gate
of record for those two targets.

## Failure proof

| Check                                                                   | Fault injected                                                       | Observed                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `owns every point on its strip, rather than the chart sliding under it` | the fix absent — the branch's first commit, at `origin/main`'s panel | **failed** on 6 of 21 points in the case's first form, each reported as `div in the chart` / `span in the chart` |
| the same case, in the form that ships (swept over the chart's top row)  | `isolate` deleted from the panel's `<section>`                       | **failed on all 18 points**, every one `div in the chart` or `span in the chart`                                 |
| the same case's drag half                                               | as above                                                             | never reached — the sweep above it is the first assertion                                                        |

Both were watched in Chromium on h2puni, 2026-08-12, and the case was watched
green with the keyword back.

**Why the first form only caught 6 of 21.** It swept fractions of the _panel's_
width, and the seeded plan's chart is about half the window wide: past its right
edge the strip is uncontested and belongs to the handle with the fix in or out.
That is the vacuity this case would have shipped with, and it is why the sweep
now measures `[data-gantt-labels]` and `[data-gantt-axis]` first, asserts the
axis reaches past the label column, and takes its points inside those two boxes.

## What the browser hands a press, measured

At `7a26663`, 18 points across the chart's top row and down the handle's 6px:

| Region                           | Before     | After      |
| -------------------------------- | ---------- | ---------- |
| the label column's own corner    | `div`      | the handle |
| the calendar axis's cells        | `span`     | the handle |
| the strip past the chart's width | the handle | the handle |

The last row is the one that was already right, and the reason the drag tests
that shipped with the handle never saw this: `dragTheEdge` grabs the strip at
its horizontal centre, which on this fixture lands past the chart.

## Blast radius

`isolate` creates a stacking context on the panel's `<section>`, so the three
`z-index`es inside it (`z-10` label column, `z-20` corner, `z-10` calendar axis)
now resolve among themselves. Their order relative to each other is unchanged —
they were already ordered against each other alone, since nothing else on the
page sits between 1 and 20 over this box.

The one thing that could have been trapped by the new context is the anchored
hover card, which is `position: fixed` and rendered from inside the section. It
is not: `hover-card.tsx` portals an anchored card to `document.body`, so it
leaves this DOM entirely. Asserted rather than reasoned — the full 159-case
browser gate includes the bar and axis cards, and passed.

`isolate` does not create a containing block for fixed descendants (only
`transform`/`filter`/`contain` do), so nothing else in the chart changes what it
is positioned against.
