---
status: accepted
---

# WBS owns runtime fences within each project and person

Conditional runtime writes use a receiver-minted generation scoped to the authenticated organization, project and person. A takeover fences delayed runtime requests while retaining existing claims; ordinary authorized WBS APIs keep their behavior. A local coordinator epoch cannot fence an independent receiver, and neither a receiver generation nor claim absence proves a worker has stopped.

## Considered options

Local-epoch-only checks cannot stop delayed requests at WBS. Per-attempt ownership would permit independently managed fleets but complicates takeover of one coordinator's project/person inventory. For the first fleet protocol we choose a conservative scope-wide receiver fence. Restricting all ordinary UI/operator writes would change existing business and authorization contracts, so this packet instead makes the runtime-channel boundary explicit.

## Consequences

Owner labels are not credentials; existing authorization and person/credential binding remain mandatory, including before replay. A stale writer must not automatically reacquire after refusal. The coordinator owns all runtime WBS dispatch and must keep direct writes out of workers. Ordinary authorized edits may invalidate a runtime basis; an actor deliberately using the ordinary channel is outside this concurrency guarantee. Runtime attempt identity remains distinct from WBS business attempt ordinals. Continuation and reattachment retain the same attempt/session/claim. A genuinely new execution attempt keeps the logical operation but, after predecessor quiescence/effect reconciliation and guarded exact release, acquires a new exact claim; it never rebinds the old immutable claim. This avoids a claim-update API or extra active-binding table, at the cost of a release/reclaim gap in which another holder may win. Retry therefore rechecks normal eligibility and the current basis and has no continuous-reservation guarantee. Takeover is never an automatic release. Scope changes later require explicit protocol migration, not reinterpretation of old generations.

Protocol: [receiver design](../../openspec/changes/twilight-agentic-workflows/receiver-design.md). Requirements: [WBS run bridge](../../openspec/changes/twilight-agentic-workflows/specs/twilight/wbs-run-bridge/spec.md). Evidence: [verification](../../openspec/changes/twilight-agentic-workflows/verify.md).
