## Why

Dev uses Compose and production plans Kubernetes/Flux, with different pipelines, authentication, retention, resource bounds and recovery. Puni needs shared deployment behavior and verified environment differences; dev success does not prove production behavior.

## What Changes

- Use shared observability components, configuration and acceptance checks across local rehearsal, dev and production candidates; Kubernetes/Flux is the existing deployment direction to converge on.
- Make environment differences explicit inputs with reasons and verification. Runtime, signal processing, security guarantees and recovery semantics do not vary merely because an environment is called dev.
- Bring the proven Elastic trace gateway and autonomous stored-query acceptance into the common deployment, preserving working log mappings and metrics coverage.
- Implement dev route cutover, rollback and restore with distinct retained-history receipts. Preserve dev until its replacement passes reviewed common checks; record transitions separately from parity.
- Report source parity, rehearsal evidence and live convergence separately.
- Inventory and bound source contributors and conditional lifecycles through shared accounting, retaining provider and enforcement provenance.
- Collect host/workload resource history through the existing observer, with provider-neutral readings, explicit unavailable states and reversible immutable-binary updates.
- Validate packet commitments; retain verified archives, helper identity roles and observed platform provenance; version provider records explicitly, preserve prior teardown, derive bounded layer facts and import without implicit builds.

## Non-Goals

Application deployment redesign, CI optimization, full delivery-timing collection, broad application instrumentation, automatic repair, production activation, secret changes, Victoria retirement and storage deletion.

## Constraints

Preserve the working dev observer, Grafana defaults, MLflow and existing history. Keep the shared observation model provider-neutral. Reuse platform ownership, pinned versions, Flux reconciliation and existing fleet/lab tools. Do not bypass unready dependencies or infer cluster access from SSH access. New safety checks require production-path negative proofs. Production activation, secret changes and final merge remain separately authorized.

## Capabilities

### New Capabilities

- `observability-environment-parity`: Shared deployment behavior, justified environment differences and evidence-bound migration readiness.

### Modified Capabilities

None. This change coordinates implementation with the existing dev and production observability planning packets; their historical acceptance remains unchanged.

## Domain Terms

Use **rehearsal horizon** from `CONTEXT.md`; preserve application environment versus platform cluster identity.

## Decisions Recorded

The user selected separate dev and production service/store instances built from shared definitions. Physical placement requires verified ownership and capacity; no new topology has been applied.

## Impact

`tools/tool-observability-stack`, `tools/tool-fleet`, `infra/platform/observability`, related Flux/alert/backup configuration, existing observability runbooks and the production rollout packet.
