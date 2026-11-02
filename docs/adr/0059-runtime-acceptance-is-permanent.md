---
status: accepted
---

# Runtime acceptance survives undo and makes used ledger rollback refuse

Accepted runtime commands retain canonical payload-bound immutable receipts independently of the ordinary undo journal, with current authorization checked before replay. Authority, exact attempt bindings and receipts share a versioned ledger identity and retained counts; after first accepted history, the schema's down script refuses. This keeps a lost response distinguishable from nonacceptance across supported restart, takeover and migration paths.

## Considered options

The ordinary journal is pruned and restamped, and current progress cannot attribute an effect to a particular command. Expiring dedup records or dropping them on release would let an old command execute again. Retaining every refused attempt would provide stable refusal replies but adds a different persistence/recovery contract; this protocol retains accepted outcomes only and reevaluates refused requests. A rollback warning is insufficient because downgrade/re-upgrade could otherwise look like never-initialized authority.

A guard alone prevents supported destructive rollback but cannot identify a reconstructed valid empty receiver. A ledger ID alone misses partial table loss. We combine a no-history SQL down guard, an identity pinned before dispatch, and constrained-marker/count validation. A new valid ledger mismatches old intents; missing or inconsistent trusted tables throw. No reset, archive-and-delete or activation mechanism is introduced.

## Consequences

History survives claim release, undo and journal pruning, without cascading deletion or TTL. The unused installation remains reversible; a used installation must retain additive schema when reverting application code. Startup and authoritative-absence audits scan retained tables. Receipt absence becomes conclusive for a receiver command only after its old generation is fenced against the same intact pinned ledger; it never proves worker quiescence or external-effect absence.

Coherent restoration of an older entire database preserving the identity and counters, and hostile DBA forgery, are outside this guarantee. Adding an external monotonic witness would be a separate decision. Existing tenant authorization, credential lifecycle and organization activation remain unchanged.

Protocol: [receiver design](../../openspec/changes/twilight-agentic-workflows/receiver-design.md). Requirements: [WBS run bridge](../../openspec/changes/twilight-agentic-workflows/specs/twilight/wbs-run-bridge/spec.md). Evidence: [verification](../../openspec/changes/twilight-agentic-workflows/verify.md).
