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
recorded in `dep-hover-highlights`' verify. It passed on the green head below,
which is the evidence for that claim rather than the assertion of it.

**The green half.** Head `HEAD_SHA`, run `GREEN_RUN`, 2026-08-11: `gate`
**pass**, `pixels` **pass** — `GREEN_TOTAL` e2e tests, the three
`deps-cell.spec.ts` add-button tests green by name, and the two
`deps-single-line` tests beside them green with the eighth button now on the
strip.

## Not verified

- No browser was run on this host: it has none. Every claim about paint, hit
  testing and default actions is CI's `pixels` job, cited above.
- The dev deploy and Dany's eyes on it (`tasks.md` 4.2) are open.
