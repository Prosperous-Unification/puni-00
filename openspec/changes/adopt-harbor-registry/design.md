## Context

The platform registry is Distribution 2.8.3 at `registry.puni.internal:5000` on h4claw, with TLS,
htpasswd and one 50 GiB local-path PVC on the host root disk
([registry operation](../../../docs/infra/registry.md)). The PVC request is not a limit. The only
image in it is the activation proof. Website images are on GHCR and WBS keeps its own registry.

Bounded storage, retention and maintenance were designed as a hand-built lifecycle in
[bound-registry-storage](../bound-registry-storage/proposal.md). That change has six open tasks
and nothing activated. On 2026-11-17 the owner decided to replace Distribution with Harbor and
to keep bespoke lifecycle code to a minimum. Zot was the considered alternative. This design
does not reopen that choice. It states what Harbor costs.

Facts this design rests on, with their source:

| Fact                                                                                                                                                                                 | Source                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| h4claw: 8 cores, 15,602 MiB RAM, no swap. During a gate: 3,741 MiB available, one `tsc` process at 5.8 GiB, load about 10.6. Root disk 150 G, 78 G free                              | Read-only measurement on 2026-11-17, supplied to this plan. Not re-run by the author                           |
| h4claw is the k3s server (`control-plane`, `product`, `ingress`) and a gate host. `puni_swap_file_mib: 0`                                                                            | `infra/ansible/inventory/production-existing-hosts.yml`, [gate hosts](../../../docs/infra/gate-hosts.md)       |
| Kubelet on h4claw: `system-reserved` 1536Mi, `kube-reserved` 512Mi, hard eviction at `memory.available<256Mi`, `nodefs.available<10%`, `imagefs.available<15%`                       | the same inventory, `infra/ansible/roles/k3s_server/templates/config.yaml.j2`                                  |
| Host pool on h4claw: budget is `nproc` and MemTotal in whole GiB; headroom pinned at 1 core and 5 GiB; a changed pinned field needs the ledger retired and the host re-enrolled      | [gate hosts](../../../docs/infra/gate-hosts.md), step 7                                                        |
| `gate` envelope: 6 GiB, estimated. The first h4claw gate reached `memory.peak` 6.93 GiB under that bound and was throttled. `gate` is not calibrated there                           | `infra/jobs/catalogue.json`, [gate hosts](../../../docs/infra/gate-hosts.md#launch-a-gate-on-h4claw)           |
| h3mon: agent with `observability` only, 15,602 MiB, 4 GiB swap for host services. Its planned observability graph requests 12,198 MiB at steady state and is not admitted in overlap | `infra/platform/observability/base/coexistence.json`, [enrollment](../../../docs/infra/enroll-h4claw-h3mon.md) |
| Production follows a pinned platform revision. The `observability`, `alerts` and `backup` stages are held                                                                            | [registry operation](../../../docs/infra/registry.md), "Identity and Flux ownership"                           |
| Pods never swap; host services may                                                                                                                                                   | `infra/ansible/roles/k3s_server/templates/config.yaml.j2`                                                      |

## Goals / Non-Goals

**Goals:**

- One self-hosted registry whose quotas, retention, garbage collection and robot permissions
  come from Harbor.
- A physical size bound that holds when Harbor's logical quotas do not.
- Configuration declared in Git, with drift detected.
- A backup and a restore drill before any consumer depends on it.
- A numeric memory decision before anything is installed on h4claw.

**Non-Goals:**

- Moving website or WBS images. Each is its own change.
- Scanning, SSO, replication, high availability.
- Removing lifecycle source. The removal change is named in decision 11 and not written here.
- Advancing the production platform source pin.

## Assumptions

The owner has seen H1 to H14. Each row gives the verdict, and the alternative with its cost.
Overrule any row by its id. H15 to H17 are new.

| Id  | Assumption as it now stands                                                                                                                                                                                           | Verdict                   | Alternative and its cost                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Harbor runs on the existing k3s cluster on h4claw. Flux installs it from the official chart, vendored as an archive, every image locked by digest. In production a fleet-owned Flux unit reads a pinned public commit | Kept, refined             | Advance the platform source pin. Cost: deploys every platform change merged since the pinned revision and unblocks held stages                                                                           |
| H2  | Trivy scanning is off                                                                                                                                                                                                 | Kept                      | Turn it on. Cost: 512Mi request and 1Gi limit by chart default, one more 5Gi volume, vulnerability-database downloads                                                                                    |
| H3  | Bundled database and cache, one replica each                                                                                                                                                                          | Kept                      | External PostgreSQL and Valkey. Cost: two services the platform does not run today. Harbor's documented backup covers the internal database only                                                         |
| H4  | Four bounded filesystems, 40 GiB in total: image store 34, database 4, job logs 1, cache 1. Project quotas sum to 23 GiB. The filesystem bound is the write cutoff                                                    | Changed (decision 3)      | One 50 GiB filesystem. Cost: a full image store stops PostgreSQL, so garbage collection cannot free it; and the root disk keeps 28 G free, 5.5 G above the kubelet's image-filesystem eviction threshold |
| H5  | Projects `website`, `wbs`, `platform`. Per project one push robot and one pull robot. No robot may delete. Pull robots reach the cluster as namespaced image pull secrets                                             | Kept, refined             | One system robot in each node's `registries.yaml`. Cost: a system-level robot with cross-project read, the class of account two of the October High advisories concern                                   |
| H6  | Retention: newest ten per repository, anything carrying a promotion tag, anything pushed in the last seven days. Untagged artifacts are not retained                                                                  | Kept, made exact (7)      | Unique immutable promotion tags. Cost: an immutable tag never releases, so the store only grows                                                                                                          |
| H7  | Garbage collection runs daily after one dry run                                                                                                                                                                       | Changed (decision 7)      | Weekly. Cost: a week of deleted bytes either keeps projects at their quota or sits on disk outside it; for the same disk margin quotas would have to sum to about half the filesystem (17 GiB)           |
| H8  | A Bun reconciler in `tool-fleet` applies the declared file through Harbor's API                                                                                                                                       | Decided (decision 6)      | The Terraform provider. Cost: robot secrets in Terraform state on a backend that has never run live; provider tested on Terraform 1.12 to 1.14 while the repository locks 1.16.3                         |
| H9  | Harbor serves `registry.puni.internal:8443` over HTTPS with the existing internal certificate, on h4claw's private address only. Distribution on `:5000` stops once Harbor's readiness receipts pass                  | Changed (decisions 5, 10) | Port 443 through Traefik. Cost: Traefik listens on host ports of the ingress node, so Harbor's API would answer anyone who sends the host name unless an allow-list is added and proven                  |
| H10 | Nightly backup of the database and image store to the existing bucket. A restore drill passes before any consumer moves                                                                                               | Kept, made exact (8)      | Velero, Harbor's documented path. Cost: the `backup` Flux stage is held in production; activating it is a wider platform step                                                                            |
| H11 | Only the activation proof image is migrated, by digest, with `crane` v0.22.1                                                                                                                                          | Kept                      | Harbor replication from a "Docker registry" endpoint. Cost: copies by tag and needs a stored credential for the old registry. Depends on pull request #936                                               |
| H12 | The hand-built lifecycle is frozen now. A separate change removes it after Harbor serves its first consumer                                                                                                           | Kept (decision 11)        | Remove it now. Cost: about 99k lines deleted before the replacement has run once                                                                                                                         |
| H13 | Every Harbor container has a memory request equal to its limit. The host pool's headroom changes only if the measurement in decision 2 says so. h3mon is a weak fallback                                              | Changed (decision 2)      | Requests below limits. Cost: under host memory exhaustion the kernel kills Harbor's database before the gate's compiler                                                                                  |
| H14 | Local admin plus robots. Self-registration off. SSO later                                                                                                                                                             | Kept                      | OIDC through Auth0 now. Cost: a new Auth0 application and an outbound dependency for the admin login                                                                                                     |
| H15 | Harbor lives in the existing `puni-registry` namespace and reuses its `registry-ca` issuer and `registry-tls` certificate                                                                                             | New                       | A new namespace. Cost: the namespace comes from the `policy` stage, which follows the pinned revision, and the CA key would need a second encrypted copy                                                 |
| H16 | Robots expire after 90 days and are rotated every 60. The daily check fails when one expires within 21 days                                                                                                           | New                       | Never expire. Cost: a leaked credential stays valid until someone notices. Harbor's default of 30 days would triple the rotations                                                                        |
| H17 | No watcher flips Harbor to read-only at a fill threshold. A full image filesystem refuses writes by itself. Alerts fire earlier                                                                                       | New                       | A five-minute host timer that sets read-only at 90%. Cost: bespoke lifecycle code of the kind this change exists to avoid                                                                                |

## Decisions

### 1. Version and chart

**Chart 1.19.4 with Harbor 2.15.4, as released together.**

- Chart 1.19.4 (2026-10-16) is the newest chart release and its `appVersion` is 2.15.4
  (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/Chart.yaml>,
  <https://helm.goharbor.io/index.yaml>). No chart release exists for Harbor 2.15.5
  (2026-11-12) or 2.16.0 (2026-11-10) (<https://github.com/goharbor/harbor-helm/releases>).
- Chart 1.19.3 was skipped because Harbor 2.15.3 shipped a regression
  (<https://github.com/goharbor/harbor-helm/releases/tag/v1.19.4>).
- All 14 advisories published in October 2026 name 2.15.3 as the patched 2.15 release, so 2.15.4
  carries every fix. The GitHub API lists six of them as High
  (<https://github.com/goharbor/harbor/security/advisories>).
- Harbor 2.15.3 blocked webhooks to private addresses. 2.15.4 allows them again by default
  (<https://github.com/goharbor/harbor/releases/tag/v2.15.3>,
  <https://github.com/goharbor/harbor/releases/tag/v2.15.4>).
- Valkey replaced Redis in 2.15.2, not in 2.16 (<https://github.com/goharbor/harbor-helm/releases/tag/v1.19.4>).
  The database image source at tag v2.15.4 already builds PostgreSQL 18 and keeps PostgreSQL 15
  only for `pg_upgrade`
  (<https://github.com/goharbor/harbor/blob/v2.15.4/make/photon/db/Dockerfile.base>). Read from
  source, not from a running image: slice 1 records `postgres --version`.
- 2.15.5 adds dependency and request-bound fixes and no advisory names it as a first fixed
  version (<https://github.com/goharbor/harbor/releases/tag/v2.15.5>). 2.16.0 is one week old
  and has no chart.
- The chart's README lists tested Kubernetes versions up to 1.34, for chart 1.18. It has no row
  for 1.19 (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/README.md>). The cluster runs
  1.36.4. Not verified; the lab run on the locked k3d image is the proof.

Upgrade policy:

- **Tracking.** Once a week someone reads the advisories page and the chart releases page above.
  This is manual toil. No automation is designed here.
- **Patch releases.** Take each chart patch of the installed minor within 30 days of its release.
  Take it within 7 days when an advisory rated High affects an enabled component.
- **Image override.** Harbor images newer than the chart's `appVersion` are allowed only inside
  the same minor, only when an advisory names that version as the fix and no chart exists yet.
  The lock records the reason.
- **Minor releases.** One minor at a time, after its first patch release or 60 days.
- **Every upgrade.** Lab upgrade first, then a backup, then the production step. Core migrates
  the database schema when it starts, downtime cannot be avoided and `helm rollback` is not
  supported (<https://goharbor.io/docs/main/administration/upgrade/helm-upgrade/>). Rollback is
  the previous chart plus a restore of the backup taken before the step.
- `updateStrategy.type` is `Recreate`, because the volumes are ReadWriteOnce
  (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/values.yaml>). Every upgrade and every
  values change that restarts a pod is a short outage for pushes and new pulls. Running pods keep
  their images.

### 2. Memory fit

**Verdict: not proven.** On paper Harbor without Trivy fits on h4claw beside a gate with about
1.6 GiB to spare. Both inputs to that sum are unmeasured. Nothing is installed on h4claw until
two numbers exist. If the second number fails the rule below, Harbor does not go on h4claw while
h4claw is a gate host, and the owner chooses among the fallbacks.

What primary sources give:

- Whole deployment: minimum 2 CPU, 4 GB RAM, 40 GB disk; recommended 4 CPU, 8 GB, 160 GB. No
  per-component figure. The page does not say whether Trivy is included
  (<https://goharbor.io/docs/main/install-config/installation-prereqs/>).
- The chart sets no requests or limits for any component except Trivy (request 512Mi, limit 1Gi).
  Its commented example is 256Mi and 100m per container
  (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/values.yaml>). Over the nine containers
  this plan enables that example sums to 2,304 MiB.
- The database pod mounts a memory-backed `/dev/shm` with a 512Mi size limit
  (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/templates/database/database-ss.yaml>).
  Memory used there counts against the container.

Planned budget. Request equals limit for every container. Every figure is the author's estimate
unless a source is named. Slice 1 replaces them with measured values.

| Container     | Request = limit (MiB) | Basis                                                                                                 |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `core`        | 384                   | Estimate. Chart example request 256Mi                                                                 |
| `jobservice`  | 384                   | Estimate. Runs retention and garbage collection. `maxJobWorkers` cut from 10 to 3                     |
| `registry`    | 384                   | Estimate. The Distribution pod today has a 512Mi limit (`infra/platform/registry/base/registry.yaml`) |
| `registryctl` | 96                    | Estimate                                                                                              |
| `portal`      | 64                    | Estimate. Static files behind nginx                                                                   |
| `nginx`       | 96                    | Estimate                                                                                              |
| `database`    | 512                   | Estimate. Includes `/dev/shm` use                                                                     |
| `valkey`      | 96                    | Estimate                                                                                              |
| `exporter`    | 96                    | Estimate                                                                                              |
| **Total**     | **2,112**             | The chart's example would give 2,304                                                                  |

Against the measurement: 3,741 MiB available under a gate, minus 2,112 MiB if every container
sat at its limit, leaves 1,629 MiB. Trivy would take 512 to 1,024 MiB of that, which is why H2
stands.

Why that is not a verdict:

- The 3,741 MiB is one sample of one gate. `gate` is not calibrated on h4claw, and its only
  recorded peak was taken under a bound that throttled it.
- Harbor's working set at idle, during a push and during garbage collection has no source.
- h4claw has no swap. When memory runs out the kernel kills a process.
- The pool keeps 5 GiB of headroom out of its jobs' budget. What already uses that
  headroom (k3s, Flux, Traefik, website pods, Docker) has not been measured.

Why request equals limit. The kubelet gives containers of Guaranteed pods `oom_score_adj` -997
and Burstable containers a value near 1000 when their request is small against node memory. The
kernel kills the highest score
(<https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/>). A gate runs
outside Kubernetes at adjustment 0. With requests below limits, a gate that exhausts memory gets
Harbor's database killed. With requests equal to limits, the gate's own compiler is killed and
the gate fails red, which is rerunnable. Guaranteed pods are also last in the kubelet's eviction
order (same page).

The first measurement (slice 1, on the local k3d `platform` profile; profile admission is
16 GiB RAM and 40 GiB disk per [local](../../../docs/infra/local.md)):

1. Bring the lab up with `bunx nx run tool-fleet:lab -- up --profile platform ...`.
2. Download chart 1.19.4, record its SHA-256, render it with the locked `helm` and the values
   this design names (Trivy off, metrics on, `Recreate`, the limits above).
3. Apply the render with a server-side dry run in a namespace that enforces `restricted`, then
   for real.
4. For every container read `memory.current` and `memory.peak` from its cgroup: after ten idle
   minutes; during a 2 GiB push with `crane`; during a retention run; during garbage collection
   with a second push in flight.
5. Record the table in `verify.md`. Record any container the kernel killed at its limit.

Then set each limit to the larger of its floor in the table and 1.5 times its measured peak,
rounded up to 32 MiB. Call the sum **L**.

The second number is read on h4claw, read-only and attended (task A1):

- **N**: MemTotal minus MemAvailable with no pool job running.
- **A**: the lowest MemAvailable across one complete gate, sampled every 10 seconds.

Decision rule:

| Condition                           | Outcome                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A − L ≥ 1,024 MiB                   | Install on h4claw as designed                                                                                        |
| A − L < 1,024 MiB                   | Stop. The owner picks a fallback below                                                                               |
| N + L > 5 GiB (the pinned headroom) | The pool's arithmetic no longer describes h4claw. Re-pin the headroom before `gate` runs in `cap` or concurrent mode |

Re-pinning means retiring the ledger and re-enrolling the host
([gate hosts](../../../docs/infra/gate-hosts.md), step 7). With headroom raised from 5 to 8 GiB
the pool has 7 GiB for jobs. The first h4claw gate already peaked at 6.93 GiB while throttled.
If calibration shows a gate needs more than the pool can then admit, h4claw cannot guarantee both
roles, and that is the owner's call.

Fallbacks, in the order this design prefers them:

1. **Resize h4claw.** h3mon was resized on 2026-10-19 for the same reason. Cost: provider spend
   and a reboot of the k3s server.
2. **Take h4claw out of the gate pool.** h2puni remains the canonical gate. Cost: the second gate
   host and its calibration week.
3. **Pin Harbor to h3mon by host name.** Costs: h3mon's planned observability graph is already
   short by 2,228 MiB in overlap, so Harbor there makes that activation harder; the bounded
   filesystems move to h3mon's disk, whose free space is not verified; `registry.puni.internal`
   must resolve to h3mon on every client; h3mon's current headroom is not verified. It works
   only while the `observability` stage stays held.
4. **Add a swap file on h4claw** (`puni_swap_file_mib`, the mechanism h3mon uses). It helps host
   processes only, since pods never swap. Cost: the k3s server and its embedded etcd are host
   processes and become swappable. Not recommended without a measurement.

A kubelet memory reservation is not a fallback: `system-reserved` caps pods, it does not protect
them from host processes.

### 3. Storage

Harbor needs four persistent volumes
(<https://github.com/goharbor/harbor-helm/blob/v1.19.4/values.yaml>, `persistence`). The chart
runs its components as fixed numeric users
(<https://github.com/goharbor/harbor-helm/tree/v1.19.4/templates>):

| Filesystem | Size   | Used by                   | UID:GID     | Chart default size |
| ---------- | ------ | ------------------------- | ----------- | ------------------ |
| `registry` | 34 GiB | `registry`, `registryctl` | 10000:10000 | 5Gi                |
| `database` | 4 GiB  | PostgreSQL                | 999:999     | 1Gi                |
| `jobs`     | 1 GiB  | `jobservice` job logs     | 10000:10000 | 1Gi                |
| `cache`    | 1 GiB  | Valkey                    | 999:999     | 1Gi                |

Why four filesystems and not one. Garbage collection and retention write to the database. If the
image store and the database share a filesystem, a full store stops PostgreSQL and nothing can
free space. Separate filesystems keep Harbor able to delete when pushes are refused.

Why 40 GiB and not 50. The root disk has 78 G free. The kubelet evicts pods when the image
filesystem has less than 15% free, which is 22.5 G of 150 G if container images share the root
filesystem (not verified on h4claw). 78 − 40 leaves 38 G: 15.5 G above that threshold for gates,
Docker and images. 78 − 50 would leave 28 G, 5.5 G above it. A gate alone declares 8 GiB of
temporary disk. The role's own 20 GiB root reserve sits below the kubelet threshold, so the
kubelet figure is the binding one.

Provisioning. The `registry_storage` role and its `storage.sh` already do the hard part.

| Part of `registry_storage`                                                                                                          | Use here                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fully allocated backing files, eager inode and journal initialisation, `mkfs.ext4 -m 0`                                             | Reused unchanged                                                                                           |
| `loop,noauto,nodiscard,X-fstrim.notrim` fstab contract                                                                              | Reused unchanged                                                                                           |
| Root-reserve refusal, storage-directory lock, backing inode / UUID / loop identity checks, per-boot receipts                        | Reused unchanged                                                                                           |
| `provision`, `mount`, `verify` verbs and the boot unit that runs `mount`                                                            | Reused; new variant suffix `-harbor`                                                                       |
| Volume set and owners: today `registry`+`journal` at one UID, or `scratch`, or `pulls`                                              | Variant: exactly `registry`, `database`, `jobs`, `cache`, two UIDs, under `/var/lib/puni-harbor`           |
| Receipt location: on the journal filesystem                                                                                         | Variant: `/var/lib/puni-harbor/identities` on the root filesystem, root-owned, as scratch mode does        |
| k3s `Requires=` the storage unit                                                                                                    | Variant: `Wants=` and `After=`. A failed Harbor mount must not keep the control plane and the website down |
| Journal filesystem, authority account (UID 59001), permit and pressure service, authority CLI, pull and scratch pools, sudo wrapper | Not reused                                                                                                 |

What stops Harbor writing to the host root when a mount is missing or wrong:

1. **Immutable mount points.** Each mount-point directory on the root filesystem is empty,
   root-owned and marked immutable before the first mount. Nothing can create a directory under
   an unmounted mount point.
2. **Static `local` volumes that name a path inside the mount.** Each PersistentVolume names
   `<mount point>/contents` and is bound to h4claw. With the filesystem unmounted that path does
   not exist, the kubelet cannot set up the volume and the pod does not start. No volume uses
   the dynamic local-path class.
3. **An init container on each of the four workloads.** It runs the mount check the staged
   `infra/platform/registry/production/startup.sh` already contains (`verify_mount`): the receipt
   is root-owned, mode 0644, single link; the mounted filesystem's id equals the receipt's; the
   mount is ext4 on the receipt's device; the size is positive and at most the receipt's
   maximum. Receipts reach the pod through a fifth, read-only volume. Any mismatch fails the
   init container.

The chart has no value for extra pod volumes (not verified beyond the 1.19.4 values file), so the
receipts volume and the init containers are added by a Flux post-render patch. `tool-fleet:check`
must render with the same patch. The guard image is one more locked image role.

The permit, fence and supervisor half of `startup.sh` is not carried over.

Quota arithmetic:

| Item                                          | GiB      |
| --------------------------------------------- | -------- |
| `registry` filesystem                         | 34       |
| Quota `website`                               | 10       |
| Quota `wbs`                                   | 10       |
| Quota `platform`                              | 3        |
| Sum of quotas                                 | 23 (68%) |
| Slack for bytes Harbor's quota does not count | 11       |

Stated plainly:

- Quotas are logical and per project. A blob shared inside a project counts once; a blob shared
  across projects counts in each, so logical use can exceed physical use
  (<https://goharbor.io/docs/main/administration/configure-project-quotas/>).
- Refusal can come late. The manifest is pushed last, after its blobs. Under concurrent pushes
  "an attempt to push an image might not be immediately rejected for exceeding the quota" (same
  page; the passage is worded for tag counts). The blobs of a refused push stay on disk,
  uncounted, until collection. Whether concurrent pushes can take stored bytes past a storage
  quota is not stated there and not verified.
- When deleted bytes leave the quota is not verified. The quota page says only that garbage
  collection "frees the storage used by untagged blobs in the project". Either way the bytes
  stay on disk until collection, and collection skips anything uploaded in the last two hours
  (<https://goharbor.io/docs/main/administration/garbage-collection/>). Unfinished uploads are
  purged after 168 hours by chart default.
- So the filesystem bound is the backstop. When the `registry` filesystem is full, writes fail
  with an error from the storage layer and the push fails. The database, on its own filesystem,
  keeps working. The exact client-visible error is not verified.

Measured usable capacity after `mkfs` goes into the provisioning receipt. If it is below 33 GiB
the quotas are cut to keep the sum at or under 70%.

### 4. Flux layout and ordering

```
infra/platform/charts/harbor-1.19.4.tgz        vendored, SHA-256 in the lock
infra/platform/registry/harbor/base/           HelmRelease, NetworkPolicy, guard script, post-render patch
infra/platform/registry/harbor/local/          lab overlay: dynamic small volumes, lab issuer, ServiceMonitor on
infra/platform/registry/harbor/production/     static volumes and claims, node selector, limits, endpoint values
```

- **Lock.** `charts.harbor` in `infra/versions/toolchain.json` records version, URL
  (`https://helm.goharbor.io/harbor-1.19.4.tgz`), SHA-256 and one image role each for `core`,
  `portal`, `jobservice`, `registry`, `registryctl`, `database`, `valkey`, `nginx` and
  `exporter`, with `disabledComponents: ["trivy"]`. The storage guard image is locked beside
  them. The reader keeps rejecting a missing or extra role.
- **Stage.** Harbor belongs with the `platform` stage, whose path is `registry/<environment>`.
  The local overlay is not added to the default lab graph: the `platform` profile is already
  admitted at 16 GiB and Harbor would add about 2 GiB to every lab. A rehearsal target applies
  it on demand. `tool-fleet:check` renders and validates it statically either way.
- **Production.** `registry/production` does not list Harbor in its kustomization, the same
  pattern the staged storage patch uses. Production follows a pinned public revision that
  predates Harbor, and advancing it would deploy unrelated work. The private fleet repository
  adds two Flux units: one for Harbor's encrypted Secrets with pruning off, and one that applies
  `infra/platform/registry/harbor/production` from a second source pinned to the reviewed public
  commit. The second unit patches the HelmRelease's chart source to that pinned source. Nothing
  private is quoted here.
- **Dependencies.** `controllers` (cert-manager), `policy` (the namespace), `storage` (only for
  ordering; Harbor's volumes are static) and the Harbor secrets unit. Traefik is not a
  dependency.
- **Secrets.** The chart's defaults are unsafe: admin password `Harbor12345`, `secretKey`
  `not-a-secure-key`, database password `changeit`
  (<https://github.com/goharbor/harbor-helm/blob/v1.19.4/values.yaml>). Unset secrets are
  regenerated on every render. Every one is supplied. Where the chart can read an existing
  Secret it does (`existingSecretAdminPassword`, `existingSecretSecretKey`,
  `core.existingSecret`, `core.existingXsrfSecret`, `core.secretName`, `jobservice.existingSecret`,
  `registry.existingSecret`, `registry.credentials.existingSecret`). The internal database
  password has only a plain value in chart 1.19.4, so it arrives through the HelmRelease's
  `valuesFrom` a Secret. Each Secret is listed in `externally-provided.json` as operator-supplied.
- **Pod security.** `puni-registry` enforces `restricted`. The chart's
  `containerSecurityContext` drops all capabilities, forbids privilege escalation, sets the
  runtime-default seccomp profile and non-root. Admission of every rendered pod is not verified
  until slice 1's server-side dry run.
- **Network policy.** Port 8443 on `nginx` from anywhere. Metrics ports from `observability`
  only. The inner `registry` and `database` ports from Harbor's own pods only. The inner
  registry is a Distribution 2.8.3 fork (`v2.8.3-harbor.2` in
  <https://github.com/goharbor/harbor/releases/tag/v2.15.4>); whether it carries the 2026
  Distribution fixes is not verified, so nothing outside Harbor may reach it.

### 5. TLS, endpoint and clients

- **Host name.** `registry.puni.internal` stays.
- **Port.** `8443`, from the first day and for good. Port 5000 belongs to Distribution until it
  retires and is not reused, so no reference changes twice. Port 443 on h4claw belongs to
  Traefik.
- **Shape.** `expose.type: clusterIP` with TLS on. Harbor's own nginx terminates TLS with the
  existing `registry-tls` Secret, which already names `registry.puni.internal` and is issued by
  the escrowed `registry-ca`. A second `registry_endpoint` instance (unit `puni-harbor`) binds
  `10.1.0.4:8443` and forwards TCP to the Service. The Service gets a static cluster address so
  the proxy does not need reconverging when the Service is recreated. The role needs a unit
  name and an upstream port as parameters; today both are fixed.
- **No public listener.** The socket binds the private address only, as today. This keeps the
  property by construction, not by an ingress rule.
- **`externalURL`** is `https://registry.puni.internal:8443`. Harbor puts it in the token
  service address it hands to clients.
- **Certificate renewal.** cert-manager renews the Secret. nginx reads it at start. The daily
  check reads the served certificate and fails when it expires within 21 days; the fix is a
  restart of the nginx Deployment. Not automated.

| Client                   | Needs                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k3s / containerd nodes   | The existing hosts block and CA, plus a `registries.yaml` entry for `registry.puni.internal:8443` with the CA and no credential. `registry_client` needs a k3s mode without credentials |
| Workloads                | A `kubernetes.io/dockerconfigjson` pull secret per consuming namespace, holding that project's pull robot. Encrypted in the private fleet repository                                    |
| Docker on the build host | `/etc/docker/certs.d/registry.puni.internal:8443/ca.crt` and an owner-only Docker config with the push robot                                                                            |
| `crane`                  | The same Docker config through `DOCKER_CONFIG`, and the CA through `SSL_CERT_FILE`                                                                                                      |
| Flux                     | Nothing. It reads Git sources and vendored charts only                                                                                                                                  |
| Dagger                   | CA, name resolution and the push robot inside the engine container. Not part of this change; the product moves own it                                                                   |

Robot credentials:

- **Where.** The operator generates each secret into an owner-only file under
  `/root/.puni/registry/harbor-robots/` on h4claw and encrypts it into the private fleet
  repository. The reconciler reads the file and sets it on the robot. Harbor never invents a
  secret that someone must then copy out of a terminal. The API accepts a caller-supplied secret
  on create and on refresh
  (<https://github.com/goharbor/harbor/blob/v2.15.4/api/v2.0/swagger.yaml>, `RobotCreate`,
  `RefreshSec`).
- **Expiry.** 90 days (H16). Harbor's default is 30
  (<https://goharbor.io/docs/main/administration/robot-accounts/>).
- **Rotation.** Every 60 days, one robot at a time: new secret file, reconcile, encrypt and
  merge, roll the consumer. Between the reconcile and the consumer's update, that robot's new
  pulls or pushes fail and are retried. Running pods are unaffected.
- **Scope.** Robots are per project, not per repository (same page).

### 6. Configuration as code

**A Bun reconciler in `tool-fleet`: a pure planner and a thin IO shell.**

| Criterion       | Terraform provider                                                                                                                                                      | Bun reconciler                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Version support | 3.12.5, tested on Harbor 2.13 to 2.15 and Terraform 1.12 to 1.14 (<https://github.com/goharbor/terraform-provider-harbor>). The repository locks Terraform 1.16.3       | Written against the 2.15.4 API file; re-run against a real Harbor in the lab at every version bump |
| Coverage        | Projects, robots, retention, immutability, garbage collection, system config, webhooks all exist as resources                                                           | The same kinds, hand-written                                                                       |
| State           | Needs a state backend. The remote backend has never run live ([operator guide](../../../docs/infra/README.md), "That does not certify"). State would hold robot secrets | None. Harbor is read each run                                                                      |
| Secrets         | In state and in plan output unless every attribute is marked sensitive                                                                                                  | Read from owner-only files, never returned in a plan                                               |
| Drift           | `terraform plan`                                                                                                                                                        | The planner's output is the drift report                                                           |
| Toolchain rule  | Terraform is locked and wrapped by `tool-fleet`, so the rule allows it; a second provider and backend would be new                                                      | Bun and Nx, the house pattern                                                                      |
| Cost            | An unproven backend becomes a dependency of every credential rotation                                                                                                   | About one module of bespoke code and an API client that must follow Harbor                         |

The reconciler is bespoke code. It is configuration, not lifecycle: it holds no journal, takes
no locks on images and deletes nothing in the store.

System settings also go through the API, not through `CONFIG_OVERWRITE_JSON`. When that variable
is set, Harbor refuses every configuration update through the API
(<https://github.com/goharbor/harbor/blob/v2.15.4/src/controller/config/controller.go>,
`readOnlyForAll`). That includes `read_only`, which the backup must toggle (decision 8).

Declared file `infra/registry/harbor.json`, validated with ArkType:

```json
{
  "schemaVersion": 1,
  "system": {
    "authMode": "db_auth",
    "selfRegistration": false,
    "projectCreation": "adminonly",
    "notificationsEnabled": true
  },
  "garbageCollection": { "cron": "0 30 4 * * *", "deleteUntagged": true, "workers": 1 },
  "projects": [
    {
      "name": "website",
      "public": false,
      "quotaBytes": 10737418240,
      "retention": { "cron": "0 30 3 * * *", "rules": ["see decision 7"] },
      "immutableTags": [{ "tags": "hold-*", "repositories": "**" }],
      "robots": [
        { "name": "push", "access": ["repository:pull", "repository:push"], "durationDays": 90 },
        { "name": "pull", "access": ["repository:pull"], "durationDays": 90 }
      ],
      "webhooks": [
        { "name": "quota", "events": ["QUOTA_WARNING", "QUOTA_EXCEED"], "kind": "slack" }
      ]
    }
  ]
}
```

No secret and no address of an alert destination is in the file. Both come from owner-only files
named by convention.

Commands:

- `plan` reads Harbor, prints the changes and exits 0 with none or 2 with some. It prints no
  secret.
- `apply --expect-sha256 <plan digest>` applies exactly that plan.
- `check` is `plan` plus three probes: each robot's secret file logs in; no robot expires within
  21 days; the served certificate does not expire within 21 days. A daily host timer runs it.

Rules the planner enforces:

- It never deletes a project, repository or artifact. An undeclared project is reported as drift.
- A robot whose live permissions include any delete action is drift, reported first.
- Missing or unreadable admin credential, secret file or declared file throws. A field Harbor
  returns that the reader does not model throws.
- Robot names are read back from Harbor, never built from a pattern. The `robot$` prefix contains
  a shell metacharacter; nothing interpolates it.

The reconciler authenticates as the local `admin`. A system robot would be narrower. System
robots are the subject of two of the October High advisories, so this design does not create one.

Bootstrap: Harbor starts with self-registration on by default
(<https://goharbor.io/docs/main/install-config/configure-system-settings-cli/>). The endpoint
socket is enabled only after the first reconcile, so no client reaches Harbor in between.

### 7. Policy

Projects: `website`, `wbs`, `platform`. All private. Quotas as in decision 3.

Tag vocabulary, a contract for release tooling:

| Tag                               | Written by                                                 | Moves | Meaning                                                 |
| --------------------------------- | ---------------------------------------------------------- | ----- | ------------------------------------------------------- |
| `sha-<40 hex>`                    | The publisher, at push                                     | No    | The build of that source commit                         |
| `promoted-<environment>`          | Release tooling, after that environment's deploy succeeded | Yes   | The image the environment runs                          |
| `promoted-<environment>-previous` | Release tooling, in the same step                          | Yes   | The image the environment ran before, kept for rollback |
| `hold-<reason>`                   | An operator                                                | No    | Keep until an administrator releases it                 |

- **Promotion.** Move `-previous` to the digest `promoted-<environment>` names, then move
  `promoted-<environment>` to the new digest. Order matters: the old image is never unprotected.
- **Rollback.** Swap the two tags. The image rolled back from stays protected as `-previous`, so
  rolling forward again is safe.
- **Depth.** One rollback step per environment is protected by tag. Older releases are protected
  only while they are among the newest ten or younger than seven days.
- **Who can move them.** Any identity with push permission in the project, which means the push
  robot. Harbor scopes robots to a project, not to a tag pattern. Promotion tags are as trustworthy
  as the push credential.

Retention, per project, exactly as Harbor expresses it. Template identifiers and selector
decorations are from the 2.15.4 source
(<https://github.com/goharbor/harbor/tree/v2.15.4/src/pkg/retention/policy/rule>,
<https://github.com/goharbor/harbor/blob/v2.15.4/src/lib/selector/selectors/doublestar/selector.go>):

| Rule | `template`           | Parameter | Repositories (`repoMatches`) | Tags (`matches`) | `untagged` |
| ---- | -------------------- | --------- | ---------------------------- | ---------------- | ---------- |
| 1    | `always`             | none      | `**`                         | `promoted-*`     | false      |
| 2    | `latestPushedK`      | 10        | `**`                         | `**`             | false      |
| 3    | `nDaysSinceLastPush` | 7         | `**`                         | `**`             | false      |

- `algorithm` is `or`: an artifact is kept if any rule keeps it. Rules are evaluated per
  repository, not across the project
  (<https://goharbor.io/docs/main/working-with-projects/working-with-images/create-tag-retention-rules/>).
- Read as one sentence: an artifact is removed only when it has no promotion tag, is not among
  the ten most recently pushed in its repository, and was pushed more than seven days ago.
- If any tag of an artifact is kept, the artifact and all its tags are kept (same page).
- With `untagged` false in every rule, untagged artifacts are removed. Whether that touches the
  per-platform children of a multi-architecture index is not verified; the lab test pushes an
  index and pulls each child by digest after retention and collection.
- Schedule: daily, `0 30 3 * * *`. The API file's examples use six-field cron. The time zone is
  not verified.
- A dry run precedes the first real run in every project.

Immutability: one rule per project, tags `hold-*`, repositories `**`. An immutable tag cannot be
deleted or re-pushed
(<https://goharbor.io/docs/main/working-with-projects/working-with-images/create-tag-immutability-rules/>),
and retention marks such artifacts immutable and keeps them
(<https://github.com/goharbor/harbor/blob/v2.15.4/src/pkg/retention/job.go>). Promotion tags are
not immutable, because they move. Build tags are not immutable, because an immutable tag would
exempt every image from retention. The single-selector rule avoids the matcher flaw fixed in
2.15.3 (GHSA-27f2-qg57-2gwg).

Garbage collection: daily at `0 30 4 * * *`, after retention, with deletion of untagged artifacts
on and one worker. One dry run first. Harbor collects while pushes and pulls continue and spares
uploads from the last two hours
(<https://goharbor.io/docs/main/administration/garbage-collection/>).

Why daily and not weekly. Between a deletion and the next collection the deleted bytes are in one
of two states, and which one is not verified. If they still count against the quota, a project
that retention has trimmed stays full and refuses pushes until collection. If they do not, they
sit on disk outside the quota; in steady state a week of deletions is about a week of pushes,
which can approach the quotas' sum of 23 GiB against 11 GiB of slack. Daily collection cuts
either effect to about one seventh. Slice 6 records which state holds.

Nightly order, UTC: backup 01:30, retention 03:30, collection 04:30.

What this protects, against the lifecycle design:

| Property                                   | Lifecycle design                              | This design                                                                                          |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Physical size bound                        | Bounded filesystem                            | Bounded filesystem, the same provisioning                                                            |
| Refusal before the disk fills              | Admission with byte and inode reservations    | Per-project quota at push. Logical; a refusal can come after the blobs are uploaded                  |
| Running and rollback images kept           | Journal of protections owned by each consumer | Promotion tags. One step of rollback. As trustworthy as the push credential                          |
| Images in use but never tagged as promoted | Protected through consumer reports            | **Not protected** beyond ten newest and seven days. There is no record of digests in use             |
| Verified backup before any deletion        | A gate inside the maintenance sequence        | **None.** Backup runs two hours before retention by schedule. A failed backup does not stop deletion |
| Client deletes                             | Disabled, bypassable on 2.8.x for tags        | No robot holds a delete permission                                                                   |
| Collection without downtime                | No. Writers stopped                           | Yes                                                                                                  |
| Untagged dependencies of kept images       | Verified by census                            | Left to Harbor. Not verified until the lab test                                                      |

### 8. Backup and restore

Harbor documents one backup path, Velero. It backs up the database, registry and job-log
volumes, excludes the cache, requires Harbor to be set read-only first, supports the internal
database only, and is crash consistent
(<https://goharbor.io/docs/main/administration/backup-restore/>). The platform's Velero stage is
held, so this design uses a different mechanism with the same ingredients. It is not Harbor's
documented procedure. The restore drill is what proves it.

Procedure, one run of `tool-fleet`'s Harbor backup command under a host timer at 01:30 UTC:

1. Preflight. Pinned `restic` binary by checksum, owner-only configuration, an existing
   repository (never initialised implicitly), no retention or collection execution running.
   Any failure stops before any change.
2. Record the current `read_only` value, then set it true through the API.
3. Dump the database with `pg_dump` in custom format from inside the database pod, streamed
   into `restic backup --stdin`.
4. `restic backup` of the `registry` and `jobs` contents directories.
5. Verify: `restic check`, and both snapshots exist with this run's tag.
6. Restore the recorded `read_only` value. This step runs on success and on failure. If it
   fails, the command exits non-zero and prints the one command that clears read-only.
7. Only after 5 and 6 succeed: write the success receipt, then
   `restic forget --keep-daily 7 --keep-weekly 4 --prune`.

- **Window.** Pushes are refused from step 2 to step 6. The first run copies everything; later
  runs copy changes. The duration is measured in the lab and in the drill, not promised here.
- **Reused.** The pinned restic 0.19.1 and its lock file, the bucket, the owner-only
  configuration layout under `/root/.puni/registry`, the encrypted recovery archive custody.
- **Not reused.** The Distribution repository prefix. Harbor gets
  `backups/registry/harbor-restic-v1`, so the Distribution snapshots stay untouched and unpruned.
- **Not in the backup.** The cache, as in Harbor's own procedure. Harbor's secrets, which are in
  the private fleet repository under SOPS. Without `secretKey` a restored database cannot
  decrypt what Harbor stored encrypted.
- **Failure.** The systemd unit fails and the previous receipt stays. Delivery of that failure
  to a person depends on decision 9.

Restore drill, the gate before the first consumer:

1. On another node, in a disposable namespace, install the same chart with small dynamic volumes.
2. Restore the `registry` snapshot into its volume and the database dump with `pg_restore`.
3. Start Harbor read-only. Pull the proof image by digest through it. Compare every blob digest.
4. Alter one blob in a second disposable copy. The same verification must fail.
5. Delete the namespace and its volumes. Record digests, durations and sizes.

### 9. Observability

- **Exporter.** `metrics.enabled: true` adds the exporter and metrics endpoints on core,
  registry and jobservice. Useful series: `harbor_project_quota_usage_byte`,
  `harbor_project_quota_byte`, `harbor_up`, `harbor_health`, `harbor_task_queue_size`
  (<https://goharbor.io/docs/main/administration/metrics/>).
- **Who scrapes.** In the lab, the chart's ServiceMonitor and the lab's Prometheus. In
  production the `observability` stage is held, so no Prometheus Operator exists there and the
  ServiceMonitor stays off. The stack that monitors hosts today runs on h3mon outside k3s
  ([enrollment](../../../docs/infra/enroll-h4claw-h3mon.md)). Whether it can reach a cluster
  Service on h4claw is not verified. Task A1 reads that. If it cannot, the series stay
  unscraped until the `observability` stage activates, and the webhooks below are the only
  quota signal.
- **Quota webhooks.** Each project gets one webhook policy for `QUOTA_WARNING` and
  `QUOTA_EXCEED` with the Slack endpoint kind
  (<https://goharbor.io/docs/main/working-with-projects/project-configuration/configure-webhooks/>).
  The lifecycle design also chose Slack. No destination has been proven live. The warning
  threshold is not documented; the page's sample message says 85%.
- **Filesystem fill.** Harbor exposes no disk-fill series. The signal is the node filesystem
  metric for the four mount points, with alerts at 80% and 90% of the `registry` filesystem and
  at 80% of the `database` filesystem. That needs a node exporter on h4claw feeding a stack that
  can alert. Not verified. If none exists, the fallback is a five-minute host timer that posts
  to the same webhook, which is bespoke and is listed as toil.
- **Daily check.** The reconciler's `check` (decision 6) is the drift, robot-expiry and
  certificate-expiry signal. It fails a systemd unit.

### 10. Migration and cut-over

| Step | What                                                                                                              | Receipt                                                      | Rollback                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1    | Lab measurement (slice 1)                                                                                         | Per-container memory table                                   | Lab down                                                                    |
| 2    | Read h4claw: N, A, free disk, image filesystem, port 8443, firewall, platform revision, exporter (A1)             | The numbers, dated                                           | None needed; read-only                                                      |
| 3    | Owner decides placement by the rule in decision 2 (A2)                                                            | The decision, by id                                          | None                                                                        |
| 4    | Provision the four filesystems (A3)                                                                               | Role output, receipts, second apply `changed=0`              | Unmount, remove the fstab entries and backing files this step created       |
| 5    | Encrypt Harbor's Secrets; add the two Flux units; Harbor Ready with no endpoint (A4)                              | HelmRelease Ready, pods Guaranteed, guard passed             | Suspend and delete the Harbor unit; volumes and Secrets remain              |
| 6    | First reconcile, then `check` clean (A5)                                                                          | Plan digest, `check` exit 0                                  | Nothing serves yet; delete the Harbor unit                                  |
| 7    | Endpoint socket and client trust (A6)                                                                             | Socket bound to `10.1.0.4:8443` only; `changed=0` on reapply | Stop and disable the `puni-harbor` socket; remove the marked client entries |
| 8    | Production proofs (A7): robot push and pull, delete refused, quota refusal, retention dry run, collection dry run | One line per proof                                           | Delete the test repositories as admin                                       |
| 9    | First backup and the restore drill (A8)                                                                           | Snapshot ids, drill digests                                  | Drill namespace deleted; snapshots kept                                     |
| 10   | Copy the proof image by digest; add `hold-activation-proof` (A9)                                                  | Source digest equals destination digest                      | Disable the hold rule, delete the copy as admin, re-enable the rule         |
| 11   | Record readiness (A10)                                                                                            | The list below, complete                                     | None                                                                        |
| 12   | Final Distribution snapshot; stop its endpoint; scale it to zero; disable its backup timer (A11)                  | Port 5000 refuses; snapshot id                               | Start the socket, restore the replica count, enable the timer               |

"Harbor is ready for a first consumer" means every one of these receipts exists:

1. Memory: measured limits in place, every Harbor pod Guaranteed, the rule in decision 2 met.
2. Storage: four receipts; the guard's negatives passed in the rehearsal; the production guard passed.
3. Policy: `check` exits 0 on two consecutive days.
4. Refusals seen on the production endpoint: anonymous request, robot delete, push over quota.
5. Retention and collection: one dry run and one real run each, on a seeded repository.
6. Backup: two consecutive nightly successes. Restore drill passed.
7. Alerts: one quota webhook and one filesystem-fill alert delivered to a person.
8. The proof image is pullable from Harbor by its original digest.

Step 10 uses `crane copy <source>@sha256:<digest> registry.puni.internal:8443/platform/<repository>:hold-activation-proof`
and then compares `crane digest` of the destination with the source digest. A copy by digest
alone would create an untagged artifact, which retention removes. `crane` enters the toolchain
lock through pull request #936; step 10 waits for it.

When Distribution stops. At step 12, in this change. It has no consumer to wait for. It should
not stay up: Distribution 2.8.x is in the affected range of CVE-2026-41888 (tag deletion ignores
`delete.enabled: false`) and of CVE-2026-35172 and CVE-2026-85747, whose preconditions on this
install are not verified. None is fixed on the 2.8 line; the fixes are in 3.1.0 to 3.1.2
(<https://github.com/distribution/distribution/security/advisories>). Its PVC, its snapshots and
its Secrets are kept. Deleting them belongs to the removal change.

Scaling Distribution to zero cannot be done by editing the public manifest, because production
follows the pinned revision. The private fleet repository carries the patch, the way it carries
the stage holds today.

### 11. Freeze of the hand-built lifecycle

Frozen means: no open lifecycle task is started, nothing of it is installed or activated, and
its source stays in the tree unchanged until the removal change.

| Change                                  | State on 2026-11-17      | Treatment                                                                                           |
| --------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `bound-registry-storage`                | 10 tasks checked, 6 open | Superseded. Open tasks stay unchecked and are not done                                              |
| `integrate-registry-journal-foundation` | 24 checked, 1 open       | Superseded. The open task is not done                                                               |
| `registry-policy-journal-foundation`    | 5 checked, 0 open        | Complete as a source change. Its code is lifecycle-only and goes with the removal change            |
| `activate-platform-registry`            | All checked              | Stands as the record of what is installed today. Its delta is replaced when this change is archived |

How "superseded" is recorded without claiming completion:

- This pull request does not edit those changes. It adds one sentence to
  [registry operation](../../../docs/infra/registry.md).
- After the owner accepts this plan, task 0.3 adds a dated `Superseded` note at the top of each
  superseded change's `proposal.md` and `tasks.md`: superseded by `adopt-harbor-registry`; open
  tasks will not be done; checked tasks record merged source, not activation.
- Superseded changes are not archived with `openspec archive`, because that applies their delta
  specs to `openspec/specs` and files them among completed work. The `registry-storage-lifecycle`
  and `registry-journal-profiles` deltas never become main specs.
- The removal change decides whether those directories move to `openspec/changes/archive` with
  `--skip-specs` or are deleted with the source.
- Open pull requests that extend the lifecycle belong to their authors. This change does not
  touch them.

What stays in use meanwhile:

- The installed nightly Distribution backup, until step 12.
- The `registry_endpoint` and `registry_client` roles, which this change extends.
- `registry_storage`'s provisioning core, which this change reuses.
- Lifecycle libraries stay dormant: supported commands already route around them.

The removal change is named `remove-registry-lifecycle`. It starts after Harbor serves its first
consumer. It is not written here.

### 12. What is given up and what is new toil

| Area               | Given up or added                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Footprint          | One pod and about 64Mi requested becomes nine containers in eight pods and about 2.1 GiB reserved on a 15.6 GiB host that also runs gates              |
| Database           | A PostgreSQL to keep alive, dump, restore and carry across major versions                                                                              |
| Cache              | A Valkey with a volume. Losing it loses sessions and queued jobs                                                                                       |
| Upgrades           | Every upgrade is an outage, migrates the schema and cannot be rolled back with Helm                                                                    |
| Advisories         | Fourteen in October 2026, six High. Someone reads the advisory page weekly and patches within 7 days for High                                          |
| Configuration      | Projects, robots and policies live in Harbor's database. Git reaches them only through a reconciler this repository must maintain against Harbor's API |
| Web UI             | An admin can change policy by hand. The daily check reports it a day later at worst                                                                    |
| Credentials        | Six robots to rotate every 60 days, by hand                                                                                                            |
| Certificate        | nginx must be restarted after each renewal                                                                                                             |
| Image protection   | No record of digests in use. Promotion tags only, one rollback step, as trustworthy as the push credential                                             |
| Backup ordering    | No verified backup gates a deletion                                                                                                                    |
| Backup path        | Not Harbor's documented one. Proven only by the drill                                                                                                  |
| Fill cutoff        | The filesystem refuses writes at 100%. No graceful refusal at 90%                                                                                      |
| Chart drift        | Guard init containers and the receipts volume are a post-render patch that must be re-checked at every chart bump                                      |
| Kubernetes support | Kubernetes 1.36 is outside the chart's published test matrix                                                                                           |
| Sunk work          | About 99k lines of lifecycle source become dead weight until removed                                                                                   |
| Gained             | Quotas, retention, online collection, per-project robots with no delete right, tag immutability, a UI and an audit log, without writing them           |

### 13. Alternatives considered

- **Finish the lifecycle.** Six tasks remain, including the installed drill and backup budget.
  It protects more: a journal of images in use and a verified backup before deletion. It is
  about 99k lines that only this team can maintain, on Distribution 2.8.3, which has no 2026
  fixes. Rejected by the owner's decision.
- **Zot.** One binary, no database, retention and per-repository quota in one config file. The
  owner chose Harbor. Not reopened.
- **Distribution 3.1.x and stay minimal.** Fixes the advisories. Still no quota, no retention,
  and collection still needs writers stopped. The lifecycle would still be needed.
- **GHCR only.** No self-hosted registry to run. Images and pull availability depend on an
  outside service, and the owner wants one self-hosted registry.

## Decision record (becomes an ADR at merge)

ADR 0079 is claimed by open pull request #935 and is not on `main`. ADR numbers must stay
contiguous, so this text stays here until this change merges. Task 0.2 files it under the next
free number.

> # Harbor replaces the hand-built registry lifecycle
>
> The platform registry was Distribution 2.8.3 with a hand-built storage lifecycle planned around
> it: a bounded filesystem, a journal of image protections, admission by reservation, and
> maintenance that stopped writers. After about 99k lines and with six tasks open, none of it was
> active. On 2026-11-17 the owner chose to run Harbor on the same cluster and take quotas,
> retention, garbage collection and scoped robot accounts from the product. Only three things
> stay hand-built: the bounded filesystems, a reconciler that applies declared policy through
> Harbor's API, and a backup runner.
>
> ## Considered options
>
> - Finish the lifecycle: stronger protection, but bespoke and tied to a Distribution line with
>   no security fixes.
> - Zot: far smaller, config in one file; set aside by the owner.
> - Distribution 3.1.x alone: patched, but without quotas or retention.
> - GHCR only: nothing to run, but not self-hosted.
>
> ## Consequences
>
> Harbor brings a PostgreSQL, a Valkey and nine containers to a host that also runs gates, and
> its memory fit had to be measured before installation. Policy lives in Harbor's database and
> reaches Git only through the reconciler. Image protection is a tag convention, not a record of
> digests in use, and no verified backup gates a deletion. Upgrades are outages and cannot be
> rolled back with Helm. Reversing this decision means copying every image out by digest and
> rebuilding retention elsewhere.

## Risks / Trade-offs

- **Memory.** Harbor may not fit beside a gate. Mitigation: the measurement and rule in
  decision 2. Residual: the owner may have to give up a role of h4claw or pay for a resize.
- **A release tool bug moves a promotion tag.** The old image loses its tag. Mitigation: it
  stays kept for seven days and while among the newest ten; the nightly backup keeps seven
  dailies.
- **Uncounted bytes fill the filesystem** (refused pushes, deletions awaiting collection).
  Mitigation: 11 GiB of slack, daily collection, the filesystem bound. Residual: a full `registry` filesystem fails pushes until collection runs.
- **Backup fails silently.** Mitigation: the unit fails and the receipt does not advance.
  Residual: someone must be told; that path is unproven (decision 9).
- **Harbor advisory with no chart release.** Mitigation: the image-override rule in decision 1.
- **Post-render patch breaks at a chart bump.** Mitigation: `tool-fleet:check` renders with the
  patch and the guard's negatives run in the rehearsal.
- **Admin credential misuse.** The reconciler holds the local admin password. Mitigation:
  owner-only file on h4claw; private endpoint.

## Open questions for the owner

1. **Placement if the rule fails.** Resize h4claw, take it out of the gate pool, or use h3mon?
   (H13)
2. **Port.** `8443` behind the private socket, or 443 through Traefik with an allow-list? (H9)
3. **Sizes.** 40 GiB in four filesystems with 10 / 10 / 3 GiB quotas, or other numbers? (H4)
4. **Environments.** Which environment names may appear in `promoted-<environment>`? This design
   assumes `dev` and `prod` per product.
5. **Alert destination.** Which Slack channel or other endpoint receives quota and fill alerts,
   and who reads it? (decision 9)
6. **Weekly advisory read.** Who does it?
7. **Backup before deletion.** Accept deletion that is not gated on a verified backup, or have
   the backup command trigger retention and collection itself after it succeeds? The second
   option is a small piece of bespoke sequencing.
8. **Platform pin.** Keep installing through a fleet-owned unit, or use this change as the
   occasion to advance the pin? (H1)
9. **Superseded changes.** Agree to mark `bound-registry-storage` and
   `integrate-registry-journal-foundation` superseded as described in decision 11?

## Not verified

- Per-component memory of Harbor. No primary source gives it.
- Harbor 2.15.4 on Kubernetes 1.36, and admission of every chart pod under `restricted`.
- That a caller-supplied robot secret is accepted as the swagger file describes, and the robot
  name format for project robots.
- That a push robot without delete permission can move an existing tag.
- The client-visible error for a push over quota and for a full filesystem.
- Whether concurrent pushes can take a project past its storage quota.
- Whether a deletion releases quota at once or only at the next collection.
- Retention with `untagged` false and the children of a multi-architecture index.
- The time zone and exact cron grammar of retention and collection schedules.
- The quota warning threshold.
- That `read_only` set through the API blocks writes the way the UI checkbox does, and how a
  running collection behaves under it.
- `pg_dump` and `pg_restore` as a restore path for Harbor's database. Harbor documents Velero only.
- Whether Harbor's Distribution fork carries the fixes for the 2026 Distribution advisories.
- That `crane copy` into Harbor preserves the manifest digest.
- That a read-only volume is exempt from the pod's `fsGroup` ownership change.
- On h4claw, all unread: the installed platform revision, whether port 8443 is free and admitted
  by the fleet firewall, whether container images share the root filesystem, whether UID 999 or
  10000 names a host account, N and A, whether a node exporter reports per-mount fill, and
  whether Traefik binds every interface.
- h3mon's current free memory and disk.
- Any live alert destination.
- The upgrade path from 2.15 to 2.16 beyond what the Helm upgrade page states.
