## Why

On a large plan, repeated estimate trios form a wall of slashes while the derived result a reader needs is the smallest, quietest part of each folded step cell. The cell should make the result easy to scan without changing how estimates are authored.

## What Changes

**Folded estimate reading**

- From: The typed trio is strongest, and a different result appears as a muted, separator-prefixed annotation.
- To: Every estimated folded step shows its result at the row's own type and foreground with tabular numerals and no separator; the trio is smaller and muted at rest, then returns to full strength on focus.
- Impact: Non-breaking visual change for people reading or editing the WBS table.

**Repeated and rolled-up readings**

- From: A flat trio suppresses its result, and a parent's rolled-up trio retains the current emphasis.
- To: A flat trio keeps the result visible and hides the repeated trio text at rest; parent cells use the same quiet-trio, strong-result hierarchy as leaves.
- Impact: Non-breaking visual change to folded leaf and parent cells.

## Non-Goals

This change does not alter stored estimates, result computation, unfolded three-box layout, hover-card content, keyboard navigation, mentions, the assignee slot, the phone-card face, or add a spread or uncertainty mark. Unestimated cells remain empty, and refused input keeps its invalid styling at full strength.

## Constraints

The trio remains a real input whose text cannot be styled in parts. The 96px column is shared with an assignee slot, editing behavior must remain unchanged, and the existing inline-style ownership is retained. Alternatives belong in an ADR; no decision here meets the ADR threshold.

## Capabilities

### New Capabilities

- `wbs-estimate-cell`: Defines how a folded step cell presents its result and typed or rolled-up trio at rest and while editing.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

The change affects only the WBS frontend's folded estimate-cell rendering and its jsdom and Chromium coverage. It changes no API, stored contract, dependency, migration, or deploy path.
