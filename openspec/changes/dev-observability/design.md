## Context

This implements the dev stack foundation selected in [delivery observation](../measure-delivery-waiting/design.md), informed by the separate [future production rollout](../production-observability/design.md). User authorization covers autonomous implementation and reversible dev-only work; final merge, secret changes and production operations remain separate.

Read-only inspection on 2026-10-25 found h3mon with 15,602 MiB total / 13,965 MiB available memory and 129 GiB free disk. Docker runs Victoria, collector-contrib 0.159.0, Grafana 13.0.7 and MLflow. The collector receives agentic-SDLC telemetry from h1claw, not application logs. Application logs on h2puni use Vector; the dev application is `wbs-dev-src` on `wbs-dev-net`. Its `/metrics` returned HTTP 200 with `unknown_service:bun` metadata and no registered measurements. A host-loopback :3100 request failed; the container-local endpoint worked. These facts rule out assuming an already usable Elastic stack or scraping the host port.

Live h3mon Compose files are under `/home/monitor/observability`. The versioned owner is `Prosperous-Unification/claire`, `setup/config/h3mon-observability/`; the last inspected path commit was `c9c26cfa673a7fd739d6cd300718925981f7c80b`. Do not overwrite that owner's collector/Grafana configuration from a guessed puni template.

## Goals / Non-Goals

**Goals:** A working dev signal destination and autonomous, query-verified health; private operator views; reproducible bounded rollout and rollback; preservation of existing services.

**Non-Goals:** Production readiness/HA, Victoria replacement, broad application auto-instrumentation, automatic repair or full delivery timing workflow. Probe request traces describe external measured activity and do not claim internal server spans.

## Decisions

### Deployment and reuse

Use a dev Compose profile in `tools/tool-observability-stack` on h3mon, with distinct names, persistent volumes and loopback ports. This is the dev instance of the selected Elastic/Prometheus architecture; Victoria remains a preserved source/history path pending a separate migration. Do not activate the production Flux graph, bypass its dependencies or create a second Grafana.

Reuse the repository's Elastic/Kibana 9.3.8, Prometheus 3.14.0, collector 0.160.0 pins and existing log redaction/failure-field conventions. Pin a matching Elastic gateway and prove the actual binary/config. The official [9.3.8 gateway sample](https://raw.githubusercontent.com/elastic/elastic-agent/refs/tags/v9.3.8/internal/edot/samples/linux/gateway.yml) includes the `elasticapm` processor and connector; both are needed for service views. Infrastructure metrics belong in Prometheus; APM aggregates needed by Kibana belong in Elastic. Do not forward all host metrics to both backends.

All host-published dev APIs bind loopback. Cross-host traffic uses existing authenticated SSH transport, with no new credentials or plaintext public route. Container networks isolate dev services; only the explicit Grafana query integration can reach Prometheus. Resolve its additive provisioning through the existing owner, preserve datasource UIDs and leave its default unchanged. No tenant-facing API is added: the dataset is operator-only. Test exposure at the rendered Compose and runtime boundaries.

### Producers and health

A small Bun dev probe performs bounded read-only health requests against the actual dev service and publishes measured duration, an observation log and parent/child OTLP request spans. It reads the service's declared revision; it must not invent a revision from repository HEAD or confuse the probe revision with the application revision. The probe emits no user/request bodies, cookies, authorization headers or organization secrets. It is independently scheduled, cannot block the application and uses low-cardinality metric dimensions; revision/correlation IDs remain log/trace attributes rather than per-request metric labels.

Collect supported structured dev logs through a dev-only input, retaining the existing application's redaction and the collector's credential-shape redaction. Do not change the shared Vector/Victoria route or mount an unrestricted Docker socket. The concrete container log input must be pinned to the observed dev container and refreshed safely when it is recreated. Existing application metrics are collected where meaningful; absence is visible, not replaced with a synthetic success claim.

Shared health assessment consumes signal observations (identity, observation time, completeness) without Elastic, Prometheus or runner concepts. Dedicated adapters query each store and translate output. A completely absent observation is `missing`; a partially observed group is `incomplete`; an observed but expired signal is `stale`; only matching, complete, fresh signals produce `complete`. Query errors remain explicit errors, not empty successful observations. Default collection cadence is 30 seconds, freshness window 120 seconds, total probe/query deadline 20 seconds. These are bounded dev defaults, not production SLOs.

### Capacity and recovery

Every container has explicit memory/CPU/PID/log bounds. Preflight reserves host headroom and sums configured limits; stale or missing capacity cannot authorize apply. Dev starts with seven-day logs/traces, 24-hour APM aggregate retention and seven-day/1-GiB metric retention, constrained further by observed ingestion and disk headroom. Elasticsearch rollover and per-stream retention are set explicitly and verified against actual stream names. Queue limits and exporter drop/backlog metrics are recorded; no lossless claim follows from receiver acknowledgement.

Alertmanager retains local firing/resolved alerts without real external recipients until separately authorized. Prometheus rules include absent-series detection, stale observations, exporter failure/backlog and storage pressure. Grafana shows observation health and measured dev requests; Kibana shows logs and trace waterfalls. The probe's health endpoint alone cannot prove backend storage.

## Migration Plan

1. Implement and test preflight, pinned configuration, probe and query acceptance in the isolated worktree. Exercise each safety guard negatively.
2. Validate with actual pinned binaries in an isolated rehearsal. Record memory, ingestion/query timing, retention and failed-backend behavior.
3. Recheck live host identity/capacity and snapshot named configuration metadata. Deploy only the dev profile at a pinned implementation revision, using existing SSH access. Preserve application and old telemetry routes.
4. Add the reviewed Grafana integration through its identified owner; verify existing dashboards still work. Collect real dev log, metric and trace evidence and the bounded outage/recovery sequence.
5. Prepare commits and PR; record exact commands and remaining limitations in `verify.md`. Final merge is separately authorized.

Rollback stops the named dev services without `down --volumes`, removes only the newly registered datasource/dashboard/network attachment or restores its captured predecessor, and preserves all stores. Missing ownership/rollback information blocks the affected integration rather than authorizing an overwrite.

## Risks / Trade-offs

A single host is not HA. Dev shares h3mon capacity with existing monitoring and an enrolled Kubernetes agent; preflight and runtime limits are necessary. Loopback-only uncredentialed dev APIs rely on host/operator and container network boundaries and must never be reused as production access policy. Any integration requiring new credentials remains pending separate authorization. The current dev metrics implementation exposes little useful activity; the probe provides real measured request telemetry while comprehensive instrumentation remains separate.

## Open Questions

Gateway binary component availability, exact live Grafana provisioning parity, and dev container log format/path require implementation-time verification. A missing fact is a failed preflight, not a default. No production cluster access is needed for this dev profile.
