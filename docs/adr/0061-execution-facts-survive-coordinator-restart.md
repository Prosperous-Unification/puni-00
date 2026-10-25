---
status: accepted
---

# Execution facts survive coordinator restart

On 2026-10-25 the project owner selected durable execution records and receipt-based reconciliation for PUNI after comparing interrupt-and-restart with the retained-state design. Persist admission/launch intents before dispatch, retain session/worker identity, results and outgoing WBS intents, and confirm WBS acceptance before releasing successors; rebuild scheduling from WBS and accepted execution facts. A coordinator restart establishes neither worker termination nor effect absence: reattach when supported, otherwise verify quiescence/effects before replacement, and retain capacity in an explicit unresolved state when evidence is insufficient.

## Considered options

The earlier `9e3f58bb7` plan marked every running attempt interrupted on restart and allowed retries from that state. It is smaller, but repeating real agent effects safely requires evidence the simpler restart rule does not provide. The later `8fea99326` design retains the execution facts needed for reconciliation; this decision selects those recovery semantics, with additional storage contracts and crash tests as their cost. Neither WBS scheduling nor CTT queues need a persisted walk.

## Consequences

RunStore and ArtifactStore remain semantic ports; SQLite is the current adapter choice. Cross-system intent delivery and exact receipts provide guarded reconciliation without a distributed exactly-once guarantee. Unsupported backend lookup, cancellation, usage or effect observation must remain explicit; SDK cleanup success alone cannot establish physical quiescence.

This resolves decision G2 for further private implementation. It accepts neither the entire proposed SDK decision in ADR 0057 nor incomplete implementation/recovery proofs, and the owner's hold on architectural merges remains in force. The separately rejected persistent security-guard refactor remains unapplied.

Contract: [run coordination](../../openspec/changes/twilight-agentic-workflows/design.md#run-coordination). Requirements: [coordination delta](../../openspec/changes/twilight-agentic-workflows/specs/twilight/run-coordination/spec.md). SDK limitations: [readiness findings](../research/2026-10-25-agent-executor-adapter-sdk-readiness.md).
