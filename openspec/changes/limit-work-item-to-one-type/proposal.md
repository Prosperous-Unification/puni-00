## Why

Dany (2026-09-27, WBS 010.4.10): "allow to add just one type to a work item; keep the underlying db structure same". A work item currently takes up to ten types. Future per-type step workflows (`address-step-nodes`, later `resolve-type-step-workflows`) need one answer to "what is this work item", and several types cannot select one workflow.

## What Changes

- A work item carries at most one work item type; none remains allowed and types still never inherit.
- The Type cell becomes single-select: choosing a type replaces the current one, and clearing removes it.
- Create, patch, batch, HTTP and MCP commands refuse more than one type with a typed 4xx, `work_item_takes_one_type`. Plan import refuses rows with several types, naming them, without a partial write.
- A work item that already carries several types reads as a **type conflict**: all its types are shown, flagged, until somebody picks one. Nothing is chosen for them.

## Non-Goals

No schema or migration change: `work_item_work_item_type` and the `typeIds` array stay, so several types can return later. No type-dependent workflow, inheritance change or directory vocabulary change. Saved plans keep the types they captured.

## Constraints

The one-type rule is an application invariant checked inside the same write transaction as the type replacement, for every write path including undo/redo and batch replay. Blue and green share SQLite during a swap and an older writer can still store several types; that produces a type conflict, not corruption. Undo restores the exact prior set, including a conflict. Duplication and project copy carry a conflict unchanged rather than resolving it. The archived `2026-08-31-work-item-types` requirement allowing several types is superseded by this change's requirement when the wbs-domain main spec is synced.

Assumption, recorded rather than asked: the WBS item's note proposed keeping the first type by stable order through a reversible one-time normalisation. This change instead shows existing multi-type rows as conflicts, because choosing silently discards meaning (AGENTS.md R5), an older writer can recreate several types mid-swap, and no migration is then needed at all.

## Capabilities

### Modified Capabilities

- wbs-domain: one type, type conflicts, single-select Type cell.
- plan-command-registry: typed refusal of several types.
- plan-import: refusal of several types per row.

## Domain Terms

Work item type and Type conflict are defined in `CONTEXT.md`.

## Impact

Command normalizers, work-item service, plan import, fe-01 Type cell, MCP/OpenAPI schemas, two-type conformance fixtures.
