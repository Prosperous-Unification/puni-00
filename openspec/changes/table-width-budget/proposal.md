<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The 2026-08-14 cloud regression raised three findings against the plan table's
geometry (`notes/wbs-cloud-regression-2026-08-14.md` in the workspace). It
could not put its browser at 1280px — the cloud window is pinned at 1536 CSS px
— so the headline one was **derived from a declared width and never watched**.

Watched now, in Chromium at 1280×800: **the P2 does not exist.** The 1343px it
quotes is the table's `width: min(100%, 1343px)` — the sum with Name at
`FLEXIBLE_CAP`, which is where the table _stops growing_. The floor that decides
whether anything scrolls is `min-width`, and it reads **1123px** with one folded
phase, **1219px** with two and **1315px** with three. D14's recorded 1219px
budget is exact, unchanged, and is the two-phase figure. Nothing regressed.

What is real is smaller and was never in the report's words: **nothing at any
viewport has ever watched the boundary itself.** `layout.spec.ts` fits two
folded phases at 1280 and `phases.spec.ts` reads the three-phase `min-width`
string, but no test has put a third phase on screen at 1280 and watched the
frame scroll. That gap is why a `width` could be read as a `min-width` for a
whole day.

## What Changes

**A browser test that measures the boundary** — `scrollWidth`/`clientWidth` at
1280×800 for one, two and three folded phases, with the declared `width` and
`min-width` asserted as the two different numbers they are. D14 asks for exactly
these three readings.

**The Depends on cell's own hover moves onto its `<td>`.** It sits on a wrapper
`<span>` inside the cell today, so the cell's padding is dead and the light
answers a gesture the reader did not make.

**`1 phase need` → `1 phase needs`**, in the sentence that quotes this very
budget. The `and 1 others` class #59 fixed, in the dialog next door.

## Non-goals

Any column width. Nothing here moves a declared px, so every figure above is
unchanged by this change. The depth-5 Number number, which is a recorded clip
bargain and a live open question — `design.md` D4. Restoring an empty input box
in a 110px cell holding two chips: it needs +34px of column or shrinking chips,
and both are Dany's call.
