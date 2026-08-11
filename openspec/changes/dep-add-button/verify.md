# verify — `dep-add-button`

Branch `change/dep-add-button`, off `main` @ `94ed488`.

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the repo root on this branch, 2026-08-11.

| Command                                                 | Result                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                  |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green, exit 0 — 21 projects; fe-01: **1095 tests** in 45 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | green — 24 items, 24 passed, 0 failed                          |

`--skip-nx-cache` on both Nx runs. fe-01 was **1091 tests** on `main` @
`94ed488`; the four added here are the jsdom slice below. `build` is off the
local run-many by house rule — builds go to `h2puni`, not this box — and CI's
`gate` job is what runs it.

## What moved

One button, and the two stylesheet rules that keep it quiet.

- **`wbs-table.tsx`**: a `<button data-dep-add>` as the **first** child of the
  deps strip, before every chip. `flexShrink: 0`, so a crowded line clips chips
  and never crushes this. Its `onClick` reaches the cell's box through
  `[data-depends-input="<id>"]` on its own parent — the Name cell's notes
  marker's reach, scoped by the row's id so a stale query cannot focus another
  row's cell — and the box's existing `onFocus` opens the picker. There is no
  second path into the picker; there is one new path to the box.
- **First, not last**, and that is the whole of the placement decision. The
  strip clips its right edge and fades the last 14px of it
  (`deps-single-line`), so a trailing affordance is cut out of sight in exactly
  the crowded cell that needs it most — and the box's `width: 100%` claim would
  have pushed it past that edge on an empty cell too. The head of a clipping
  `nowrap` line is the one place on it never cut.
- **The press is cancelled, the click is not.** `preventDefault` on
  `mousedown`, and nothing else there: without it the button takes the focus,
  and a button taking the focus from this cell's own box is a blur — which
  closes the picker and drops the search typed into it. The action sits on the
  click because a `mousedown` that re-renders before the browser performs its
  default action is R5 #12/#14/#15's fault class, and because an assistive
  technology's activation dispatches a click with no `mousedown` at all.
- **Not a tab stop**, at rest or with the picker open, where the chips flip
  between the two. Tab into the cell already lands on the box and the box's
  focus already opens the picker; a stop here would cost one Tab per row on
  every walk through the plan and do nothing at the end of it that the next Tab
  does not already do. It keeps its own accessible name, so a reader's element
  walk still finds and activates it.
- **Its name is not the box's.** `Make 020 wait for something`, in the chips'
  voice (`Stop 020 waiting for 030`), rather than a second `Add a dependency to
020` — two controls in one cell under one name is a reader told the same
  thing twice, and it would make every existing query for that box ambiguous.
- **`styles.css`**: the chip rule and its `:hover` gain `:not([data-dep-add])`
  — a chip's hover goes `--destructive` because the ✕ is saying what the click
  will do, and an "add" that turned red would be promising a removal — and the
  add button gets its own quiet pair: no border, no fill, `--muted-foreground`,
  `--accent` on hover, at the chips' exact `line-height: 1.5` and `padding: 0
4px` so the strip's line box is unmoved and the row keeps resting at 28px.
  Nothing fades it in on a row hover the way the ⋯ button is faded: always
  visible is the ask.
- **The landmine held**: nothing was added to the `columns` memo, whose deps
  stay `[roles, unfoldedRoles]`; the button reads `row.original` and `live`
  like everything else in that cell.

## Failure-proof table

Every check this change adds, the fault injected into it, and what was watched.
The jsdom rows were watched locally — red with the fault in, green with it
restored — on 2026-08-11. The browser rows are CI's and are recorded under
"Watched in CI".

| Check                                                                         | Injected fault                                                                          | Observed                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `offers an add button at the head of every rested deps cell`                  | **the button removed from the strip**                                                   | `Unable to find a label with the text of: Make 030 wait for something` — and all four red   |
| `opens the picker from the add button, on the box the cell already has`       | **the `onClick` body dropped** — the button rendered and inert                          | `expected <body><div>…(1)</div></body> to be <input …(10)></input>` — the focus never moved |
| `keeps the add button out of the tab order, at rest and with the picker open` | **the chips' condition copied onto it** — `tabIndex={picker === null ? -1 : undefined}` | `expected +0 to be -1` — a stop appearing the moment the picker opened                      |
| `refuses the press the focus, so the box beside it keeps what was typed`      | **the `preventDefault` dropped** from `onMouseDown`                                     | `expected true to be false` — the press left to the browser                                 |
| `keeps the add button visible in a cell whose chips are clipped`              | **`order: 1` on the add button** — the DOM order unchanged, the paint order reversed    | `the add button's own centre answers <input>` — clipped out of sight, run 31473157529       |
| `keeps a half-typed search when the add button is pressed`                    | **a focus-stealing `onMouseUp`** on the button — the press moving the focus after all   | `Expected: "03" / Received: ""` — the search eaten by the control that means "search"       |

The two browser faults are deliberately chosen to be **invisible to jsdom**, so
the observation is the browser's and not a jsdom failure wearing a browser's
hat: `order: 1` moves paint and not DOM order, and every jsdom assertion here is
about DOM order (`strip.firstElementChild`); no jsdom test dispatches a
`mouseup` at all. The `gate` job stays green across both, which is what makes
the red a statement about Chromium.

`opens the picker from the add button, with the caret in the box` — the browser
half of row 2 — has **no separate CI red staged for it**, and that is said
rather than glossed. Every fault that breaks it (the click inert, the focus
moved to the press) reds the jsdom check first and takes the `gate` job down
with it, so the observation would be jsdom's. Its guarded behaviour is the row-2
fault above, watched locally; what the browser adds is the default action jsdom
never performs, and that half is recorded green.

## Watched in CI

Two heads on PR #42, each pushed alone and watched to conclusion — `ci.yml`
has `cancel-in-progress: true`, so a second push would have cancelled the first
run and left nothing observed.

**The red half.** Head `b9f7909`, run 31473157529, 2026-08-11: `gate` **pass**
3m21s, `pixels` **fail** 7m16s, 122 passed / 3 failed. The gate staying green is
half the observation — both faults are invisible to jsdom, so nothing but
Chromium could have said this:

- `keeps the add button visible in a cell whose chips are clipped` failed on
  `the add button's own centre answers <input>` — `expected true, received
false`. `order: 1` left the button first in the DOM and last in the paint,
  which put it past the strip's visible edge on a cell waiting on seven rows;
  the pixel at its centre belongs to the box that had been laid out before it.
  This is the placement decision measured: the head of a clipping `nowrap` line
  is the one place never cut, and the tail is cut exactly as predicted.
- `keeps a half-typed search when the add button is pressed` failed on
  `toHaveValue` — `Expected: "03" / Received: ""`, with the call log showing the
  box resolving 24 times to `value=""` and `aria-expanded="true"`: the picker
  reopened empty. The focus-stealing `onMouseUp` blurred the box, the blur
  closed the picker and dropped the search, and the click that followed opened a
  fresh one. Precisely the fault the cancelled press exists to prevent.
- `opens the picker from the add button, with the caret in the box` **passed**
  in the same run, as predicted: neither fault touches it, and the click's own
  focus still lands.

The third failure in that run is **not this change's**:
`name-cell.spec.ts`'s `a peer's longer name arriving while the cell is focused
is whole once it is left` failed on `the peer name never reached the box` —
`Expected: "Survey the existing warehouse racking…" / Received: "Strip the
wiring"`, a peer edit that never arrived over the socket. Nothing here touches
the Name cell, live editing or the gateway; it is the flake class already
recorded in `dep-hover-highlights`' verify. It passed on the green head below — test 110,
`✓ a peer's longer name arriving while the cell is focused is whole once it is
left (1.7s)` — which is the evidence for that claim rather than the assertion of
it.

**The green half.** Head `1126ec5`, run 31473982270, 2026-08-11: `gate`
**pass**, `pixels` **pass** — **125** e2e tests, all of them, the three
`deps-cell.spec.ts` add-button tests green by name, and the two
`deps-single-line` tests beside them green with the eighth button now on the
strip.

## The review round — observed before it was fixed

The cross review raised two P2s, both **derived from the source and neither
seen**. So both were measured before anything was changed: dev deployed at
`2b2affec` (the head above), a Browser Use cloud Chromium at 1440×900,
session `b2f8d2d9-c161-434f-95f1-0cfacf9b28f8`, a throwaway account and the
`deps-cell.spec.ts` fixture — nine rows, `020` waiting for seven, `030`
waiting for nothing.

**Both held.** Not by the predicted amount in one case, which is the reason
for measuring rather than reasoning: the review derived ~22px of growth from
the chip's line box, and the browser said 18.98.

### Finding 1 — an empty cell grew when it was clicked into

| Row 030 (no chips) | at rest | picker open | moved  |
| ------------------ | ------- | ----------- | ------ |
| row height         | 26px    | 44.98px     | +18.98 |
| the box's `y`      | 198     | 219.98      | +21.98 |
| the `+`'s `y`      | 198.5   | 198         | —      |
| the box's width    | 84.2px  | 102px       | +17.8  |
| the listbox's `y`  | —       | 240.98      | —      |

The box on a line of its own, 21.98px under the `+` it rests beside, and the
list under both. Clicking the cell and clicking the `+` measured
**identically**, so it was the strip's layout and not the button's handler —
the review's own "affects clicking the cell directly too", confirmed.

The `020` cell, seven chips, measured in the same session: 26px at rest,
118.94px open. Unchanged by the fix below and deliberately so — that is
`deps-single-line`'s open state, where wrapping is what the chips are for.

**Derived, not observed:** that a chipless cell stayed one line _on `main`_.
No `main` build was measured. It follows from the code — without the `+` the
open strip has exactly one flex item — but it is a reading, not a
measurement, and is written here as one.

### Finding 2 — the hover was lighter than the row it sat in

Light palette, row 030 hovered, then the `+` on it hovered:

| what                           | colour                       |
| ------------------------------ | ---------------------------- |
| the row under the pointer      | `oklab(0.93903 …)`           |
| the `+` hovered                | `oklch(0.968 0.007 247.896)` |
| a dependency-lit row           | `oklab(0.96448 …)`           |
| the same `+`, dark palette     | `oklch(0.279 0.041 260.031)` |
| the row under it, dark palette | `oklab(0.18885 …)`           |

Lighter than the row on a light page — the affordance reading as a hole
punched through the row to the page behind it. Four thousandths from a
dep-lit row's own colour, where it all but vanished. And right on a dark
page, which is the tell: one absolute value cannot answer for two themes,
and this one answered for one.

### Finding 3

`title="Add a dependency"` beside `aria-label="Make 010 wait for something"`,
read off the live DOM. Deleted.

## The review round — what moved

- **`wbs-table.tsx`**: the strip wraps only where there are chips to wrap —
  `picker !== null && waitingFor.length > 0`. The box claims `width: 100%`,
  so under a wrap its hypothetical main size is the whole strip and it can
  share a flex line with nothing; `minWidth: 0` lets it shrink past the `+`
  under `nowrap` instead, to the same 84.2px it rests at. The `+` is **not**
  hidden while the picker is open — always visible is the whole of what it
  is for, and a cell somebody is typing into is where "another one" has most
  to say.
- **`wbs-table.tsx`**: the `title` deleted.
- **`styles.css`**: the hover is
  `color-mix(in oklab, var(--foreground) 7%, var(--cell-bg))`. `--cell-bg` is
  the join every row state re-points (banded, hovered, dep-lit, drop), so the
  affordance darkens off whatever the row currently is rather than off an
  absolute value; 7% is `--grid-hover`'s own dose, so it stands off the
  hovered row by what the hovered row stands off the page. `--card-dep-lit`'s
  per-surface pattern (#38), one layer further in.

## The review round — failure-proof table

| Check                                                                              | Injected fault                                                    | Observed                                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `leaves an empty cell’s open strip on one nowrap line…` (jsdom)                    | **the chip condition dropped** — `picker !== null ? 'wrap' : …`   | `expected 'wrap' to be 'nowrap'`. Watched locally, 2026-08-11                                   |
| the same check's second half                                                       | **`flexWrap: 'nowrap'` unconditionally** — the wrap gone entirely | `expected 'nowrap' to be 'wrap'` on the chipped cell. Watched locally, 2026-08-11               |
| `answers to one name, with no tooltip saying a different one` (jsdom)              | **the `title` restored**                                          | `expected 'Add a dependency' to be null`. Watched locally, 2026-08-11                           |
| `rests an empty cell at its own height while the picker is open` (browser)         | **the chip condition dropped**                                    | `the open row is 44.984375px where it rests at 28px` — `Received: 16.984375`, run 31482772312   |
| `picks the add button up off the row it is hovered on, in both palettes` (browser) | **the hover paint back to `var(--accent)`**                       | `light: the hovered add button is lighter (244) than the row it sits on (235)`, run 31482772312 |

The second half of the wrap check is staged separately on purpose: `nowrap`
everywhere would satisfy the first assertion while silently undoing
`deps-single-line`'s open state, and a chipless-only check could not see it.

**One of these faults is not invisible to jsdom, and that is said rather
than glossed.** The hover fault is a stylesheet rule and jsdom evaluates
none, so `gate` was green through it and the colour red is Chromium's alone.
The wrap fault is an inline style the jsdom check reads, so `gate` failed
beside `pixels` on that head — jsdom stating the declaration, Chromium
stating the 16.98px it produces. There is no jsdom-invisible version of it
to stage: under `nowrap` nothing wraps, so no fault reaches that row height
except through the declaration jsdom can see.

## The review round — watched in CI

Two heads, each pushed alone (`cancel-in-progress`).

**The red half.** Head `b8b7d4d`, run 31482772312, 2026-08-11: `pixels`
**fail**, and it failed on exactly the two new checks and nothing else — the
five `deps-cell.spec.ts` tests before them green in the same run, including
all three the original round added. `gate` **fail**, as predicted above.

**The green half.** Head `b1fe412`, run 31483370458, 2026-08-11: `gate`
**pass**, `pixels` **pass** — **127** e2e tests, all of them, `rests an empty
cell at its own height while the picker is open` and `picks the add button up
off the row it is hovered on, in both palettes` green by name.

Local gate on `b1fe412`: `bunx nx format:check --all` green;
`bunx nx run-many -t test lint typecheck --parallel=2 --skip-nx-cache` green
across 21 projects, fe-01 **1097 tests** in 45 files (1095 before this round,
the two added being the jsdom pair above);
`bunx @fission-ai/openspec@1.3.0 validate --all` green, 24 passed, 0 failed.

## The review round — re-observed on dev

Dev redeployed to `b1fe412d`, all four health lines printed. A **fresh**
cloud browser, session `7a095f53-73e0-4151-aec0-3cfb1f67b925`, same fixture
and same viewport as the before run:

| Row 030 (no chips) | before, open | after, open |
| ------------------ | ------------ | ----------- |
| row height         | 44.98px      | **26px**    |
| the box's `y`      | 219.98       | **198**     |
| the `+`'s `y`      | 198          | 198.5       |
| the box's width    | 102px        | **84.2px**  |
| the listbox's `y`  | 240.98       | **219**     |

The row is the height it rests at, the box is back on the `+`'s own line at
the width it rests at, and the list sits 21.98px higher — at the rested
cell's own bottom edge. Identical again through the cell and through the `+`.
Row 020's open cell measured 118.94px in both runs: `deps-single-line`'s
state, untouched.

| the `+` hovered | before                     | after               | row it sits on     |
| --------------- | -------------------------- | ------------------- | ------------------ |
| light           | `oklch(0.968 …)` — lighter | `oklab(0.882328 …)` | `oklab(0.93903 …)` |
| dark            | `oklch(0.279 …)` — lighter | `oklab(0.24451 …)`  | `oklab(0.18885 …)` |

Darker than the row on a light page and lighter on a dark one, off the row's
own current colour in both. And `title` reads `null` on the live DOM.

Both cloud sessions were stopped through `PATCH /api/v4/browsers/{id}`
`{"action":"stop"}` and answered `"status":"stopped"` — dropping the CDP
connection does not end a v4 browser or its billing.

## Not verified

- Nothing about paint or layout was measured **on this host**: it has no
  browser. Every such claim is either CI's `pixels` job or the cloud Chromium
  against dev, and each is cited with its run or session id.
- That a chipless cell stayed one line on `main` is derived from the code and
  was not measured — see finding 1 above.
- Dany's own eyes on dev (`tasks.md` 4.2) are still open. Dev is left on this
  branch.
