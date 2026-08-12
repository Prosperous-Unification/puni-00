<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Unfolding a role folds whichever role was open. That is an accordion, and it was
a width decision: a folded role costs 96px and an unfolded one 348, so one open
role already needs more than a 1280 laptop has.

The cost lands on the one reader it was meant to help. Comparing two phases'
three-point estimates — the thing the columns are for — means opening one,
reading it, opening the other and holding the first in your head, because the
table takes it away as the second arrives. A table that reshuffles itself when
something is opened reads as a bug whatever it is protecting.

Dany's call, 2026-08-08 (U3, `docs/plans/2026-08-08-table-polish.md` §4):
horizontal scrolling is **acceptable** when a role is unfolded. The pinned
handle, number and name are what make it readable, and they already ship.

## What Changes

**Unfolding**

- From: an accordion — `unfoldedRoles` holds at most one id, and its only
  writer replaces rather than adds
- To: a set — each role opens and closes on its own, and any number may be open
- Impact: with anything unfolded the table may be wider than the frame, and the
  frame scrolls. The page still never does

**The folded guarantee, unchanged**

- Folded, the table fits every laptop in the browser gate's matrix, and the
  Phases dialog's folded minimum is the same figure it was

**What the fold button promises**

- From: "any other role folds"
- To: "the table may scroll sideways" — the one thing unfolding can now do that
  it could not before

## Non-Goals

- No new width. Nothing is narrowed to make two open roles fit; the frame
  scrolling is the answer, and it is the answer that was already built.
- No memory of which roles are open. Unfolding stays local to the reader and
  unshared, exactly as it was.
- No change to the Phases dialog's arithmetic, which quotes the folded minimum.

## Constraints

- Every claim that at most one role can be open is superseded by name, in the
  spec, in the tests and in the plan that inherits the language. A green matrix
  invalidated in silence is the R5 sin this repository names.
- Keyboard: the row is eight cells longer with two roles open, and no walk ever
  asserted that far because it could not be reached.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: roles unfold independently, and an unfolded table may scroll
  inside its frame

## Domain Terms

none

## Decisions Recorded

none — the decision is Dany's own and is recorded in the plan it came from.

## Impact

`apps/fe-01` only: `wbs-table.tsx`'s `unfoldedRoles` and its one writer, the
fold button's copy, their unit tests, and `e2e/layout.spec.ts`. No be-01, no
gw-01, no migration, no deploy step.
