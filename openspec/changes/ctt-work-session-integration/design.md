## Context

The parent [coordinator design](../twilight-agentic-workflows/design.md) requires CTT readiness followed by host admission. The repository has RunStore admission implementations but no CTT dependency or production consumer. Published 0.12.0 removes the planned 0.11 settlement surface.

## Goals / Non-Goals

Implement native validated topology, independent ticket sessions, accepted-fact reconstruction and actual RunStore admission. Preserve existing ownership, revision, replay, retry and capacity semantics. Do not implement another traversal interpreter, persistent ticket format, outcome mapper, claim protocol or provider activation.

## Decisions

Use `materializeDagInputFromRecords` and `prepareDag` from the exact published package. A compatibility materializer uses existing `orderSteps` and `formatStepNodeId`; each ordered step explicitly depends on the preceding step's work. A preparation function also accepts the native materialized envelope, allowing complete disconnected and milestone validation without another graph language.

A run coordinator owns a prepared DAG and one external-completion work session. Its activities are existing step nodes of that run's leaf. The authoritative input boundary supplies current WBS project/work-item identities, the complete step catalog, accepted `done` progress and current eligible step IDs. It must come from validated WBS reads; local outcomes and local receipts are not inputs to this boundary. The compatibility materializer supplies topology; project-step order is not inferred from binding-map keys.

Readiness overlays the latest RunStore snapshot. New attempts exclude active/waiting/reconciling/terminal work and exhausted retry budgets. Only the existing pre-claim, proven-absent interrupted state can retry. Retained occurrences must match this run's step-node identities; unknown historical mappings throw instead of changing old IDs. Operation keys remain caller-retained and the store checks exact immutable replay.

Admission accepts an issued native ticket, a RunGuard and an Admission. It verifies ticket-to-occurrence correspondence and refreshed WBS facts, then invokes actual `RunStore.admitAttempt`. The store remains the atomic authority for ownership, revision, identity, retry and global capacity. Exact existing attempt replay reaches that authority before new-work exclusion; it never bypasses current ownership. No admission path completes CTT work or performs an external launch.

Completing a ticket requires a fresh accepted `done` fact for its exact step node. A local issued-ticket set rejects foreign or fabricated objects before native completion. Native completion receipts distinguish first and repeated acknowledgements. Reconstructing creates an independent session, so tickets from an earlier coordinator remain foreign. Inspection uses CTT's callback-free APIs; no workflow visitors are registered.

## Risks / Trade-offs

WBS reads provide advisory eligibility; receiver authority and conditional claim/write checks still govern remote effects. Separate reads can become stale, so this component never claims remote authority. A changed step catalog requires rebuilding the coordinator and invalidates local tickets. Existing arbitrary occurrence identities are preserved through refusal rather than silently adopted as step nodes. CTT tickets are capabilities local to one process, not durable execution identities.

## Migration Plan

Pin 0.12.0 and its lockfile entries, add the consumer and tests, then update the parent plan's API references. No database migration or durable-format change. Package and consumer changes can be reverted together. Existing architectural merge holds remain in force.

## Open Questions

None for this consumer. Complete coordinator CLI composition, outcome/write recovery and provider work remain separately tracked in the parent change.
