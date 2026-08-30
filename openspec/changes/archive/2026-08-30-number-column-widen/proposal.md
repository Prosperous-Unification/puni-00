<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

`table-width-budget` (#62, merged `2be70fb`) reproduced a P3 the 2026-08-14
cloud regression understated: at depth 5 the Number cell's content box
overflows its 93px envelope, and — worse than "clipped, still legible" —
reading the visible prefix character by character found `010.1.1.1.1` and
`010.1.1.1.1.1` both draw `010.1.1.1.`. A row and its own child read as the
same number, the exact fault `table-mechanics` fixed one level shallower.
design.md D4 recorded two fixes that hold at every depth (eliding from the
head) and one that buys exactly one level (widening the column), put both to
Dany with their costs, and shipped neither — Dany had not yet chosen.

Dany has still not answered directly. This change takes the reversible half of
that open question rather than waiting on it further: **widen `['number', 93]`
to 105** in `COLUMN_WIDTHS`. One `INDENT_STEP` (12px), which design.md already
measured as affordable — two folded phases at 1280 go 1219 → 1231 against a
1248px frame, 12 of the 29px of slack `table-width-budget` measured by
breaking it (+16 survives, +32 does not).

## What Changes

**`table-frame.ts`'s `COLUMN_WIDTHS` entry for `number`: 93 → 105.** Every
downstream figure that sums it — `frameLayout`'s `minWidth`/`maxWidth`,
`foldedTableMinWidth`, the Phases dialog's quoted sentence, the pinned offsets
— moves by the same 12px, because they are all derived from this one map
rather than repeated. Nothing else in the layout changes: `NUMBER_ENVELOPE`'s
two-level contract, `DEEPEST_INDENT`, `INDENT_STEP` and the clip itself are
untouched.

**`e2e/layout.spec.ts` grows two cases**: the depth-5/6 pair now reading
apart (the fix), and the depth-6/7 pair still colliding (the fix's stated
cost — design.md D4: "buys exactly one level," not every level). The second
is a negative that keeps the first from being read as "the fault is closed."

## Non-goals

**Eliding from the head**, design.md D4's other option. It holds at every
depth rather than one, but inverts how every clipped number in the product
reads — a product call, not a reversible one, and explicitly left for Dany.
This change is the reversible half only, said in the code as a comment so the
next reader knows it was a choice.

**`NUMBER_ENVELOPE_LEVELS`.** The envelope's contract (two levels) is
unrelated to the declared width the contract is checked against; #62's own
design.md D4 is explicit that widening the column is slack, not a contract
change.
