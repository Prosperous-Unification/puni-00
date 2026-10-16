## Why

Progress receipts bind only PlanRef. Two v9 exports differing only in blockedAt retain the same PlanRef and tasks digest while their reference digests differ. Conversion cannot establish that progress belongs to the independently selected accepted reference.

## What Changes

- Add progress receipt schema 2 carrying the producer referenceDigest, covered by receiptDigest.
- Preserve schema 1 decoding and receipt-to-commands conversion.
- Add Dash record-progress-v2 for explicit bound receipt production.
- Add Navigator admit-progress requiring receipt, producer reference, tasks, independently selected accepted reference and exclusive output. Before proposing commands, strictly decode every document, require a bound receipt, compare both reference digest relationships and perform existing consistency checks.

## Capabilities

### New Capabilities

- `progress-admission`: local admission against a caller-selected accepted reference.

### Modified Capabilities

None.

## Impact

Burokrat contracts, Dash receipt producer and Navigator CLI. No current WBS state is read, no commands are applied, and no authentication or live freshness authority is introduced. Acceptance is relative only to the caller-selected reference.
