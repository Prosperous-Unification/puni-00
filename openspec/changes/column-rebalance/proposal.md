<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany's screenshot of the live table at ~2000px, 2026-08-09: the Start and End
columns are 52px and a short date wraps inside them — `29 Sep` onto two lines,
`29 Sep 2027` onto three. Two columns of the plan's schedule are unreadable at
any window width, because 52px was measured against a workday offset and nobody
measured it against a date. Meanwhile Number is 169px — sized to eleven
characters at the deepest indent, which almost no row has — and Name, the
remainder-absorber, takes everything the two mistakes leave over.

## What Changes

**Start and End are sized to a printed day.** Both go 52 → the width a browser
measures the widest day the formatter can print, plus End's no-estimate marker:
`20 May 2027 ?`. One width for the pair, because the two ends of one span are
read against each other. The `title` keeps the full `YYYY-MM-DD`, unchanged.

**The Number column's display envelope shrinks.** From eleven characters at the
deepest indent to a two-level number — `010.1`, drawn at the indent a two-level
row has, beside its expander and its frozen-number lock. The contract around it
is unchanged and already written: a number past the envelope is clipped, never
wrapped, with the whole number in the cell's `title`.

**Name is untouched.** It absorbs the remainder and shrinks by the difference;
its 200px floor and the frame that scrolls below the table's minimum stay
exactly as they are.

Every width moves through `frameLayout`. No consumer gains a number, and the
`columns` memo gains no dependency: rebuilding a column definition takes the
focus and the half-typed value with it.

## Non-Goals

- No maximum width on Name. That is a separate decision Dany has not made.
- The earliest-start column keeps its 84/56, though 84 is too narrow for a
  dated year form as well — see `verify.md`.
- No change to how a day is formatted, or to any `title`.

## Constraints

- A stored width from `T1 column-widths-drag` outranks the new default. That is
  correct: reset is the route back.
- Three folded phases no longer fit a 1280 laptop; the frame scrolls, which is
  the documented backstop.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Number column's envelope, and the two date columns' widths.

## Impact

fe-01 only: `table-frame.ts` and every test that quoted its numbers. No
migration, no wire change, no dependency.
