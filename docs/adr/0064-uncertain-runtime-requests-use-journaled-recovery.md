---
status: accepted
---

# Uncertain runtime requests use journaled recovery

On 2026-10-28 the owner approved R2 for implementation, tests and review: retain a recovery journal, acquire a receiver fence that dominates the original request, and atomically publish verified acceptance or fenced nonacceptance with a generation barrier. Preserve complete existing execution histories through an explicit additive upgrade, deliver authority and claim recovery before write and physical recovery, and retain capacity in a recovery hold until continuation conditions are established. Architectural main merge remains separately held.

## Considered options

New-store-only support avoids upgrade work but postpones recovery of existing retained work. Joint authority/claim/write adoption avoids an intermediate migration but delays the first usable recovery slice. Universal exclusion of old processes would strengthen the operational boundary but requires proving shutdown beyond the local store instance; the selected policy instead blocks their execution, ownership and history writes while explicitly permitting compatible artifact retention and monotone refusal-clock observations.

## Consequences

Ordinary open still never upgrades or repairs state. Upgrade preserves every predecessor record and migration identity; unused successor down restores populated predecessor histories, while used recovery history refuses destructive reversal. Actual already-open and queued old-writer proofs, late rollback faults and complete historical reconstruction remain required implementation work. Logical nonacceptance proves neither worker termination nor permission to release capacity, and this intermediate slice does not complete write recovery, physical continuation or S0/S7a.

Contract: [logical recovery](../../openspec/changes/twilight-agentic-workflows/recovery-design.md). Parent decision: [execution facts survive restart](0061-execution-facts-survive-coordinator-restart.md).
