## Context

The previous optimization is already present: [change-aware CI](../change-aware-ci/design.md) preserves docs-only checks, affected module selection and conservative fallback. Main/manual/full host verification intentionally remains full. Increased [workspace](../workspace-gate-time-budget/proposal.md) and [browser](../separate-browser-setup-budget/proposal.md) budgets prevented premature timeouts; they are not evidence of a speedup.

[Shared delivery](../../../libs/shared/domain/delivery/README.md) supplies provider identities, provenance, performed/carried executions and bounded/partial timing summaries. Its attempt-start waiting is explicitly not scheduler queue waiting. The [GitHub reader](../../../libs/shared/adapters/delivery-github/README.md) supplies bounded public observations, with no durable history. Preserve version 1 and add a separate receipt/report contract rather than silently redefining its timing fields.

Dash's activation observation store is an authority for activation scheduling, not a generic CI/deployment history database. Dash review telemetry and Burokrat's `ElapsedReceipt` / experiment accounting already preserve failed/censored intervals and receipt linkage. Reuse those semantics and offer an export mapping for fully attributed intervals; do not force arbitrary CI runs into a priced trial or import Burokrat into the shared domain. No activation-store migration is needed for this slice.

The [planning evidence](../../../docs/findings/delivery-waiting-baseline.md) records historical examples and the limits of those examples. They motivate collection; they do not choose the fix.

## Goals / Non-Goals

**Goals:** A small reproducible measurement path, useful without a new dashboard: collect receipts, inspect a report, select a bottleneck, compare a candidate. Establish current coverage before making a speed claim.

**Non-Goals:** All non-goals and constraints in [intent](proposal.md) apply. This PR is a plan. Measurement implementation precedes an independently reviewable optimization. No auto-merge or live host configuration change is authorized by publishing these artifacts.

## Decisions

### Receipt and report boundary

Add pure receipt validation and report/comparison functions under `libs/shared/domain/delivery/src/`. Keep transport and filesystem code outside that module. A receipt envelope carries version, identity, scope, revision and optional parent run/attempt/execution identity, observedAt, source reference/hash, named phase, outcome, interval endpoints, basis, clock domain and coverage reasons. Unknown fields use explicit null/reason states. Intervals from one process also retain monotonic elapsed time; cross-source wall-clock deltas declare precision and clock assumptions. Do not fabricate a parent link from timestamps or a matching branch name.

A bundle is immutable JSON receipts plus a manifest of content hashes and the collection outcome. Validate once on import; reject malformed trusted bundles, duplicate conflicts, negative intervals and impossible scope joins. Safe reimport deduplicates exact identities. A new observation of an unfinished execution has a new observation identity but the same execution identity, so the reducer selects the latest consistent state instead of charging work twice.

Add a small Bun CLI at `tools/tool-devsync/src/delivery-timing-cli.ts`, with pure composition/report helpers in the same directory. Proposed commands are `collect`, `report` and `compare`; documentation must label them proposed until implemented. `collect` accepts a canonical public change reference or a declared host receipt directory and writes a new bundle. `report` and `compare` operate offline and produce JSON plus Markdown. CLI exit success means a valid report was produced, not that an improvement was proved: `comparison.verdict` is explicitly `improved`, `not-improved` or `inconclusive`. Invalid bundles exit nonzero.

Scope the initial collector to public GitHub and operator-owned host receipts. It does not expose a new unauthenticated server endpoint. WBS organization authorization remains in front of any future integration, and existing external references can link a published, appropriately scoped report. No new progress or budget writes.

### First adapters and observation points

| Source                                                                      | Read or emit                                                                                                                         | What it can establish                                                                              | Limits                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GitHub adapter                                                              | Existing change/check/run/attempt/job reads, retained job step timestamps and CI selection artifact when available                   | Verdict completion, per-job execution, setup/test phase spans and retry identity                   | Queue eligibility stays unknown unless a documented source actually supplies it; never use `updated_at` as completion |
| `bin/heavy-lock-lib.sh` and `bin/h2puni-gate.sh`                            | Local receipt on enqueue, acquisition/refusal and command completion; phase receipts around existing `h2puni-gate-steps.sh` commands | Actual host waiting, lock occupancy and gate phase duration                                        | Preserve FIFO, canonical lock path, checkout-under-lock and signal propagation                                        |
| `bin/dev-poll.sh`, `bin/dev-poll-sync.sh`, `tools/tool-devsync/src/sync.ts` | Target observed, attempt started, dependency/publication/restart phases where executed, hold/refusal, health proof                   | Poller delay after observed target, retry/recovery, deployment execution and exact-revision health | Latest-main polling can skip revisions; checkout/last-synced is not health proof                                      |

The initial per-target breakdown uses existing Nx/log artifacts only where identities and intervals are unambiguous. When a CI job reports only an aggregate Nx span, report that span and missing module attribution. A follow-up needs module receipts only if that uncertainty prevents selecting a fix; do not instrument every test case upfront.

Collection runs on explicit demand or after completion in an independent optional observer, never as a prerequisite of `gate` or `pixels`. Start with the demand-driven collector and local host spool: this avoids new CI permissions or secrets. GitHub collection preserves the existing read budgets; any additional step/artifact reading must fit explicit separate budgets and mark truncation. Artifact/log failures cannot be hidden as complete coverage.

Host emission performs bounded local writes only, with no network under the lock. Use one file per immutable receipt and atomic publication; no shared journal writer lock. Retain a collection-error signal separately from delivery status. The emitter is explicitly optional: absence/unwritability is an observable collection failure with tests, whereas trusted receipt import remains strict. Do not introduce third-party dependencies into the isolated deploy candidate bootstrap graph. Define a bounded spool (30 days or 100 MiB, whichever comes first), report the retained horizon, and export bundles before expiration. Interrupted processes without terminal receipts remain censored; do not infer success from process disappearance.

### Metrics and comparability

| Measurement            | Endpoints / interpretation                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Verification latency   | Identified revision's observed verification request to completion of its required verdict set; unknown start remains unknown           |
| Execution work         | Sum unique performed job/phase intervals; parent phases and children are alternate breakdowns, never added together                    |
| Execution span         | Earliest performed start to latest completion, including gaps; distinct from work                                                      |
| Host queue wait        | Actual enqueue to lock acquisition, or enqueue to timeout/cancellation with that outcome                                               |
| Attempt-start wait     | Existing delivery metric retained under its existing basis; cannot be relabeled runner queue                                           |
| Retry gap              | End of one identified attempt to start of the next; separate from execution                                                            |
| Deployment latency     | Exact merged revision timestamp to matching served-health proof; merge timestamp absent means unknown                                  |
| Poller / deploy phases | First target observation, attempt start, build/install/restart and health boundaries where known; nested/overlapping intervals labeled |

Use immutable context manifests: event, selection mode, target/test inventory digest, required-verdict contract, source/lock/toolchain, resource class, concurrency and cache mode. A comparison names the intended treatment and permits only its declared context differences. Same-workload replay is preferable; observational matched cohorts remain explicitly observational. A docs-only run is never a baseline for an application run. Separate first attempts and retries in display while keeping both in totals and outcome counts.

Start with five matched baseline/candidate pairs per chosen workload stratum. Predeclare the primary metric and a material-reduction rule before candidate measurements: median paired reduction must exceed both 10% of baseline median and twice the baseline median absolute deviation. This is an operational screening rule, not a statistical significance claim. Show every sample, sample count, spread, median and failure/cancellation/censoring counts. Fewer pairs, absent context, incomplete chosen intervals or unresolved censoring make the claim inconclusive; show descriptive measurements anyway. Do not print p95 from this small sample. Real-world deployment incidence may make five matched pairs slow to obtain; report that limitation instead of generating gratuitous deployments.

Rank observed bottlenecks only within a declared cohort and coverage window. Do not add parallel job times or nested phases to claim an end-to-end saving. The optimization proposal must name which interval it shortens, its effect on other work sharing resources and the safety/test coverage that remains required. A changed workload invalidates the comparison unless separately stratified. A successful demonstration is an observed reduction with unchanged required checks and no worse observed failure/cancellation counts; insufficient evidence is a valid result.

### Delivery sequence

1. Planning PR: intent, specification, design, tasks, retained historical evidence. No behavior changes. Await approval before merge.
2. Measurement PR: receipt/report model, bounded collectors and host emission, focused safety proofs and a real Puni report. Can be prepared autonomously; installation/merge follows separate authorization. Preserve pre-instrumentation samples and measure observation overhead independently.
3. Optimization PR: select one bounded fix from the current report, open its own packet, preserve baseline manifests, and run the declared comparison. No preselected fleet/scheduler/test change. Record no-gain findings as readily as improvements. Await approval before merge.

## Risks / Trade-offs

- Read-only provider snapshots cannot reconstruct unavailable enqueue times or expired retry history. Missing evidence is a first-class output, not a reason to guess.
- Phase collection must not become the bottleneck. Measure five paired fixture workloads with emission enabled/disabled; flag added median wall time over 1% or 100 ms, whichever is larger. Production overhead remains unverified until observed.
- Host clock changes can invalidate cross-source elapsed values. Record source clocks/precision; refuse negative chronology and show uncertain cross-clock intervals rather than clamp.
- Private host paths or logs may contain sensitive values. Emit only allowlisted identities/phases/status/times, never argv, environment, headers or full logs; public exports require deliberate selection.
- CI/runtime cohorts change frequently. Preserve exact manifests and distinguish workload growth from a regression in execution efficiency.

## Migration Plan

No database or version 1 API migration. Add receipt files alongside existing operational state; never replace lock tickets or last-proven markers. Roll back collection by disabling its observer/emitter while retaining prior bundles; delivery behavior must remain unchanged. Deploy instrumentation to dev only after the measurement PR is approved and merged and installation is authorized.

## Open Questions

No product decision blocks this plan. The baseline must resolve whether host queue contention, CI workspace execution, setup or repeated work dominates the selected workflow. The fix is intentionally not selected until then. Unknown provider enqueue semantics remain unsupported until verified against the provider's contract during adapter implementation.
