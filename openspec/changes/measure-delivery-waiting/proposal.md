## Why

Verification and dev deployment still impose substantial waits after docs-only selection, affected-module checks and parallel CI jobs were introduced. Retained examples show a 72m21s workspace job and 45m26s across two host-lock waits, but neither establishes a current, comparable baseline. Manual inspection cannot sustain a system that improves itself. Observation must run autonomously, distinguish execution, scheduling, retry and deployment delay, and demonstrate whether a proposed fix helped.

## What Changes

Continuously collect and retain source-attributed receipts through a restart-safe, bounded observer; no UI visit or manual command is required. Reuse delivery identities and retry accounting; add explicit timing bases, collection coverage and workload context. Collect CI job/step observations and host gate/dev deployment intervals through dedicated adapters. Preserve failures, cancellation, supersession and incomplete observations.

Publish fresh reports and deduplicated, machine-readable findings automatically. Track observer health separately. Freeze comparable baselines, detect delays/regressions, and reevaluate linked fixes as observations arrive; unsupported improvement claims remain inconclusive. Publish the measurement implementation and the subsequent evidence-selected fix as separate reviewable PRs.

## Non-Goals

No scheduler redesign, new runner fleet, increased parallelism, test sharding or result caching in this measurement change. No new required CI check, automatic merge, production deployment, secret changes, autonomous repair executor, billing system or general observability platform. A specific optimization needs a successor packet supported by the baseline.

## Constraints

Provider-neutral concepts; GitHub and existing Puni host/dev scripts are first adapters. Preserve stable gate/pixels verdicts, fast docs checks, affected selection, tenant isolation, progress semantics and existing host locks. Collect without triggering tests or deployment. Distinguish unknown from zero and overlapping work from elapsed time. User approval is required before every merge.

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

Shared delivery domain and GitHub adapter; a bounded observer and reporting CLI; host gate/lock and dev poller receipt emission; related tests and runbooks. This planning PR changes documentation only. Implementation tasks remain open.
