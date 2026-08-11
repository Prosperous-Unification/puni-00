<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Adding a dependency has only ever been discoverable by knowing that the
Depends on cell is a box. A rested cell says `010 ✕ 030 ✕` and a fade —
chips, a removal each, and nothing that says another one can be added; the
one thing that starts the flow is an unlabelled sliver of `<input>` behind
the chips, which since `deps-single-line` is as narrow as the crowd leaves
it. Dany, 2026-08-11: "for depends on cells let's add an always visible
small btn in the cell that will trigger adding the dep."

## What Changes

**A `+` at the head of the strip, always on it**

- A small quiet `<button>`, first child of the strip the chips and the box
  share, sized to a chip's own `line-height` and `padding` so the row keeps
  resting at one line. Its click focuses the cell's box, and the box's
  existing `onFocus` opens the picker: no second path to the picker, one
  path to the box.
- **First, not last.** The strip clips its right edge and fades the last
  14px of it, so a trailing affordance is cut out of sight in exactly the
  crowded cell that needs it most — and the box's `width: 100%` would have
  pushed it there on an empty one. The head of a clipping `nowrap` line is
  the one place never cut.
- **The press is cancelled, the click is not.** `preventDefault` on
  `mousedown` keeps the focus where it is: a button taking it from this
  cell's own box is a blur, and this box's blur drops the search typed into
  it. The action lives on the click — R5 #12's fault class, and an
  assistive technology's activation carries no `mousedown`.
- **Not a tab stop**, at rest or open, where the chips flip. Tab already
  lands on the box and the box's focus already opens the picker.

## Non-Goals

- No hover-reveal, no row-hover fade: always visible is the ask.
- The picker, listbox, chips, card, fade, tab routing and the dependency
  hover machinery are untouched.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`.
- Rest height and the clip are Chromium's (the `pixels` job, R5 #14–16).

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Depends on cell offers a visible way to add.

## Domain Terms

none

## Decisions Recorded

none

## Impact

fe-01 only: `wbs-table.tsx` (the button), `styles.css` (its quiet, and the
chip rules scoped off it), `wbs-table.test.tsx`, `e2e/deps-cell.spec.ts`.
No migration or dependency.
