## Why

Puni has checked-in Elastic/Prometheus platform definitions, but the verified live monitoring host still runs OTel with VictoriaMetrics, VictoriaLogs, VictoriaTraces and Grafana. Autonomous delivery observation needs a proven production destination. Activating manifests alone will not establish trace usability, alert delivery, recoverability or a safe migration from the existing telemetry path.

## What Changes

Plan a staged production rollout of Elasticsearch/Kibana for logs and traces, Prometheus/Alertmanager for metrics and alerts, and existing Grafana for metrics dashboards. Retain OpenTelemetry as the vendor-neutral producer interface; add a version-compatible Elastic trace gateway and real end-to-end acceptance.

Reconcile live prerequisites and ownership, pin the implementation, rehearse failure and restore paths, enable a canary, then migrate producers and dashboards while retaining Victoria rollback and history. Record the exact production revision, topology, endpoints, alert/backup proofs and limitations. Feed the resulting ingestion/query contracts into delivery-observation planning in PR #728.

## Non-Goals

No deployment, secret provisioning, certificate changes, producer cutover or Victoria shutdown is performed by this planning PR. No new telemetry vendor, second Grafana, fleet rebuild, production application migration or autonomous repair executor. No historical reindexing by default. High availability is a separate topology choice; a single node must not be described as highly available.

## Constraints

Reuse the existing Flux/ECK/OTel/Prometheus configuration and recovery procedures. Preserve MLflow, its trace export and backups. Verify actual cluster identity, resources, credentials, service ownership and access before production mutation. Keep public unauthenticated access closed. Changes to production, secrets and retirement require separate authorization; each implementation PR needs user approval before merge.

## Capabilities

### New Capabilities

- `production-observability-rollout`: Verified logs/traces/metrics, operator access, recovery and reversible migration to the selected production stack.

### Modified Capabilities

None; implementation must reconcile any changed existing platform contracts explicitly.

## Domain Terms

None. Existing platform and telemetry terms suffice.

## Decisions Recorded

None. The user selected Elastic and Prometheus; this packet defines rollout acceptance and retains reversible migration choices.

## Impact

Existing platform observability/backup/alert manifests, version locks, fleet conformance, Grafana provisioning and runbooks. This packet contains planning only; all implementation and rollout tasks remain open.
