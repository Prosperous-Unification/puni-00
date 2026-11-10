# Current operational evidence — 2026-11-10

Read-only observations collected **18:59–19:07 UTC** on 2026-11-10. Source snapshot:
public `7614ca5116e2b27831076f7bc7c9f9872051c388`; scope at
`puni-assessment.md` last changed in `74591b2ef231c9c2b97a934dfcf81a5ba4ba133f`.
Initial source/test inspection was `d87afb94a6362d345480f665b6e3b5d20d787686`;
main advanced during collection. The 23-file website delta was inspected, and the
assessment checkout fast-forwarded to 7614ca5. Relevant earlier test blobs were
unchanged; those tests are not represented as a new final-SHA gate.

Companion remote-main identities were independently read through GitHub: fleet
`f6a4ab630564f36a102db7600a5de068954484f8`, product
`b3d40fe000601aead58679035cee01a03a89cf21`. Researchers inspected those exact objects,
including the deltas from stale local-main refs. Checked-out companion branches were
excluded. No deployment state is inferred from a repository ref.

## Collection contract and limits

Existing SSH aliases used `BatchMode=yes`, `StrictHostKeyChecking=yes`, a five-second
connection bound and bounded read-only Python commands. Selected APIs were read
through `gh api`, Prometheus GET queries, Elasticsearch search/count/health and
Grafana health. Elasticsearch searches read aggregates only. Database reads used
SQLite URI `mode=ro` and selected only activation state/epoch markers. WBS used the
connected read-only work-item-row API. No client rows, credentials, private keys,
connector identities, raw logs, full environment or configuration were emitted.

Sanitized JSON observations and exact collection programs are retained privately in
`/tmp/puni-assessment-20261110/`: `hosts.json`, `monitoring.json`, `signals.json`,
`activation.json`, `github.json` and their `collect-*.py` programs. Temporary files
are session evidence, not permanent runtime telemetry. The observations and limits
needed to reproduce the conclusions are recorded below. No remote file/service,
provider resource, message, alert route, permission or secret was changed.

## Hosts and access

| Host role                            | CPUs | Total / available RAM, GiB | Root available / total, GiB | Observation boundary                                                                 |
| ------------------------------------ | ---: | -------------------------: | --------------------------: | ------------------------------------------------------------------------------------ |
| h1claw — operator/assistant/backup   |    4 |                7.57 / 3.77 |               13.33 / 74.79 | Existing user services read; no cluster service installed                            |
| h2puni — Compose/build/edge/registry |    8 |              15.24 / 11.35 |              13.49 / 149.88 | Existing Docker access; safe identity/health projections                             |
| h3mon — monitoring/cluster agent     |    8 |              15.24 / 11.69 |             119.19 / 149.87 | k3s-agent active; Docker socket denied to observed account; loopback stores readable |
| h4claw — cluster server/gate         |    8 |               15.24 / 2.62 |              75.89 / 149.88 | k3s active; Docker socket denied; `sudo -n k3s kubectl get nodes -o json` refused    |

Values derive from `/proc/meminfo`, `os.cpu_count` and `statvfs`, rounded to two
places. These are instantaneous available bytes, not allocations, concurrent peak
capacity, load acceptance or a resize recommendation. Hostnames still contain older
size labels; guest counters own the current capacity claim. A running k3s service
is not proof that nodes, Flux, workloads, claims or backups are Ready.

## Recovery and assistant

`systemctl --user show` selected unit identity/load/activity, last result/exit and
start/exit timestamps; `not-found` units were not counted as successful work merely
because systemd prints default `Result=success`.

| h1 service                    | Latest observed interval/result, UTC           | What this establishes                                                               |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| SQLite backup                 | Nov10 18:17:00–18:26:24; success/0             | Latest job reports success after the October repair                                 |
| Remote retention              | Nov10 04:47:00–04:47:31; success/0             | Retention service executed; object/version protection not independently read        |
| Restore drill                 | Nov8 05:55:52–05:57:20; success/0              | Scheduled drill reports success; no fresh application restore performed by assessor |
| Backup freshness alert        | Nov10 18:47:00–18:47:03; success/0             | Latest check executed; no failure/recovery message sent by this assessment          |
| OpenClaw gateway              | Active/running; unit description `v2026.7.1-2` | Existing process presence, not effective running build or permission policy         |
| Dev observer / private tunnel | Both loaded, active/running                    | Process presence, qualified below by fresh stored signals                           |

`openclaw --version` reports `2026.9.4 (3a9d69d)`. A parser projected only the
`whatsapp` channel kind and `tools.exec.{host,security,ask}`; all three execution
fields were absent. Defaults, inherited policy, alternate tool routes, approval
behavior and the running gateway version were not resolved. Absence establishes
neither unrestricted authority nor a restrictive policy. No assistant task,
connector grant, spending limit, upgrade, restore or offboarding was exercised.

The [October backup repair and alert/restore evidence](../puni-assessment-2026-10-21/live-evidence.md#w02-resolution--2026-10-23)
remains historical evidence for its recorded scenarios. The fresh service outcomes
supersede the old claim that the latest scheduled backup is failing; they do not
prove every current remote generation, store, key, retention guard or live-service RTO.

## Running application identity and activation

`docker ps` and selected inspect fields identified current image IDs, start times,
OCI revision, resource caps and only `WBS_SHA` from environment entries. No complete
inspect/environment document was exported. Selected deployment state fields were
read from the existing per-tier state files.

| Surface                                    | Observation                                                                                                                       | Limit                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dev backend `/health` inside `wbs-dev-src` | HTTP200, `status=ok`, `commit=bootCommit=7614ca5116e2b27831076f7bc7c9f9872051c388`                                                | Proves this backend reports the observed source; no full user journey or multi-client acceptance |
| Prod state files                           | All three tiers record `0afc77758131bc4257dcaa78f0b26bc97ffd92dc`; backend/gateway green, frontend blue                           | State-file declaration, not independent accepted build provenance                                |
| Prod container images                      | Same image IDs as the October observation: backend `ebc269d2…`, gateway `81c35528…`, frontend `310f4fb8…`; started Aug24          | Local image IDs are not registry manifest digests; current routing was not reread                |
| Prod source metadata                       | No `WBS_SHA` on the inspected tiers; backend/gateway OCI revision `0d9b296a…` is the previously identified inherited Bun metadata | Source/build/gate chain remains unproved; do not relabel these images as current main            |
| Dev organization DB                        | Read-only singleton marker `activated`                                                                                            | Activation marker only, not complete browser/socket/MCP isolation proof                          |
| Prod organization DB                       | Activation table absent                                                                                                           | This store is not the currently activated schema; do not claim current isolation code governs it |
| Browser authority                          | Existing dev backend `.env` says `BROWSER_SESSION_AUTHORITY=enabled`                                                              | Declared configuration; process-effective policy not independently inspected                     |
| MCP epoch                                  | First historical session-store path was absent; no epoch read                                                                     | Unknown, not epoch0/1 and not evidence that no session store exists elsewhere                    |

## Autonomous observability and retained legacy stack

At 19:02 UTC, existing h3 loopback endpoints answered:

| Read                                                        | Result                                                                                               | Interpretation                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Prometheus `:19090/api/v1/query`, `count({__name__=~".+"})` | 2,099 active series; TSDB head metric 2,102                                                          | Different metric definitions; neither is request volume or complete sample coverage                           |
| `max by (state) (puni_resource_collection_state)`           | complete1, unavailable0                                                                              | Selected resource observation is currently complete                                                           |
| `time()-max(puni_resource_observed_timestamp_seconds)`      | 24.04 seconds                                                                                        | Fresh selected-resource evidence, not all-estate coverage                                                     |
| Probe age / success                                         | 27.63 seconds / 1                                                                                    | Autonomous dev health observation is fresh and successful                                                     |
| Resource workload series                                    | 13 current-memory series in two selected groups                                                      | Bounded role inventory, not discovery of every container/host                                                 |
| Sum of current memory per group                             | Dev 3,224,829,952B; preserved monitoring 2,085,756,928B                                              | Concurrent current charges, not RSS, limits or simultaneous lifetime peaks                                    |
| Request/latency/gateway series query                        | Empty vector for `http_server_requests_total`, `http_server_request_duration_seconds_count`, `gw_.*` | Those names absent in this store at this instant; no blanket claim that all request instrumentation is absent |
| Elasticsearch `:19200/_cluster/health`                      | green, one node, 73 active primary shards, zero unassigned, no timeout                               | Healthy singleton store; not replicated HA or recovery proof                                                  |
| Legacy VictoriaMetrics `:8428`                              | 21,936 active series                                                                                 | Legacy backend still retained/running; migration is incomplete, not an authorization to remove it             |

At 19:04 UTC, aggregate-only searches of `logs-*` and `traces-*` returned **21,143
logs** and **41,076 spans**, latest timestamps **19:03:48.873Z** and **19:03:48.871Z**,
zero failed shards and no search timeout. An earlier guessed `puni-dev-*` count
returned zero; that prefix was not the actual log/trace namespace and was not used
to conclude that signals were missing. Counts/latest timestamps establish populated,
fresh stores, not complete application traffic tracing or an independently joined
end-to-end trace for every request.

The observer checkpoint independently reports producer
`047e08024b4b1bbba4cb7700400d6f37b0d0ed05`, target revision7614ca5, successful observation
and acknowledged publication. Its health checkpoint reports health, application-log,
storage and resource collection `complete`. The [encoder](../../../tools/tool-observability-stack/src/dev/otlp.ts)
and [acceptance reader](../../../tools/tool-observability-stack/src/dev/acceptance.ts)
retain observation/trace/span identities; their guards were tested locally, but this
assessment did not independently reconstruct every stored parent/child correlation.

Grafana `/api/health`: HTTP200, database `ok`, version13.0.7. Prometheus alerts API:
zero active pending/firing alerts at the sample. Neither response proves dashboards,
recipient delivery, outage detection, persistent history across recovery or production
observability. No new notification or failure injection was performed.

## GitHub enforcement and seven-day delivery sample

Fresh `/branches/main` reports protected main at7614ca5. `/rules/branches/main`
returns active ruleset25730010 requiring **`gate` and `pixels`**, Actions integration15368,
strict freshness false and zero required approvals. These settings differ from
October's unprotected branch. Review policy, composed-tree races and current missing/
failed/cancelled merge-negative controls were not mutated/replayed during this audit;
[prior enforcement proof](../../../openspec/changes/enforce-merge-checks/verify.md)
remains dated. Required checks are enforced settings, not mandatory human review.

Window **Nov3 19:00:06.994Z → Nov10 19:00:06.994Z**. Commands:
`gh pr list --state merged --search merged:>=<window-start> --limit300` and paginated
`/actions/workflows/ci.yml/runs?branch=main&per_page=100&page=N` through the older-window
boundary. Both populations were complete within configured collection bounds.

| Measure                                 |         Observed value | Denominator/limit                                                                   |
| --------------------------------------- | ---------------------: | ----------------------------------------------------------------------------------- |
| Merged PRs                              |                     62 | Source merges, not accepted client outcomes                                         |
| Open-to-merge median / nearest-rank p90 |         3.38h / 81.85h | Drafting included; not ready-for-review delay or request-to-production lead time    |
| Main `ci` workflow runs                 |                     50 | Current run records; attempts are not independent accepted changes                  |
| Completed conclusions                   | 36 success, 13 failure | 49 terminal runs; failure proportion13/49=26.5%, not deployment change-failure rate |
| Running / cancelled                     |                  1 / 0 | Running result censored; not converted to success or failure                        |

No continuous queue/execution attribution, production deployment frequency, accepted
change count, rework time, incident recovery distribution, operator minutes or client
invoice reconciliation was obtained from this population. Workflow `updated_at` was
not treated as completion time or runner queue. [Provider-neutral timing](../../../libs/shared/domain/delivery/README.md)
separates performed work, elapsed span and attempt-start waiting; those overlapping
quantities cannot be summed or renamed runner queue.

## WBS workflow intent

The connected `getApiProjectsByIdWork_item_rows` read returned all140 rows with
`nextCursor=null` for the assessment plan's named workflow project. Parent S7a is
`in_progress`; the durable-coordinator planning row is also `in_progress`. I1.05,
I2.10 and I3.05 are `unknown` (revision2 each); S7a.06 is `unknown` (revision7).
`unknown` is the stored progress state, not proof of implementation absence or failure.
Source-level partial components are assessed in [delivery/swarm](delivery-swarm.md).
The prior assessment's revoked-MCP-session limitation is no longer current for this read.

## Checks deliberately not performed

No full Nx/host gate, release build or rebuild, browser/client acceptance run, live
attack, provider inventory/billing query, paid inference, configuration apply, Secret
read/write, permission change, deployment, recovery drill, live failure/alert injection,
Kubernetes/Flux/PVC inventory after access refusal or independent cost audit. Those
limitations keep the respective readiness criteria open. Read-only reachability,
source tests, old lab proof, unit success and current operational acceptance are never
interchanged in this assessment.
