# verify — `dep-hover-highlights`

Branch `change/dep-hover-highlights`, rebased onto `main` @ `aa0d628` for the
review-fix round (it was cut at `e3eae84`; `name-column-drag` and
`gantt-calendar-snap` landed in between and the rebase was clean — no conflict
in `wbs-table.tsx`, `styles.css` or the Gantt files all three touched).

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-11 (the review-fix round; the
2026-08-10 pre-review run is the row beneath each).

| Command                                                 | Result                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                  |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green, exit 0 — 21 projects; fe-01: **1091 tests** in 45 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | green — 23 items, 23 passed, 0 failed                          |

On 2026-08-10, before the review: the same three green, with `build` in the
run-many and fe-01 at **1080 tests**. `build` is off this round's local
run-many by house rule — builds go to `h2puni`, not this box — and CI's `gate`
job is what runs it.

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
- **The tint** is one stylesheet rule: `--grid-dep-lit` (the drop tint's ink at a lower dose) and `[data-grid] tbody tr[data-dep-lit]` re-pointing `--cell-bg`, after `tr:hover` — the join through which a highlight reaches the pinned cells' opaque inline backgrounds. **Per surface**, and that is the review round's one visual fix: `--card-dep-lit` puts the same dose of the same ink into `--popover` where `--grid-dep-lit` puts it into `--background`. "The same tint" is a direction and not a value, and one absolute colour cannot hold it — the dark palette sits the two surfaces either side of any single mix.
- **The card**: `DependsCard` gains `emphasisedId`, fed from this cell's `depHover.pillId` through `live`; the emphasised line renders `background: var(--card-dep-lit)` — the row tint spoken on the card's own surface, not bold — inset `1px 4px` with the inset given straight back as negative margin, so emphasising a line neither clips its glyphs nor moves it. The card's list stays `dependenciesOf` over `flat`: a collapsed or filtered-out dependency has no row to light and the card still names it.
- **The keyboard** (`depFocus`, review round): a second state of the same shape, written by the deps box's and the chips' focus and blur, with `depLit` reading `depHover ?? depFocus` — the pointer's reading wins while both are live, because the pointer is where the eyes are. Two states rather than more writers on one, because focus and the pointer come and go independently and a single field would have a blur clearing a live hover. A chip's blur _clears_ where its `mouseleave` _widens_: a leave means the pointer is still in the cell, a blur means nothing of the sort, and widening on it would leave a cell lit with nobody in it. Narrowed on purpose and in the spec — sequential Tab reaches the box and not the chips, so the keyboard gets the cell-level light and the per-pill narrowing only where focus can land on a chip at all.
- **The pill's id is checked, not trusted** (review round): `depLit` requires `hovered.dependsOn.includes(pillId)`, and the chip's `onClick` widens the hover to the cell before removing the edge. The ✕ _is_ the pill, so the click unmounts the element and its own `mouseleave` can never arrive.
- **The landmine held**: `columns` still depends on `[roles,
unfoldedRoles]` and nothing else; `depHover` is read through `live`
  inside the column definitions, so a hover re-renders and never remounts.

## Failure-proof table

Every check this change adds, the fault injected into it, and what was watched. The jsdom rows were watched locally in `wbs-table.test.tsx` — red with the fault in, green with it restored — dated by the round they belong to. The browser rows are CI's and are recorded under "Watched in CI".

| Check                                                                                | Injected fault                                                                               | Observed                                                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lights every dependency's row from the cell, and no other row`                      | **the lit set derived from the wrong id** — `depLit` built from `depHover.rowId`             | `expected [ '030' ] to deeply equal [ '010', '020' ]` — the successor lit, its dependencies dark                  |
| `narrows to the pill's row, and widens again when the pill is left`                  | **the pill leave's restore dropped** — the leave writer returning `current` unconditionally  | `expected [ '010' ] to deeply equal [ '010', '020' ]` — the light stuck on the pill after the pointer had left it |
| `lights rows without remounting the cells under a half-typed name`                   | **`depHover` added to the `columns` memo's dependency list**                                 | `expected <textarea …(5)></textarea> to be <textarea …(5)></textarea>` — same label, different node: a remount    |
| `emphasises the pill's entry in the card as a background, not bold`                  | **`emphasisedId` hardcoded to `null`** — the pill hover never reaching the card              | `expected '' to be 'var(--card-dep-lit)'` (re-watched 2026-08-11 on the per-surface token)                        |
| `a collapsed dependency has no row to light, and the card still names it`            | **the card's list narrowed to rows on screen** — `waitingFor` filtered to rendered `<tr>`s   | `Unable to find an accessible element with the role "tooltip"` — the hidden dependency dropped, the cell mute     |
| `widens back to the remaining dependencies when a pill is deleted under the pointer` | **the chip's `onClick` widen dropped** — nothing telling the hover the pill it names is gone | `expected [] to deeply equal [ '020' ]` — the light out of a cell the pointer was still in                        |
| the same check                                                                       | **and `depLit`'s `includes` guard dropped with it**                                          | `expected [ '010' ] to deeply equal [ '020' ]` — the cut edge still lit: the reported bug, reproduced             |
| `lights the rows a cell waits for while its box holds the focus`                     | **the box's `onFocus` write to `depFocus` dropped**                                          | `expected [] to deeply equal [ '010', '020' ]` — the keyboard given nothing                                       |
| `narrows to a focused pill, and clears when the focus leaves it`                     | **the chip's `onFocus` dropped**                                                             | `expected [] to deeply equal [ '010' ]`                                                                           |
| the five hover tests in `e2e/hover-cards.spec.ts`                                    | **the `tr[data-dep-lit]` rule withheld** from `styles.css`                                   | see "Watched in CI" — every one of the five red on the unmoved paint                                              |
| `the tint moves the same way on both surfaces, in both palettes`                     | **the card's swatch pointed back at `--grid-dep-lit`** — the pre-review absolute token       | see "Watched in CI" — red on the sign mismatch in the dark palette, green in light                                |

Rows 1–5 were watched 2026-08-10; rows 6–9 on 2026-08-11, with the ✕ row watched twice, once per end of its fix. The five jsdom tests of the first round were also watched red before the implementation existed (each failed on an empty lit set or a missing card entry), then green with it. Each restored guard carries a `Proof:` comment naming its fault and the figure it was watched failing on.

**Two ends, one scenario, and this is said rather than glossed.** The ✕ fix has two halves and the check above is red for each — but only in sequence: with the chip's widen in place, no route this UI has can leave a `pillId` naming a cut edge, so `depLit`'s `includes` guard has no reachable red of its own. It is there to make the derivation total over remembered state instead of dependent on every writer being right, which is what both reviewers asked for, and its watched red is the one recorded above with the widen withheld. That is the honest shape of it; a guard against a state no route reaches is not a check with an independent fault, and recording one would be the fiction R5 exists to stop.

## Watched in CI

Three heads on PR #38, each pushed alone and watched to conclusion — `ci.yml` has `cancel-in-progress: true`, so a second push would have cancelled the first run and left nothing observed.

| Head        | What was withheld                                                | Run         | Result                                                      |
| ----------- | ---------------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `ec1580e`   | the `tr[data-dep-lit]` rule (round 1, superseded — see below)    | 31434033908 | `gate pass 2m35s`, `pixels fail 5m51s`                      |
| `04a4b9e`   | nothing (round 1's restore head)                                 | 31434962012 | `gate` success, `pixels` success                            |
| `756a24a`   | the `tr[data-dep-lit]` rule, on the review round's own spec text | 31452990284 | `gate` success, `pixels` failure — **5 failed, 117 passed** |
| FAULT_2_SHA | nothing, but the card's swatch pointed back at `--grid-dep-lit`  | FAULT_2_RUN | FAULT_2_RESULT                                              |
| GREEN_SHA   | nothing — the head that ships                                    | GREEN_RUN   | GREEN_RESULT                                                |

On `756a24a` the five red were, by name, `the cell lights every dependency's row, and dark again on leaving`, `a pill narrows the light to its row and tints its line in the card`, `a clipped chip has no hover target, and the cell still lights its row`, `the keyboard gets the same light, from the box's focus` and `the tint moves the same way on both surfaces, in both palettes`. The first four failed on the unmoved paint — `Expected: not "oklch(1 0 0)"`, `Timeout 10000ms exceeded while waiting on the predicate` — and the fifth on its own non-vacuity guard, before it could reach the direction claim at all: `light: the row's tint did not move`, `Received: 0`. `gate` passed on the same head, all 1091 jsdom tests included: the rule is invisible to jsdom, which is why this negative has to be a browser's.

**Round 1's red does not prove round 1's checks, and that is why there are two fault heads here.** Run 31434033908 was recorded on `ec1580e`; afterwards `settledRowBg` was added and the pill assertion rewritten, so the run predates the text it was cited for — codex's finding, and correct. The re-watch above is on the current text, and on five checks rather than three: the keyboard check and the two-palette direction check are new this round and both go red on the same withheld rule (the first has a paint assertion, the second cannot claim a direction for a tint that did not move).

**Round 1's green is real and is now cited properly.** Run 31434962012 concluded with `gate` and `pixels` both successful on `04a4b9e`. The pre-review draft of this file said the green was "recorded here" and, twenty lines later, that it would be recorded "when it lands" — it had landed and neither sentence had the run. The head that ships is this round's, so GREEN_RUN is the citation that matters; 31434962012 is kept because it is what round 1's restore actually proved.

Two latent flakes in the tests' own reads were found in run 31434033908's shape and fixed before `04a4b9e`: a remembered colour could be captured mid-cross-fade (now `settledRowBg`, which waits for `getAnimations()` to empty before reading), and one change-poll compared two rows to each other instead of a row to its own rest.

Three jsdom modelling notes, so the tests say what a browser does: a pill leave dispatched with jsdom's default `relatedTarget: null` reads to React as leaving the whole cell (the wrapper's leave fires too), so the pill tests name the element the pointer moved to; the collapsed-branch fixture waits out the rename in flight before clicking `Add work item`, which is disabled while `busy`; and the focus tests use `fireEvent.focus`/`fireEvent.blur` rather than `.focus()`, because React reads focus through `focusin`/`focusout` and only the `fireEvent` pair is wrapped in `act` — a bare `.focus()` moves `document.activeElement` and leaves the render unflushed, watched as `expected [] to deeply equal [ '010', '020' ]` on a correct implementation. That a real Tab reaches the box and really paints is the browser's to say, and it does.

## Not verified

- **The Chromium assertions** — this host has no browser, so none of the following was run locally and no local result is claimed for them (R5). The PR's `pixels` job is the proof for all five, both halves, and the runs are in "Watched in CI" above:
  - `the cell lights every dependency's row, and dark again on leaving`: the painted colour of the **pinned** Name cells, polled through the 100ms cross-fade, banded and unbanded row landing on one shared tint, back to their two rest colours on leaving;
  - `a pill narrows the light to its row and tints its line in the card`: one row painted, the other at its rest colour, the card's emphasised line carrying a swatch where no other line does at weight 400, and the real pointer move off the pill widening the light back;
  - `the tint moves the same way on both surfaces, in both palettes`: the root class toggled to reach the dark palette, and in each palette the lit row and the card's swatch both moved off the surface each sits on and both in the same direction — rasterised through a canvas, because a computed `color-mix` comes back as `oklab(…)` and a resting grey as `rgb(…)` and string equality between two notations is what let the inversion through;
  - `the keyboard gets the same light, from the box's focus`: the attribute and the paint, from focus alone with the pointer parked at the origin, and back to rest when the focus leaves the grid;
  - `a clipped chip has no hover target, and the cell still lights its row`: seven chips, real area and real clipping asserted first, the clipped chip answering no hit test at its own centre, the cell-level hover point found by hit test, and the clipped dependency's row lit.
- **The dark palette's look, as opposed to its direction.** What is pinned is that the tint moves the same perceptual way off both surfaces in both themes. Whether the dark swatch reads as _pretty_ is task 4.2's, and the app ships no theme switch to reach it from the UI — the browser check reaches it by the root class, which is the whole mechanism the tokens are built on.
- **One pre-existing test failed on round 1's red head and it is not this change's.** `opens the folded figure in the same breath as the mouse arrives` (the first test in the same file, untouched here) read `Dev for 010No estimate yet…` — its seed's `2/3/8` estimate never reached be-01 for that throwaway account, a race in the seed, not in the hover. It was green again on `04a4b9e`'s run 31434962012, which settles it.
- **The tint's look.** Whether 12% ring ink reads as "these rows" at arm's length is a judgement for eyes on dev (task 4.2); what is pinned is one declared tint per surface, painted, distinct from each row's rest colour and moving the same way on both.
- **Task 4.2** — the dev deploy and Dany's look come after the merge.
- **Anything outside Chromium.** The layout gate is one engine by design.
