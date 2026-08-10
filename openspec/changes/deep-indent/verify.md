# verify — `deep-indent`

Branch `change/deep-indent`, off `main` @ `8901b25`.

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-10.

| Command                                                      | Result                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | green, exit 0                                                     |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green — 21 projects; fe-01: **1071 tests** in 45 files, all green |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | green — 63 items, 63 passed, 0 failed                             |

`nx` marked `gw-01:test` flaky on one run of the gate (a `run-many` pass had it
red, a direct `nx run gw-01:test` and the next full `run-many` green — 43 tests
across 7 files). Nothing in this change touches gw-01.

**`bun run e2e` was not run.** This host has no Chromium; the browser
assertions are written and the PR's `pixels` CI job is what proves them. See
"Not verified".

## What moved

One function became two named concepts, plus a third for the one surface with
a budget of its own — all in `table-frame.ts`:

| Function             | Cap                       | Consumers                                                     |
| -------------------- | ------------------------- | ------------------------------------------------------------- |
| `numberIndentFor`    | `DEEPEST_INDENT` (4)      | the Number cell — byte-for-byte the old `indentFor`           |
| `hierarchyIndentFor` | none                      | the Gantt label rail whole; the Name cell as the _difference_ |
| `cardIndentFor`      | `CARD_DEEPEST_INDENT` (6) | the mobile cards' margin                                      |

The Name cell's wrapper carries
`hierarchyIndentFor(depth) − numberIndentFor(depth)`: zero until the cap, one
step per level past it. No single element's edge moves at every level — the
Number cell's padding is flat past the cap and the Name share is zero below it
— so the quantity that grows at every level is the **sum** of the two, and the
sum is what the browser fixture measures (opus 10).

## Failure-proof table

Every check this change adds, the fault injected into it, and what was
watched. All watched on 2026-08-10, locally, in the jsdom suites.

| Check                                                                                        | Injected fault                                                                                         | Observed                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `keeps the hierarchy indent growing past the Number cap…` (`table-frame.test.ts`)            | **the cap accidentally applied to `hierarchyIndentFor`** — `Math.min(depth, DEEPEST_INDENT)` put on it | `expected +0 to be 12` at the depth-5 step; `3 failed \| 32 passed` — the difference case and the card case fell with it |
| `hands the Name cell the share of the indent the Number cap withheld` (`wbs-table.test.tsx`) | the Name wrapper's share put back to `paddingLeft: 0` (the shipped state)                              | `expected { number: '48px', name: '0px' } to deeply equal { number: '48px', name: '12px' }`                              |
| `steps one level at every depth, uncapped` (`gantt-panel.test.tsx`)                          | the rail pointed back at the capped `numberIndentFor`                                                  | `expected '56px' to be '68px'` at depth 5                                                                                |
| `indents a card one step per level, and stops at the cards' own cap` (`plan-cards.test.tsx`) | the cards pointed at the uncapped `hierarchyIndentFor`                                                 | `expected '84px' to be '72px'` at depth 7                                                                                |

Each restored line carries a `Proof:` comment naming its fault and the figure
it was watched failing on.

The first row is the fault this change exists to make impossible to reintroduce
silently: a `min` reapplied to the uncapped half is exactly the shipped
behaviour Dany's screenshot complained about, and the named test sees it at
the first level past the cap.

## Not verified

- **The Chromium assertions** — this host has no browser, so none of the
  following was run locally, and no local result is claimed for them (R5):
  - the deep-plan fixture grown to depth 6 in `e2e/layout.spec.ts`, with the
    sum (Number cell's used padding + Name box's offset from its cell's edge)
    asserted strictly increasing to depth 6 and each half equal to its
    function's arithmetic;
  - the Gantt rail's uncapped edge at every depth of the same fixture;
  - `the Number column fits its envelope` staying green (its assertions are
    untouched beyond the `indentFor` → `numberIndentFor` rename).
    The PR's `pixels` CI job is the proof for all three — **observed green on
    PR #33** (`pixels pass 5m38s`, 2026-08-10), which is a CI result, still
    not a local run.
- **Task 6.2** — the dev deploy and Dany's look come after the merge.
- **Anything outside Chromium.** The layout gate is one engine by design.
- **That 72px reads well on a 390px card.** `CARD_DEEPEST_INDENT = 6` is a
  stated budget, not a measured judgement; the dev deploy is where it gets
  eyes.
