## Why

Puni is being developed through dev, but dev has no verified Elastic/Prometheus destination for autonomous observations. The live monitoring host serves different signals through Victoria and MLflow, while the current dev metrics endpoint reports no application measurements. Running containers and successful receiver responses cannot establish that useful, fresh telemetry is queryable.

## What Changes

Provide a bounded dev deployment using the existing observability tool, pinned platform versions and collection conventions. OpenTelemetry routes dev logs and traces through an Elastic gateway into Elasticsearch/Kibana; Prometheus and Alertmanager expose metrics and observation-health alerts; existing Grafana gains an explicit dev datasource and dashboard.

Autonomous collection and a bounded dev probe produce queryable service/revision-correlated signals, with missing, stale and incomplete observations visible. Verify actual dev activity and stored output, including trace structure, rather than relying on endpoint status or synthetic fixture success.

Provide reproducible rollout, preflight, rollback, private operator access and outage/recovery evidence. Prepare tested commits and an implementation PR.

## Non-Goals

Production activation, Victoria retirement, historical reindex, storage deletion, MLflow migration, new Grafana, tenant-facing telemetry APIs, automatic repair and the full delivery-observer workflow. This does not claim comprehensive application tracing or production availability.

## Constraints

Reuse existing platform versions and assets; provider details belong in adapters. Preserve current dev availability and existing telemetry paths/history. No secret changes or final implementation merge without separate authorization. Private operator access must not expose other organizations through application APIs. Bound memory, CPU, storage, queueing, request time and retries. Unknown or empty evidence cannot pass acceptance. Use OpenSpec, Bun/Nx, affected checks and production-path negative proofs.

## Capabilities

### New Capabilities

- `dev-observability`: Bounded, private, query-verified dev telemetry and autonomous observation health.

### Modified Capabilities

None.

## Domain Terms

None; reuse existing environment and observation-health language without changing delivery progress semantics.

## Decisions Recorded

None; the dev deployment is reversible and does not settle production topology.

## Impact

`tools/tool-observability-stack`, dev collector/probe configuration, existing platform assets, operator documentation, and an additive integration with the Grafana configuration owned by `claire`. No application database migration.
