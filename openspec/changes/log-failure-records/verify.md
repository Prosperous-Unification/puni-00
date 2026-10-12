# Verification Report

**Change**: `log-failure-records`
**Verified at**: `2026-09-21`
**Verifier**: Codex executor, attempt `040-5-observability-serializer.A.20260920T214549Z`

## Slice A — OpenSpec change

### A0 baseline

| Command                                                                                                     | Status | Decisive output                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)`              | 0      | `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files.` |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `108` items, `108` passed, `0` failed                                 |

The baseline validation report is `openspec-validation-a0.zc43vC.json` in this attempt's evidence directory.

### A2 validation

| Command                                                                                                     | Status | Decisive output                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `109` items, `109` passed, `0` failed; `log-failure-records` valid with no issues |

The post-change validation report is `openspec-validation-a2.ULMRmR.json` in this attempt's evidence directory. OpenSpec validation checks artifact structure; it does not prove the scenarios or implementation. Task 1.1 remains unchecked because slice A implements no production behavior.

## Slice B — Tests and implementation

**Verifier**: Codex executor, attempt `040-5-observability-serializer.B.20260920T215449Z`

### B0 baseline

| Command                                                                                        | Status | Decisive output                                                       |
| ---------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files.` |

The baseline output is `b0-baseline.log` in this attempt's evidence directory and matches slice A's committed baseline.

### B3 red checkpoint

| Command                                                                                        | Status | Decisive output                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 1      | `SyntaxError: Export named 'createFailureSerializer' not found in module '.../src/serializers.ts'.` |

The red run executed 14 tests across 3 files and is `b3-red.log` in this attempt's evidence directory. The implementation did not yet export the serializer the new tests required; the same run also exposed the legacy schema, absent-`undefined` and unredacted-secret behavior in the logger tests.

### B8 green, typed and linted

| Command                                                                                        | Status | Decisive output                                                          |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files.` |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                                      | 0      | `Successfully ran target typecheck for project wbs-observability`        |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                                           | 0      | `Successfully ran target lint for project wbs-observability`             |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-core`                | 0      | `Successfully ran target typecheck for 3 projects`                       |

The logs are `b8-observability-test.log`, `b8-observability-typecheck.log`, `b8-observability-lint.log` and `b8-downstream-typecheck.log` in this attempt's evidence directory. Nx reported that its plugin-worker socket was denied by the sandbox and ran plugins in the main process; every target still exited 0. Task 1.1 remains unchecked until slice C observes and records its required negative proofs.

## Slice C — Negative proofs and documentation

**Verifier**: Codex executor, attempt `040-5-observability-serializer.C.20260920T220705Z`

### C0 baseline

| Command                                                                                        | Status | Decisive output                                                          |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files.` |

The baseline output is `c0-observability-baseline.log` in this attempt's evidence directory and matches slice B's committed baseline.

### C1 watched negative proofs

Each fault was saved as the named patch in this attempt's evidence directory. Before checking the captured test status, the passing bytes were copied back and `cmp` exited 0; each named test was then rerun and passed.

| Proof | Fault and named test                                                                                                                                                                  | Fault status | Observed fact                                                                                                              | Restore                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1     | Replace the provenance map lookup with a structural `reported` read; `reports an unregistered reporting-shaped value instead of trusting it`                                          | 1            | `Expected to not contain: "hunter2"`; received the forged diagnostic containing `"password":"hunter2"`                     | `cmp` 0; green rerun `1 pass`                      |
| 1     | Same fault; `reports an unregistered loss-shaped value instead of trusting its reason`                                                                                                | 1            | `Expected to not contain: "hunter2"`; received the forged loss containing `"reason":"leak hunter2"`                        | `cmp` 0; green rerun `1 pass`                      |
| 1     | Same fault; `does not invoke an accessor named reported while deciding provenance`                                                                                                    | 1            | `Expected: 0`; `Received: 2`                                                                                               | `cmp` 0; green rerun `1 pass`                      |
| 2A    | Break `@shared/failures`' never-throw wrapper while retaining the serializer guard; `writes a visible loss rather than throwing when no report can be built`                          | 1            | `Expected to contain: "UNREPORTED_"`; `Received: "UNSERIALIZED_1"`, proving the serializer still wrote its fallback record | both later `cmp` 0                                 |
| 2B    | Keep 2A and remove the serializer guard; the same named test                                                                                                                          | 1            | `TypeError: Array.isArray cannot be called on a Proxy that has been revoked` escaped and no record was built               | both `cmp` 0; green rerun `1 pass`                 |
| 3     | Write `reporting.reports.public`; `never writes the public report in place of the diagnostic one`                                                                                     | 1            | `Expected: "corj/v0.14"`; `Received: "appex/public/v4"`                                                                    | `cmp` 0; green rerun `1 pass`                      |
| 4     | Build the redaction policy from `[]`; `scrubs a secret this process owns out of the failure line`                                                                                     | 1            | `Expected to not contain: "hunter2"`; received a line containing `"stack":["Error: token was hunter2"`                     | `cmp` 0; green rerun `1 pass`                      |
| 5     | Relax the diagnostic branch to `'v?': 'string'`; `refuses a public report where the schema expects a failure record`                                                                  | 1            | `Expected pattern: /\^corj\//`; `Received function did not throw`                                                          | `cmp` 0; green rerun `1 pass`                      |
| 6     | Make the loss reason optional; `refuses a reporting loss that names no reason`                                                                                                        | 1            | `Expected pattern: /reason must be a string/`; `Received function did not throw`                                           | `cmp` 0; green rerun `1 pass`                      |
| 7     | Restore the legacy `err` schema member; `logs a failure as the diagnostic report and validates against the schema`                                                                    | 1            | `Validation failed: err.message must be a string (was missing)`                                                            | `cmp` 0; green rerun `1 pass`                      |
| 8     | Remove the `formatters.log` hook; `reports an explicitly present undefined failure instead of dropping it`                                                                            | 1            | `expect(received).toBeDefined()`; `Received: undefined`                                                                    | `cmp` 0; green rerun `1 pass`                      |
| 9     | Normalize every present `err`; `reports the failure it was given, never a substitute`                                                                                                 | 1            | `Expected to contain: "Error: the real failure"`; received an `err` with `"typeof":"undefined","as_string":"undefined"`    | `cmp` 0; green rerun `1 pass`                      |
| 10A   | Break `@shared/failures`' wrapper while retaining the serializer guard; `gives two lost reports two different correlation handles` and `states one fixed reason on every lost report` | 0, 0         | Both tests reported `1 pass`, proving the serializer fallback answered correctly                                           | both later `cmp` 0                                 |
| 10B   | Keep 10A and replace the serializer loss increment with a constant; `gives two lost reports two different correlation handles`                                                        | 1            | `Expected: not "UNSERIALIZED_1"`                                                                                           | both `cmp` 0; both named tests reran with `1 pass` |

The mutation patches are `proof-1-provenance.patch`, `proof-2-dependency.patch`, `proof-2-guard.patch`, `proof-3-public-report.patch`, `proof-4-secrets.patch`, `proof-5-diagnostic-version.patch`, `proof-6-loss-reason.patch`, `proof-7-legacy-schema.patch`, `proof-8-undefined-hook.patch`, `proof-9-no-substitute.patch`, `proof-10-dependency.patch` and `proof-10-counter.patch`. Their corresponding `.log` files contain the complete runner output. With these observed negatives recorded, task 1.1 is complete.

### C5 final verification

| Command                                                                                                     | Status | Decisive output                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `GSETTINGS_BACKEND=memory bunx prettier --write <the eleven owned text files>`                              | 0      | All eleven files formatted; only `verify.md` changed               |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                                                        | 0      | `Successfully ran target lint for project wbs-observability`       |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                                                   | 0      | `Successfully ran target typecheck for project wbs-observability`  |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)`              | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests`           |
| `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`                                       | 0      | No formatter diagnostics                                           |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `109` items, `109` passed, `0` failed; `log-failure-records` valid |

The command logs are `c5-prettier.log`, `c5-observability-lint.log`, `c5-observability-typecheck.log`, `c5-observability-test.log` and `c5-format-check.log`. The strict validation report is `openspec-validation-c5.1UwUAT.json` in this attempt's evidence directory.

## Slice D — Failure report search (WBS 080.23)

**Verifier**: Claude Opus 5.5 lane `failure-reports-elastic`, 2026-10-11, branch `batch-10/080-23-failure-reports-elastic`. The platform-side record is the Failure reports part of [docs/infra/platform.md](../../../docs/infra/platform.md#failure-reports).

`bin/with-heavy-lock.sh` refused on this workstation (`heavy lock: /home/puni1/.cache does not exist`), so the labs ran directly. No real host was touched.

### Unit and graph checks

| Command                                                                 | Status | Decisive output                                                                     |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache`    | 0      | `Ran 36 tests across 4 files`, including the seven `failure-mapping.test.ts` tests  |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:check` | 0      | `Ran 391 tests across 32 files`; `schema: toolchain and 11 platform releases valid` |
| `bunx nx show projects --affected --files=<failure-fields.json>`        | 0      | lists `wbs-observability`, so a mapping change reruns the mapping test              |

Watched negatives (each restored and rerun green). The identifier shape match is also watched in the collector harness below.

| Fault                                                                                        | Observed                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| delete `attributes.failure.fingerprint` from `failure-fields.json`                           | two mapping tests fail; `+ "attributes.failure.fingerprint"` and `"type": undefined`                                     |
| map the fingerprint as `text`                                                                | `lifts the grouping and correlation fields as keywords` fails with `"type": "text"`                                      |
| drop `mcp-01` from the collector's `pino-foreign` list                                       | `admits exactly the services and level labels the log schema declares` fails, `- "mcp-01"`                               |
| parser `on_error: drop`                                                                      | `parses only object bodies and ships a body that does not parse` fails                                                   |
| no generator comparison in `requireNativeResources`                                          | `rejects a generated ConfigMap outside the locked graph` resolves                                                        |
| generator schema `'+': 'delete'`                                                             | `rejects a generator that disables the content hash a Job rerun depends on` resolves                                     |
| rename `attributes.failure.fingerprint` in `objects.ndjson`, or title the data view `logs-*` | `builds the Kibana objects only on mapped fields of the stream the collector writes` fails naming the field or the title |
| delete the fingerprint operator's shape match                                                | `bounds the lifted identifiers to a shape the real logger satisfies` fails listing `failure-fingerprint`                 |
| `kibana-kb-http-certs-public` not declared as ECK-produced                                   | `platform-local consumes Secret observability/kibana-kb-http-certs-public, which is neither listed nor declared`         |

### Collector harness (locked `opentelemetry-collector-contrib:0.160.0` image, committed operators, file exporter)

Twelve CRI lines through the committed filelog operators and `transform/redact`: the real logger's failure line lifted `level`, `service`, `msg`, `time`, `failure.occurrence_id`, `failure.fingerprint` (`fp1_5f60…`) and `failure.v`; the plain line, `{`, and foreign JSON (no WBS `service`, or `service: 7`) lifted nothing; `level: "loud"` and `level: 50` were not lifted; a fingerprint `bad fingerprint!` was not lifted; `err` as a string or an array lifted no failure field; `msg` `password=hunter2` arrived as `password=[REDACTED]`. Only the `{` line logged an operator error (`pino-parser`, action `send`). A first draft errored on a numeric `level` (`reflect.Value.MapIndex: value of type float64…`), which is why every condition checks the type first.

Mutations of `collector.yaml`, each run against the same lines: without the `msg` redaction statements `attributes.msg` was `case7 password=hunter2 here`; without `pino-foreign` a foreign line lifted `failure.fingerprint: fpX`; with the level condition reduced to `!= nil` `level: loud` was lifted; without the fingerprint shape match `failure.fingerprint: bad fingerprint!` was lifted.

### k3d lab `fre` (app profile, locked k3d v5.9.0, kubectl v1.36.4, helm v4.3.0)

The vendored ECK operator, Elasticsearch, Kibana and collector charts were installed by helm with each HelmRelease's committed values (the collector's `serviceMonitor` off: no kube-prometheus-stack in this lab); `kubectl apply -k` applied `elastic/settings` and `kibana/objects` at commit `40018ba25`. Flux did not run.

- Jobs: `elastic-settings` Complete (ILM and `logs-otel@custom` both `{"acknowledged":true}`); `kibana-objects` Complete with `{"successCount":4,"success":true,…}`; a second run of the same Job: `"successCount":4,"success":true`.
- Drill pod (10 lines from the real WBS logger plus negatives): `hits 10`. Three site-A failures and one site-B failure carried `failure.fingerprint` `fp1_29ec4478…` and `fp1_23a226d8…`; the plain line and `{` arrived with no attributes; `level: loud` arrived without `level`; the failure without a fingerprint carried `failure.occurrence_id` only; the 41 144-byte line (above containerd's 16 KiB chunk) arrived as one 41 178-character body carrying `failure.fingerprint: fp1_oversize`.
- Dashboard **Failures** rendered in headless Chromium over a port-forward, Last 7 days, no embeddable error: rows `fp1_29ec…` 3, `fp1_23a2…` 1, `fp1_oversize` 1; the fingerprint-less failure forms no row. Three more site-A occurrences one second apart (`AE_SEQ1..3`) made that row `6` with latest occurrence `AE_SEQ3`.
- Kibana refusals: truncated NDJSON → pod exit 22, `curl: (22) The requested URL returned error: 400`; an unknown object type → HTTP 200 with `"success":false`, pod exit 1, `Kibana refused the saved objects`; the same import with the verdict check removed → Job Complete. Kibana scaled to zero with the wait bound lowered to 3 → exit 1, `Kibana did not report available after 3 checks`; with the bound removed the Job stayed active.
- Mapping takes effect at rollover: the collector created the data stream before the settings Job ran, so `attributes.msg` was a dynamic `keyword`. After `POST logs-puni.otel-local/_rollover`, backing index `-000002` mapped `msg` `match_only_text`, `time` `date`/`epoch_millis` and `failure.fingerprint` `keyword`; `match_phrase` `rollover drill` found the new line, stored as `rollover drill password=[REDACTED] searchable`.

### Elasticsearch outage

Procedure: generator pod writes 900 failure lines (`fp1_outage`, one occurrence id each, 5/s); ECK paused (`eck.k8s.elastic.co/managed=false`), StatefulSet scaled to 0, 60 s with no pod, scaled to 1, ECK resumed.

| Run | Collector                                   | Outage                                                        | Result                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | committed exporter (90 s default `timeout`) | scaled to 0 19:47:51, pod gone 19:48:44, scaled to 1 19:49:44 | **851 of 900 stored** (reconstructed: read interactively, transcribed in the lane evidence file `outage-run1-interactive.txt`; the drill script's own count query returned 0 because `msg` was then a dynamic keyword). `Exporting failed. Dropping data. … dial tcp 10.43.208.203:9200: i/o timeout, dropped_items: 49` at 19:49:13; `otelcol_exporter_send_failed_log_records 49` |
| 2   | same plus `timeout: 3m`                     | scaled to 0 19:59:37, pod gone 20:00:30, scaled to 1 20:01:30 | 900 of 900 stored, 900 distinct occurrence ids, no `Dropping data`; queue 2 → 22 batches, drained to 0 by 20:03:11                                                                                                                                                                                                                                                                  |

Run 2 does not prove the timeout fixes the loss. With a black-holed endpoint (`10.255.255.1`) in the harness, `timeout: 10s` dropped at 10 s (`context deadline exceeded`), a refused endpoint was retried with no drop for 60 s, and both `timeout: 90s` and `timeout: 3m` dropped one batch (`dial tcp 10.255.255.1:9200: i/o timeout`, `dropped_items: 6`), after 136 s and 71 s. The exporter's `RetryOnError` refuses `context.DeadlineExceeded`, which a dial timeout satisfies (exporter source v0.160.0, `esclient.go`), and the exporter has no `retry_on_failure`. The timeout change was therefore not committed. The requirement states the bounded-loss truth (refused connections lose nothing until the queue fills; a hung request is dropped after 90 s and counted), and lossless hanging stays open as task 2.6.

Not verified: Flux reporting a failed `kibana-objects` Job (no Flux in this lab), and the production platform (gated on WBS 070.07 and 070.08).

## Slice E — Log loss alert (2026-10-12, A30)

**Verifier**: Claude Opus 5.5 lane `failure-exporter-alert`, 2026-10-12, branch `batch-10/080-failure-exporter-alert`. Runbook: "Log loss" in [docs/infra/platform.md](../../../docs/infra/platform.md#log-loss). `bin/with-heavy-lock.sh` refused on this workstation (`heavy lock: /home/puni1/.cache does not exist`), so the lab ran directly. No real host was touched.

### promtool (`bun tools/tool-fleet/src/platform-alerts.ts`, locked Prometheus v3.14.0 image, network off)

`SUCCESS` with five new or changed cases: the first dropped batch alerts although its counter appears already incremented, and stops after the window; a later batch alerts again; a full persistent queue (`enqueue_failed`) alerts; a backlog the queue absorbs drops nothing and does not alert; the ingest rule stays quiet while records flow.

| Fault                                                         | Observed                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| rules before this change                                      | 4 cases fail: ingest rule fires while records flow, and all three drop cases get `[]` |
| `increase` branch alone (the brief's expression)              | first-dropped-batch and full-queue cases get no alert                                 |
| both branches, without the inner `> 0` on `increase`          | the same two cases get no alert: `or` matched the zero and hid the new series         |
| ingest rule reading `otelcol_exporter_sent_log_records_total` | records-flow case fires                                                               |

### k3d lab `fea` (app profile; vendored kube-prometheus-stack, ECK and collector charts with committed values; alerts stage applied with `kubectl apply -k infra/platform/alerts/local`; no Flux)

`alertmanager-puni` was a lab secret routing every alert to the stage's `alert-receiver` webhook (`group_wait: 10s`, `send_resolved: true`). Each drill wrote 900 failure lines at 5/s and cut the collector off Elasticsearch for 60 s by iptables on the k3d node.

- **Stored names.** Prometheus stores the collector's counters without `_total` (`otelcol_exporter_sent_log_records`, `otelcol_exporter_send_failed_log_records`). With the committed rules, `PuniLogIngestStopped` reached the receiver at 05:13:05 while `sum(otelcol_exporter_sent_log_records)` was 1244.
- **Hung, committed rule.** `FORWARD -s <collector> -d <es> --dport 9200 -j DROP` 05:13:43–05:14:44. `sent_log_records` stayed 1301 and the queue grew 2 → 14. At 05:15:18 `failed to execute the request: context deadline exceeded … Dropping data`; `send_failed_log_records` appeared at 54. `PuniLogRecordsDropped` was firing in Prometheus and Alertmanager by 05:15:35, and the receiver logged `"status":"firing" … "pod":"otel-collector-agent-hfczk"`, then `resolved` at 05:20:35. Stored: 849 of 900.
- **Production-path negative.** On that run's stored series, the `increase`-only expression returns no sample from 05:14 to 05:21 (`query_range`, 30 s step); the committed expression returns 54 from 05:15:30 to 05:20:00. The counter appeared at 54 and never changed, so `increase` saw no growth.
- **Hung, after a collector restart, `increase`-only rule applied.** The drops came in three steps (two `dial tcp …: i/o timeout` at 05:22:13 and 05:22:23, one `context deadline exceeded` at 05:23:03), so `increase` saw growth and the alert fired anyway. This run does not separate the two expressions. Stored: 753 of 900.
- **Refused, committed rule.** `OUTPUT -p tcp --dport 9200 -j REJECT --reject-with tcp-reset` inside the collector's network namespace (`nsenter -t <pid> -n`), 05:46:42–05:47:43. `sent_log_records` stayed 2498, the queue grew 2 → 15 and drained to 0. There was no `Dropping data`, `send_failed` stayed 377, `PuniLogRecordsDropped` was absent from Prometheus and Alertmanager for six minutes, and no new receiver line arrived. Stored: 900 of 900, 900 distinct occurrence ids.
- **Two refusal injections that did not refuse.** A `tcp-reset` REJECT in the node's `FORWARD` chain did not reach the collector's socket: dials timed out, and the run behaved as a black hole (219 lost; the alert fired at 05:31:05). An `icmp-port-unreachable` REJECT there never matched (0 packets; `sent` kept growing). Neither run counts as a refusal result.

Collector release check: no collector-contrib release up to v0.162.0 (2026-09-29, the latest) retries these errors. `exporter/elasticsearchexporter/esclient.go` lines 280–282 are identical at v0.160.0 and v0.162.0 (`return !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded)`). `factory.go` at v0.162.0 registers no `exporterhelper.WithRetry`, and the v0.161.0 and v0.162.0 changelogs have no retry entry for this exporter. Upstream issue #46970 (bulk requests as `exporterhelper.Request`) is the open path to a fix. There is no candidate version, so the pinned 0.160.0 stays and task 2.6 stays open.

Not verified: a production Alertmanager route (the `alertmanager-puni` SOPS secret was not used), and a full-queue drop on k3d. That case needs 5000 queued requests and was proven by promtool only.

### Review fixes (Fable review of de731cc5, MERGE AFTER FIXES)

- **Duplicate labelset (blocking).** The reviewed rule put both counters in one `__name__=~` selector inside `increase`. `increase` drops the name, so a pod with both counters made every evaluation fail with `vector cannot contain metrics with the same labelset`. With the reviewer's case (pod c has both counters, pod d grows), promtool reported that error at 1m and 1h11m. That was watched before the next finding removed `enqueue_failed` from the rule.
- **`enqueue_failed` never grows here.** At v0.160.0 the exporter's `createDefaultConfig` sets `BlockOnOverflow = true`. On k3d the queue was cut to 2 and Elasticsearch black-holed under load: the queue sat at capacity and `otelcol_exporter_enqueue_failed_log_records` never appeared in the exposition. A full queue blocks intake instead. So `PuniLogRecordsDropped` now watches `send_failed` only. The new `PuniLogQueueFull` (size/capacity ≥ 1 for 1 m) reports the full queue, and `collector.yaml` now states `block_on_overflow: true`.
- **Scrape gap.** The new-series branch is now `sum by (pod) (X) > 0 unless sum by (pod) (last_over_time(X[1h] offset 5m))`. With `unless … offset 5m`, the scrape-gap promtool case (10 m without samples, then the same value) alerted. With the committed form it does not. A gap longer than an hour still fires once; the runbook says so.
- **Wording.** Task 2.7's k3d negative is the replay of run 1's stored series. The post-restart run does not separate the expressions.
- **Exposition oracle.** `tool-fleet` `platform-alerts.test.ts` checks every `otelcol_*` name in `rules.yaml` against `conformance/alerts/collector-metrics.json`. That file holds the sample names from `GET :8888/metrics` of the pinned image on k3d; the raw capture is in the lane evidence. The test also checks that the file's image equals the pinned image and that `block_on_overflow` is `true`. Each was watched failing: `_total` restored on the ingest rule, collector tag set to 0.162.0, `block_on_overflow` deleted.
- **promtool** (`bun tools/tool-fleet/src/platform-alerts.ts`): `SUCCESS`. Watched faults:
  - `increase` alone: the first-dropped-batch case gets no alert.
  - `unless … offset 5m`: the scrape-gap case alerts.
  - The queue rule without its exporter filter: the full remote-write queue alerts at 9 m and 22 m.
  - The queue rule with `> 1`: no alert at 12 m.
- **k3d, queue full** (queue size 2, 180 s black hole, committed rules): `PuniLogQueueFull` pending at 06:39:08, firing in Alertmanager by 06:40:10, and the receiver logged firing then resolved. `PuniLogRecordsDropped` fired too, as hung batches were dropped (`send_failed` 11 → 557). Stored: 364 of 900 under that shrunken queue. The committed collector config (queue 5000, `block_on_overflow: true`) was then reapplied and logged `Everything is ready`.
