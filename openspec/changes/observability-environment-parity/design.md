## Context

PR #741 merged at `f5904f9e67b666d7adb0459ef6f67659b16974ff`. It provides a working bounded dev stack on h3mon and an observer on h1claw. The user requires environments to work the same unless a concrete reason justifies a difference. This packet plans convergence; it does not retroactively claim the existing Compose rollout proves production parity.

The following source comparison and fresh read-only probes are planning evidence, not implementation acceptance. A post-implementation verify.md will record actual parity proofs. The existing [production rollout](../production-observability/design.md) remains the owner of production activation, backup objectives and Victoria retirement. [Delivery timing](../measure-delivery-waiting/design.md) remains a separate consumer.

| Area             | Running dev implementation                                            | Existing Kubernetes candidate                        | Required convergence                                                                       |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lifecycle        | Compose; six services have restart policy `no`; observer uses systemd | Flux, Helm/ECK and Kubernetes controllers            | Same Kubernetes/Flux service lifecycle; rehearse recovery                                  |
| Trace processing | Proven Elastic gateway with APM enrichment/aggregates                 | Collector has logs and metrics only                  | One shared three-signal pipeline definition                                                |
| Identity         | Explicit dev admission; measured app revision                         | Telemetry ConfigMap uses `local` or `production`     | Separate deployment identity from producer environment                                     |
| Access           | Loopback/SSH; Elastic security disabled inside the private stack      | ECK certificates/password plus OTLP mTLS path        | Authenticated private access in every persistent instance; no insecure dev overlay         |
| Metrics          | Dedicated collector scrape exporter and five-second probe scrape      | Prometheus remote write plus platform scrape targets | Preserve both actual producer contracts and platform coverage through shared configuration |
| Retention        | Seven-day logs/traces and metrics; one-day APM aggregates             | Thirty-day logs; fifteen-day metrics; no trace ILM   | Same retention mechanism, explicit measured policy values                                  |
| Stores           | Docker named volumes                                                  | ECK/Prometheus retained PVCs                         | Supported migration or retained-history access; no dual mounts                             |
| Grafana          | Existing instance; additive API-owned objects and receipts            | Chart Grafana deliberately disabled                  | Keep existing Grafana and one explicit owner per object                                    |
| Local proof      | Full Compose proof plus component fixtures                            | Existing k3d/Flux lab and fixture receiver           | Rehearse the actual shared Kubernetes services                                             |

A fresh `ssh h4claw 'sudo -n k3s kubectl get nodes -o wide'` was denied for account claw. A fresh h3mon container-runtime pod listing showed only CoreDNS. Neither proves cluster-wide readiness, Secret availability, Flux ownership or sufficient capacity for a second runtime.

## Goals / Non-Goals

**Goals:** Shared signal behavior and deployment lifecycle; explicit, tested differences; protected environment identity; a reversible dev cutover supported by the same acceptance used for production candidates.

**Non-Goals:** Moving the WBS application itself, changing CI selection, implementing delivery timing, introducing a new telemetry backend, production activation, secret changes, deleting old stores or certifying HA.

## Decisions

### Shared source and deployment path

Converge on the repository's existing Kubernetes/Flux direction. Use the already proven dev gateway configuration as behavioral evidence, while retaining the platform collector's filelog/failure mappings, OTLP transport and infrastructure metrics. Do not replace one config with the other wholesale.

Introduce shared configuration builders under `tools/tool-observability-stack/src/configuration/` and shared workload composition under `infra/platform/observability/base/`. Environment inputs carry service addresses, secret references, source admission, storage/capacity and retention values. Version pins, processing order, redaction, queue behavior, health semantics and recovery policy remain common. Rendered artifacts are checked for drift; Flux consumes committed deterministic artifacts rather than executing a new generator on hosts.

Keep `src/dev/` as the compatibility adapter for the current Compose rollout until cutover. Extract common behavior without silently altering the deployed renderer. Local and production overlays consume the same shared composition; add a dev overlay only through the same path, with equivalent validation.

The existing cluster IDs identify deployment targets, not application environments. Do not rename `platform-production`, repurpose `platform-local` as persistent dev, or relabel incoming application records merely to make a renderer accept them.

### Failure isolation and placement

The user selected separate dev and production service/store instances built from the same definitions. This isolates dev experiments and failure rehearsals from production telemetry. Namespace, storage, credential and source-admission boundaries are instance-specific; the common configuration and lifecycle contracts remain shared. A valid dev identity must be refused by production ingest/query routes even when it reaches their private listeners; different Secret names alone do not prove distinct authority.

Separate instances do not imply new machines automatically. They can share a cluster only after scoped namespace/RBAC/network/storage ownership and coexistence capacity are proven. Cluster-scoped ECK/Prometheus operators and CRDs have one reconciler owner. Refactor controller ownership explicitly before adding another namespaced instance; do not install the full kube-prometheus-stack chart twice with its operator/CRD defaults. Keep host/cluster metrics scoped by their actual source rather than duplicating them under fabricated application environments.

If existing capacity cannot safely host the overlap or the required isolation, report the measured shortfall and prepare a separate capacity proposal. Do not weaken limits, stop Victoria or provision infrastructure to hide it.

### Permitted differences

| Input                                                                                | Reason                                                           | Proof                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Names, namespaces, cluster markers and source environments                           | Independently addressed deployments and actual producer identity | Correct-target positive and wrong-target/cross-environment negatives                            |
| CPU, memory, replicas and storage size                                               | Measured workload and declared availability objectives           | Coexistence budget plus equivalent bounded load/recovery acceptance                             |
| Retention durations and size limits                                                  | Different measured volume/history needs                          | Same ILM/TSDB mechanism and historical-query checks                                             |
| Private addresses, certificate identities, secret references and backup destinations | Distinct trust domains and ownership                             | Same authenticated transport, valid-client positive and invalid-client/admin negatives          |
| Alert recipients                                                                     | Avoid real incident paging during rehearsal                      | Same rules and a local receiver that records firing/resolved notifications                      |
| k3d node substrate versus enrolled k3s hosts                                         | Disposable local lab                                             | Same Kubernetes/Flux service graph; host reboot/network claims require host evidence separately |

The list allows field-specific values, not arbitrary patches. Security disabled in dev, missing trace pipelines, silent telemetry loss, omitted persistent queues and manual-only process recovery are not acceptable steady-state exceptions. A laptop running a small fixture may remain useful for editing, but that result is labelled component evidence, not environment parity.

### Validation boundary

Add a semantic comparison of rendered service configuration and effective Helm/workload output. Validate the exception records themselves, reject unused/stale paths and compare siblings after each permitted scalar difference. Do not normalize all annotations, environment variables or URLs away: those can contain routing, auth and ownership behavior.

The comparison complements actual pinned-binary configuration validation, promtool tests and Kubernetes rehearsal. A syntactically equal configuration cannot prove runtime health. Reuse the current observation identity/freshness evaluator through backend adapters; add authenticated query transport instead of changing the domain states.

### Ownership and authority

Long-lived Kubernetes resources remain Flux-owned. Existing production dependencies cannot be bypassed to make dev readiness green. Secret material is never included in snapshots or planning output. Disposable rehearsal identities are local-only; persistent credential creation or modification remains a separately authorized action.

Grafana remains the existing service with its current default. Carry forward the receipt-based additive integration, automate the remaining fixed type/URL check, and accept a fresh unique receipt for each migration operation.

## Migration Plan

1. Build and validate common configuration and exact environment-difference contracts. Keep the running dev Compose release pinned and unchanged.
2. Complete the existing Kubernetes three-signal path, common retention setup, protected backend query adapters and single controller ownership. Coordinate overlapping tasks with the production packet so implementation has one owner.
3. Run the shared deployment through the existing isolated k3d/Flux lab. Prove stored logs/metrics/traces, UI use, authentication negatives, bounded process recovery, outage/loss reporting and historical queries.
4. Obtain a fresh authorized cluster inventory and prepare a concrete dev operation: target/namespace identities, exact source revision, controller owners, capacity, secrets/certificate metadata, snapshots, retained history locations and rollback commands. Read denial keeps this operation blocked; it does not block source work.
5. With the topology and persistent inputs resolved, stage a separately owned dev candidate. Preserve the old route. Validate supported restore/export and known historical samples before switching any producer. Do not mount Compose store directories directly into new pods.
6. Switch only dev telemetry and new Grafana objects after acceptance. Observe at least two freshness windows, exercise route rollback and restore with distinct receipts, and record the active revision/locations. Stop the old dev services only after acceptance; retain their volumes. Production promotion remains in its existing separately authorized plan.

## Risks / Trade-offs

The Kubernetes path currently lacks proven trace behavior, and completing it requires more than moving containers. Shared-host instances still share a host failure domain; they are not HA. A second controller installation can disrupt both instances if ownership is not split first. Keeping two stores during migration costs capacity. Existing Docker history may remain queryable in the retained backend while a supported transfer is verified; an empty new store is not successful migration.

## Open Questions

- Separate service/store instances are approved. Physical placement and shared-controller ownership still require the authorized inventory below.
- Read-only cluster inventory is blocked by h4claw sudo authorization. Required observations are cluster identity, nodes/capacity, Flux/controller ownership and readiness, namespace/storage bindings and credential key metadata without values.
- Persistent dev placement and the exact namespace/controller plan depend on that inventory. No new cluster, credentials, production mutation or capacity purchase is authorized implicitly.
