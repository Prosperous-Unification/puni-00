## Context

The user selected Elastic for logs and traces and Prometheus for metrics, with autonomous delivery observation as a consumer. This is a separate future production plan. [Delivery observation PR #728](https://github.com/Prosperous-Unification/puni-00/pull/728) first develops and proves the feedback loop on dev while Puni is used to develop itself. Production activation is not its prerequisite; dev evidence informs this later rollout.

Repository base at planning: `93b6f3555`. Existing work: [platform](../../../docs/infra/platform.md), [k3s platform tasks](../k3s-platform/tasks.md), [mTLS canary](../otlp-mtls-canary/proposal.md), [recovery](../../../docs/infra/recovery.md), and [fleet enrollment](../../../docs/infra/enroll-h4claw-h3mon.md). Reconcile these packets rather than replaying completed local proofs or pretending their open production tasks are complete.

Read-only probes on 2026-10-25 found the h3mon Docker OTel, VictoriaMetrics, VictoriaLogs, VictoriaTraces, Grafana and MLflow containers running. Collector destination hostnames were `victoriametrics:8428`, `victorialogs:9428`, `victoriatraces:10428` and `mlflow:5000`. Its Kubernetes runtime listed only CoreDNS; no Elastic/Kibana workload was running on the intended monitoring node. The tested h4claw accounts lacked cluster read permissions; the fleet account could not authenticate. Therefore cluster-wide readiness and current Secret/dependency state remain unverified. Earlier missing-Secret/Flux blockers in enrollment docs are historical, not current facts. An empty `count(up)` response from Victoria is not proof that its push-ingested metrics are absent.

Current manifests pin Elasticsearch/Kibana 9.3.8, Prometheus 3.14.0 and collector-contrib 0.160.0. They provide logs and metrics pipelines, no Elastic trace pipeline; the contrib collector lacks Elastic's APM enrichment components. The Elastic snapshot policy selects `logs-*` only. Prometheus has 15-day/8-GB retention on a 10-Gi PVC. Elasticsearch requests 4 GiB with a 2-GiB heap and one 100-Gi PVC; Kibana requests 512 MiB. Grafana is disabled in kube-prometheus-stack, while a separate Grafana is live on h3mon. These are concrete rollout gaps, not a reason to deploy a duplicate stack.

## Environment parity coordination

The user requires shared behavior and deployment mechanisms across environments unless a concrete reason justifies a difference. The [environment-parity change](../observability-environment-parity/design.md) now owns common configuration, Kubernetes signal-path convergence, runtime rehearsal and the dev migration proposal. Its tasks 2.1 and 3.2 coordinate the gateway and preflight work already listed here; use one implementation for each, not parallel competing versions. This packet continues to own production-specific backup/access/alert readiness, production authorization and Victoria retirement. The merged Compose dev rollout is a transitional implementation, not proof of production parity. Instance isolation and live target ownership must be resolved before migration; no production deployment is authorized by this planning update.

## Goals / Non-Goals

**Goals:** A usable, protected and recoverable production destination for all three signals; explicit ownership and capacity; dashboards and real alert delivery; reversible migration and evidence-based Victoria retirement.

**Non-Goals:** No current production rollout or production mutation in this PR; no automatic removal, new fleet provisioning, broad application instrumentation project or forced historical reindex. Preserve MLflow and its backups. Keep delivery measurement implementation independently reviewable.

## Decisions

### Topology and interfaces

Proposed first rollout uses the existing h4claw platform control plane and h3mon monitoring capacity, subject to fresh preflight. It is a recoverable single-node service, not HA. The existing footprint is a planning reference, not a settled availability commitment. The production topology/HA choice can be resolved when production promotion is scheduled; it does not block work on dev. If HA is required, this plan's placement/capacity and failure proofs must be revised before apply; adding a replica on the same host is not HA.

| Signal / surface                   | Proposed destination                                                     | User experience                                                      |
| ---------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Logs                               | Existing OTel path into Elasticsearch                                    | Kibana Discover and correlated logs                                  |
| Traces                             | OTel edge collector → version-compatible Elastic gateway → Elasticsearch | Kibana APM service inventory and trace waterfall                     |
| Infrastructure/application metrics | Existing OTel metrics pipeline and scrape targets → Prometheus           | Existing Grafana dashboards; Prometheus query UI for diagnosis       |
| APM-derived metrics                | Elastic gateway's APM aggregation → Elastic                              | Supports APM views; not a second full copy of infrastructure metrics |
| Alerts                             | Existing Prometheus rules → Alertmanager and approved receivers          | Firing/resolved evidence plus independent dead-man service           |
| MLflow                             | Preserve its existing exporter and storage                               | Existing experiment/trace consumers remain available                 |

Prometheus has its own [query UI](https://prometheus.io/docs/prometheus/latest/getting_started/); it is useful for ad-hoc queries and graphs. Reuse the live Grafana for saved dashboards instead of enabling another Helm Grafana. Kibana handles log/trace investigation; Grafana handles metric dashboards. Access initially remains private through approved tunnels or authenticated private routes, with exact endpoints recorded after deployment. Do not publish raw Prometheus, Elastic or Alertmanager APIs to the internet.

Prometheus access is operator-only, not a tenant API: its query endpoint exposes the dataset accessible to that instance. Query-only identities must not obtain admin/lifecycle APIs or Alertmanager silence authority accidentally. A future tenant-facing measurement API applies organization authorization separately. Preserve current OTLP private ingress/TLS boundaries and complete the documented mTLS canary cutover without an implicit plaintext fallback.

### Trace compatibility and producer coverage

Use the official [self-managed OpenTelemetry gateway path](https://www.elastic.co/docs/reference/opentelemetry/architecture) and the [configuration for the selected stack version](https://www.elastic.co/docs/reference/edot-collector/config/default-config-standalone). Choose and pin the matching gateway image/config in the implementation PR; prove its required processor/connector inventory with the pinned binary. The existing 9.3.8 stack cannot inherit 9.5-only documentation or endpoint assumptions. A broader Elastic upgrade requires an explicit compatibility change, not an incidental latest-image pull.

Add a dedicated gateway workload to the existing graph, with measured memory/CPU/queue storage and constrained access. Keep the existing edge OTel receiver contract stable. Do not send raw spans directly to the current log exporter and claim APM readiness. Traces require enrichment plus derived APM metrics for service views. Preserve trace/span/parent IDs, service/version/environment, timing, error status and correlation fields; use standard OTLP at the producer boundary. Verify the actual Bun/Node producer instrumentation rather than assuming Node auto-instrumentation works on Bun.

Inventory currently enrolled sources, API/query consumers, Grafana datasource UIDs, alert routes and current collector/config ownership. Include h1claw agent telemetry, Puni services, gates/dev observation when implemented, and any other currently observed producer. Platform readiness needs a known synthetic three-signal canary and at least one real enrolled producer; it must not invent CI observations that #728 has not implemented. Bring the effective h3mon Grafana datasource and collector configuration under an identified versioned owner before editing them; do not overwrite another repository's managed files from a guessed template.

### Retention, capacity and recovery

Starting policy: retain existing 30-day logs, add 7-day traces and 15-day APM aggregate metrics, retain Prometheus's 15-day or 8-GB limit (whichever acts first). Explicit ILM must cover the chosen gateway's real stream names. Data older than these windows is available only through retained exports/snapshots. Validate the 10-Gi metric PVC headroom with compaction/WAL overhead; retained block size is not total filesystem use.

Recompute `observability-budget.test.ts` and runtime admission for the gateway plus coexistence with Victoria/Grafana/MLflow. Measure CPU, available memory, disk/volume reservations, ingestion rate, series cardinality and queue fill on the actual hosts before applying. The previous 5,830-MiB graph estimate excludes new trace work and is not sufficient. Unknown capacity or storage class behavior blocks rollout; do not remove Victoria or lower safety bounds to make a failing budget pass.

Extend SLM selection and recovery receipts to logs, traces and required APM aggregate/config metadata. Use application-consistent snapshots and test restore under new names in an isolated destination. Preserve encrypted off-cluster credentials and restore instructions. Existing snapshots run daily; proposed nominal RPO is 24 hours while backups are healthy, with stale detection at 26 hours. Target recovery is within two hours for the declared dataset; this is an acceptance target to measure, not an existing guarantee.

Prometheus local storage is not replicated. Add a consistent TSDB snapshot/export path and an isolated restore drill for known samples. [Prometheus recommends snapshots](https://prometheus.io/docs/prometheus/latest/storage/); its snapshot API also enables dangerous admin operations, so any use must be reachable only by the protected backup workload, with query routes denying admin paths and network tests proving the boundary. Do not copy live TSDB files and label the result a consistent backup. Use the existing approved backup destination and encrypted credential mechanism, a daily cadence and declared bounded retention; do not introduce a second metrics backend solely for backup. Failure to implement and prove this leaves metric-history recovery incomplete.

Grafana dashboards/datasources, Kibana saved objects, collector and alert configurations must be versioned or exported consistently before cutover. Preserve required current Victoria history in its native backend/export for the agreed retention window; do not assume format compatibility or delete volumes after merely redirecting ingestion. A frozen delivery comparison bundle remains portable independently of backend retention.

### Dependency and authority boundaries

The existing production observability Flux stage depends on platform and certificates. Recheck these dependencies, storage and SOPS inputs with an authorized operator. Do not bypass unhealthy prerequisites or broaden this rollout into a production registry/application migration. If an unrelated dependency prevents safe activation, document the exact failure and prepare a separate reviewed dependency correction.

The user authorized planning and autonomous PR preparation, not live production activation. Runtime/secret/DNS/certificate changes, real receiver tests and retirement need authorization for the concrete operation. Never print Secret values in evidence. Verify availability, ownership, required keys, role scope and certificate identities through safe receipts. Existing collector superuser credentials are not the query identity of an application or repair worker.

## Migration Plan

Production execution is deferred until requested. First develop and validate the measurement workflow on dev, keeping Grafana; use its observed load, retention and recovery evidence to refine this rollout. Then:

1. **Inventory and prepare:** restore cluster read access through the authorized operator, record the live source revision/dependencies and current telemetry ownership, capture rollback configs and consistent backups, measure coexistence capacity. Implement/pin gateway, retention, UI access, backup and acceptance checks in a reviewable PR.
2. **Rehearse:** use isolated local infrastructure to prove three-signal ingestion, APM usability, query access refusal, alert rules, network failure, queue/disk bounds and restores. Exercise each new safety guard with a production-path fault; retain exact versions and observations. Local success is not production acceptance.
3. **Authorize activation:** present the exact reviewed revision, affected services, prerequisites, rollout/rollback commands, intended recipients and remaining limits. Provision only approved operator inputs, then reconcile the existing Flux observability graph. Verify actual ready versions and storage.
4. **Canary:** route identified synthetic signals and one real producer to the new destinations while preserving the old path. Keep routing/buffers independently bounded. Do not let an unhealthy secondary exporter block the existing path. Compare counts/IDs, freshness, errors and trace structure; capture a real Kibana workflow, Grafana panel, Prometheus query and approved firing/resolved alert.
5. **Observe and cut over:** at least 24 hours and one successful scheduled backup/restore/alert cycle, whichever is longer, with no unexplained canary loss or duplicates, bounded queue/disk usage and no regression to existing delivery. Move sources/datasources one at a time. Designate one canonical metrics/alert path during overlap to prevent double counting and duplicate notifications. Test route rollback for each signal before accepting it.
6. **Retirement:** after per-signal acceptance and the history/rollback window, propose a separately authorized stop of the relevant Victoria services. Preserve Grafana, MLflow and their volumes. Volume deletion is a later explicit operation after native history/export retention requirements are met. Record retained history locations and final ownership.

Rollback restores the recorded producer/exporter and dashboard configuration, disables only the new affected path, and retains both stores. It must not rewind application databases or discard queues blindly. A failed rollback is a loud incident with the pinned manual recovery command, not a successful rollout receipt.

## Risks / Trade-offs

- Existing single-node placement loses observability during host/storage failure. Backups and a dead-man alert mitigate detection/recovery, not availability. HA changes require multiple failure domains and revised budgets.
- The collector's documented hung-export timeout can lose records despite receiver acknowledgement. Canary/reconciliation must expose this; no lossless guarantee is inherited from an old passing outage drill.
- Trace ingest may increase CPU/disk materially. Benchmark and set retention/queue bounds before routing all sources; do not infer trace capacity from log-only tests.
- Full logs/APM features and license compatibility must be checked against pinned versions. Do not silently depend on a trial-only capability.
- MLflow and existing Grafana are independent consumers; removing the Victoria compose project wholesale would remove unrelated working services.

## Open Questions / Prerequisites

The existing-hosts versus HA choice is explicit in the topology section. Live cluster read access, current Flux/Secret readiness, actual ingestion/query credentials and the owner of h3mon provisioning remain specific preflight prerequisites, not assumed facts. Operator routes, real alert recipients and off-cluster backup access must be verified before activation. No deployment work starts from this planning packet alone.
