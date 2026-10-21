# Observability, delivery measurement and cost assessment

Assessed 2026-10-21 at `4151532121633d978beb67ab52b3eb748285cd8e` against
[the scope](../../../puni-assessment.md). Fresh host and application observations
are recorded in [live evidence](live-evidence.md); this report separates them from
source and historical verification.

## OBS-01: monitoring infrastructure exists; application health coverage is incomplete

**Required outcome:** an operator can see errors, latency, traffic and resource
saturation for each client/application/environment, connect these to a release,
and receive an actionable alert when the agreed service target is breached.

The [infrastructure plan](../../plans/2026-09-15-infra-evolution-plan.md) describes
consolidating telemetry while preserving the existing Victoria/Grafana/MLflow stack.
The [collector manifest](../../../infra/platform/observability/otel/collector.yaml)
implements durable queues/checkpoints, log redaction, bounded memory, metrics forwarding,
and mTLS input. [Platform alert rules](../../../infra/platform/alerts/base/rules.yaml)
cover endpoint probes, telemetry loss, resource/worker absence and backup conditions.
[Alert verification](../../../openspec/changes/close-observability-alert-gaps/verify.md)
contains real promtool and fault-injection receipts, but explicitly excludes live
recipient delivery and rollout. These are substantial implementation and bounded
historical proofs, not evidence that the current production alert chain works.

Fresh h3mon queries establish a responsive metrics store with 16,496 active series.
However, the sampled prod backend, dev backend and dev gateway `/metrics` responses
contained only `target_info`. h3mon had no instant samples matching the selected
application/gateway/collector metric names. This is a coverage gap in the sampled
paths; it is not a claim that the whole monitoring platform is empty.

Source supports that concern:

- [Legacy backend dashboard](../../../tools/tool-observability-stack/src/grafana/provisioning/dashboards/be-01-overview.json)
  requests `http_server_requests_total`; [gateway dashboard](../../../tools/tool-observability-stack/src/grafana/provisioning/dashboards/gw-01-overview.json)
  requests `gw_reconnects_total` and `gw_message_fanout_total`.
- A scoped `rg` search of `apps`, `libs` and `tools/tool-observability-stack`, excluding
  tests, found those exact names only in those dashboard definitions.
- [GatewayMetrics](../../../apps/wbs/gw-01/src/service/gateway-metrics.ts) maintains
  useful in-memory counters; [the gateway app](../../../apps/wbs/gw-01/src/app.ts)
  exposes a separate `/metrics/snapshot`. Those counters do not themselves establish
  exported time series. [Socket writer](../../../apps/wbs/gw-01/src/service/socket-writer.ts)
  does use OTel counters for dropped/backpressured frames; ordinary traffic coverage
  should not be inferred from those exceptional-event counters.
- [Prometheus scrape code](../../../libs/wbs/adapters/observability/src/prometheus.ts)
  can return HTTP 200 with a comment when no metrics are registered. Its
  [test](../../../libs/wbs/adapters/observability/src/prometheus.test.ts) checks status
  and nonempty text, not application-series semantics. The fresh 36-test observability
  pass below does not close this integration gap.

The public production `/health` returns frontend HTML, while a direct backend request
returns `{"status":"ok"}`. The [current backend endpoint](../../../apps/wbs/be-01/src/controller/infrastructure-endpoints.ts)
has database/schema probes and a commit field; dev returns that commit, older prod
does not. Thus [HUMAN_README's health discussion](../../../HUMAN_README.md) is stale
for current source and its public probe is insufficient for the current routing.

**Next action — P1, observability owner and application owner:** define required
application series and a health contract; connect request/socket instrumentation to
the actual collector/dashboard path. Completion evidence is a known successful and
failed request appearing in the intended series/dashboard with source/environment
identity, and a controlled failure reaching the responsible recipient. Treat the
current backup failures as the immediate P0 operational investigation in the main
report. No faults or alert notifications were injected here.

## OBS-02: log handling has proof; cross-client and end-to-end session visibility do not

[Logger](../../../libs/wbs/adapters/observability/src/logger.ts),
[failure serializers](../../../libs/wbs/adapters/observability/src/serializers.ts),
the collector and [indexed failure fields](../../../infra/platform/observability/elastic/settings/failure-fields.json)
provide structured occurrences/fingerprints and credential redaction. Fresh tests
verify those mappings and several failure cases. [Historical log verification](../../../openspec/changes/log-failure-records/verify.md)
also records an important limitation: a connection timeout lost 49 of 900 lines in
one local exercise. Queue persistence does not imply lossless audit storage.

The inspected collector has logs and metrics pipelines; that file does not establish
an end-to-end distributed trace path. Existing VictoriaTraces/MLflow references in
the plan are not a complete live trace/session demonstration. No customer session,
LLM transcript or tool log was read in this assessment. Correlation across user request,
agent attempt, tool effect, deployed revision and application failure remains unverified.
Likewise, a shared Grafana/Elastic installation does not establish client-specific
read access, redaction coverage, retention or export/deletion policy.

**Next action — P1, observability owner and security lead:** define which events need
diagnostic logs versus durable audit records, retention/access rules, and correlation
identifiers. Demonstrate one non-client synthetic request through LLM/tool/application
boundaries, including a redacted failure and a denial of another client's telemetry.
Record known loss behavior and operator response. This applies to all three journeys,
including dedicated apps that depend on shared telemetry.

## MET-01: delivery accounting primitives exist; operational delivery metrics need adoption

It would be inaccurate to call delivery/cost accounting wholly unimplemented.
[Burokrat trial accounting](../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.ts)
models sessions, attempts, accepted/failed/censored outcomes, source commits, acceptance
and integration identities, raw usage, priced allocation, concurrency, elapsed phases
including human/gate/waiting time, and currency-specific charges.
[Portable export](../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/export.ts)
supports independent recomputation. [Review audit](../../../apps/twilight-structure/twilight-burokrat/cli/src/review/audit.ts)
retains both cold and informed review cost/usage. Fresh accounting/export tests pass.

Those are accounting and experiment capabilities. The inspected
[experiment evidence](../../experiment-evidence/baseline-inventory.v1.json) and
[fixed corpus](../../experiment-evidence/fixed-benchmark-corpus.v1.json) are inputs;
they do not themselves demonstrate accepted client delivery throughput. The
[control-plane tasks](../../../openspec/changes/twilight-control-plane/tasks.md)
describe broader orchestration and collection work. No live production delivery
dashboard, client-attributed request-to-release population, or measured one-versus-many
agent comparison was established by this review. Historical gate timing is discussed
in [delivery assessment](delivery.md); a CI sample is not a delivery baseline.

**Next action — P1, delivery operations owner:** connect existing receipts to real
work before inventing another ledger. Define and collect:

| Metric                        | Measurement contract to establish                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Change lead time              | Accepted request to accepted production outcome; retain intermediate implementation/review/merge/deploy timestamps              |
| Delivery throughput           | Accepted requirement-linked outcomes per elapsed hour and per hands-on operator hour; retain failed/censored work               |
| Deployment frequency          | Successful production deployments per application/environment/window, distinct from builds, PRs and dev reloads                 |
| Review/integration/gate delay | Queue, execution and human-wait intervals separately; distinguish overlapping work from elapsed time                            |
| Change failure and recovery   | Defined denominator and post-release failure window; failed changes, rollback/fix-forward, restoration time and customer impact |
| Parallel-agent benefit        | Comparable workload mix and acceptance criteria at different concurrency, including rework, defects, cost and human effort      |

Acceptance requires a retained population with client/repository/change/revision/run/
deployment identities, independently recomputable totals, explicit missing records,
and sample sizes. It does not require the entire proposed control plane before a
bounded measurement pilot can begin.

## COST-01: budgets and cost models are not measured client economics

Prior [unit-economics research](../../twilight-structure/research/unit-economics/README.md)
explicitly calls human minutes and per-stage usage unmeasured. Its dated external price
and subscription assumptions were not refreshed here and are not used for a current
quote or margin claim. [Execution profiles](../../../openspec/schemas/twilight-v1/execution.yaml)
and accounting code specify budgets and charge provenance; a specified ceiling is
neither actual spend nor proof of live enforcement in every assistant/provider path.

The website's bounded paid-inference policy is a concrete application-level control
described in [security assessment](security-assistant.md). It does not cover arbitrary
OpenClaw tools or all agent work. The [fleet implementation](infrastructure.md) likewise
has declared capacity/budget controls, but provider invoices, resource attribution and
live create/destroy acceptance were not inspected here.

**Next action — P1, service owner and operator:** establish a client cost record that
joins fixed shared allocation, dedicated resources, storage/traffic, model/tool usage,
failed attempts, onboarding work, maintenance and incident effort. Name the payer and
owner for shared, dedicated, client-owned and hybrid dependencies. Reconcile a bounded
pilot with provider billing and measured human effort; report unallocated/unpriced
usage explicitly. Define support hours, incident response ownership, recovery targets
and handover obligations with the client before promising an operational service.
There is currently insufficient measured evidence in this review to quote repeatable
onboarding time, maintenance effort, cost per accepted change or client margin.

## Fresh verification and limits

Commands on `pop-os`, Bun 1.4.2:

- `bun test libs/wbs/adapters/observability/src --timeout=10000`: exit 0,
  **36 pass, 0 fail**, 84 assertions, four files, 2.10 seconds.
- `bun test apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.test.ts apps/twilight-structure/twilight-burokrat/cli/src/experiments/export.test.ts --timeout=10000`:
  exit 0, **13 pass, 0 fail**, 52 assertions, two files, 530 ms.
- Source searches and the linked code/artifact reads establish the implementation
  observations above; [live evidence](live-evidence.md) supplies host and scrape results.

No full gate, live alert delivery, synthetic load, secret rotation, fault injection,
session-content review, provider billing query or longitudinal analytics collection
was performed. Historical mutation proofs were inspected, not rerun. All costs remain
unpriced unless attributed to explicit repository policy; no current vendor-price
recommendations are made.
