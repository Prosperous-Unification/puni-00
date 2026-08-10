# verify — `dep-hover-highlights`

Branch `change/dep-hover-highlights`, off `main` @ `e3eae84`.

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-10.

| Command                                                      | Result                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | green, exit 0                                                  |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green, exit 0 — 21 projects; fe-01: **1080 tests** in 45 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | green — 21 items, 21 passed, 0 failed                          |

`nx` reported `fe-01:test` and `gw-01:test` as flaky across the runs: the
first gate run failed `fe-01:test` under `--parallel=2` load and the same
suite passed standalone (`bunx vitest run`, 1080/1080) and on the recorded
gate re-run. `deps-single-line`'s verify saw the same gw-01 flake; nothing
in this change touches gw-01, and the fe-01 failure did not reproduce.

**`bun run e2e` was not run.** This host has no Chromium; the browser
assertions are written and the PR's `pixels` CI job is what proves them —
including, this once, the red half. See "Not verified".

## What moved

The table answers a dependency hover in the grid itself:

- **`depHover`** (`wbs-table.tsx`), table-level beside `depPicker`:
  `{ rowId, pillId | null } | null`. The deps wrapper's `mouseenter` writes
  `{rowId, pillId: null}` — guarded on `waitingFor.length > 0`, codex round
  3 finding 5's rule that a cell with nothing to say spends no render — and
  its `mouseleave` clears with the same-cell guard every other hover clear
  uses. Each pill's enter writes its id; its leave restores `pillId: null`,
  guarded on its own id so a leave that lands after the next pill's enter
  cannot widen what that enter narrowed. Every writer returns `current`
  when the value is already there — the string-key bail-out, spelt for an
  object — so a resting pointer costs one render.
- **The lit set** derives per render from the hovered row's `dependsOn`
  (all of it at `pillId: null`, the one pill's id otherwise), never from
  the hovered row's own id; a hovered row the tree no longer holds lights
  nothing, modeled like `goToRow`'s absences. `<tr>` carries `data-row-id`
  (identity, for the browser proofs) and `data-dep-lit` (state).
- **The tint** is one stylesheet rule: `--grid-dep-lit` (the drop tint's
  ink at a lower dose) and `[data-grid] tbody tr[data-dep-lit]` re-pointing
  `--cell-bg`, after `tr:hover` — the join through which a highlight
  reaches the pinned cells' opaque inline backgrounds.
- **The card**: `DependsCard` gains `emphasisedId`, fed from this cell's
  `depHover.pillId` through `live`; the emphasised line renders
  `background: var(--grid-dep-lit)` — the row tint by token, not bold. The
  card's list stays `dependenciesOf` over `flat`: a collapsed or
  filtered-out dependency has no row to light and the card still names it.
- **The landmine held**: `columns` still depends on `[roles,
unfoldedRoles]` and nothing else; `depHover` is read through `live`
  inside the column definitions, so a hover re-renders and never remounts.

## Failure-proof table

Every check this change adds, the fault injected into it, and what was
watched. Rows 1–5 watched 2026-08-10, locally, in the jsdom suite
(`wbs-table.test.tsx`) — red with the fault in, green with it restored.
Row 6 is the browser's and was watched in CI (see below).

| Check                                                                     | Injected fault                                                                              | Observed                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lights every dependency's row from the cell, and no other row`           | **the lit set derived from the wrong id** — `depLit` built from `depHover.rowId`            | `expected [ '030' ] to deeply equal [ '010', '020' ]` — the successor lit, its dependencies dark                  |
| `narrows to the pill's row, and widens again when the pill is left`       | **the pill leave's restore dropped** — the leave writer returning `current` unconditionally | `expected [ '010' ] to deeply equal [ '010', '020' ]` — the light stuck on the pill after the pointer had left it |
| `lights rows without remounting the cells under a half-typed name`        | **`depHover` added to the `columns` memo's dependency list**                                | `expected <textarea …(5)></textarea> to be <textarea …(5)></textarea>` — same label, different node: a remount    |
| `emphasises the pill's entry in the card as a background, not bold`       | **`emphasisedId` hardcoded to `null`** — the pill hover never reaching the card             | `expected '' to be 'var(--grid-dep-lit)'`                                                                         |
| `a collapsed dependency has no row to light, and the card still names it` | **the card's list narrowed to rows on screen** — `waitingFor` filtered to rendered `<tr>`s  | `Unable to find an accessible element with the role "tooltip"` — the hidden dependency dropped, the cell mute     |
| the three hover tests in `e2e/hover-cards.spec.ts`                        | **the `tr[data-dep-lit]` rule withheld** from `styles.css` on the first PR head             | `pixels fail 5m51s` on `ec1580e` — all three red on the unmoved paint; see "Watched in CI" below                  |

The five jsdom tests were also watched red before the implementation
existed (each failed on an empty lit set or a missing card entry), then
green with it. Each restored guard carries a `Proof:` comment naming its
fault and the figure it was watched failing on (the pill leave, `depLit`,
the `emphasisedId` feed, `waitingFor`'s source, and the remount test's own
comment).

**Watched in CI** (PR #38, 2026-08-10). The red half: head `ec1580e`
withheld the `tr[data-dep-lit]` rule — run 31434033908 concluded
`gate pass 2m35s`, `pixels fail 5m51s`, with all three dependency-hover
tests red by name on the unmoved paint (`Expected: not "oklab(0.978225
-0.0000970799 -0.0010455)"`, `Timeout 10000ms exceeded while waiting on
the predicate`) and every other e2e test in the new suite's file green.
Two latent flakes in the tests' own reads were found in that run's shape
and fixed before the restore head: a remembered colour could be captured
mid-cross-fade (now `settledRowBg`, which waits for `getAnimations()` to
empty before reading), and one change-poll compared two rows to each other
instead of a row to its own rest. The green half is recorded here from the
restore head's run.

Two jsdom modelling notes, so the tests say what a browser does: a pill
leave dispatched with jsdom's default `relatedTarget: null` reads to React
as leaving the whole cell (the wrapper's leave fires too), so the pill
tests name the element the pointer moved to; and the collapsed-branch
fixture waits out the rename in flight before clicking `Add work item`,
which is disabled while `busy`.

## Not verified

- **The Chromium assertions** — this host has no browser, so none of the
  following was run locally, and no local result is claimed for them (R5):
  - `the cell lights every dependency's row, and dark again on leaving`:
    the painted colour of the **pinned** Name cells, polled through the
    100ms cross-fade, banded and unbanded row landing on one shared tint,
    back to their two rest colours on leaving;
  - `a pill narrows the light to its row and tints its line in the card`:
    one row painted, the other at its rest colour, the card's emphasised
    line carrying the lit row's exact computed colour at weight 400, and
    the real pointer move off the pill widening the light back;
  - `a clipped chip has no hover target, and the cell still lights its
row`: seven chips, real area and real clipping asserted first, the
    clipped chip answering no hit test at its own centre, the cell-level
    hover point found by hit test, and the clipped dependency's row lit.
    The PR's `pixels` CI job is the proof for all three — **both halves**:
    the first PR head withholds the `tr[data-dep-lit]` rule so the job is
    watched red on exactly these tests (jsdom green throughout — the rule
    is invisible to it, which is why the negative has to be a browser's),
    and the restoring head is watched green. The red half is recorded above
    ("Watched in CI"); the green half's run is recorded there when it
    lands.
- **One pre-existing test failed on the red head's run and it is not this
  change's.** `opens the folded figure in the same breath as the mouse
  arrives` (the first test in the same file, untouched here) read `Dev for
010No estimate yet…` — its seed's `2/3/8` estimate never reached be-01
  for that throwaway account, a race in the seed, not in the hover. It had
  been green on `main`'s runs and is watched on the restore head; if it
  stays red there, it is its own investigation, not a cover for this one.
- **The tint's look.** Whether 12% ring ink reads as "these rows" at
  arm's length is a judgement for eyes on dev (task 4.2); what is pinned
  is one shared declared tint, painted, distinct from each row's rest
  colour.
- **Task 4.2** — the dev deploy and Dany's look come after the merge.
- **Anything outside Chromium.** The layout gate is one engine by design.
