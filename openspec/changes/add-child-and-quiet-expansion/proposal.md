## Why

Creating a nested work item is hard to discover from the row being broken down. On a flat plan, the expansion buttons appear actionable although no branch exists; pressing Collapse all also saves a collapsed state that can hide the first child created later.

## What Changes

- Add Add child to each work-item row menu and its mobile card menu. Create the last child, reveal it by opening its parent and ancestors, and focus its Name after a successful create.
- Make Expand all and Collapse all silent no-ops when the plan has no nested work items. Do not persist an expansion change from either action on a flat plan.
- Preserve first-child estimate hand-down and one-command undo.

## Non-Goals

No change to numbering, row indentation, existing drag behavior or the search filter's forced expansion.

## Constraints

Expansion is saved per project in local storage. Today Collapse all writes an empty map; a later-created parent is collapsed because absent keys read as closed. A fresh project starts with the boolean true, which leaves new parents open. Child creation must open ancestors even when a previous legitimate collapse is remembered.

## Capabilities

### Modified Capabilities

- wbs-domain: child creation is available from row and card menus; expansion controls act only when branches exist.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

WBS frontend menus, expansion state and focused tests; existing create and undo contracts are reused. No migration.

## Deferred: drag into parent — pending Astra design v2

The current drag planner already has an into-row zone, but its discoverability and phone interaction need a separate design review. A future change may make dropping onto a row a clear way to create a child. This proposal adds no drag requirement.
