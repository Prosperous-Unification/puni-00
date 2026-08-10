# verify — `deps-single-line`

Branch `change/deps-single-line`, off `main` @ `db5844f`.

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-10 — re-run whole after the
review fixes below.

| Command                                                      | Result                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | green, exit 0                                                     |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green — 21 projects; fe-01: **1075 tests** in 45 files, all green |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | green — 19 items, 19 passed, 0 failed                             |

`nx` reported "detected a flaky task: gw-01:test" on the gate run while the
run itself concluded `Successfully ran targets` for all 21 projects
(deep-indent's verify saw the same flake). Nothing in this change touches
gw-01.

**`bun run e2e` was not run.** This host has no Chromium; the browser
assertions are written and the PR's `pixels` CI job is what proves them. See
"Not verified".

## What moved

The deps cell's chips and box moved into an inner **strip**
(`data-depends-strip`, `wbs-table.tsx`) inside the wrapper:

- at rest one flex line that does not wrap (`flexWrap: 'nowrap'` +
  `whiteSpace: 'nowrap'`), `overflow: hidden`, and a **rest-only** edge fade
  (`DEP_EDGE_FADE`, a `mask-image` so it holds over a tinted row) — applied
  when `picker === null`, a state condition, never a measurement; while the
  picker owns the cell the strip wraps exactly as the cell always did and
  carries no mask, so the focus ring, caret and typed text are undimmed
  (codex + agy review round, 2026-08-10 — the first cut applied the fade
  unconditionally, which also dimmed those three);
- at rest the chip ✕ buttons carry `tabIndex={-1}` — a clipped chip is a
  native button a sequential Tab or a reader's focus walk would otherwise
  reach, invisible, and the browser may scroll the clipping strip to show
  what it focused; with the picker open (strip wrapped, chips visible) they
  are focusable again, and the grid's Tab routing into the cell's box is
  unchanged (same review round);
- the strip pins `direction: 'ltr'`: the mask fades a physical right edge,
  the app is LTR-only today, and a logical-direction mask is not portable
  gradient syntax (same review round);
- the wrapper keeps `position: relative` and stays the popovers' positioned
  ancestor; the listbox and the `DependsCard` stay its children, **outside**
  the clipper; the `<td>`'s `opensAPopover` exemption is untouched;
- chip spacing moved from the chips' CSS margin (`styles.css`) to the strip's
  `gap` — a chip's own bottom margin would have made the rested line 2px
  taller than a chipless row's;
- the box gained `minWidth: 0` so it can shrink behind the chips instead of
  pushing its rect out of the cell (its `width: '100%'` claim is unchanged,
  and the `lets no control in a cell assert a width of its own` test with it).

Two recorded requirements are reversed **by name**, in the delta spec and at
the wrapper: the wrapper's `whiteSpace: 'normal'` rationale comment ("an
uneven row height is a cost worth paying; a dependency nobody can see is
not"), and `table-geometry-and-tab-order`'s "wraps its chips onto a second
line rather than clipping them" (task 2.1, archived at
`openspec/changes/archive/2026-08-10-table-geometry-and-tab-order/`). No `+N`
marker, no measurement: the full list stays in the `DependsCard` hover and
the box's sr-only `Waiting for …` description, both already tested.

## Failure-proof table

Every check this change adds, the fault injected into it, and what was
watched. All watched on 2026-08-10, locally, in the jsdom suite
(`wbs-table.test.tsx`) — red first, then green with the fault restored.

| Check                                                                 | Injected fault                                                                         | Observed                                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `clamps the chips and the box onto one nowrap line at rest`           | **the strip loses nowrap** — the rest branch forced to `flexWrap: 'wrap'`              | `expected 'wrap' to be 'nowrap'`                                                                    |
| `keeps the truncation fade on the rested strip, and off the open one` | **the fade removed** — both mask declarations deleted from the strip                   | `expected '' to contain 'linear-gradient'`, at the rest assertion                                   |
| `keeps the truncation fade on the rested strip, and off the open one` | **the fade applied unconditionally** — masks taken out of the `picker === null` branch | `expected 'linear-gradient(to right, #000 calc(1…' to be ''`, at the assertion with the picker open |
| `keeps clipped chips out of the tab order at rest`                    | **the rest condition dropped** — chips always focusable                                | `expected +0 to be -1`, at the rest assertion                                                       |
| `keeps both popovers out of the clipper`                              | the strip's closing tag moved past the listbox — the listbox rendered in the clipper   | `expected <span …(2)>…(3)</span> to be <span …(1)>…(2)</span>` — the listbox's parent the strip     |

The fade test's first shape asserted the opposite open-state rule (fade
present with the picker open, watched failing both ways on 2026-08-10 before
the review); after the review reversed the rule, **both of its faults were
re-injected and re-watched** against the rest-only implementation — the rows
above are the re-watched observations. The strip's structural tests were also
watched red before the strip existed (each failed on `the 030 depends box is
not in a strip`), then green with it.

Each restored declaration carries a `Proof:` comment naming its fault and the
figure it was watched failing on (`DEP_EDGE_FADE`, the strip's comment, the
chip button's `tabIndex`, and the tests).

## Not verified

- **The Chromium assertions** — this host has no browser, so none of the
  following was run locally, and no local result is claimed for them (R5):
  - `e2e/deps-cell.spec.ts`, `rests the seven-chip row at a chipless row's
height`: seven chips each with real area, the strip really clipping
    (`scrollWidth > clientWidth`), and the seven-chip row's height within a
    pixel of the chipless row's;
  - `e2e/deps-cell.spec.ts`, `a clipped chip is invisible at rest, and an
unclipped one is not`: the unclipped first chip answering a hit test at
    its own centre (the probe proven live), the last chip laid out with real
    area, wholly past the strip's visible edge, and `elementFromPoint` at its
    centre answering something else;
  - the existing layout, hover-card and keyboard suites staying green over
    the restructured cell.
    The PR's `pixels` CI job is the proof for all of these. Observed green
    twice on PR #35 before the review fixes (`pixels pass 5m29s`, 114 e2e
    tests, both `deps-cell.spec.ts` tests by name in the job log,
    2026-08-10); the review-fixes head's own run is **not yet observed at
    the time of this writing** — this file is updated with its conclusion
    once the PR has run it, and until then no result is claimed for it.
- **The fade's look.** The known cosmetic cost — a short row's placeholder
  tail under the rest fade — and whether the fade reads well at all are
  judgements for eyes on dev (task 5.2), not for a DOM assertion; what is
  pinned is that the declaration is there at rest and gone with the picker
  open.
- **Task 5.2** — the dev deploy and Dany's look come after the merge.
- **Anything outside Chromium.** The layout gate is one engine by design.
