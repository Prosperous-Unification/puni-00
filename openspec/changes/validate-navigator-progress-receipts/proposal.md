## Why

Navigator checks progress receipts while preparing commands, but Burokrat cannot report their consistency independently. A standalone validator gives callers the same refusal before they prepare a batch and keeps one definition of the receipt, plan reference and task export relationship.

## What Changes

Add `twib validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>` with strict decoding, existing digest checks, plan/task consistency, complete PlanRef equality and task/step membership. Emit deterministic JSON scoped to `progress-receipt-consistency`. Navigator reuses the typed checker before constructing its unchanged command batch.

## Non-Goals

Certification, authentication, current WBS authority, network access, WBS writes, sorting or deduplication, a new receipt format, and v9 support. Version 9 remains deliberately refused by the existing step blockage contract.

## Constraints

Retain historical v6/v7/v8 references and native task values. Refuse absent, unreadable, malformed and inconsistent documents with empty success stdout. Preserve exclusive output creation and receipt/measure order. Use Bun, existing contracts, focused TDD and watched production negatives. The parent owns the full h2puni gate and merge.

## Capabilities

### New Capabilities

- `progress-receipt-consistency`: independently check three supplied documents and reuse the check in Navigator.

### Modified Capabilities

None.

## Domain Terms

None; existing Plan reference, Progress receipt and Task export terms apply.

## Decisions Recorded

None.

## Impact

Burokrat contracts, source and installed CLI; Navigator receipt conversion; their tests and CLI documentation.
