## Why

PUNI plans CTT 0.11 coordination but installs no CTT dependency and has no executable readiness-to-admission integration. Published 0.12.0 replaces the planned API, so installing it without connecting validated topology, accepted completion facts and durable attempt admission would leave the coordinator gap open.

## What Changes

- Pin `configurable-tree-traversal` to published 0.12.0 and verify its real Bun/TypeScript consumer path.
- Map the current ordered workflow steps into CTT's native materialized input. Prepare the complete topology before admission, including disconnected components and prerequisites.
- Use independent externally completed work sessions and their local tickets. Dependencies remain blocked until the host supplies accepted completion facts; inspection invokes no workflow callbacks.
- Reconstruct readiness from current WBS facts and durable execution history. Filter ineligible, running, waiting and retry-blocked work, then connect selected work to existing atomic RunStore admission and its revision, ownership and capacity refusals.
- Reject foreign or stale ticket completion and preserve exact duplicate acknowledgement. Rebuilding a session does not adopt old tickets or infer business success from an agent turn.
- Update the existing coordinator plan to use the current published API and record real integration/R5 evidence.

## Non-Goals

Changing CTT itself, introducing another graph language, changing business outcome policy, implementing the pending outcome/write protocol, replacing persistence or receiver contracts, enabling providers, completing the remaining S7a/S7b work, operator migration or production deployment.

## Constraints

Use Bun/Nx and the real published dependency. Preserve existing accepted IDs, binding manifests, store interfaces and admission semantics. Tickets and traversal state remain local; durable acceptance stays with WBS and RunStore. Missing trusted facts throw; expected admission conflicts remain typed. Prove new safety boundaries through actual production-path failures and restore every injected fault. Existing architectural merge holds remain in force.

## Capabilities

### New Capabilities

- `ctt-coordination`: Validated compatibility topology, accepted-fact reconstruction, local ticket ownership and guarded durable admission using CTT 0.12.0.

### Modified Capabilities

None.

## Domain Terms

None; use existing step-node and execution identities and CTT's published API terminology.

## Decisions Recorded

None; no new durable representation or irreversible policy is selected.

## Impact

Twilight Dash coordination code/tests, exact dependency and lockfile, toolchain pin checks, coordinator planning and verification. No storage migration or production activation.
