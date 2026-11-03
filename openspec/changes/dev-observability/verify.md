## Historical deployment evidence — 2026-10-25

The deployment observations below describe their recorded dates. They are retained
historical evidence, not a fresh runtime or delivery claim by the 2026-11-03 source
integration. The latest local integration scope is recorded at the end of this file.

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

## Historical authorized Slack receiver rendering — 2026-10-29

The four receiver records below are imported historical evidence from reviewed
commits `6a058008077aed53c9c3aaf6499932fd2df6879c` and
`18a49644572da5e6f987a249c47c6cf9d927ce08`. Their pending-state statements describe
2026-10-29; the 2026-11-03 integration does not refresh or repeat remote operations.

This follow-up is part of bound-registry-storage Task5.1, on the owning
observability source lineage5d27b7de430c61dc0317ed9ab530a4d8a59e8c78.
The registry worktree lacks this deployed renderer, so a separate managed checkout
at /home/df/.codex/worktrees/3005/puni-00 preserves that source ownership without
merging unrelated changes or altering the registry maintenance worktree.

Baseline configured project tests passed334/334. The new15-case receiver regression
initially passed11and failed4: normal rendering reset to local-only, and local
fallback, nested routes and proxy overrides could pass the old boundary. Normal
rendering now pins slack-puni/#puni-alerts, recovery notifications and the existing
persistent secret-file reference. It emits no webhook value. The exact policy also
refuses missing/foreign/extra notifications, inline URLs and alternate transports.
The existing unapproved-webhook test continues to pass.

Removing the actual recipient policy guard made all14refusal cases falsely emit
deployment files; the positive render case still passed. Original/mutated sources,
final test source and raw logs are preserved under /tmp/task10-slack-persistence/.
The adjacent Proof comment names the observed renderer scope. Final comment/JSDoc
transfer emits identical runtime to the omission-tested source and detects an
injected effect. No notification was sent by these tests.

With an Nx project graph generated, uncached project lint, forced-build typechecking,
package build, changed-file formatting and strict dev-observability validation all
exited0. The first uncached Nx test run had341passes/8failures because an unrelated
Bun process occupied127.0.0.1:3100 and127.0.0.2:3100. Read-only identity audit located
PID2857476 in /home/df/.codex/worktrees/f7f1/puni-00/tools/tool-remote-scripts; it was
not stopped or modified. After fresh socket inspection showed the ports free, a
single new uncached run passed349tests, zero failures,640assertions across12files
in9.12seconds, with33source/config pins unchanged. Nx's flaky-task warning refers
to that retained earlier collision. The failed run is not certified as passing.

Read-only validation used the running Alertmanager0.34.0 image pinned at
sha256:690c7b525f4367aa91f73e2f91c632206d32e97c6384bdbf2fb7a861b420340d.
amtool check-config accepted the candidate, but also accepted nonexistent and
unreadable api_url_file paths. Therefore its zero exit does not prove secret
availability. This is a concrete pending deployment dependency, not a successful
missing-secret guard proof. Read-only status comparison confirmed the candidate's
receiver/channel/secret reference/recovery flag match the currently loaded route;
other differences were loaded defaults. No webhook value was printed, secret
changed, message sent, configuration reloaded or service restarted.

The renderer is implemented locally, but owned release/adoption and a separate
actual protected-file readiness check remain unimplemented/unverified. Existing
runtime snapshot checks pin immutable a1ffe27e7/c811f34bf manifests; do not change
expected hashes merely to hide the prior manually configured receiver's drift.
The two new authorization follow-up tasks remain unchecked pending complete review
and live adoption. The broader registry Task5.1 still needs warning/cutoff/failure
and independent five-minute missed-report delivery; this change does not satisfy
those scenarios or activate registry safeguards. No exact-SHA host gate or final
integration review has run for this follow-up.

## Protected Slack secret readiness — 2026-10-29

The authenticated h3runtime snapshot now requires the fixed protected Slack secret
reader before emitting slackSecret:verified. It chooses exactly one inspected
running Alertmanager container, checks project/service and64hex ID, and requires
its single writable named Alertmanager volume. Docker execution uses that captured
ID, not a name that could select a recreated container. The reader opens only the
fixed secret, requires canonical descriptor path and UID:GID65534:65534/mode0600/
single-link metadata, reads at most1025bytes, then requires at most1024bytes and
one exact authorized-workspace URL plus newline. Its command has an eight-second
deadline. Only a marker enters snapshot output; no webhook bytes do.

The TypeScript snapshot boundary requires that exact marker and exposes it with
the existing sixty-second observation expiry. Old/invalid/missing claimed evidence
refuses. The test fixture's new marker models this updated contract; it is not a
retroactive claim that the older captured snapshot checked a secret.

Initial readiness regressions demonstrated five cases of absent/invalid evidence
being accepted. The first strengthened18-case test run had1pass/17failures before
the helper existed; negative tests require actual reader invocation, so missing
functions cannot satisfy them. A later container-identity regression initially
miscalled the old signature; its corrected harness executes that old real reader
and reproduced11pre-effect failures. The final33new tests cover the actual Python
helper/shell reader with ordinary files, container/mount refusals, exact snapshot
field expression and TypeScript validator. Only Docker transport/path and UID:GID
role are modeled in those filesystem tests; actual host identity is separate.

Eleven exact omissions fail the actual tests: uniqueness, container identity,
persistent mount, regular-file kind, canonical path, metadata, length, format,
read cap, snapshot call and schema marker. Most permit false certification or an
unapproved execution. Kind-check removal blocks on an actual owned FIFO; the test
kills/reaps only its own new session/group after an independent one-second bound.
Read-cap removal exceeds1025bytes before later refusal. Neither of those two is
called successful false certification. The missing and unreadable file tests use
separate real filesystem faults. Adjacent Proof comments name these scopes.
Python AST equality after removing only proof-comment lines and complete emitted
TypeScript equality establish final comment transfer, with injected-effect controls.

Read-only execution of the final reader against the live existing container passed
at2026-10-29T21:05:41Z, returning only verified and notificationSent:false. Its
full source SHA256 was f042435f1b36ed7fd5ae73511b75cce7583637078c685979276b83e13708a76a.
No secret, mounted configuration, service or notification destination was changed,
and no message was sent. This proves current protected-file material/readability;
it does not prove webhook delivery or new-release adoption.

Uncached project lint, forced-build types, package build, formatting and strict
OpenSpec validation exited0. A host listener again occupied3100 and was left alone.
A private-network test attempt kept user-namespace capabilities and failed three
unreadable-file checks; its379passes/3failures are retained and not certified.
The corrected runner preserves UID1000, enables only its private loopback, drops
all effective/permitted/inherited/bounding/ambient capabilities and sets no-new-privs
before testing. Full uncached Nx tests then passed382, zero failures,758assertions
across13files in9.87seconds. All49package input/config pins remained unchanged.
A post-run lsns audit found no remaining process in its namespace4026533438. The
host network and its unrelated listener were never modified. Nx's flaky warning
retains the earlier failed test history.

Artifacts are under /tmp/task10-slack-secret/: original sources, failed/final tests,
11omission cases, transfer checks, live receipts, zero-capability receipt,
namespace audit and uncached checks. New owned release/immutable-manifest
reconciliation, final review/gate and actual redeployment persistence still remain.
The older local-only mounted release's manual Slack change must not be hidden by
rewriting expected manifest hashes. The broader registry warning/cutoff/failure and
independent five-minute missed-report delivery scenarios also remain open.

## Versioned Slack release ownership — 2026-10-29

The new pure notification release renderer emits exactly the authorized Alertmanager
config, a retained-volume Compose overlay and a strict manifest at
releases/slack-<full40hexsource>. Source metadata is provenance, not proof of Git
review, gating or apply authorization. Runtime validation now requires measured
notificationRelease evidence: exact source-directory/mount relationship, strict
schema and both declared/measured hashes equal to current trusted rendering. A
host-consistent forged manifest alone refuses. Both original release inventories
and all existing ownership/preservation checks remain required.

The h3 producer derives that evidence from the actual inspected running owned
Alertmanager and its read-only config bind mount. It shares the existing container
and persistent-volume selector with the secret reader. It reads only the three
fixed files, requiring regular/canonical/singly-linked identity, monitoring-root
UID/GID and mode0644. NOFOLLOW/NONBLOCK opens, a64KiB size bound,65537byte read cap,
post-read length refusal and finally-close bound its effects. Missing/unreadable
files raise distinct real filesystem errors. Modeled UID/GID and concurrent-growth
faults are explicitly distinguished from actual ordinary-file/link/FIFO tests.
The runtime fixture's new release is modeled, not historical live adoption.

Five actual preflight regressions reproduced the prior missing release validation:
15existing module tests passed and5new tests failed before caller integration.
The first filesystem test harness mistakenly used Bun.spawnSync input instead of
stdin, so its27failures were harness failures, not a production-path RED. That
attempt remains recorded. Corrected stdin execution, actual ordinary files and
reader/snapshot-field tests pass. Two test type errors and import/stringification
lint findings were corrected without weakening validation.

Twenty-one exact omissions break actual tests: shared container uniqueness,
identity and persistent volume; file kind, canonical path, metadata, size, length,
NOFOLLOW, NONBLOCK, read cap and close; config mount and versioned path; snapshot
reader call; renderer source format; observation schema, mounted path, trusted
hash comparison and runtime caller. Most admit untrusted evidence. Size/read-cap
omissions instead perform excess reads before later refusal; NOFOLLOW omission
opens a symlink before canonical refusal; close omission leaves real descriptors
open until test-process exit. NONBLOCK omission blocks on an actual owned FIFO;
the supervisor kills/reaps only its own session/group. These effects are not
misreported as successful complete-release certification. All11existing secret
omission proofs also fail again after the selector refactor. Adjacent production
Proof comments name these scopes; Python AST/complete emitted TypeScript equality
and injected-effect controls transfer the proofs to the final comments.

Fresh read-only inspection at2026-10-29T21:18:52Z found only the original a1ffe27e7
alertmanager.yaml drifting:7534aa9ee55fec911dc18f1e72917659bfe3bc5dc12a1d8a7795252ccbbc70a4
matches the Slack setup receipt. Its saved pre-Slack backup matches the original
manifest expected hash ed705c05334fd3363b5f0a9c258444433c3134a70e2efa53ce13f1b8e09b0496.
Both original manifests remain unchanged; c811f34bf has no file drift. The active
config is still mounted from a1ffe27e7. Root/release ownership was1001:1001 and the
config/manifest files were0644/single-link. The runbook preserves the old manifests,
moves only Alertmanager before restoring its unmounted original config, and
requires a second recreation/delivery proof for persistence.

Actual h3 Compose5.5.0 read-only merge validation at21:37:15Z retained the exact
persistent Alertmanager volume and all5other services; only its readonly config
mount changed. This used a modeled40a candidate identity and did not stage or
apply a release. Final live reader execution at21:43:22Z verified the protected
secret through the same captured container ID, then refused the old unowned
mount with the expected versioned-release error. Source SHA256 was
63f6bfbbfeba5082a3c3229a93720cefe7509e4bf20d7e8fd0a53a0ea8107fe5.
No webhook value was printed, notification sent, file replaced or service restarted.

Full uncached Nx tests passed434, zero failures,886assertions across15files in
13.22seconds with60named package/root-config/doc pins unchanged during the run.
They used UID1000 in a temporary private network namespace, all five capability
sets zero and no-new-privs enabled. Fresh post-run lsns audit found no process in
its exact net:[4026533446] namespace. Final lint initially rejected one test type
alias spelling; changing it to interface produced identical complete emitted test
runtime with an injected-effect control. The434-test claim is bound through that
transfer rather than a repeated test run. Final uncached lint, forced-build types,
package build, format and strict OpenSpec validation all passed on stable inputs.

All raw attempts, final sources,32omission cases, transfer checks, live/Compose
receipts and uncached checks are retained under /tmp/task10-slack-release/.
Covering manifest /tmp/task10-slack-release-covering.json has284pins and SHA256
006b40b712a50a92284b527782acceb0374811984afc6ea52e06ed13f8dd98ec.
Its scope excludes this append-only verification record. Existing prior capsules
remain historical after intentional owning-source edits. Local implementation is
validated; exact-SHA host gate, final integration review, staged ownership adoption
and actual firing/recovery delivery across recreation are still pending. Follow-up
tasks4.1/4.2 and registry Task5.1 remain unchecked. No registry safeguard activation,
Victoria retirement, provider physical-budget resolution or product migration is
claimed.

## Host-gate refusal and fixture layout repair — 2026-10-29

The canonical h4 gate ran exact source
`6a058008077aed53c9c3aaf6499932fd2df6879c` as `puni1` in its clean gate tree.
Its durable terminal receipt ended at23:35:24Z with exit1; the unit was failed,
MainPID0 and its control group empty. This is a failed gate, not an active or
successful one. `twilight-burokrat:test` reported2503pass/11fail. The production
pilot rejected `tools/tool-observability-stack/test/fixtures/runtime.json` because
both test and fixture selectors matched; ten later negatives stopped at that same
classification error before their intended boundaries. No monitoring transition
was applied.

The production `classify-candidate committed` command reproduced this exact
failure with the extracted full-policy classification section. Initial attempts
passed the outer policy instead of its classification section, then encountered
sandbox object-store permissions using working selection; those are diagnostic
command failures, not additional safety witnesses. Bootstrap/code-policy whole-tree
runs are also outside their intended scopes and remain failed observations.
Moving the unchanged fixture to the package's `fixtures/runtime.json` and updating
its three imports made production full-policy working classification exit0.
No policy, classifier or safety guard was relaxed. Fixture SHA256 remained
`9b518d4d79ec11e00501880df258a5eda917545239ee0a119207906b5aa69943`.

Fresh uncached monitoring tests passed434, zero failures,886assertions across15files
in12.46seconds. All60 named package/config/doc pins stayed unchanged during each
scoped check. Lint, forced-build types, formatting and strict OpenSpec validation
passed. The tests ran asUID1000 with private loopback, zero capabilities and
no-new-privs; post-run lsns inspection found no remaining visible process in that exact namespace.
A direct all-process audit hit protected PID1 and failed; it is not evidence.
Only three test imports and the fixture location changed from the prior validated
implementation; production code is unchanged. The affected production pilot,
new exact-SHA host gate, integration review and live ownership/persistence remain
pending. Evidence: `/tmp/task10-slack-fixture-layout/`; failed gate log SHA256
`48c223d8bac33dc492f4f19c271894a7d7c0d8167899833dc9865afd16c91f76`.

## Maintained-source receiver integration — 2026-11-03

This is a local source integration for the registry monitoring prerequisite, based
on clean maintained-main `f6b2fec3326caa7cd23a71d76b3a36ce2ad613d3`. Applied reviewed
commits `6a058008077aed53c9c3aaf6499932fd2df6879c` and
`18a49644572da5e6f987a249c47c6cf9d927ce08` in that order without importing their
ancestors. No dependency, architecture or provider change was needed. At integration
checkpoint `422c38a736e6b588bdff8995cfc08e516452e177`, the receiver,
protected-secret reader, immutable notification-release reader/validator and their
tests/fixture matched the reviewed source exactly. The fix-round record below
identifies the later intentional mounted-content correction. Current-main's
ephemeral-loopback source-test transport and package-level fixture location are
preserved.

Frozen `bun install --frozen-lockfile` succeeded with Bun 1.4.4. The inspected owning
project baseline passed 337 tests, zero failures, 651 assertions across 11 files.
Before integration, a focused `bun -e` assertion parsed the actual
`renderDevConfiguration()['alertmanager.yaml']` output and failed with actual
`local-only`, expected `slack-puni`. The identical command passed after integration,
including the sole receiver/notification, #puni-alerts, recovery flag, persistent
secret-file reference and absence of an inline webhook. No real secret was read.

Fresh scoped verification:

```sh
NX_DAEMON=false bunx nx run tool-observability-stack:test --skip-nx-cache
NX_DAEMON=false bunx nx run tool-observability-stack:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-observability-stack:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-observability-stack:build --skip-nx-cache
bunx openspec validate dev-observability --strict --json
git diff --check HEAD
```

The project tests passed 437, zero failures, 918 assertions across 15 files in
20.64 seconds. Lint, forced-build typechecking, package build, scoped changed-file
Prettier checks and strict owning-change validation passed. Lint emitted only the
Node warning that FORCE_COLOR overrides NO_COLOR. Test collection is restricted
to this package: HTTP uses owned loopback listeners, SSH/Docker transports are
fixtures, and Python/shell readers use owned ordinary files. No root/remote test,
provider request, live secret-file read or notification occurred.

At that original integration checkpoint, reviewed production guards/callers and
adjacent Proof comments were unchanged; the dated omission evidence above remained
historical rather than a newly repeated mutation suite. Fresh tests included real
missing/unreadable file negatives and actual runtime preflight validation. Integration-only documentation changes fix
the notification renderer's full repository path and label dated deployment
observations as historical. Raw local logs and the exact focused assertion are in
`/tmp/registry-monitoring-source-integration-20261103/` and the local SDD task report.

Full host gates, whole-repository/remote/root/native-registry tests, live adoption,
notification delivery and recreation/persistence drills were not run in this
source-only slice. They are not established by these local results. Neither the
broader registry Task 5.1 nor the live receiver tasks are closed here.

## Fix round 1: measured mounted config bytes — 2026-11-03

Review I1 found that hashing Docker's host Source pathname could certify trusted
replacement bytes while Alertmanager's file bind mount retained a different
predecessor inode. On base `422c38a736e6b588bdff8995cfc08e516452e177`, the focused
`bun test tools/tool-observability-stack/src/dev/notification-files.test.ts
--test-name-pattern 'host replacement'` regression failed twice: both the production
reader and actual snapshot expression returned success. The fixture opens a real
owned predecessor, atomically replaces its host pathname with trusted config, and
observes different predecessor/replacement hashes. Docker's checksum transport is
modeled; this is not a live-container bind-mount proof.

After all existing host release checks, the production reader now invokes only
`sudo -n docker exec <captured-container-id> sha256sum /etc/puni/alertmanager.yaml`
through the existing eight-second `run` adapter, without a shell or config output.
It refuses missing/failed/timed-out checksum dependencies, absent/malformed/
ambiguous fixed-path output and disagreement with the verified host config hash.
The snapshot schema, trusted-rendering comparison and all host ownership/mode/link/
path/size/read limits remain required. The protected-secret reader is unchanged.
The focused reader suite then passed 41 tests, zero failures, 152 assertions.

Seven deliberate source mutations produced the intended failures before restoration:

| Mutation                                           | Actual production-path witness                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Remove checksum-format guard                       | Wrong-path and duplicate checksum responses both falsely returned success; two snapshot-expression regressions failed |
| Remove mounted/host hash comparison                | Both actual host-replacement regressions falsely returned success; two tests failed                                   |
| Replace container observation with the host hash   | Successful production path omitted the required checksum request; one test failed                                     |
| Use container name instead of captured ID          | Exact modeled transport refused the changed identity; successful production-path test failed                          |
| Use foreign config path or command                 | Exact modeled transport refused each changed argv; each successful production-path test failed                        |
| Change adapter deadline from eight to nine seconds | Modeled transport refused the changed bounded invocation; successful production-path test failed                      |

Adjacent Proof comments describe these separate fault scopes. Raw mutations,
commands, hashes and failed assertions are retained in
`/tmp/registry-monitoring-source-integration-20261103/fix-round-1/omissions.json`
and sibling named source/log files. Restored production Python SHA256 is
`a4cba13dda1c012b87ecf2844ec732dfa24aa88689898670ab36c4e7c7e2fa18`.
This fix intentionally differs from the reviewed upstream: runtime-snapshot.py
adds the observation and two predicates, notification-files.test.ts extends the
owned-file/model transport coverage, and notification-release.ts updates JSDoc.
Earlier upstream-equality receipts apply only to integration checkpoint `422c38a73`.

Fresh owning-project checks ran once, with only the conflicting NO_COLOR variable
unset to remove the previously disclosed Node tooling warning:

```sh
env -u NO_COLOR NX_DAEMON=false bunx nx run tool-observability-stack:test --skip-nx-cache
env -u NO_COLOR NX_DAEMON=false bunx nx run tool-observability-stack:lint --skip-nx-cache
env -u NO_COLOR NX_DAEMON=false bunx nx run tool-observability-stack:typecheck --skip-nx-cache
env -u NO_COLOR NX_DAEMON=false bunx nx run tool-observability-stack:build --skip-nx-cache
```

All four exited zero. Tests passed 448, zero failures, 969 assertions across 15
files in 21.54 seconds. Lint output was clean. Forced typechecking and package-asset
build passed. Affected formatting and strict owning-change validation accompany
the local fix commit; exact commands and receipts are in the appended task report.
No unrelated toolchain code or dependency changed.

Actual installed checksum-tool availability, live-container mounted-file
measurement, host gates, loaded policy, live adoption, notification delivery and
recreation remain unverified. No real Docker/sudo/root/remote/namespace/native
registry action was run, and no live secret was accessed. No parent/live task is
closed by this source-only correction.
