## Why

A saved single-number estimate such as 5 looks blank in the folded o/r/p input because the input text is deliberately transparent while a duplicate final value appears beside it. A planner must be able to read what they entered after blur, refresh and folding.

## What Changes

- Keep the folded input's shorthand visibly readable at rest. When its text equals the computed final value, show that value once in the input and omit the duplicate final span.
- Apply the same single-reading rule to parent rolled-up trios.
- Keep distinct shorthand and final values visible together, with the existing quiet-trio treatment.

## Non-Goals

No change to parsing, estimate storage, arithmetic, three-box editing, incomplete drafts, refused input or unestimated cells.

## Constraints

The existing estimate-cell-at-rest delta is the active wbs-estimate-cell base in this checkout; there is no main spec for that capability. Its conflicting flat-trio requirement is amended in place. The new delta modifies that requirement.

## Capabilities

### Modified Capabilities

- wbs-estimate-cell: the folded single estimate and equal parent roll-up remain visible without a duplicate final span.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

WBS frontend estimate-cell rendering and its component/browser assertions only. No API, stored contract or migration.
