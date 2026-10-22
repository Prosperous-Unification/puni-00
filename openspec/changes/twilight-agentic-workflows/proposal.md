## Why

WBS can identify startable work and its holder, but no production integration executes that
work through agents, tools and human decisions. The existing control-plane proposal puts
LangGraph, infrastructure and a Backlog.md migration before a working execution path.

## What Changes

- **Activity execution:** one Twilight Dash ActivityExecutor port for API models, coding
  harnesses, ACP, tools and humans.
- **Bindings:** Burokrat validates type/activity bindings; Dash retains immutable manifests
  and referenced prompt/tool-policy versions for each run.
- **WBS bridge:** guarded claims, progress, measures and exact-authority release under a fleet
  credential, with typed refusals. Shared canonical request identity lets a durable sender
  retain the exact payload identified by a receiver receipt.
- **S7a coordinator:** unified CTT hints, deferral and summary over a linear compatibility
  workflow; abstract RunStore/ArtifactStore ports; intent/outbox reconciliation and safe
  recovery of surviving workers or uncertain effects. SQLite is the current adapter choice;
  any conformant provider can replace it.
- **S7b integration:** reuse the runtime for pinned type-specific DAGs, joins and repair.
  W0–W12 in the WBS planning project remain required product scope.
- **Staged cutover:** S7a safety proofs precede deployment and real dogfood. A linear run does
  not complete the type-DAG milestone.

## Non-Goals

K3s workers, OpenClaw triggers, Backlog.md migration and multi-tenant hosting. This change
plans the integration; the WBS editor, model and migration are delivered by W0–W12.

## Constraints

Bun/Nx; pinned SDK packages; provider-prefixed model IDs; fleet credentials; no credentials
in retained manifests. Burokrat rules are pure. Storage engines and schemas stay behind
semantic ports. Unknown worker/effect state blocks automatic retry. The laptop cap is two.

## Capabilities

### New Capabilities

- `twilight/activity-execution`
- `twilight/workflow-binding`
- `twilight/wbs-run-bridge`
- `twilight/run-coordination`

### Modified Capabilities

None.

## Domain Terms

Canonical runtime request.

## Decisions Recorded

[ADR 0057](../../../docs/adr/0057-activities-run-on-the-ai-sdk-and-an-interpreter-coordinates.md)
and design.md record accepted API/storage/recovery refinements; other product assumptions
remain proposed.

## Impact

Twilight Dash agents, workflows, runs and bridge; Burokrat contracts; repository bindings;
replacement of harness-example after conformance; control-plane tasks and operator runbooks.
