# Observability, delivery measurement and operating cost

Assessed 2026-11-10 at public source **7614ca5116e2b27831076f7bc7c9f9872051c388**
against [scope](../../../puni-assessment.md). [Live evidence](live-evidence.md) owns
fresh timestamps, commands, populations and limitations. The October findings are
historical leads, not current measurements. No telemetry was replaced and no new
observability vendor, datastore or accounting ledger was introduced.

Applicability: all three journeys need service/task health, change identity, recovery,
cost and accountable operation. Shared/hybrid services additionally require tenant
attribution, access isolation and contention budgets; dedicated/client-owned setups
still need credential, incident, retention and exit ownership. Roles below propose
accountability; they do not assign named staff or accepted customer targets.

## OBS-01 — Autonomous dev observation works; application service targets remain unqualified

**Acceptance / owner:** observability owner can detect a failed or stale observation
separately from a failed application, correlate the selected revision with stored
logs/traces/metrics, and notify an accountable operator within an agreed bound.
Client/service owner accepts availability, p95/p99 latency, error, throughput and
saturation targets for each workload/environment.

**Intent:** [dev observability](../../../openspec/changes/dev-observability/proposal.md),
[runbook](../../runbook-dev-observability-runtime.md), [Grafana views](../../runbook-dev-observability-grafana.md)
and roadmap W13 deliberately reuse Elastic, Prometheus and Grafana.
**Implementation:** [probe](../../../tools/tool-observability-stack/src/dev/probe.ts),
[OTLP encoder](../../../tools/tool-observability-stack/src/dev/otlp.ts),
[resource metrics](../../../tools/tool-observability-stack/src/dev/resources.ts),
[stored acceptance](../../../tools/tool-observability-stack/src/dev/acceptance.ts)
and persistent checkpoints distinguish complete, stale and unavailable evidence;
producer version, target revision, observation and trace/span IDs are retained.
The observer is read-only. It supplies evidence to a later decision maker; it does
not autonomously authorize or execute repairs.

**Fresh evidence:** at 19:02–19:04 UTC, current resource age24.04s, probe age27.63s/
success1, 13 selected workload-memory series, acknowledged publication and complete
health/application-log/storage/resource checkpoints. Elastic was green with fresh
logs and spans; Grafana health was HTTP200. Source and live observer versions are
explicitly different. At 7614ca5, 74 focused tests/145 assertions passed in376ms:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-observability-stack/src/dev/resources.test.ts tools/tool-observability-stack/src/dev/acceptance.test.ts --timeout=30000
```

This exercises unavailable-state encoding, counter-generation continuity and scoped
stored-signal acceptance/refusals with local fixtures/servers. No production guard
was removed and no operational fault was injected in this assessment.

**Reconciliation / gap:** October's blanket “application metrics expose target_info
only” no longer describes the dev observer's custom metrics. The sampled conventional
request/latency/gateway series were nevertheless absent in this Prometheus instant.
Fresh health/resource collection is not an application error/throughput distribution,
all-request tracing, complete customer SLO or production activation. Zero firing
alerts does not prove notification delivery. Agent tool-call/session coverage is
not established by external health spans.

**Smallest next action:** reuse the existing observer/stores to qualify one workload's
request/error/latency and dependency signals, then separately authorize one failure/
staleness/recovery and recipient test. **Close with:** exact deployed revision,
signal definitions and coverage, trace/log join, missing-data negatives, received
alert/recovery, retention and client-access proof. Keep unsupported or stale signals
visible; do not add an ungoverned self-repair loop.

## OBS-02 — Common-stack parity has source machinery; runtime migration is incomplete

**Acceptance / owner:** platform/observability owners prove dev and production use
the same service contract with separately owned instances/stores, reviewed environment
differences, compatible routing, retained history, rollback, limits and tenant access.

**Intent / implementation:** [environment-parity tasks](../../../openspec/changes/observability-environment-parity/tasks.md),
[read-only admission](../../infra/observability-preflight.md) and
[configuration parity](../../../tools/tool-observability-stack/src/configuration/parity.ts)
implement source/rendering, ownership, freshness, selected placement/capacity and
route/history checks. These are deliberate safety checks, not readiness granted by
a passed local unit suite. [Sizing](../../infra/observability-sizing.md) separates
steady operation, migration overlap and disposable rehearsal costs.

**Evidence / reconciliation:** the owning [verification record](../../../openspec/changes/observability-environment-parity/verify.md)
keeps runtime acceptance4/11 and Task97/full rehearsal/live cutover open. Its audited
source fixes and component proofs do not close the retained/native/current-capacity,
Kubernetes/Flux/two-instance, stored-history, outage and recovery requirements.
Fresh h3 readings show the current dev Elastic/Prometheus path and retained legacy
VictoriaMetrics (21,936 active series) coexist. That is incomplete migration, not
permission to delete Victoria, repoint clients or collapse the separate instances.

**Gap / consequence:** operational parity, retained history, source-bound native
admission and production rollout remain unproved. The isolated full-lab16GiB-available
floor remains a prerequisite of that lab, not the permanent monitoring-machine minimum.
The withdrawn64/128GiB hardware recommendation is not a current requirement. Current
~3.00GiB dev and ~1.94GiB legacy cgroup charges do not establish cold-start, load,
copy/restore or failure-overlap peaks.

**Smallest next action:** close the existing measured phase/concurrency and retained
resource prerequisites on authorized existing hosts, then run the already specified
bounded acceptance. **Close with:** complete source/owner/claim/resource receipts,
all required runtime cases and history/rollback/isolation proofs. Resize only after
that accounting demonstrates a deficit; preserve missing cost contributors and
refusals rather than lowering guards to fit a purchased size.

## MET-01 — Delivery and inference accounting exist; autonomous outcome measurement is incomplete

**Acceptance / owner:** delivery operations owner links each accepted request/WBS
revision to a change, every CI attempt, artifact and deployed revision, acceptance,
incident/recovery and operator/review effort. Finance owner approves model/tool prices,
unknown-price handling, billing periods, shared allocations and client cost ceilings.

**Intent / implementation:** [shared delivery model](../../../libs/shared/domain/delivery/README.md)
is provider-neutral; [GitHub adapter](../../../libs/shared/adapters/delivery-github/README.md)
translates provider observations read-only and retains provenance. Opaque IDs and
incomplete/stale inventories do not become GitHub assumptions or zero time.
[Dash outcome accounting](../../../apps/twilight-structure/twilight-dash/cli/src/ledger/account-outcomes.ts)
and [Burokrat accounting](../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.ts)
retain attempt outcomes, failed/censored work, usage and price provenance. Their
bounded fresh tests are recorded in [delivery/swarm](delivery-swarm.md#fresh-checks-and-limits).

**Fresh evidence:** seven-day GitHub census found62 merged PRs, open-to-merge median
3.38h/p90 81.85h;50 main CI runs included36 success,13 failure and one running.
The terminal CI-failure fraction is13/49, not customer change failure. The census is
an assessment-time read, not evidence of a scheduled platform collector. Fresh WBS
reads prove current authorized access and open/unknown plan states; they do not prove
that each merge automatically enters a complete business-outcome ledger.

**Gap / consequence:** no audited autonomous accepted-change-to-production inventory,
reliable review-ready timestamp, runner queue attribution, deployed acceptance,
operator minutes, client costs or repeated multi-agent advantage was established.
Code accounting cannot price missing vendor usage or establish that all nested
harness/subagent work was captured. Attempt-start waiting, summed execution and elapsed span
overlap; adding them double-counts cost/time. A successful retry must preserve its
failed predecessor and reuse carried outcomes without charging a second execution.

**Smallest next action:** adopt existing read-only adapters and accounting in one
bounded actual PUNI change; persist source/run/attempt/execution identity and explicit
collection completeness, and route collection health into the existing Elastic/
Prometheus/Grafana stack. This is an assessment recommendation, not implementation.
**Close with:** recomputable raw-event-to-summary proof including retry/carried/
missing/cancelled/censored cases, deployed revision and client acceptance; finite
collection bounds; tenant access negatives; observed operator/reviewer effort.
Only then compare one/two/four-agent throughput and cost with paired seeds/control.

## Measurement contract gaps to close

These definitions are required acceptance outputs, not silently adopted numeric SLOs.

| Measure                                 | Definition / collection boundary                                                                                                                                                                                                                                                        | Current evidence / gap                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Availability and errors                 | Successful eligible requests / all eligible requests within agreed windows; classify dependency/probe failures separately                                                                                                                                                               | Fresh external health success; no representative per-client request denominator                     |
| Latency and throughput                  | p50/p95/p99 and accepted operations per second under named workload/data size                                                                                                                                                                                                           | No current load baseline or production distribution established                                     |
| Saturation and capacity                 | Concurrent memory/CPU/I/O/storage with coverage, role/generation/phase and available headroom                                                                                                                                                                                           | Fresh selected-role cgroups; historical38-minute quiet history; no complete load/overlap acceptance |
| Agent/tool behavior                     | Each attempt/tool/message linked to principal, parent/delegation, model/harness, latency, tokens, failures and external effects                                                                                                                                                         | Local contracts/receipts; end-to-end live capture and unauthorized-action rate unproved             |
| Request lead time                       | Accepted request timestamp to verified production acceptance; missing either endpoint = incomplete                                                                                                                                                                                      | PR opening is not request acceptance; production provenance unresolved                              |
| Review and merge delay                  | Ready-for-review→verdict→merge, retaining requested revisions and ownership                                                                                                                                                                                                             | Open-to-merge sample only; no ready-state/human-effort population                                   |
| CI execution and waiting                | Unique performed execution durations; attempt-start waiting separate from provider runner-queue evidence and elapsed span                                                                                                                                                               | Domain model/tests exist; continuous collection/adoption not established                            |
| Deployment frequency / accepted changes | Verified accepted deployments/changes per environment/window; replays and source merges are not new deployments                                                                                                                                                                         | No complete deployed acceptance ledger                                                              |
| Change failure / rework / recovery      | Deployments causing a defined service failure/degradation requiring remediation / the explicitly selected deployment population and window. Track predeployment CI failures, failed client acceptance and rework separately; incident-to-restored acceptance retains censored incidents | Main CI failures and byte-integrity drills are narrower quantities                                  |
| Client cost / operator effort           | Infrastructure/storage/traffic/inference/tooling plus active human minutes, approved rates and shared allocation                                                                                                                                                                        | Neither invoices nor a representative attributed service interval reviewed                          |

Every row needs client/application/environment/change attribution, a named collecting
and acting owner, retention/access policy, dashboard and alert action where meaningful.
An empty result, missing price, missing provider attempt or stale observation remains
explicitly unknown/incomplete. The [roadmap](roadmap.md) prioritizes reuse and closure
proof rather than constructing a second monitoring or accounting stack.
