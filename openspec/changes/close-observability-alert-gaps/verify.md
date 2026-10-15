# Verification Report

**Change:** close-observability-alert-gaps (F7; WBS 070.07/070.08/070.09)
**Base:** abb051cb5
**Verified:** 2026-10-14, isolated /tmp/puni-f7-alerts on pop-os

## Metric provenance

`telemetry/agent/agent.yaml` hostmetrics memory scraper produces `system_memory_usage_bytes`; resource/cluster sets `puni.cluster`. Gateway `prometheusremotewrite.resource_to_telemetry_conversion` emits `puni_cluster`. Actual metric names and cluster labels were previously observed in k3s-fleet/verify.md, “live cross-cluster telemetry”, 2026-09-18. This packet adds `k8s.namespace.name=observability` only to host metrics, preserving log namespaces.

ECK and the shipped snapshot configuration Job do not expose an SLM last-success gauge. The new CronJob reads `/_slm/policy/puni-daily?filter_path=*.last_success.time` using the already locked Elasticsearch image. A successful kube-state-metrics CronJob timestamp means that check accepted a snapshot no older than 26 hours. The alert starts pending at 30 minutes without a successful check and fires at 35 minutes; complete CronJob absence also fires after 5 minutes. A first deployment without a snapshot intentionally fails until daily SLM succeeds.

Locked kube-prometheus-stack chart `kube-state-metrics/templates/servicemonitor.yaml` lines 58-60 consumes monitor.metricRelabelings. Actual production kubectl + Helm rendering produced action=replace, replacement=platform-production, targetLabel=puni_cluster. Wrong cluster and namespace samples cannot satisfy the selectors. Only the two exact production Kustomize patches are accepted; unrelated patches remain refused.

## Commands and observed output

- `bun tools/tool-fleet/src/platform-alerts.ts`: real offline locked Prometheus 3.14.0 promtool, `SUCCESS`.
- Rendered production PrometheusRule passed the same real promtool suite with expected/foreign cluster fixtures exchanged: `SUCCESS`.
- `bun test tools/tool-fleet/src/snapshot-check.test.ts`: `6 pass, 0 fail`, six cases execute the script extracted from the shipped ConfigMap.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:test`: `441 pass, 0 fail`, `Ran 441 tests across 37 files`, `NX Successfully ran target test for project tool-fleet`. Required socket access granted; an initial sandbox run failed socket tests and the then-unimplemented patch schema, and was superseded by the restored successful run.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:lint`: `NX Successfully ran target lint for project tool-fleet`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:typecheck`: `NX Successfully ran target typecheck for project tool-fleet`.
- Scoped `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --files=<all packet files>`: exit 0, no stdout; `git diff --check`: exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: totals `items=193, passed=193, failed=0` (175 changes, 18 specs).
- Real locked Elasticsearch image, offline: `command -v bash` -> `/usr/bin/bash`; `command -v curl` -> `/usr/bin/curl`; `date +%s` -> numeric epoch. No new image dependency.

## Failure proofs

| Check                      | Injected fault                                  | Production-path observed failure                                                                   |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Workers absence            | Rule absent                                     | workers vanish and foreign workers expected alert, got none                                        |
| Workers cluster/namespace  | Selectors removed                               | foreign-workers case got no alert                                                                  |
| Snapshot freshness alert   | Rule absent                                     | missing, stale, never-checked and foreign-snapshot expected alert, got none                        |
| Snapshot cluster/namespace | Selectors removed                               | foreign-snapshot case got no alert                                                                 |
| SLM shape/parsing          | Replace parsing with accepted fixture timestamp | missing/malformed cases expected exit 1, got 0                                                     |
| SLM age                    | Age guard removed                               | stale/future cases expected exit 1, got 0                                                          |
| Request failure            | Remove errexit                                  | request-failure case expected curl exit 22, got 1                                                  |
| Exact patch allowance      | Patch comparison removed                        | unrelated networking and both production patch negatives resolved instead of rejected (3 failures) |
| KSM cluster relabel        | Literal replacement constraint relaxed          | wrong-cluster relabel negative resolved instead of rejected (1 failure)                            |

All guards were restored before successful checks. Adjacent Proof comments identify these observations.

## Scope and remaining evidence

Delta spec sync/archive and integration are delegated to the root PM. No push or merge. No h3/h4 rollout, fresh cross-cluster runtime namespace-label observation, live SLM API response, recipient delivery or snapshot restore claim. Full host-wide h2puni gate is deferred to the integration SHA; no raw full Nx gate was run. This is scoped packet evidence for independent Astra high review.

## Astra review correction: 35-minute deadline

The independent review reproduced a contract mismatch at 39m: the original expression used age >35m and then waited another 5m. Production predicates now use age >=30m with for:5m, preserving the specified 35m firing deadline. Both the last-successful timestamp and never-successful creation timestamp branches receive boundary assertions: no firing at 34m, firing at 35m and 39m. Production substitutions derive the same corrected expression.

| Check                    | Injected fault                            | Observed production-path failure                                                                                      | Restored output                               |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Snapshot firing deadline | Keep original >35m expression plus for:5m | Real locked promtool expected alert at 35m and 39m, got none, for stopped and never-successful checks (four failures) | Base and kubectl-rendered production: SUCCESS |

This watched pre-fix failure is also the mutation proof for restoring the late threshold. The adjacent Proof comment names both cases. No rollout or delivery evidence was added.

Correction checks rerun on 2026-10-14:

- Locked base promtool: `SUCCESS`.
- Locked promtool on actual kubectl-rendered production rules, expected/foreign clusters swapped: `SUCCESS`.
- Scoped Nx tool-fleet test: `441 pass`, `0 fail`, `NX Successfully ran target test for project tool-fleet`.
- Scoped Nx lint and typecheck: `NX Successfully ran target lint/typecheck for project tool-fleet`.
- Nx format check of all six correction files: exit 0, no stdout.
- Pinned OpenSpec 1.12.0 all validation: `items=193, passed=193, failed=0`.
- `git diff --check`: exit 0.
