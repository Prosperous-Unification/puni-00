## Why

Dev uses Compose and planned production uses Kubernetes/Flux, with different pipelines, authentication, retention, resource bounds and recovery. Puni needs shared deployment behavior and verified environment differences; current dev success does not prove production behavior.

## What Changes

- Use shared observability components, configuration and acceptance checks across local rehearsal, dev and production candidates; Kubernetes/Flux is the existing deployment direction to converge on.
- Make environment differences explicit inputs with reasons and verification. Runtime, signal processing, security guarantees and recovery semantics do not vary merely because an environment is called dev.
- Bring the proven Elastic trace gateway and autonomous stored-query acceptance into the common deployment, preserving working log mappings and metrics coverage.
- Prepare and rehearse a retained-history migration from the dev Compose stack. Continue using it until its replacement passes the common checks; record it as transitional rather than claiming parity.
- Report source parity, rehearsal evidence and live convergence separately.
- Inventory stage, chart and bootstrap contributors; bound container resources, scratch, alert-receiver input/history and conditional controller lifecycles through shared accounting and validated patches, retaining provider and enforcement provenance.
- Retain verified archives, helper identity roles and observed platform provenance; version provider records explicitly, preserve prior teardown, derive bounded layer facts and import without implicit builds.

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

None. Preserve the existing distinction between application environment and platform cluster identity.

## Decisions Recorded

The user selected separate dev and production service/store instances built from shared definitions. Physical placement requires verified ownership and capacity; no new topology has been applied.

## Impact

`tools/tool-observability-stack`, `tools/tool-fleet`, `infra/platform/observability`, related Flux/alert/backup configuration, existing observability runbooks and the production rollout packet.
