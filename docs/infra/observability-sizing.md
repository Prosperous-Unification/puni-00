# Observability capacity plan

Planning basis: 2026-10-31, implementation `49857aa2903fa56feea389211a36624c26bbdb19`, evidence checkout `6aebc4b70935a693749ec62dba4cb0fd800a5808`. These budgets cover the current one-replica dev and retained-production instances. They are proposed allocations for hardware selection; they do not authorize a resize or establish runtime admission. The existing Compose services and all history remain preserved.

Keep Flux, cert-manager and ingress on h4claw, and plan the monitoring services/stores on h3mon. For that placement, **64 GiB-class RAM, a proposed 32-vCPU migration profile and at least 456 GiB of service-usable filesystem capacity** cover the migration proposal below. Prefer a **600 GB or larger disk**; 512 GB does not meet the reserve example. Normal operation alone has a smaller budget. Use a separate **128 GiB-class, 24-or-more-vCPU rehearsal host with at least 408 GiB service-usable filesystem capacity**, then verify the actual guest capacity. A 512 GB disk is a candidate for that fresh lab. If all platform controllers move onto the monitoring host, its migration RAM budget increases.

## Budget summary

RAM minima mean guest-visible `MemTotal`, including the reserves listed below. Disk minima exclude filesystem-reserved bytes and include 20% unallocated capacity. GB is decimal; GiB is binary.

| Scenario                                                                       | RAM before free margin | Guest RAM minimum, 20% unused |               Service-usable disk minimum | Practical candidate to verify                                                    |
| ------------------------------------------------------------------------------ | ---------------------: | ----------------------------: | ----------------------------------------: | -------------------------------------------------------------------------------- |
| Normal dev + retained-production pair on h3mon                                 |              25.19 GiB |                     31.49 GiB |                                340.40 GiB | 64 GiB RAM / 512 GB disk                                                         |
| Migration, old dev running, one complete first replacement wave, reused claims |              47.88 GiB |                     59.85 GiB |                                455.40 GiB | 64 GiB RAM / 600 GB+ disk                                                        |
| Same migration retaining a second complete set of claims                       |              47.88 GiB |                     59.85 GiB |                                630.40 GiB | 64 GiB RAM / 1 TB disk; extra concurrently running instances need additional RAM |
| Normal pair plus all platform controllers on the same host                     |              31.19 GiB |                     38.99 GiB | Recalculate platform writers/claims there | 64 GiB RAM; placement changes the disk budget                                    |
| Migration with those controllers and their replacement wave                    |              59.88 GiB |                     74.85 GiB | Recalculate platform writers/claims there | 96 GiB+ guest RAM; 128 GiB-class candidate                                       |
| Full rehearsal, fresh isolated host                                            |              63.44 GiB |                     79.30 GiB |                                407.27 GiB | 128 GiB-class RAM / 512 GB disk                                                  |

The normal and migration disk columns retain h3mon's entire current 23.314 GiB used allocation. An existing-host rehearsal instead needs 436.41 GiB service capacity with h3mon's preserved bytes, or 458.29 GiB with h4claw's. Existing workloads would also need their own RAM/CPU allowance. The fresh-lab row avoids that overlap.

These are capacity targets, not a verified vendor SKU, price, stock level or performance guarantee. A nominal 64 GiB plan must expose at least 59.85 GiB guest RAM for the migration proposal. A nominal 512 GB disk is only 476.84 GiB before formatting/reservations. With an illustrative 5% filesystem reserve, the h3mon migration requires about 479.37 GiB total filesystem size: 512 GB is insufficient; 600 GB is the more practical target.

For a concrete provider mapping, Hetzner's [published General Purpose specifications](https://www.hetzner.com/cloud/general-purpose/) list CCX43 as 16 vCPU / 64 GB RAM / 360 GB disk, and CCX53 as 32 vCPU / 128 GB RAM / 600 GB disk. The former does not meet this migration disk/profile proposal; the latter is a candidate to inspect for the combined resource targets. This is a specification comparison, not confirmed regional stock, account eligibility, price or an instruction to order. The budgets remain independent of those vendor names. A CPU/RAM-only rescale does not solve the disk shortfall; retaining disk size preserves future downgrade options under the [provider's rescale contract](https://github.com/hetznercloud/cli/blob/main/docs/reference/manual/hcloud_server_change-type.md).

## Fresh existing-host baseline

Read-only observations at 2026-10-31 13:48–13:50 UTC used the existing pinned operator transport and verified fleet machine/daemon identities. No Secret values, container environment, private key material or database contents were exported.

| Observation                  |                             h3mon |                                                           h4claw |
| ---------------------------- | --------------------------------: | ---------------------------------------------------------------: |
| Logical CPUs                 |                                 8 |                                                                8 |
| Guest RAM total / available  |               15.237 / 11.588 GiB |                                              15.237 / 11.641 GiB |
| Root filesystem total / used |              149.869 / 23.314 GiB |                                             149.885 / 40.817 GiB |
| Available to services        |                       120.432 GiB |                                                      102.917 GiB |
| Filesystem-reserved space    |                         6.123 GiB |                                                        6.151 GiB |
| Running Docker workloads     | 13, finite limits totalling 8 GiB | OpenHands, no finite memory/CPU bound through observed ancestors |

`/var/tmp` and Docker share the root device on each host, so their free bytes cannot be added. h3mon's seven retained services account for 2,560 MiB of Docker limits; its six old dev services account for 5,632 MiB. All remain running now. The eventual normal budget excludes only the six old dev processes after a separately reviewed successful cutover; their storage remains charged.

Kubernetes reports both nodes Ready. The only current h3mon Pod is CoreDNS, with a 170 MiB memory limit. h4claw hosts Flux, cert-manager, ingress, registry and website workloads. Several current platform Pods have missing limits; they have not yet adopted the proposed source bounds. Its registry 50 GiB and website 2 GiB claims are Bound. This inventory establishes current placement, not readiness for the new stack. OpenHands and unbounded platform demand prevent treating spare h4claw RAM as an independently bounded lab reservation.

## RAM and CPU accounting

Use `max(sum(application containers), each ordinary init)` per Pod; do not sum serial init containers as simultaneous processes. Generated reloaders add 128 MiB of limits per instance to the previous seven-main-container subtotal. The provider-derived memory-backed config volume bound is inside its Pod's memory accounting; it is not added again. Actual cgroup/tmpfs enforcement still needs runtime observation.

| Steady source contributor                                                                              | Request MiB |  Limit MiB |
| ------------------------------------------------------------------------------------------------------ | ----------: | ---------: |
| Dev: Elasticsearch, Kibana, Prometheus/reloader, Alertmanager/reloader, signal collector/gateway/proxy |       4,864 |      6,016 |
| Retained production: same roles, 4 GiB Elasticsearch                                                   |       6,912 |      8,064 |
| ECK and Prometheus operators, one owner each                                                           |         214 |        768 |
| Node exporter, kube-state-metrics, platform OTel and blackbox exporter                                 |         240 |        704 |
| Velero server and one node agent                                                                       |         256 |      1,536 |
| **Monitoring node source total**                                                                       |  **12,486** | **17,088** |
| Flux, four controllers                                                                                 |         256 |      4,096 |
| cert-manager, three controllers                                                                        |         384 |      1,536 |
| Traefik, one node                                                                                      |         128 |        512 |
| **Source total if all co-located**                                                                     |  **13,254** | **23,232** |

These quantities follow the [shared instance composition](../../tools/tool-fleet/src/observability-composition.ts), [signal workloads](../../tools/tool-fleet/src/observability.ts), [monitoring release](../../infra/platform/observability/prometheus/kube-prometheus-stack.yaml), [ECK operator](../../infra/platform/observability/eck/eck-operator.yaml), [platform collector](../../infra/platform/observability/otel/collector.yaml), [Velero](../../infra/platform/backup/velero/production/velero.yaml), [Flux](../../infra/platform/flux/install.yaml) and [networking definitions](../../infra/platform/networking). Retained pinned render/provider facts were reconciled against current owning source; subsequent agent policy changes affect ephemeral storage, not these RAM/CPU quantities.

DaemonSets are per node. A second node can add another 1,920 MiB of source limits for Traefik, node exporter, OTel and Velero node agent. Count each on its actual host, with Traefik included only once. Neither a second store instance nor a shared operator makes agents free.

The following additional allocations are **proposed planning policy**, not measured peaks or existing enforced caps:

| Allocation                                                        |                                                          Normal/migration |                            Full isolated rehearsal |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------: | -------------------------------------------------: |
| Linux, runtime, node services, storage/network helpers and caches |                                                                     4 GiB | 6 GiB, including k3s control plane and k3d helpers |
| Read-only/admission metadata and ancillary memory                 |                                                                     1 GiB |                                              2 GiB |
| Aggregate periodic maintenance Jobs                               |                                                                     1 GiB |               Included in source lifecycle charges |
| Preserved seven-service Docker stack                              |                                                                   2.5 GiB |                               None on a fresh host |
| Old six-service dev stack during migration                        |                                                                   5.5 GiB |                               None on a fresh host |
| Aggregate extra transfer/rollback workers                         |                                                    4 GiB during migration |                 4 GiB image/import/archive workers |
| First replacement wave                                            | 13,504 MiB during monitoring migration; 19,648 MiB if platform co-located |               Included in source lifecycle charges |

Normal RAM is `17,088 + 2,560 + 4,096 + 1,024 + 1,024 = 25,792 MiB`. Migration adds `5,632 + 4,096 + 13,504 = 23,232 MiB`, giving 49,024 MiB. Divide each by `0.8` to leave 20% of total RAM unused; multiplying by 1.2 would leave less than 20% free.

The retained full-rehearsal ledger's 49,984 MiB counts complete conditional replacement/retry/history scenarios. It is not measured simultaneous RAM. Its omitted known OTel/Velero node-agent roles add `2 × (320 + 1,024) = 2,688 MiB`, giving 52,672 MiB of named source-role allocation. Add lab policy allocations of 6,144 + 4,096 + 2,048 MiB, then divide by 0.8: **79.296875 GiB**. Keeping this conservative scenario avoids assuming failed generations have already disappeared. A smaller phase-aware peak would need a separately verified execution/concurrency contract; it is not assumed here.

These lifecycle allocations cover one immutable-source operation, the retained ledger's declared retry/history horizon and one first replacement wave. Native StatefulSet same-ordinal replacement assumes reachable cooperative controllers and no duplicate execution. Forced deletion, lost-node execution, additional Helm/Flux generations or further retained attempts require additional allocation and fresh admission. No cleanup or termination timing is assumed merely to lower the budget.

Monitoring source CPU requests total 2.94 cores; co-located platform increases that to 3.54. Full-rehearsal conditional slots request 9.07 cores. CPU limits total 19.9 / 28.9 / 82.6 cores respectively and can be overcommitted; they are not required physical core counts. Preserved Docker quotas total 5.75 cores, or 12.75 with the old dev stack, without scheduler reservations. Proposed starting profiles are **16 vCPU normal, 32 vCPU for conservative migration overlap, and 24 vCPU for the isolated lab**, with aggregate copy/import workers capped at two cores and two cores reserved for host work. These profiles require measured ingest/query/backup latency and throttling checks; no throughput SLO or benchmark currently proves them necessary or sufficient.

## Disk accounting

| Active stores                |        Dev | Retained production | Disposable rehearsal pair |
| ---------------------------- | ---------: | ------------------: | ------------------------: |
| Elasticsearch                |     10 GiB |             100 GiB |                    20 GiB |
| Prometheus                   |     10 GiB |              10 GiB |                    20 GiB |
| Alertmanager                 |      1 GiB |               1 GiB |                     2 GiB |
| Collector and gateway queues |      4 GiB |               4 GiB |                     8 GiB |
| **Instance total**           | **25 GiB** |         **115 GiB** |                **50 GiB** |

The permanent pair needs 140 GiB of new claims. The rehearsal adds a 50 GiB registry and 20 GiB local object store, making 120 GiB active claims. Its raw 130 GiB descriptor also sees a disabled controller-only Prometheus template; that dormant 10 GiB is not active allocation. See [composition policies](../../tools/tool-fleet/src/observability-composition.ts), [queue claims](../../tools/tool-fleet/src/observability.ts), [registry](../../infra/platform/registry/base/registry.yaml) and [local object store](../../infra/platform/backup/local/object-store.yaml).

Proposed additional disk allocations on h3mon are:

| Category                              | Normal pair |   Migration | Basis                                                                                                                                                  |
| ------------------------------------- | ----------: | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New claims                            |     140 GiB |     140 GiB | Full source reservations                                                                                                                               |
| New runtime images/content/snapshots  |      32 GiB |      48 GiB | 12 GiB content + 20 GiB expanded tier; another 16 GiB during overlap                                                                                   |
| Pod ephemeral storage and logs        |      16 GiB |      28 GiB | Conservative known steady contributors 11.875 GiB plus two 64 MiB periodic contributions leave 4 GiB for bounded ancillary work; migration adds 12 GiB |
| Host journal and retained Docker logs |       8 GiB |       8 GiB | Proposed journal 2 + other host logs 6                                                                                                                 |
| Host collector queue/checkpoints      |       2 GiB |       2 GiB | Separate hostPath writer; not covered by its ephemeral limit                                                                                           |
| Serial backup/transfer cache          |       8 GiB |       8 GiB | Outside charged Pod scratch                                                                                                                            |
| OS/runtime and preserved-store growth |       8 GiB |       8 GiB | Proposed 4 + 4; original bytes already retained                                                                                                        |
| Future new-store growth contingency   |      35 GiB |      35 GiB | 25% of candidate claims; does not expand current PVCs                                                                                                  |
| Export workspace and rollback archive |           — |      64 GiB | Separate 32 GiB caps; no compression/expansion ratio assumed                                                                                           |
| **Additional allocation B**           | **249 GiB** | **341 GiB** | Additional to preserved current used bytes                                                                                                             |

For a replacement disk, let `U` be all preserved used bytes, and `B` the additional allocation. Require `(U + B) / 0.8` **service-usable capacity**, after filesystem reserves. h3mon's `U = 23.314 GiB` gives 340.3926 GiB normal and 455.3926 GiB migration. For current-free-space comparison use `availableNow >= additionalDemand + freeMargin`; do not add used bytes again. Stopping a process earns no disk-space credit.

Count a reviewed reused claim once. A rollback with another whole pair of claim identities adds `D = 140 GiB`; a dev-only duplicate adds 25 GiB, a production-only duplicate 115 GiB. Migration becomes `(U + 341 + D) / 0.8`; `D=140` requires 630.3926 GiB service capacity on h3mon and makes 1 TB the practical disk class. Extra running replicas also require a separate RAM/CPU allowance. Repeated retained generations accumulate; this budget is for one declared operation, not unlimited restore attempts.

For the isolated rehearsal, retain 153.6875 GiB of historical complete-attempt source disk charges: 120 GiB claims and 33.6875 GiB accumulated Pod contributions. Add 4.125 GiB for initial/replacement collector and node-agent ephemeral limits, including their scratch once. Proposed remaining tiers are host/bootstrap 24, host runtime images 32, nested k3s images 32, archives/build/import 24, outer logs 12, host collector state 4, backup staging 16 and store-growth reserve 24 GiB. Total **325.8125 GiB**; divided by 0.8 gives **407.265625 GiB** on a fresh host. Host, nested runtime, registry and archive copies are separate writers; no deduplication credit is assumed.

The lab's 20 GiB MinIO store does not certify backing up full 50 GiB registry or 140 GiB production stores. Proposed fixture allocations are 12 GiB total backup objects, including metadata, and 16 GiB external staging. They are sizing assumptions, not changes to the required recovery/history corpus or acceptance criteria. If any required case exceeds them, enlarge and budget the destination/workspace; do not omit the case, shorten required history or reduce the source capacity policy. A full-size recovery test needs a larger/external destination and its own byte allocation. Existing production snapshots use remote S3; a full local database copy is not presumed.

## Operational prerequisites

Planning is complete for the declared placements and finite scenarios above. Every non-source tier remains a proposed allocation. The existing full-lab prerequisites of at least 16 GiB available RAM and 120 GiB active claims remain unchanged; passing either minimum does not satisfy the larger complete budget. Before creation or cutover, verify actual guest RAM, allocatable resources, complete effective Pods, device/claim ownership, aggregate worker concurrency/cgroups and the allocated writer limits. Queue counts, PVC requests, disk `emptyDir.sizeLimit` and ephemeral eviction thresholds do not by themselves prove hard physical quotas. Bind hostPath growth, image/cache retention, logs, copy/archive outputs and retained generations to the budget and fail visibly before exceeding it.

Use the existing [preflight and admission contract](observability-preflight.md). Current h4claw unbounded workloads remain outside any certified finite envelope. Sustained ingest, query, backup/restore, history retention and outage recovery must demonstrate that the proposed allowances are sufficient. Hardware selection does not remove those runtime checks, authorize persistent credentials or approve production activation. No workload, store, secret, graph, limit or capacity floor was changed to prepare this plan.

The owning OpenSpec [verification record](../../openspec/changes/observability-environment-parity/verify.md) records the source identities, read-only commands, arithmetic verification and independent review. Detailed per-role quantities, immutable input hashes, fresh host projections and reproduction scripts are retained in the existing private evidence ledger.
