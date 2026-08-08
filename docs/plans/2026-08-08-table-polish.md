# Table polish — plan v2 (2026-08-08, night)

v1 reviewed same night: codex 13 findings (4 critical), agy 5 (1 critical,
convergent). All folded in; disposition at the bottom. Base: branch
`change/keys-notes-and-fit` (PR #31, open — this stacks on it).

Dany's asks: **U1** the Depends chip stack is ugly; **U2** Name line 1 =
title, always fully shown, wrapping; lines 2+ = .md body, only on edit/
hover; hover renders `# title` + body; **U2.2** Name half as wide; **U3**
horizontal scroll acceptable when phases are expanded; **U4** `#` instead of
"Number", tighter paddings, spreadsheet feel.

Four changes, resequenced per review (geometry moves once, in one change):

---

## 1. `depends-folds-to-a-count` (U1) — independent, first

**Rest: one line — `030 +7`**, both the shown number and the count computed
from the resolved `numbersOf(...)` list, so peer-pruned or dangling edges
never miscount. `title` lists all numbers.

**Open: the overlay is the editor, and its visibility is the picker's open
state — never the candidate list's emptiness** (codex #2: today `open`
requires entries; a row whose candidates ran out would hide its own remove
controls). Chips with ✕ live in the overlay; zero-candidate state shows
chips + "nothing left to add".

**Focus model, specified** (codex #1 — v1 contradicted shipped contracts):

- The grid Tab contract is untouched: Tab/Shift+Tab from the input walk to
  adjacent grid cells, chips stay OUT of the tab sequence (that is today's
  deliberate rule, kept).
- **Keyboard removal moves into the listbox**: when the box is empty, the
  candidate list is prefixed by the current dependencies as removable
  entries (`Remove 030` …), reachable with ↑↓ + Enter — the same pattern
  the folded `@` picker shipped for `Remove <name>`. Pointer removal stays
  the ✕ chips.
- **Picking keeps the list open** (existing tested contract, unchanged).
  Escape/blur-outside close; blur INTO the overlay does not (containment
  via `relatedTarget`, the ⋯ menu already does this).
- Peer-prune tests while open: first/middle/last dep removed, highlight
  vanishing, candidate list emptying under the cursor.

**~0.75 day.** Pixels: 10-dep row is one line at rest; overlay hit-testable;
fault: badge computed from raw ids → dangling-id test red.

## 2. `spreadsheet-geometry` (U2.2 + U4's widths) — all geometry, once

One change owns every number that moves (codex #13/#6; v1 moved geometry
twice and forked the width authority):

1. **Name cap inside the one authority:** `table-frame.ts` exports
   `tableMaxWidth(columnIds) = fixed sum + NAME_CAP (420)`; the `<table>`
   style becomes `width: min(100%, tableMaxWidth)` with `minWidth:
tableMinWidth` as today. Name stays the single unsized `<col>`: wide
   frame → table stops at max and Name gets exactly 420; narrow → remainder
   down to the 200 floor. No cell `max-width`, no `fit-content`, no second
   system. Faults: cap constant removed → Name-at-420 assertion red; cap
   and colgroup fed different sums → alignment assertion red.
2. **`#` column, measured not asserted** (codex #10 + agy #1 killed 64px:
   depth-cap indent alone is 48). Header `#` (aria keeps "Number");
   INDENT_STEP 12 → **8** (cap 4 = 32px); frozen 🔒 leaves the inline flow —
   the state moves to `aria-label="Number 020, frozen"` on the number span
   itself plus `title` (codex #11: the shipped `Number is frozen` label is
   preserved as an accessible NAME, its test updated deliberately);
   triangle loses button chrome (density) at ~14px. Width target **84**,
   but the deepest fixture (`010.1.1.1.1` + triangle at depth cap) is
   measured in Chromium and the final constant is what the browser asked
   for — the date-column precedent, stated as such. Clipping is not
   acceptable; if 84 clips, the number wins and the width grows.
3. **Density paddings/typography:** grid font 13px, line-height ~1.45;
   CELL padding `2px 6px`; inputs contribute zero extra chrome (see
   change 3's quiet-inputs, which lands with this change's numbers
   already in place — order below).
4. **Point headers `o · r · p`** (matching the shorthand the cells teach);
   role point width can drop 52 → 44 with single-letter headers. Folded
   role cell: assignee as initials (`7 · DF`), full name in `title`,
   width stays 96.
5. **Row-height budget:** single-line row ≤ 28px at rest, asserted in the
   matrix.

**~1 day** including the h2puni measurement run.

## 3. `quiet-cells` (U4's look + U2's title-rest + hover doc)

The visual state moves from inputs to cells, and the Name cell learns
rest/edit modes — together, because both rewire how a cell shows state.

1. **Quiet inputs:** border/background/outline off, font inherited; the
   **cell** shows state. Mechanism (codex #8: match/refused state cannot
   move to the `<td>` by prop without remount risk): the tint stays INSIDE
   the cell on a full-bleed wrapper (inputs are already `width:100%`;
   the wrapper gets `position:absolute; inset:0` behind the input) — the
   "cell background" effect with zero new `columns` dependencies and no
   fight with the pinned cells' mandatory opaque background (the wrapper
   sits above it by construction). **Precedence, documented and tested:**
   pinned base < hover < match < armed-delete < refused < focus.
   Refused-state today has no visual at all — it gains the tint here, from
   the ref it already owns (CellInput renders its own wrapper — no state
   export needed).
2. **Focus indication:** `td:has(:focus-visible)` inset outline —
   keyboard-only by contract (codex #9), mouse editing shows the caret and
   that suffices; fallback for the depends/team cells whose focus sits in
   overlay controls: the outline binds to the grid stop input only.
   Fault: outline selector removed → keyboard-visibility assertion red.
3. **Title-only rest for Name** (codex #3 owned honestly): a NEW mirror
   measurer (autoSize today is scrollHeight-only; this is new code, named
   as such) — hidden block, same font/width/wrap, fed `split(value).name`,
   gives rest height; focus/expanded uses scrollHeight as today; column
   resize re-measures (ResizeObserver on the cell). jsdom pins the
   substring + state machine; the browser pins geometry, including the
   negative: mirror fed the FULL value → body visible at rest → red.
   Edge cases from `name-notes`: empty title, leading newline, CRLF-from-
   server.
4. **Caret contract unchanged** (codex #4): ↓ leaves at end of the FULL
   value, never the clipped title; every arrival path (click, focusNext,
   grid arrows, Cmd+Enter landing) expands to full height on focus —
   browser-asserted for focusNext and grid arrival, not just click.
5. **The body indicator and the hover document follow the SHOWN value**
   (codex #5): indicator (`≡`, muted, corner) and preview read the split
   of what the cell is displaying — during a refused hold that is the
   draft, and the preview says what the person is looking at, not what
   the server holds. `NotesPreview` gains the `title` prop and renders
   `# title` above the body (it cannot today — named). Accessibility:
   the textarea gets `aria-describedby` → "has notes" description;
   the preview opens on keyboard focus as well as hover.

**~1.25 days.** The riskiest change; it is also the one the screenshots
are about.

## 4. `unfolding-may-scroll` (U3) — last, after final widths

Accordion dies; roles unfold independently; folded-only no-hscroll
guarantee stays. **Everything at-most-one touches is enumerated and
superseded explicitly** (codex #7/#12, agy #3 — the R5 sin is silent
invalidation): the reducer proof test, the component JSDoc, the
`tableMinWidth` equation prose+test, `table-fits-the-screen`
proposal/design/tasks + verify.md inventory, the layout spec's "other
role folded itself" assertion, and PR #31's fit-matrix rows. Each
change's verify.md carries an **"assertions intentionally superseded"
table**: old claim → replacement → injected fault → observed failure.
New coverage: both-open reducer sequences, both-open `commandMove`/Tab
walk/picker ownership, both-open MAY-scroll + pinned-columns-hold in the
matrix. The openspec fit spec gets its delta — spec and implementation
must not disagree.

**~0.5 day.**

---

## Order, cost, interplay

1 → 2 → 3 → 4. **~3.5–4 agent-days** (v1 said 2.5–3; the reviews bought
the difference: the mirror is new code, the tint precedence needs faults,
and the superseded-assertions bookkeeping is real work). Review cadence:
codex+agy after 3, browser runs after 2, 3, 4 (2's is partly a
measurement run). Slots BEFORE the phases/gantt/mobile roadmap; that
plan's fit language inherits U3's folded-only guarantee (one-line addendum
there when this is approved).

## Open questions (recommendations inline)

1. Depends rest `030 +7` vs bare `8 deps` — first-chip recommended.
2. Point headers `o · r · p` — recommended over `opt/real/pess`.
3. Name cap 420px — right ballpark for "half"?

## Disposition (v1 review)

| finding                                          | disposition                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| codex 1 / agy 2 (popover focus contradiction)    | **Accepted** — chips out of tab order; keyboard removal via listbox `Remove NNN` entries; pick-keeps-open kept; containment blur. |
| codex 2 (open ≠ entries non-empty)               | **Accepted** — editor visibility = picker state; zero-candidate state specified; badge from `numbersOf`.                          |
| codex 3 / agy 4 (mirror doesn't exist)           | **Accepted** — named as new code; ownership, ResizeObserver, jsdom split vs browser geometry, negative full-value proof.          |
| codex 4 (caret contract)                         | **Accepted** — full-value rule explicit; every arrival path expands; browser assertions beyond click.                             |
| codex 5 (indicator/preview source + a11y)        | **Accepted** — shown-value split wins; NotesPreview gains title prop; aria-describedby; keyboard-focus preview.                   |
| codex 6 (fit-content forks width authority)      | **Accepted** — `tableMaxWidth` in table-frame; `width: min(100%, max)`; both faults specified.                                    |
| codex 7 / codex 12 / agy 3 (silent supersession) | **Accepted** — full enumeration + "assertions intentionally superseded" tables + openspec delta.                                  |
| codex 8 (tint can't move to td)                  | **Accepted** — full-bleed wrapper inside the cell; precedence documented; refused tint born here from CellInput's own ref.        |
| codex 9 (:focus-within wrong)                    | **Accepted** — `td:has(:focus-visible)`, keyboard-only contract, fault row.                                                       |
| codex 10 / agy 1 (64px broken)                   | **Accepted** — indent 8, lock out of flow, 84 target, Chromium measures the final constant, clipping refused.                     |
| codex 11 (lock aria)                             | **Accepted** — accessible name preserved on the number span; test updated deliberately.                                           |
| codex 13 / agy 5 (geometry twice, estimates)     | **Accepted** — geometry unified into change 2; budget 2.5–3 → 3.5–4 days.                                                         |
