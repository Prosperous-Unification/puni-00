<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The 2026-10-13 UI/UX review found the Gantt panel hard to read: a short bar's
label painted over its lane neighbour's (`01010.3.0606`, F-012), placeholders
labelled `? · 010.4` beside the numbered bar (F-037), white labels under 4.5:1
on half the person colours (F-038), Weeks and Months axes with no month names
(F-023), a Months chart filling under half its panel with 1px slivers (F-026),
and a control strip in a smaller dialect than the toolbar whose off toggles
read as disabled (F-013).

## What Changes

- Labels take their own lane; placeholders say `<number> · no estimate`, or
  the number alone where only it fits.
- A hatched bar's label sits on its own fill; done slivers under 8px keep a
  1px green edge and drop the 2px outline and tick.
- Four palette entries move along OKLab lightness; the ink is the stronger of
  two; done bars are opaque.
- Compressed rungs name months at their first day, with boundaries.
- The calendar fills the panel; positive bars are at least 4px wide.
- Strip toggles are drawn plain when off and filled when pressed; the
  toolbar's 32px size is left open (two layout gates pin the strip).

## Non-goals

No change to scheduling, dates or any API. The Days axis prints as before;
the panel-fill horizon applies at every rung, Days included.

## Constraints

Dany's 2026-09-13 rule (commit 755f8213e): every bar title starts from the
item number and it must always be visible. F-037 removes the `?` lead only;
the number is kept, first, on placeholders as on every other bar.
