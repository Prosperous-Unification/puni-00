## Why

Creating a nested work item is hard to discover from the row being broken down. On a flat plan, the expansion buttons appear actionable although no branch exists; pressing Collapse all also saves a collapsed state that can hide the first child created later.

## What Changes

- Add Add child to each work-item row menu and its mobile card menu. Create the last child, reveal it by opening its parent and ancestors, and focus its Name after a successful create.
- Make Expand all and Collapse all silent no-ops when the plan has no nested work items. Do not persist an expansion change from either action on a flat plan.
- Preserve first-child estimate hand-down and one-command undo.
- Make the existing middle-row drag target legible with “Move under …”, temporarily open valid collapsed targets after about 600ms, and offer an arbitrary-parent Move under… picker on keyboard and mobile.

## Non-Goals

No change to numbering, row indentation, drag-zone geometry or the search filter's forced expansion.

## Constraints

Expansion is saved per project in local storage. Today Collapse all writes an empty map; a later-created parent is collapsed because absent keys read as closed. A fresh project starts with the boolean true, which leaves new parents open. Child creation must open ancestors even when a previous legitimate collapse is remembered.

The existing drag planner uses top/middle/bottom row zones; middle drop creates the last child. Frozen numbers remain movable. A refused or concurrently invalidated move must not leave a misleading preview or transient expansion.

## Capabilities

### Modified Capabilities

- wbs-domain: child creation is available from row and card menus; expansion controls act only when branches exist; drag and keyboard/mobile moves make child placement clear and recover from refusal.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

WBS frontend menus, expansion state, drag cues, move picker and focused tests, plus backend move validation against the dependency graph. Existing create/move and undo contracts are reused. No migration.
