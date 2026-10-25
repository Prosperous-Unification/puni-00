## Why

Verification and dev deployment still impose substantial waits despite docs-only and affected-module checks. Historical examples show a 72m21s CI job and 45m26s of lock waits, not a comparable baseline. Puni needs to observe its own development automatically and prove whether fixes helped.

## What Changes

First prove the workflow on dev while developing Puni through Puni. Continuously collect and retain source-attributed receipts through a restart-safe, bounded observer; no UI visit or manual command is required. Reuse delivery identities and retry accounting; add explicit timing bases, collection coverage and workload context. Collect CI job/step observations and host gate/dev deployment intervals through dedicated adapters. Preserve failures, cancellation, supersession and incomplete observations.

Publish reports and deduplicated findings through existing OpenTelemetry, Elastic/Kibana, Prometheus/Alertmanager and Grafana integrations. Track observer health separately. Freeze comparable baselines, detect delays/regressions, and reevaluate linked fixes as observations arrive; unsupported improvement claims remain inconclusive. Publish the measurement implementation and the subsequent evidence-selected fix as separate reviewable PRs.

## Non-Goals

No scheduler redesign, new runner fleet, increased parallelism, test sharding or result caching in this measurement change. No new required CI check, automatic merge, production deployment, secret changes, autonomous repair executor, billing system or parallel observability platform. A specific optimization needs a successor packet supported by the baseline.

## Constraints

Provider-neutral concepts; GitHub and Puni dev are first sources. Production rollout is a separate future plan, not a prerequisite for dev observation. Reuse the existing telemetry transport, search, dashboards and alert routing; local state is limited to checkpoints, bounded buffering and pinned comparison evidence. Preserve stable gate/pixels verdicts, fast docs checks, affected selection, tenant isolation, progress semantics and existing host locks. Collect without triggering tests or deployment. Distinguish unknown from zero and overlapping work from elapsed time. User approval is required before every merge.

## Capabilities

### New Capabilities

- `delivery-waiting-evidence`: Autonomous observation, retained timing receipts, findings and guarded fix comparisons for verification and deployment.

### Modified Capabilities

None. Existing version 1 delivery observations remain compatible.

## Domain Terms

Delivery timing receipt, delivery timing cohort, delivery timing comparison, delivery finding, delivery observation health: [glossary](../../../docs/twilight-structure/CONTEXT.md#delivery-observation).

## Decisions Recorded

None.

## Impact

Shared delivery domain and GitHub adapter; a bounded observer and reporting CLI; host gate/lock and dev poller receipt emission; existing observability configuration, dashboards, alerts, tests and runbooks. This planning PR changes documentation only. Implementation tasks remain open.
