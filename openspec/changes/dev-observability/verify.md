## Outcome and scope

Verified on 2026-10-25 against the actual dev application and monitoring hosts. Six new bounded services run on h3mon: collector, Elastic gateway, Elasticsearch, Kibana, Prometheus and Alertmanager. The existing Grafana has one additional nondefault datasource and a 14-panel dashboard. A separate enabled observer and SSH tunnel run on h1claw using existing identities. Production, secrets, the shared Vector/Victoria route and application code were not changed.

The shared assessment in `tools/tool-observability-stack/src/dev/observation.ts` has no Elastic, Prometheus, GitHub or runner dependency. Concrete source, OTLP, store-query and deployment adapters preserve provenance. This establishes autonomous measurement and query-verified health; automatic repair and full delivery timing remain separate work.

[Versioned live evidence](#selected-live-evidence) contains the actual sampled observations, outage/recovery states, missing-record accounting, cgroup bounds, historical queries and restored Grafana response. Full raw replies, screenshots and command logs are retained under `/home/monitor/puni-dev-observability/evidence/`; observer checkpoints and service evidence are under `/home/claw/.local/state/puni-dev-observability/`.

## Running artifacts and operation

| Artifact                        | Verified identity                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Original h3 release             | `releases/a1ffe27e7`, source `a1ffe27e740965d9020b819f50f17a1f1ce4329f`                                                        |
| Current h3 Prometheus candidate | `releases/c811f34bf`, source `c811f34bf21a5be0a07a3bebf043f651556e50dc`; original binds retained for the other five services   |
| Observer binary                 | `/home/claw/.local/lib/puni-dev-observability/ab4f7cf6e/observer`, source `ab4f7cf6e3023f2f2851bbf85dfb920c7de0859d`           |
| Observer SHA256                 | `281c51a2542784f8b46df5ad8f7a22ab4f29b738a90b15a7bd1c9937a743374c`, 109467824 bytes; built locally with Bun 1.4.4, never on h1 |
| Runtime preflight and units     | `b92721392ec8f8e22cfe8f7f33dbf58355e7f456`; later `690c81dd9` changes only operator documentation                              |
| Active Grafana receipt          | `evidence/grafana-integration-restored.json`, phase `applied`; original `grafana-integration.json` remains `removed`           |

Exact commands and ownership refusals are in [runtime operation and rollback](../../../docs/runbook-dev-observability-runtime.md) and [Grafana integration](../../../docs/runbook-dev-observability-grafana.md). Release manifests hash the configuration files. The preflight deliberately adopts these known releases; it is not an arbitrary-host deployment controller.

The actual images reuse locked Elastic/Kibana 9.3.8, collector-contrib 0.160.0, Elastic gateway 9.3.8, Prometheus 3.14.0 and Alertmanager 0.34.0 digests. Actual Docker 29.7.2 and Compose 5.5.0 accepted the configuration. Collector `validate`, gateway `otel validate`, `promtool check config`, `promtool test rules` and `amtool check-config` ran against pinned binaries. The gateway inventory includes the Elastic APM processor and connector used by Kibana.

## Live observations and private access

- Actual source: inspected Docker container `wbs-dev-src` on h2puni, ID `42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623`. The adapter checks the source mount/runtime and executes by the inspected ID. No host-port or production fallback is used.
- First real stored observation: `f1519c81-ee91-497f-960b-9d1a230d5c58`, trace `79d4354fca488f29a374767868501c7f`, root `62b30fae184b54d5`, child `e4765c3169d98351`, application revision `2ca06fcf191be55289930d10f119a9c884fac564`. Elastic returned its log and two related spans; Prometheus returned the measured timestamp and matching revision. The real Kibana waterfall showed the 2433 ms external operation and 19 ms measured HTTP request separately.
- A fresh real backend assessment returned `complete`; querying an older observation with the real clock returned `stale`. Empty vectors, wrong identities, incomplete traces and query errors are independently refused in production-path tests.
- One real `mcp-01` application log was collected and queried from Elastic. Its missing revision remains `not-emitted`; it is not relabeled as `be-01` or assigned the latest health revision. The body hash and supported keys were recorded without printing its message. Synthetic credential-shaped content was redacted through the actual pinned collector, and a production-environment fixture did not appear in the dev stream.
- All five published APIs bind `127.0.0.1`: OTLP 14318, Elasticsearch 19200, Kibana 15601, Prometheus 19090 and Alertmanager 19093. Actual requests succeeded on loopback; connections to all five ports were refused on both the public and private host interfaces. No tenant-facing API was added.
- Existing Grafana remained running. All 14 new panel queries succeeded through its datasource, with zero browser HTTP failures. The browser rendered real duration, storage, revision and explicit stale/missing states. The old VictoriaMetrics datasource remained the sole default. Screenshots and their SHA256 values are recorded in the selected live evidence below.

The initial internal-only Docker bridge accepted configuration and passed in-network health checks but omitted actual published ports. The final dedicated bridge permits outbound traffic and verifies actual loopback publication. Only Prometheus additionally joins the existing Grafana query network, with its unique alias; admin/lifecycle APIs remain disabled.

## Autonomous operation and timings

Both new h1 units are enabled and running. Actual cgroup files, not just intended unit properties, showed `memory.max=268435456`, `cpu.max=25000 100000` and `pids.max=32`. Restarts are bounded to three failed starts in five minutes, with a ten-second delay. The permanent launcher omits `--initialize`; existing checkpoints survived stop/restore. `Wants`/`After` permits unavailable cycles while the separate tunnel reconnects.

Four consecutive sampled cycles before rollback all returned complete stored-signal assessments, successful source health, complete application-log collection and complete real storage readings. Four more distinct complete assessments followed restoration. The actual application revision advanced independently to `a116092e522f43c649e3c566fbe63fecc0da230f`, then `2cc76418d848c8833c81f524ef269928015318f2`; the observer used those health-reported revisions without a checkpoint reset or repository-HEAD substitution.

Eleven completed journaled cycles spanning the fault drill took 7.288–8.238 seconds, below the 20-second cycle deadline. Cadence is 30 seconds; freshness is 120 seconds. The dedicated small probe scrape is five seconds/three-second timeout; internal metrics and rule evaluation remain 30 seconds. The final restored Grafana query returned complete health, a 33.871-second check age, exactly one active revision and no active alerts.

Actual disk readings describe h3's Docker storage filesystem, not application disk usage. A measured capacity was 160921083904 bytes, with approximately 130 GB available. An initial running-container snapshot used approximately 1.84 GiB total; this is a snapshot, not a load or production capacity certificate.

## Fault, loss and recovery proof

Only the new dev gateway was stopped. A separate timed recovery command was installed before stopping it, then removed after normal restoration. The measured stop/start operation lasted 90.314 seconds.

| Observation                     | Actual evidence                                                                |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Before outage                   | Stored health complete; no active alerts                                       |
| 30-second sample                | Previous complete evidence still visible; no premature absence claim           |
| 60-second sample                | Health incomplete; `DevCollectorMissing` active                                |
| 90-second sample                | Health incomplete; `DevCollectorMissing` and `DevObservationIncomplete` active |
| After restoration               | `DevExporterLoss` also fired as the failed-send counter increase was evaluated |
| First sampled complete recovery | 49.922 seconds after the restored snapshot                                     |
| All active alerts resolved      | 154.956 seconds after the restored snapshot                                    |

These are sampled detection/recovery bounds, not exact transition latencies. The recovery polling was bounded and stopped only after complete health and an empty active-alert set.

The highest sampled collector queue size was 1736 bytes against a declared and observed 16777216-byte capacity per signal. Final counters reported three failed log records and six failed spans. Direct Elastic queries independently found these three acknowledged observations missing their log and both spans:

- `2be91848-2e07-421c-9430-d259416f09ea`
- `c68c15a3-c484-4f63-b3ff-53a455e3e6e0`
- `171a8950-7b8e-465f-9eeb-8b8490081740`

Eight other captured observations had exactly one log and two spans, for 24 stored documents. Thus this drill accounts for the actual gap rather than equating receiver acknowledgement with delivery. These counters are not a general unique-loss ledger across every possible retry or crash. The 90-second outage exceeds the configured 30-second exporter retry bound; loss is visible and is not silently repaired.

The dev app remained healthy at the same revision during this drill. Seven old monitoring container identities/start times/restart counts, four old configuration hashes and their health checks were unchanged.

## Rollback and restoration proof

Executed rollback disabled/stopped only the two new h1 units, removed only the owned Grafana dashboard/datasource using the original durable receipt, restored Prometheus's original sole-dev network/configuration, then stopped all six new h3 services. All six volume names, creation identities, mountpoints and ownership labels compared equal before and after. No volumes were deleted or reinitialized.

While the new services were stopped, the seven old services remained running and healthy with their original IDs/start times/restart counts and four file hashes. Existing Grafana retained its default datasource. The original h1 tunnel's PID `1406810` and configuration hash were preserved throughout.

Restoration started retained Elasticsearch first. One expected startup connection reset was recorded; a second bounded readiness attempt returned green after 5.528 seconds. All three retained ILM policies and component templates matched. The remaining services, candidate Prometheus configuration and Grafana additions were restored. A new receipt records the restored Grafana objects; the removed receipt was not reset or overwritten. All six semantic endpoint checks passed before the observer resumed.

The original observation's three Elastic documents and historical Prometheus sample at query time `1792937800` remained identical after restoration (`1792937768.527` measured timestamp). An existing VictoriaMetrics query at pre-rollout time `1792931800` returned 21600 historical samples across 180 fetched token-usage series. The old route and stores were preserved. Post-restore autonomous cycles and Grafana queries returned complete, fresh health.

A guessed Kibana Node path failed with exit 127 and stopped the restoration sequence before observer activation. The previously verified pinned-image executable `/usr/share/kibana/node/glibc-217/bin/node` passed all health checks; only then did restoration continue. `systemd-analyze --user verify` passed both new units and separately warned about an unrelated existing `review-reconcile.service` setting, which was not changed.

## Verification commands and safety proofs

The final behavior-changing commit is `b92721392`; later changes are documentation/evidence only.

```sh
bunx nx run tool-observability-stack:test
bunx nx run tool-observability-stack:lint
bunx nx run tool-observability-stack:typecheck
bunx nx run tool-observability-stack:build
bun tools/tool-observability-stack/src/dev/runtime-cli.ts preflight /tmp/puni-dev-release-c811f34bf
bun run tools/tool-git-hooks/src/hooks/doc-caps.ts
./node_modules/.bin/openspec validate --all --json
```

Local observability tests: **334 pass, zero failures, 619 assertions across 11 files**. Lint, typecheck and build passed. The build target copies the module assets; the separately compiled and actually executed observer binary is distinct evidence. Full OpenSpec validation passed all 290 entries. Formatting, document-cap, tracked secrets/private-nesting and diff checks passed; the final artifact commit runs normal hooks.

Production-path negatives were observed failing when their guard or dependency was broken, then restored. Adjacent `Proof:` comments identify the test/fault:

| Boundary                     | Negative evidence                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment/configuration     | Wrong target, absent/unreadable files, stale capacity, unbounded resources/queues, public or extra networks, missing inputs, malformed semantic health, removed APM enrichment/admission and disabled queues                                |
| Shared health                | Missing/partial/stale signals, wrong environment/service/revision/observation, future/nonfinite time and invalid parent/child relationships; 18 mutations                                                                                   |
| Source/probe/OTLP            | 27 initial mutations covering real subprocess and HTTP boundaries, limits, revision, checkpoint corruption, provenance and pinned inspected-container execution; separate fix proof suppresses a false HTTP child when no request occurred  |
| Store/application acceptance | 51 guard mutations plus seven actual pinned-promtool rule mutations; stored identities, partial/truncated/error responses, scrape-time correlation, dev-only log identity and body-only redaction; three storage parser/time fix proofs     |
| Grafana                      | 40 guard mutations plus actual promtool ambiguity proof; UID/default/baseline/receipt/ownership/byte/deadline/network and rollback refusals                                                                                                 |
| Runtime operation            | 20 TypeScript plus three Python/CLI mutation proofs; two further guards reject foreign-interface same-port listeners and a missing owned query alias. Actual OS missing/unreadable reads and valid-output/nonzero SSH failures are distinct |

Intermediate failures were retained in the working evidence: an internal bridge hid ports, a release directory mode prevented container reads, actual `df` header spacing differed, a JSON fixture was incorrectly placed under dashboard validation, and review found the two runtime network omissions. The final fixes were scoped and re-reviewed. No validator was weakened to make an unrelated fixture pass; no failed subprocess was treated as successful output.

## Limits and unverified capabilities

- This is single-host dev infrastructure, not production/HA readiness. Host reboot, long-duration retention deletion, high-volume saturation, disk exhaustion and backup/restore of the Grafana database were not rehearsed. Actual Docker restart policy is `no` for the six new Compose services: a process crash or host restart requires the explicit retained-store start/restore procedure. The h1 observer units are enabled with bounded restarts; this work does not provide monitoring-host recovery automation.
- ILM deletion ages are after rollover: seven days for logs/traces and one day for APM aggregates. They are not hard maximum document ages or disk quotas. Prometheus retention is seven days/1 GiB. Queue capacities are logical bytes, not a physical filesystem quota.
- Application internal spans and comprehensive application metrics are not present. Traces are measured external health requests. The existing app metrics endpoint had metadata but no useful registered measurements.
- Application log capture is bounded, can report truncation/incomplete, and may duplicate a small window after restart. Quiet complete collection does not prove a new application log was emitted. Historical app logs without revision remain explicitly unknown.
- Alertmanager has a local receiver with no external notifications and is not a durable alert-history database. Its health depends on this dev monitoring host. Exhausted observer/tunnel restarts require explicit inspected recovery.
- The current runtime preflight is tied to the inspected releases and host identities. New releases require a reviewed adapter update. Snapshots expire and do not make separate remote writes transactional.
- Full h2/h4 monorepo gates, application/browser autotests unrelated to this module, and migration checks were not run locally: no application code, workflow or migration changed. The PR's affected CI checks remain the merge authority. No final merge or production deployment is authorized by this evidence.
- Tool Wiki hooks reported inactive/not certified because the external activation root is absent. No activation or certification is claimed.
- Automatic approval rejected an unrestricted temporary Grafana viewing proxy. It was never started. A separately approved restricted viewer allowed only explicit read routes and the new datasource's queries; real negative requests refused admin/dashboard writes and other datasource queries. The viewer and its extra forward were closed after the browser proof.

## Decisions made under autonomous authorization

1. Use a dev Compose deployment instead of production Flux activation. Cost if wrong: the future production adapter needs revision; the production graph remains untouched.
2. Reuse existing observation/environment terminology rather than invent glossary terms. Cost if wrong: later domain clarification may be required.
3. Proceed from the approved plan and explicit autonomous implementation request without another design interview. Cost if wrong: bounded design choices may need user-directed rework.
4. Use this goal's own scratch directory because the helper's generic tasks directory contained older work. Cost if wrong: scratch routing needs correction; unrelated reports were preserved.
5. Scrape only the small probe exporter every five seconds. Cost: six times its former sample rate, bounded by the existing retention; avoids systematic missed observations at equal producer/scrape cadence.
6. Add API-managed Puni Grafana objects with durable receipts. Cost: their ownership and restoration must be maintained separately from Claire's file provisioning; existing defaults/files are preserved.

## Final review and CI scope

Independent whole-branch review of `9e023867a..22fcb49de` approved PR publication with no Critical or Important findings. Two nonblocking follow-ups remain: initial Grafana capture relies on the operator’s fixed Victoria type/URL check, and a further restoration cycle needs a newly reviewed unique receipt name. Existing receipts must never be overwritten.

The initial CI preview selected all 53 runtime modules because a standalone OpenSpec evidence JSON had unknown runtime impact. The exact same JSON is embedded below in the supported `verify.md` artifact instead. The CI selector and its refusal policy were not changed; the immutable-SHA preview now selects only `tool-deploy`, `tool-devsync` and `tool-observability-stack`, rather than all 53 modules. Application/browser suites are not selected. The first two are actual declared documentation consumers and remain included; CI was not bypassed.

## Selected live evidence

<details>
<summary>Actual sampled observations, faults, recovery and retained history</summary>

```json
{
  "verifiedOn": "2026-10-25",
  "autonomousBeforeRollback": [
    {
      "sampledAt": 1792943752470,
      "observationId": "e0b460c2-694f-449d-a607-1bb64d9e45d5",
      "revision": "a116092e522f43c649e3c566fbe63fecc0da230f",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "e95959af-9905-4e47-b490-1de7be92e3e3",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792943782471,
      "observationId": "e8091651-3515-4651-9898-f3c7c8bbcc93",
      "revision": "a116092e522f43c649e3c566fbe63fecc0da230f",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "e0b460c2-694f-449d-a607-1bb64d9e45d5",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792943812472,
      "observationId": "c924fe79-4b80-42df-87fe-3e4e3baa107a",
      "revision": "a116092e522f43c649e3c566fbe63fecc0da230f",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "e8091651-3515-4651-9898-f3c7c8bbcc93",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792943842474,
      "observationId": "4816a7fc-f2ce-44e0-a2b7-651b8b68dbfa",
      "revision": "a116092e522f43c649e3c566fbe63fecc0da230f",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "c924fe79-4b80-42df-87fe-3e4e3baa107a",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    }
  ],
  "autonomousAfterRestore": [
    {
      "sampledAt": 1792944705256,
      "observationId": "d2860d57-7896-4220-8574-d9eaba4f0d2a",
      "revision": "2cc76418d848c8833c81f524ef269928015318f2",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "e9ce618f-1fd4-462c-962e-32de27edbd56",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792944735257,
      "observationId": "e10f2402-b683-416e-8c59-5e4d272382fe",
      "revision": "2cc76418d848c8833c81f524ef269928015318f2",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "d2860d57-7896-4220-8574-d9eaba4f0d2a",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792944765258,
      "observationId": "cc873701-bdf5-4b74-8002-9871c2fbb0c1",
      "revision": "2cc76418d848c8833c81f524ef269928015318f2",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "e10f2402-b683-416e-8c59-5e4d272382fe",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    },
    {
      "sampledAt": 1792944795259,
      "observationId": "00a531ad-fe9c-482b-93d8-7b7b8af624dc",
      "revision": "2cc76418d848c8833c81f524ef269928015318f2",
      "source": {
        "kind": "ssh-dev-container",
        "containerValidated": true,
        "containerId": "42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623"
      },
      "assessedObservationId": "cc873701-bdf5-4b74-8002-9871c2fbb0c1",
      "health": {
        "state": "complete",
        "signals": {
          "log": [],
          "metric": [],
          "trace": []
        }
      },
      "application": "complete",
      "storage": "complete"
    }
  ],
  "effectiveBounds": {
    "observedAt": 1792943713903,
    "units": [
      {
        "unit": "puni-dev-observability-tunnel.service",
        "systemd": {
          "TimeoutStopUSec": "25s",
          "MainPID": "3564140",
          "NRestarts": "0",
          "ControlGroup": "/user.slice/user-1000.slice/user@1000.service/app.slice/puni-dev-observability-tunnel.service",
          "CPUQuotaPerSecUSec": "250ms",
          "MemoryMax": "268435456",
          "TasksMax": "32",
          "ActiveState": "active",
          "SubState": "running",
          "UnitFileState": "enabled"
        },
        "cgroup": {
          "memory.max": "268435456",
          "cpu.max": "25000 100000",
          "pids.max": "32"
        }
      },
      {
        "unit": "puni-dev-observability.service",
        "systemd": {
          "TimeoutStopUSec": "25s",
          "MainPID": "3564141",
          "NRestarts": "0",
          "ControlGroup": "/user.slice/user-1000.slice/user@1000.service/app.slice/puni-dev-observability.service",
          "CPUQuotaPerSecUSec": "250ms",
          "MemoryMax": "268435456",
          "TasksMax": "32",
          "ActiveState": "active",
          "SubState": "running",
          "UnitFileState": "enabled"
        },
        "cgroup": {
          "memory.max": "268435456",
          "cpu.max": "25000 100000",
          "pids.max": "32"
        }
      }
    ]
  },
  "outage": [
    {
      "phase": "before",
      "observedAt": 1792943870834,
      "health": ["complete"],
      "alerts": []
    },
    {
      "phase": "outage-0",
      "observedAt": 1792943871162,
      "health": ["complete"],
      "alerts": []
    },
    {
      "phase": "outage-30",
      "observedAt": 1792943900943,
      "health": ["complete"],
      "alerts": []
    },
    {
      "phase": "outage-60",
      "observedAt": 1792943930944,
      "health": ["incomplete"],
      "alerts": ["DevCollectorMissing"]
    },
    {
      "phase": "outage-90",
      "observedAt": 1792943960944,
      "health": ["incomplete"],
      "alerts": ["DevCollectorMissing", "DevObservationIncomplete"]
    },
    {
      "phase": "restored",
      "observedAt": 1792943961257,
      "health": ["incomplete"],
      "alerts": ["DevCollectorMissing", "DevObservationIncomplete"]
    }
  ],
  "recovery": [
    {
      "observedAt": 1792943996175,
      "complete": false,
      "activeAlerts": ["DevExporterLoss", "DevObservationIncomplete"]
    },
    {
      "observedAt": 1792944011179,
      "complete": true,
      "activeAlerts": ["DevExporterLoss", "DevObservationIncomplete"]
    },
    {
      "observedAt": 1792944026185,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944041190,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944056195,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944071200,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944086204,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944101209,
      "complete": true,
      "activeAlerts": ["DevExporterLoss"]
    },
    {
      "observedAt": 1792944116213,
      "complete": true,
      "activeAlerts": []
    }
  ],
  "lossAccounting": {
    "observations": [
      {
        "observationId": "e95959af-9905-4e47-b490-1de7be92e3e3",
        "observedAt": 1792943700234,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "e0b460c2-694f-449d-a607-1bb64d9e45d5",
        "observedAt": 1792943729782,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "e8091651-3515-4651-9898-f3c7c8bbcc93",
        "observedAt": 1792943760263,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "c924fe79-4b80-42df-87fe-3e4e3baa107a",
        "observedAt": 1792943790282,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "4816a7fc-f2ce-44e0-a2b7-651b8b68dbfa",
        "observedAt": 1792943819684,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "e11caa03-a48c-45fd-85d3-d2206a2babb5",
        "observedAt": 1792943850593,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "2be91848-2e07-421c-9430-d259416f09ea",
        "observedAt": 1792943880259,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 0,
          "traces": 0
        }
      },
      {
        "observationId": "c68c15a3-c484-4f63-b3ff-53a455e3e6e0",
        "observedAt": 1792943910015,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 0,
          "traces": 0
        }
      },
      {
        "observationId": "171a8950-7b8e-465f-9eeb-8b8490081740",
        "observedAt": 1792943940056,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 0,
          "traces": 0
        }
      },
      {
        "observationId": "cb42f7cd-2296-4422-8b6e-461b1573ccde",
        "observedAt": 1792943970234,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      },
      {
        "observationId": "e383aa8e-6e48-4ae9-bcbb-7bde1f8d0d73",
        "observedAt": 1792944000410,
        "publication": {
          "state": "acknowledged"
        },
        "stored": {
          "logs": 1,
          "traces": 2
        }
      }
    ],
    "storedHits": 24
  },
  "finalFailedSendCounters": {
    "status": "success",
    "data": {
      "resultType": "vector",
      "result": [
        {
          "metric": {
            "__name__": "otelcol_exporter_send_failed_log_records",
            "error.permanent": "false",
            "error.type": "Unavailable",
            "exporter": "otlp",
            "instance": "collector:8888",
            "job": "dev-collector",
            "server.address": "gateway",
            "server.port": "4317"
          },
          "value": [1792944134.357, "3"]
        },
        {
          "metric": {
            "__name__": "otelcol_exporter_send_failed_spans",
            "error.permanent": "false",
            "error.type": "Unavailable",
            "exporter": "otlp",
            "instance": "collector:8888",
            "job": "dev-collector",
            "server.address": "gateway",
            "server.port": "4317"
          },
          "value": [1792944134.357, "6"]
        }
      ]
    }
  },
  "historyBefore": {
    "observationId": "f1519c81-ee91-497f-960b-9d1a230d5c58",
    "elastic": {
      "count": 3,
      "_shards": {
        "total": 2,
        "successful": 2,
        "skipped": 0,
        "failed": 0
      }
    },
    "prometheus": {
      "status": "success",
      "data": {
        "resultType": "vector",
        "result": [
          {
            "metric": {
              "__name__": "puni_dev_probe_observed_timestamp_seconds",
              "environment": "dev",
              "exported_job": "puni-dev-probe",
              "instance": "collector:8889",
              "job": "dev-probe",
              "otel_scope_name": "puni-dev-probe",
              "otel_scope_version": "469c630ec",
              "service": "be-01"
            },
            "value": [1792937800, "1792937768.527"]
          }
        ]
      }
    }
  },
  "historyAfter": {
    "observationId": "f1519c81-ee91-497f-960b-9d1a230d5c58",
    "elastic": {
      "count": 3,
      "_shards": {
        "total": 2,
        "successful": 2,
        "skipped": 0,
        "failed": 0
      }
    },
    "prometheus": {
      "status": "success",
      "data": {
        "resultType": "vector",
        "result": [
          {
            "metric": {
              "__name__": "puni_dev_probe_observed_timestamp_seconds",
              "environment": "dev",
              "exported_job": "puni-dev-probe",
              "instance": "collector:8889",
              "job": "dev-probe",
              "otel_scope_name": "puni-dev-probe",
              "otel_scope_version": "469c630ec",
              "service": "be-01"
            },
            "value": [1792937800, "1792937768.527"]
          }
        ]
      }
    }
  },
  "preservedAfterRestore": {
    "observedAt": 1792944697729,
    "preservedOldContainers": 7,
    "preservedFileHashes": 4,
    "health": {
      "mlflow": {
        "status": 200,
        "body": "OK"
      },
      "victoriametrics": {
        "status": 200,
        "body": "OK"
      },
      "victorialogs": {
        "status": 200,
        "body": "OK"
      },
      "victoriatraces": {
        "status": 200,
        "body": "OK"
      },
      "grafana": {
        "status": 200,
        "body": "{\n  \"database\": \"ok\",\n  \"version\": \"13.0.7\",\n  \"commit\": \"392e53a167a4382a14d2d6246284a36bc198ae3d\"\n}"
      }
    },
    "retainedVolumes": [
      {
        "name": "puni-dev-observability_elasticsearch",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_elasticsearch/_data",
        "labels": {
          "com.docker.compose.config-hash": "17fbe69dc7470d19fb666013898e981b26ec06b17f407a7088a41637334e0b3a",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "elasticsearch"
        }
      },
      {
        "name": "puni-dev-observability_kibana",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_kibana/_data",
        "labels": {
          "com.docker.compose.config-hash": "6065eb4814e30a7744cc11aedb4a19ea7fc5b783964ba265e55a9f87205d32b8",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "kibana"
        }
      },
      {
        "name": "puni-dev-observability_collector",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_collector/_data",
        "labels": {
          "com.docker.compose.config-hash": "d45eafd0e9883df3428cdc3c723e06aa4be3166846605aafe9a56b80904535aa",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "collector"
        }
      },
      {
        "name": "puni-dev-observability_gateway",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_gateway/_data",
        "labels": {
          "com.docker.compose.config-hash": "f3410869c48030c2c9df3cb3513fb2856abc4681db53546f924e1466459a803a",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "gateway"
        }
      },
      {
        "name": "puni-dev-observability_prometheus",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_prometheus/_data",
        "labels": {
          "com.docker.compose.config-hash": "f56acc77c3ba012e3bfdafd5b81a65710e1169682e69f727857c08fc87c09555",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "prometheus"
        }
      },
      {
        "name": "puni-dev-observability_alertmanager",
        "createdAt": "2026-10-25T14:07:41Z",
        "mountpoint": "/var/lib/docker/volumes/puni-dev-observability_alertmanager/_data",
        "labels": {
          "com.docker.compose.config-hash": "8b769465a62f8f53497647e2064ac759244341aecc1c15b74abf9ffdf71e61a6",
          "com.docker.compose.project": "puni-dev-observability",
          "com.docker.compose.version": "5.5.0",
          "com.docker.compose.volume": "alertmanager"
        }
      }
    ]
  },
  "victoriaHistory": {
    "metricName": "gen_ai.client.token.usage_bucket",
    "queryTime": 1792931800,
    "query": {
      "status": "success",
      "data": {
        "resultType": "vector",
        "result": [
          {
            "metric": {},
            "value": [1792931800, "21600"]
          }
        ]
      },
      "stats": {
        "seriesFetched": "180",
        "executionTimeMsec": 23
      }
    }
  },
  "restoredGrafana": {
    "observedAt": 1792944836935,
    "queries": {
      "health": {
        "status": "success",
        "data": {
          "resultType": "vector",
          "result": [
            {
              "metric": {
                "__name__": "puni_dev_observation_health",
                "environment": "dev",
                "exported_job": "puni-dev-probe",
                "instance": "collector:8889",
                "job": "dev-probe",
                "otel_scope_name": "puni-dev-observation-health",
                "service": "be-01",
                "state": "complete"
              },
              "value": [1792944836.889, "1"]
            }
          ]
        }
      },
      "age": {
        "status": "success",
        "data": {
          "resultType": "vector",
          "result": [
            {
              "metric": {
                "environment": "dev",
                "exported_job": "puni-dev-probe",
                "instance": "collector:8889",
                "job": "dev-probe",
                "otel_scope_name": "puni-dev-observation-health",
                "service": "be-01"
              },
              "value": [1792944836.903, "33.87100005149841"]
            }
          ]
        }
      },
      "revision": {
        "status": "success",
        "data": {
          "resultType": "vector",
          "result": [
            {
              "metric": {
                "__name__": "puni_dev_revision_info",
                "environment": "dev",
                "exported_job": "puni-dev-probe",
                "instance": "collector:8889",
                "job": "dev-probe",
                "otel_scope_name": "puni-dev-probe",
                "otel_scope_version": "ab4f7cf6e3023f2f2851bbf85dfb920c7de0859d",
                "revision": "2cc76418d848c8833c81f524ef269928015318f2",
                "service": "be-01"
              },
              "value": [1792944836.91, "1"]
            }
          ]
        }
      }
    },
    "dashboardPanels": 14,
    "oldDefaultPreserved": true,
    "activeAlerts": [],
    "originalReceipt": "removed",
    "activeReceipt": "applied"
  },
  "screenshots": {
    "puni-dev-real-kibana-waterfall.png": "6ebdb70c2a5fd0302cd1f7fe898a170e7efa4b9c702b882453e1b0adf9949836",
    "puni-dev-grafana-current.png": "65ac8a762035e271d41cf2782666b96ef43565c825506314a39153c5d5f82d09",
    "puni-dev-grafana-storage.png": "d7e4ae92a5acad01daf210d9e442e706703cee876977b7d496a341a56f30b90e"
  }
}
```

</details>
