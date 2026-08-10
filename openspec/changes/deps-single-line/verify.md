# verify — `deps-single-line`

Branch `change/deps-single-line`, off `main` @ `db5844f`.

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-10.

| Command                                                      | Result                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | green, exit 0                                                     |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green — 21 projects; fe-01: **1074 tests** in 45 files, all green |
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
  `whiteSpace: 'nowrap'`), `overflow: hidden`, and an **unconditional** edge
  fade (`DEP_EDGE_FADE`, a `mask-image` so it holds over a tinted row);
  while the picker owns the cell the strip wraps exactly as the cell always
  did, so typing and the open list are unchanged;
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

| Check                                                         | Injected fault                                                                       | Observed                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `clamps the chips and the box onto one nowrap line at rest`   | **the strip loses nowrap** — the rest branch forced to `flexWrap: 'wrap'`            | `expected 'wrap' to be 'nowrap'`                                                                |
| `keeps the truncation fade on the strip, rest and open alike` | **the fade removed** — both mask declarations deleted from the strip                 | `expected '' to contain 'linear-gradient'`, at the rest assertion                               |
| `keeps the truncation fade on the strip, rest and open alike` | **the fade accidentally conditional** — masks put behind `picker === null`           | `expected '' to contain 'linear-gradient'`, at the assertion after the focus — the picker open  |
| `keeps both popovers out of the clipper`                      | the strip's closing tag moved past the listbox — the listbox rendered in the clipper | `expected <span …(2)>…(3)</span> to be <span …(1)>…(2)</span>` — the listbox's parent the strip |

All three new tests were also watched red before the strip existed (each
failed on `the 030 depends box is not in a strip`), then green with it.

Each restored declaration carries a `Proof:` comment naming its fault and the
figure it was watched failing on (`DEP_EDGE_FADE`, the strip's comment, and
the three tests).

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
    The PR's `pixels` CI job is the proof for all of these — **observed green
    on PR #35** (`pixels pass 5m29s`, 114 e2e tests passed, both
    `deps-cell.spec.ts` tests among them by name in the job log; `gate pass
3m18s` beside it, 2026-08-10). A CI result, still not a local run.
- **The fade's look.** That an unconditional fade reads well — and really is
  invisible over a short row — is a judgement for eyes on dev (task 4.2), not
  for a DOM assertion; what is pinned is that the declaration exists and that
  no condition grows back.
- **Task 4.2** — the dev deploy and Dany's look come after the merge.
- **Anything outside Chromium.** The layout gate is one engine by design.
