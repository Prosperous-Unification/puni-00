## Why

The running dev observability stack uses Compose while the planned production stack uses Kubernetes/Flux. Their signal pipelines, authentication, retention setup, generated workload bounds and recovery behavior differ, so success on dev does not prove that the production candidate will behave the same. Puni needs to exercise the deployment it intends to operate, with each environment difference justified explicitly.

## What Changes

- Use shared observability components, configuration and acceptance checks across local rehearsal, dev and production candidates; Kubernetes/Flux is the existing deployment direction to converge on.
- Make environment differences explicit inputs with reasons and verification. Runtime, signal processing, security guarantees and recovery semantics do not vary merely because an environment is called dev.
- Bring the proven Elastic trace gateway and autonomous stored-query acceptance into the common deployment, preserving working log mappings and metrics coverage.
- Prepare and rehearse a retained-history migration from the dev Compose stack. Continue using it until its replacement passes the common checks; record it as transitional rather than claiming parity.
- Report source parity, rehearsal evidence and live convergence separately.
- Share cutover and cold-start workload accounting, including selected-provider traits and explicit volume and enforcement provenance.
- Validate and retain locked object-store archives, derive bounded layer byte facts, and import retained bytes without implicit builds.

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
