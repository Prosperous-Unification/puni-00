## Why

Verification and dev deployment still impose substantial waits after docs-only selection, affected-module checks and parallel CI jobs were introduced. Retained examples show a 72m21s workspace job and 45m26s across two host-lock waits, but neither establishes a current, comparable baseline. We need to distinguish execution, scheduling, retry and deployment delay before selecting another optimization, then demonstrate whether that optimization helped.

## What Changes

Provide reproducible delivery timing reports from retained, source-attributed receipts. Reuse delivery identities and retry accounting; add explicit timing bases, collection coverage and workload context. Collect CI job/step observations and host gate/dev deployment intervals through dedicated adapters. Preserve failures, cancellation, supersession and incomplete observations.

Reports expose per-attempt timelines, waiting and execution measurements, dominant observed delays and comparable baseline/candidate results. A fix is proposed only against a measured bottleneck; unsupported improvement claims remain inconclusive. Publish the measurement implementation and the subsequent evidence-selected fix as separate reviewable PRs.

## Non-Goals

No scheduler redesign, new runner fleet, increased parallelism, test sharding or result caching in this measurement change. No new required CI check, automatic merge, production deployment, secret changes, billing system or general observability platform. A specific optimization needs a successor packet supported by the baseline.

## Constraints

Provider-neutral concepts; GitHub and existing Puni host/dev scripts are first adapters. Preserve stable gate/pixels verdicts, fast docs checks, affected selection, tenant isolation, progress semantics and existing host locks. Collect without triggering tests or deployment. Distinguish unknown from zero and overlapping work from elapsed time. User approval is required before every merge.

## Capabilities

### New Capabilities

- `delivery-waiting-evidence`: Retained timing receipts, observable reports and guarded comparisons for verification and deployment.

### Modified Capabilities

None. Existing version 1 delivery observations remain compatible.

## Domain Terms

Delivery timing receipt, delivery timing cohort, delivery timing comparison: [glossary](../../../docs/twilight-structure/CONTEXT.md#delivery-observation).

## Decisions Recorded

None.

## Impact

Shared delivery domain and GitHub adapter; a bounded reporting CLI; host gate/lock and dev poller receipt emission; related tests and runbooks. This planning PR changes documentation only. Implementation tasks remain open.
