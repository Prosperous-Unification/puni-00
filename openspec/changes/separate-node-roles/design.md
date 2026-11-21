## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. This is the fourth draft of the change, revised
after a fourth review and the owner's decisions of 2026-11-23;
[verify.md](verify.md#replaced-drafts) records the drafts it replaces, what the four reviews
found, and how ids moved.

What runs today:

- `infra/fleet/desired.yaml` declares one platform cluster, fleet id `platform`, with
  `controlPlane: single`. h4claw carries `control-plane`, `product` and `ingress`; h3mon carries
  `observability`. The live cluster's identity is `platform-production`.
- Flux delivers it. `infra/clusters/platform/production` holds eleven Flux units in a
  `dependsOn` graph, and nine workloads are Flux `HelmRelease` objects. Its platform source is
  pinned to one commit; a private fleet source follows a branch and owns the website units, the
  ACME issuers and two registry Secrets.
- h4claw is also a gate host. h2puni is a gate host, never a k3s node, and runs WBS production
  and dev on Compose, the dev website stack, the dev poller and the release builds. WBS dev
  follows `main` through that poller and holds the agents' live tracker.
- The cluster's `website-dev` namespace holds the dev website and the dev request app.
- Elasticsearch and Prometheus have never run in this cluster: the stages `observability`,
  `alerts` and `backup` are not Ready.
- h1claw pulls hourly snapshots of the Compose databases on h2puni and a daily one of MLflow on
  h3mon, prunes the SQLite prefixes in the bucket, and sends the freshness alert
  ([recovery](../../../docs/infra/recovery.md)). It also holds the key of that encrypted archive.

What the repository can already do from an empty host, and what Argo CD changes about it:

| Need                            | Source                                                                                                       | Reusable for the new cluster                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| First server with embedded etcd | `playbooks/bootstrap.yml`: `base`, `network`, `storage`, k3s server                                          | yes                                                                   |
| Agents                          | `playbooks/join.yml`, `validate-enrollment.yml`, `firewall.yml`                                              | yes                                                                   |
| etcd snapshots and cold restore | `playbooks/backup.yml`, `restore.yml`, `tool-fleet:recover`                                                  | yes, after slice 2.6                                                  |
| Gate host                       | `playbooks/gate-host.yml` and the gate-host runbook                                                          | yes                                                                   |
| Delivery and the stage graph    | `playbooks/platform.yml`, `infra/clusters`, `validatePlatform`                                               | no: Flux only (decision 3)                                            |
| Workload definitions            | `infra/platform`: plain manifests and Flux `HelmRelease` objects                                             | plain ones as copies; each `HelmRelease` is rewritten                 |
| Secrets                         | SOPS files decrypted in the cluster by Flux                                                                  | no (decision 5)                                                       |
| WBS on k3s                      | `deploy/k8s/wbs` with `staging` and `prod` overlays; the [cutover plan](../../../docs/infra/cutover-plan.md) | manifests yes; both overlays name the same two namespaces (slice 3.5) |

## Goals / Non-Goals

**Goals**

- One node role per host, in the fleet model and in workload selectors.
- The new cluster delivered by Argo CD from a tree of its own: staging follows `main`,
  production and the platform change on command.
- OpenBao as the first service after Argo CD, so every later Secret comes from it.
- A build order in which every stage has a receipt.
- A sized, grounded budget for each node.
- A plain list of what must survive the switch and what proves that it did.

**Non-Goals**

- Designing Harbor, OpenBao, the WBS overlays or how a merge becomes an image. Their changes
  own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- Moving workers clusters or the existing labs off Flux (R27).
- High availability, continuous SQLite replication, single sign-on for Argo CD.
- A switch without downtime (R26).
- Any duty of h1claw (R30).

## Assumptions

Fixed by the owner on 2026-11-21: the four roles, the three production apps, Elasticsearch and
Prometheus as the observability stack, SQLite, a cluster recreated from scratch, Argo CD as its
delivery tool, and that the switch may be unsafe. Fixed on 2026-11-23: OpenBao is set up before
everything else; `main` deploys to staging and production deploys on command; staging shares
the apps node; alerts go to Slack; MLflow is kept; h1claw may be deleted at any time; the
recommendations then on the table are accepted. A row
marked **decided** records one of those; the rest are assumed and can be overruled by id. R14
and R18 of the second draft stay withdrawn.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                     | Alternative and its cost                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new cluster is built on newly created servers. An old host is deleted once its data is confirmed restored and, for a gate host, once its successor is calibrated                                                                                                                                                                                                                           | Reinstall the existing servers. Cost: gates stop for other sessions while a gate host is rebuilt                                                                          |
| R2  | **Decided.** Three servers of 8 vCPUs and 16 GiB, and a CI host of 16 vCPUs and 32 GiB. The observability server's root disk is at least 180 GiB (decision 2)                                                                                                                                                                                                                                  | A CI host of the smaller class. Cost: one gate at a time at about 5 h 20 min                                                                                              |
| R3  | **Decided.** Node ids and host names are `h5plat`, `h6apps`, `h7obs` and `h8ci`                                                                                                                                                                                                                                                                                                                | none                                                                                                                                                                      |
| R4  | **Decided.** The owner creates each server in the provider console; it is enrolled by static inventory                                                                                                                                                                                                                                                                                         | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                               |
| R5  | The new cluster keeps the cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed. **Decided:** machine ids and private addresses are recorded where the fleet model records them today                                                                                                                       | A new cluster id. Cost: the id list is closed in the `backup` role, `platform.ts` and `recover.ts`                                                                        |
| R6  | New: k3s credentials, a SOPS age identity that never enters the cluster, the repository read keys, the Argo CD account, everything OpenBao generates. Carried from escrow: the registry CA, the object storage credentials                                                                                                                                                                     | Reuse every secret. Cost: the old cluster's credentials would open the new one                                                                                            |
| R7  | Build order: platform, CI, observability, apps, then retirement (decision 6)                                                                                                                                                                                                                                                                                                                   | Apps before observability. Cost: data arrives before the alert and backup units are healthy                                                                               |
| R8  | One new capability, `platform-services`, pins Argo CD, cert-manager, Harbor, OpenBao and the External Secrets Operator                                                                                                                                                                                                                                                                         | One label per service, as pull request #935 proposes with `secret-store`. Cost: several labels that always sit on one node                                                |
| R9  | Storage stays node-local with policy `Retain`                                                                                                                                                                                                                                                                                                                                                  | Provider volumes. Cost: SQLite on a network volume is what the owner ruled out                                                                                            |
| R10 | Harbor is the only registry the new cluster ever runs. Its tree has no Distribution unit                                                                                                                                                                                                                                                                                                       | Install Distribution first. Cost: a registry replaced before its first consumer                                                                                           |
| R11 | **Decided.** The website and the request app run on the new cluster from the same release pins and source registry as today, moved after the release bootstrap finishes; the session that owns it writes the fleet repository's directory for the new cluster                                                                                                                                  | Route them to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                 |
| R12 | The CI role is gates and release builds, nothing else. No app, staging or production, and no database runs there                                                                                                                                                                                                                                                                               | Dev stacks on the CI host, as the third draft had it. Cost: the agents' tracker slows under every gate and sits beside branch code                                        |
| R13 | **Decided.** Backups of everything on the new cluster run inside it: each app's own backup job, and retention and the freshness alert as cluster units (slice 3.1)                                                                                                                                                                                                                             | Keep an outside puller. Cost: a host whose only job is to watch another                                                                                                   |
| R15 | **Decided:** MLflow is kept. Assumed: it runs on the observability node as a cluster unit with a `Retain` claim and the same backup job as the apps (slice 3.6); Victoria and Grafana are not rebuilt                                                                                                                                                                                          | A Compose service with a host timer. Cost: a second backup mechanism for one store                                                                                        |
| R16 | Each node is probed from another node; the observability node from the platform node                                                                                                                                                                                                                                                                                                           | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                               |
| R17 | The Ansible controller lives on the operator workstation and reaches private addresses through a jump on `h5plat`. When `h5plat` is off, the jump is the target server's own public SSH endpoint, which the fleet firewall keeps open                                                                                                                                                          | A jump on the CI host. Cost: a host that runs branch code sits on the path to every node                                                                                  |
| R19 | One root Application owns plain Application files (app of apps). It syncs automatically and manages only Application and AppProject objects. The ApplicationSet controller is not installed                                                                                                                                                                                                    | An ApplicationSet with a cluster generator. Cost: a generator and a controller for one cluster                                                                            |
| R20 | **Decided.** The owner on 2026-11-23: what merges to `main` is deployed on staging; a production deployment is done by hand, on command. Staging Applications sync automatically from `main`. Production Applications track `main` with automated sync off. Assumed: platform units have no staging copy and are synced on command too                                                         | Platform units automated. Cost: a merged infrastructure change rolls out with no second look, on the one cluster there is                                                 |
| R21 | The new cluster's definitions live under `infra/argocd` and share no file with a Flux-reconciled path, except chart archives locked by digest                                                                                                                                                                                                                                                  | Reference the existing plain manifests. Cost: an edit for one cluster reaches the workers clusters and the labs                                                           |
| R22 | **Decided.** The owner on 2026-11-23: OpenBao is set up before the other services. No decryption runs in the cluster. Ansible applies only the bootstrap Secrets that Argo CD and OpenBao themselves need (decision 5); every other Secret is an ExternalSecret from the first day                                                                                                             | Bootstrap Secrets for the first stages. Cost: a second delivery path, built to be removed                                                                                 |
| R23 | **Decided.** The Argo CD interface has no public route and one local account, which reads everything and may sync Applications of the `production` project only, at the revision the Application names. The built-in `admin` account is disabled. Break-glass is `kubectl` on the platform node                                                                                                | Keep `admin` enabled. Cost: a second write path with one shared password                                                                                                  |
| R24 | Argo CD's four workloads are limited to 1,536 MiB together until A8 measures them                                                                                                                                                                                                                                                                                                              | No limits. Cost: the repo server's rendering can take memory from the secret store                                                                                        |
| R25 | The platform node is registered with the taint `CriticalAddonsOnly=true:NoSchedule`. Platform services and three named node agents tolerate it; nothing else may                                                                                                                                                                                                                               | Node selectors alone. Cost: a workload outside the checked tree can land beside the secret store                                                                          |
| R26 | **Decided.** The switch may be unsafe. The owner on 2026-11-21: "we can make the switch unsafe that's ok / no prod users yet". It holds only while there are no production users; the guards of decision 7 stay                                                                                                                                                                                | A staged switch with fences and a retained old side. Cost: the ceremony of the second draft                                                                               |
| R27 | Workers clusters and the existing labs stay on Flux. The repository carries two delivery tools until a later change                                                                                                                                                                                                                                                                            | Move them now. Cost: no workers cluster exists in production to prove it on                                                                                               |
| R28 | **Decided.** WBS production crosses the simple way, like the website: stop, one backup, restore, start. The cutover plan's first-start coordinator and its replay and digest guards are not used for the move. Its images come from Harbor                                                                                                                                                     | The guarded cutover plan. Cost: its coordinator reads and patches Flux objects and would have to be ported first                                                          |
| R29 | **Decided:** staging lives on the production apps node as namespaces, under a capability of its own, `staging`, so a later split is a label move (decision 1). Assumed: staging is one environment and replaces today's dev: the `website-dev` namespace, and WBS staging in place of the Compose dev stacks. The WBS dev database, the agents' live tracker, becomes the staging WBS database | A fifth server for staging now. Cost: one more host before there is a production user. Dev and staging as two environments. Cost: two non-production copies of three apps |
| R30 | **Decided.** h1claw is outside this plan: the owner may delete it at any time. Two consequences are accepted unless he acts on them: the stores on the old hosts have no off-host backup from that moment until each has moved, and the existing encrypted archive is unreadable unless its key is escrowed first (task 0.5)                                                                   | Keep h1claw until retirement. Cost: a host and its upkeep for stores that are leaving                                                                                     |

## Decisions

### 1. Roles, capabilities and placement

| Role            | Host   | Capabilities                         | In the k3s cluster |
| --------------- | ------ | ------------------------------------ | ------------------ |
| Platform        | h5plat | `control-plane`, `platform-services` | server             |
| CI              | h8ci   | none: it is not a k3s node           | no                 |
| Observability   | h7obs  | `observability`                      | agent              |
| Production apps | h6apps | `product`, `staging`, `ingress`      | agent              |

- `platform-services` and `staging` are new. Each is added to `CapabilitySchema`,
  `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`.
- The server carries none of `product`, `staging` and `ingress`, and no gate host is a k3s
  node.
- The production apps node carries production and staging (R29). The role is "runs the apps";
  the two environments are separated by namespace, AppProject, OpenBao path, claim and
  capability, not yet by node. Staging workloads select `staging` and production workloads
  select `product`; today one node carries both labels. Giving production a server of its own
  later is then no manifest change: add a node, move the `staging` label to it, and restore
  the staging stores there, since their volumes are node-local.
- What sharing the node costs meanwhile: staging deploys from `main` by itself and carries the
  agents' tracker load beside production. Memory is bounded by limits; CPU, disk I/O and the
  node's disk are shared; a container escape in staging reaches production data. The planning
  session recommends the split at the first real production user, or sooner if staging load
  measurably slows production. That is a recommendation to the owner, not part of this plan.
- The server template already writes `node-taint` entries. A server that carries
  `platform-services` is registered with `CriticalAddonsOnly=true:NoSchedule` (R25). The k3s
  documentation names this taint for a dedicated control plane, and the CoreDNS, volume
  provisioner and metrics server that k3s v1.36.4+k3s1 packages tolerate the key
  `CriticalAddonsOnly` (read upstream and on the live cluster,
  [verify.md](verify.md#k3s-behaviour)). A taint of our own would not last: k3s re-applies its
  packaged manifests when it starts. k3s applies `node-taint` only when a node registers, so
  the taint is in the server's first configuration. Flannel and kube-proxy run inside the k3s
  process and need no toleration.
- Every server also registers with the enrollment taint `puni.io/enrollment=pending:NoSchedule`,
  which validation removes at its end. `validate-enrollment.yml` lets CoreDNS start under it
  with a strategic patch of the Deployment's tolerations. That list has no merge key, so the
  patch replaces it and drops the packaged `CriticalAddonsOnly` toleration: on a server that
  carries both taints CoreDNS would stay Pending and validation would fail. Slice 1.2 changes
  the play to append the enrollment toleration and keep the packaged ones.
- CoreDNS, the metrics server and the volume provisioner are packaged by k3s and are not in
  the new tree. k3s gives them no capability selector and reverts a patch that adds one, so
  they may run on any node. The platform budget counts CoreDNS as its worst case.
- Every pod template rendered from the new tree selects a capability, with one named
  exemption. Workloads that select `platform-services` tolerate the taint. The node exporter,
  the OTel collector and the Velero node agent are DaemonSets that run on every node: they
  select no capability and tolerate every taint, as they do today. No other workload may
  tolerate the taint.
- The WBS gateway, frontend and MCP manifests and the Velero server select no node today; the
  new cluster's overlays patch them, because `deploy/k8s/wbs/base` is shared with the lab.
- The capability floors of a cluster apply as soon as it has one node (`decodeFleet`). The new
  cluster entry starts with the floor `platform-services: 1` and gains `observability: 1`, then
  `product: 1`, `staging: 1` and `ingress: 1`, in the revision that adds each node.

### 2. Budgets

Memory in MiB. Limits are used where they exist. Capacity of a 16 GiB server is assumed to be
15,602, the reading of both current nodes.

**Platform node.** Reservations assumed 2,816 (system 1,024, kubelet with the k3s server and
etcd 1,536, eviction 256).

| Workload                                         |     Limit | Source                                             |
| ------------------------------------------------ | --------: | -------------------------------------------------- |
| Harbor                                           |     2,112 | Harbor change, decision 2: planned, to be measured |
| Harbor backup                                    |       768 | Harbor change, decision 2                          |
| OpenBao and the External Secrets Operator        |     1,024 | assumed: pull request #935 measures it             |
| Argo CD: controller, repo server, server, Redis  |     1,536 | assumed (R24): 768, 384, 256 and 128; A8 measures  |
| cert-manager, three pods                         |     1,536 | sizing document; no limits set live, 115 in use    |
| CoreDNS                                          |       170 | live limit; not pinned, counted here as worst case |
| Node exporter, OTel collector, Velero node agent |     1,408 | sizing document: 1,920 per node less Traefik's 512 |
| **Sum**                                          | **8,554** | with reservations 11,370; margin 4,232             |

**Production apps node.** Reservations assumed 1,664 (system 1,024, kubelet 384, eviction 256);
allocatable 13,938.

| Workload                                                         |     Limit | Source                                        |
| ---------------------------------------------------------------- | --------: | --------------------------------------------- |
| Traefik                                                          |       512 | sizing document; no limit set live, 47 in use |
| Production: `puni-website` `site` and its log shipper            |       256 | live limits                                   |
| Production: `puni-request-app`                                   |       640 | assumed: not deployed yet                     |
| Production: `puni-user-platform` backend, gateway, MCP, frontend |     2,176 | `deploy/k8s/wbs/base`                         |
| Production: `puni-user-platform` hourly backup and daily verify  |     1,024 | `deploy/k8s/wbs/base`, both counted           |
| Staging: `website-dev` (website and request app)                 |       768 | live limits; 71 in use                        |
| Staging: `puni-user-platform`, the same workloads and jobs       |     3,200 | `deploy/k8s/wbs/base`, counted a second time  |
| Node exporter, OTel collector, Velero node agent                 |     1,408 | sizing document                               |
| **Sum**                                                          | **9,984** | margin 3,954                                  |

Not counted: the host-owned solver supervisor and the solver pods that the WBS manifests
require on the product node, for either environment.

**Observability node.** `infra/platform/observability/base/coexistence.json` describes h3mon:
reservations 1,792, platform requests 6,182, application requests 1,664, preserved Docker
services 2,560, and 5,632 more during a migration overlap. A new node has neither the Docker
services nor an overlap, so its requests are 9,638 of 15,602, or 10,150 with MLflow (R15).
Those are requests. The sizing document's limits for the same node sum to 17,088 and it calls
its figures unmeasured. A14 measures on the node and the owner then keeps or changes its size.

Its disk is decided before the server is created. The declared claims are 114 GiB:
Elasticsearch 100, Prometheus 10, two signal stores of 2 each. With 30 GiB assumed for the
system and images and a fifth of the whole disk kept free, the root disk needs
(114 + 30) / 0.8 = 180 GiB. The kubelet evicts at 10% free on the node filesystem and 15% on
the image filesystem (both k3s templates), so a fifth leaves room above both. The existing
hosts report about 150 GiB, which is below the floor. A12 reads the new server's disk and stops
on a smaller one, and A14 measures growth.

**CI host.** A gate is measured at 6 cores, 9 GiB and 11 GiB of temporary space, and runs under
`min(13 GiB, pool budget − headroom)`. On 16 vCPUs and 32 GiB (R2) two such gates fit side by
side on paper, or one gate can run more tasks in parallel. Which one, and the pool budget and
headroom, are the pool owner's to set from the calibration (A10).

**Disk elsewhere.**

| Node            | What lands there                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots                                                                                                  |
| Production apps | Production SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB. Staging: the same three, with `wbs-data` assumed at 10 GiB because the dev database is 2.2 GB today |
| CI              | gate trees, caches, 11 GiB of temporary space per gate, release build layers                                                                                                           |

### 3. Delivery by Argo CD

Checked against Argo CD v3.6.2, the current release; [verify.md](verify.md#argo-cd-behaviour)
lists what was read and what was not.

**Tree.** Everything the new cluster reconciles from this repository is under `infra/argocd`:

| Path                                        | Holds                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `infra/argocd/install`                      | the vendored install manifest and its kustomize patches                         |
| `infra/argocd/clusters/platform-production` | the three AppProjects and one Application file per unit; the root's source path |
| `infra/argocd/units/<unit>`                 | a kustomize directory or a wrapper chart per unit                               |

No file is shared with a path that a Flux unit reconciles, except the chart archives in
`infra/platform/charts`, which are immutable and locked by digest (R21). The lock has one entry
per chart version: a bump adds an entry and an archive and never rewrites one, and an old
archive stays while any Flux path names it. Plain manifests are copied; a render-equality test
at the copying commit proves each copy against the old stage, apart from Flux kinds, placement
and the rows of the table "What Flux did" below. After that the trees change separately. This
is what keeps the old cluster, the workers clusters and the labs out of reach of this change:
none of their paths is edited, whatever their pins do.

**Install.** Ansible applies `infra/argocd/install` once with a server-side apply, as the
install guide prescribes, after checking the manifest's SHA-256 against
`infra/versions/toolchain.json` (`manifests.argocdInstall`). The kustomization removes Dex, the
notifications controller and the ApplicationSet controller, pins every image by digest, sets
the selector, toleration and limits, and carries the settings of this decision. From then on
an Application named `argocd` holds the same path with `ServerSideApply=true`, which is the
self-management the declarative setup guide describes, without its remote base. The bootstrap
playbook writes the local account's password hash into `argocd-secret`, where Argo CD also
keeps its generated keys. With a server-side apply Argo CD owns only the fields it sends, and
the vendored manifest sends none of that Secret's data. Rehearsal 2.7 asserts that the hash and
the keys survive a sync of `argocd`. If they do not, the kustomization drops `argocd-secret`
from the managed set and the playbook alone creates it.

**Environments, projects and who syncs.**

| Project      | Holds                                                  | Source                                                               | Sync                                                        |
| ------------ | ------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `platform`   | the root, every platform unit, the public-name issuers | this repository; one path of the fleet repository for the issuers    | on command, by the operator                                 |
| `staging`    | the staging copy of the three apps                     | the fleet repository and the WBS deploy repository, staging overlays | automatic from `main`: prune, self-heal, retry with backoff |
| `production` | the three production apps                              | the same repositories, production overlays                           | on command, by the owner                                    |

- The root Application is the one automated Application in `platform`. It reads
  `infra/argocd/clusters/platform-production` and manages only Application and AppProject
  objects, so a merge changes what an Application _is_ at once and what it _deploys_ only when
  that Application is synced. Its self-heal reverts an Application edited in the cluster,
  which is what keeps automation from being switched on for a production unit outside Git. The
  bootstrap playbook applies the three AppProjects and the root; the same files lie in the
  root's source path, so the root adopts them on its first sync.
- `staging` and `production` admit only their own namespaces and no cluster-scoped kind. Every
  namespace is an object of the `namespaces` unit in this repository. The public-name
  `ClusterIssuer` objects live in the fleet repository; their Application belongs to
  `platform`, and the `delivery` check holds a fleet-sourced Application in `platform` to that
  one path.
- **Staging follows `main`** (R20). A merge that changes a staging overlay is applied within
  the reconciliation interval, and a manual edit in the cluster is reverted. A staging overlay
  names images by digest, so staging runs new code only when a merge moves a pin; how a merge
  to `main` of an app becomes a pin is slice 3.7's gap, not solved here.
- **Production is synced on command.** A production Application tracks `main` with no automated
  sync. After a merge it shows OutOfSync with its difference in the interface, and it changes
  when the owner presses Sync there or runs `argocd app sync`. The local account holds
  `applications, sync` on `production/*` and nothing else beyond `role:readonly`. It does not
  hold `override`, and `application.sync.requireOverridePrivilegeForRevisionSync` is set, so a
  sync deploys the revision the Application names and no other.
- **Platform units are synced on command by the operator**, through a sync playbook
  (`playbooks/argocd-sync.yml`, slice 2.5) that runs the locked `argocd` CLI in core mode on
  the server with the node's credential. No Argo CD account can sync a platform unit. If core
  mode cannot sync without the API server's account (rehearsal 2.7(n)), the fallback is a
  second local account limited to `platform`, used by the playbook only.
- **Drift on a unit that is not automated is reported, not repaired.** OutOfSync on a
  production or platform unit means either that `main` is ahead or that the cluster was
  changed; the difference view tells which. `tool-fleet:health` lists such units with their
  age, and once the Prometheus stack runs an alert fires when one has been OutOfSync for 24
  hours (assumed), which calls for either a deployment or a look.
- Break-glass: `kubectl` on the platform node. An edit to a production or platform object
  holds, because nothing self-heals it; the runbook requires the same change on `main` before
  the next sync, which would otherwise undo it. An edit to an Application object needs the
  root's automation disabled first. The root is applied by the playbook and owned by no
  Application, so that setting stays until the playbook runs again.

**Order.** With children that are synced on command, sync waves on the root would order nothing
useful: a wave waits for health, and a unit that has never been synced has none. The health
customization for `argoproj.io/Application` is therefore not restored, and no Application
carries a sync-wave annotation. The order of the first sync is data instead: every Application
file carries `puni.dev/sync-order`, the `delivery` check holds it to the table below, and the
sync playbook syncs the units it is given in that order, waiting for each to be Synced and
Healthy and refusing a unit while a unit of a lower order in the tree is not.

The order is derived from what each unit reads, not from the Flux stage names.

| Order | Units                                                     | Project    | Needs                                                                                                              | First synced                         |
| ----: | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
|     0 | `argocd`                                                  | platform   | nothing                                                                                                            | A4                                   |
|     1 | `namespaces`                                              | platform   | nothing; the playbook applied them already                                                                         | A4                                   |
|     2 | `policy`, `storage`                                       | platform   | the namespaces                                                                                                     | A4                                   |
|     3 | `cert-manager`                                            | platform   | its namespace                                                                                                      | A4                                   |
|     4 | `openbao`                                                 | platform   | the seal key and the server CA Secret, applied by the playbook; `storage`; cert-manager for its server certificate | A7                                   |
|     5 | `external-secrets`                                        | platform   | `policy`                                                                                                           | A7                                   |
|     6 | `secret-sync`                                             | platform   | OpenBao serving; the operator's CRDs                                                                               | A7                                   |
|     7 | `issuers`                                                 | platform   | the Secret `registry-ca` from order 6; cert-manager                                                                | A7                                   |
|     8 | `otel-certificates`, `eck-operator`, `prometheus-stack`   | platform   | the Secret `otel-server-ca` from order 6                                                                           | A14                                  |
|     9 | `elasticsearch`                                           | platform   | the ECK CRDs                                                                                                       | A14                                  |
|    10 | `kibana`, `elastic-settings`, `otel-collector`, `signals` | platform   | Elasticsearch and the Secrets ECK makes for it; the certificates of order 8; the Prometheus stack                  | A14                                  |
|    11 | `alerts`, `probes`                                        | platform   | the Prometheus stack                                                                                               | A14                                  |
|    12 | `velero`, `elastic-snapshots`, `sqlite-custody`, `mlflow` | platform   | `alerts`, as the Flux `backup` stage does                                                                          | A14; `mlflow` A15                    |
|    13 | `traefik`                                                 | platform   | a node that carries `ingress`                                                                                      | A17                                  |
|    14 | `harbor`                                                  | platform   | OpenBao serving; `storage` and `issuers`                                                                           | Harbor's change, before any WBS unit |
|    15 | `public-issuers`                                          | platform   | Traefik; cert-manager                                                                                              | A18                                  |
|    16 | `website-staging`, `wbs-staging`                          | staging    | orders 13 and 15; their Secrets in OpenBao; Harbor for WBS                                                         | A18                                  |
|    17 | `website`, `wbs`                                          | production | the same, for production                                                                                           | A19; A20                             |

- **OpenBao is first among the services** (R22). The four units before it are Argo CD, the
  namespaces, policy and storage it runs under, and cert-manager, which is there only because
  pull request #935 issues OpenBao's server certificate from a cert-manager CA issuer. Nothing
  else precedes it.
- `secret-sync` holds the store object and every platform ExternalSecret, as pull request #935
  shapes it; it grows with each stage. The plan relies on Argo CD's bundled health check for
  ExternalSecret, so the unit is Healthy only when every value has arrived.
- `issuers` holds the registry CA issuer and the staging ACME issuer. The `otel-server` Issuer
  and Certificate, which read the Secret `otel-server-ca`, are their own unit,
  `otel-certificates`.
- A Secret has one of four providers, and its consumer has a higher order than the providing
  unit: the bootstrap playbook, an ExternalSecret, a Certificate in the tree, or an operator
  named in a short table that slice 2.8 adds. One exception: a Job may read a Secret that an
  operator makes for a custom resource of the Job's own unit, as `kibana-objects` reads
  `kibana-kb-http-certs-public`; its pod waits for the Secret.
- `elastic-settings` is a Job that reads the two Secrets ECK makes for Elasticsearch. The Flux
  tree keeps it in the observability base; here it is a unit of its own, one order after
  `elasticsearch`, like `signals`.
- `harbor` precedes the WBS units because WBS pulls its images from Harbor (R28). The website
  and the request app do not (R11), so a missing Harbor holds back WBS only.
- An Application file is merged in the revision that adds its node or its dependency.
- The `alerts` unit carries only rules whose subject exists at that revision. The copied rule
  set has a group that watches the WBS backup CronJob and a rule that watches a workers
  cluster. The WBS group lands with each WBS Application; the workers rule is not copied
  (R27). The stale-backup rule of each app lands with that app, not with `sqlite-custody`.

**What the order guarantees.** It orders the first sync of each unit and nothing after it. A
later change to two platform or production units is synced by a person, who names the order.
A later change to two staging units is applied by each Application on its own; what protects
that case is convergence: every staging Application retries a failed sync with exponential
backoff and self-heals.

**Charts.** Argo CD renders a chart with `helm template` and owns the lifecycle itself; there is
no Helm release in the cluster. Each chart gets a wrapper chart directory whose `Chart.yaml`
names the archive as a dependency and whose `charts/` directory holds it. The repo server runs
`helm template` in that directory and calls `helm dependency build` only on a missing
dependency (read in its source), so nothing is fetched at render time. Consequences:

- Helm hooks are mapped onto Argo CD hooks: install and upgrade hooks become `PreSync` or
  `PostSync`, test hooks are skipped, and delete policies follow sync phases. cert-manager's
  start-up check and the Prometheus stack's webhook jobs are such hooks. Velero's CRD upgrade
  job is switched off in its values (`upgradeCRDs: false`).
- Three archives carry CRDs in a `crds/` directory: Traefik (25 files), Velero (13), and the
  Prometheus stack, whose ten lie one level down, in the `crds/` directory of a subchart named
  `crds`. A Helm source includes them unless `skipCrds` is set. A kustomize unit that inflates
  a chart leaves them out unless `includeCRDs: true` is set, so the Velero unit sets it. Rule
  2.4(j) looks for `crds/` at any depth of an archive, and rehearsal 2.7(k) reads all three
  sets back; orders 9 to 12 depend on the Prometheus ones.
- A chart that generates a random value renders a new one on every comparison. Every such
  value is supplied from a Secret. This matters most for Harbor (decision 9).
- Charts with large CRDs use the `ServerSideApply=true` sync option: client-side apply fails
  above the 262,144-byte annotation limit.
- Fields that a controller writes after apply, such as the CA bundle that cert-manager injects
  into webhook configurations, are listed under `ignoreDifferences`. Slice 2.7's receipt is
  the list.

**What Flux did that Argo CD must be told.** Found by searching the manifests the new tree
copies for Flux annotations, and the Flux units and `HelmRelease` objects for fields with no
Argo CD default. A render-equal copy would silently lose each row.

| Flux semantic and where it is used                                                                                                                    | In the new tree                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssa: IfNotPresent` on the ConfigMap `wbs-solver/puni-trusted-workload`: created once, then the release coordinator owns `solverImages`               | `ignoreDifferences` on `/data/solverImages` with `RespectIgnoreDifferences=true`. The option acts only on an existing object                |
| `force: enabled` on the Jobs `elastic-snapshots`, `elastic-settings` and `kibana-objects`: deleted and recreated when their spec changes              | The annotation `Force=true,Replace=true` on those three Jobs. `Force` alone is ignored under server-side apply                              |
| `dependsOn` between `HelmRelease` objects: Elasticsearch after the ECK operator; Kibana and the OTel collector after Elasticsearch                    | Orders 8 to 10 of the first sync                                                                                                            |
| `dependsOn`, `wait` and `timeout` on the Flux units                                                                                                   | The sync order, with each unit Healthy before the next; retry with backoff on staging                                                       |
| The `target` unit's health check on the ConfigMap `kube-system/puni-cluster-platform-production`: a wrong cluster reconciles nothing                  | The bootstrap playbook refuses a cluster whose identity ConfigMap differs. Every Application targets the cluster it runs in                 |
| `kubeConfig.secretRef` on every unit                                                                                                                  | Not needed: no Application names a remote cluster                                                                                           |
| `decryption: sops` on every unit                                                                                                                      | None, by decision 5                                                                                                                         |
| `prune: true`                                                                                                                                         | Prune on every sync, automatic on staging only; `Prune=false` on data                                                                       |
| `postRenderers` on the Velero `HelmRelease`: size limits on two `emptyDir` volumes                                                                    | A kustomize unit that inflates the chart and patches it (`kustomize.buildOptions: --enable-helm`). Fallback: a committed render             |
| A kustomize patch on a `HelmRelease`'s `spec.values` (the cluster name in the Prometheus stack)                                                       | The value moves into the wrapper chart's values file                                                                                        |
| Helm release history, rollback and `helm test`                                                                                                        | None: the chart is rendered. Going back is a revert on `main` and a sync                                                                    |
| Variable substitution after the build                                                                                                                 | Not used: the only `${…}` in these manifests is shell                                                                                       |
| `healthCheckExprs` on the `certificates` unit: a Certificate is failed when `Ready` is False and current only when `Ready` is True for its generation | Argo CD's bundled health check for `cert-manager.io/Certificate`. Rehearsal 2.7(l) watches a failing Certificate keep its unit from Healthy |
| Chart `crds/` directories (Traefik, Velero, the Prometheus stack's subchart), which a `HelmRelease` installs by its CRD policy                        | Included by a Helm source; `includeCRDs: true` in the Velero kustomize unit                                                                 |
| The Helm release name. Flux uses the `HelmRelease` name, and `otlp-ingress.yaml` selects pods by `app.kubernetes.io/instance: otel-collector`         | Every wrapper sets `releaseName` to the old release's name, and the equality test compares it                                               |

Rehearsal 2.7 observes the first two rows, the Velero row and the last three. For the Velero
fallback, the `delivery` check proves the committed render equal to the chart's output.

**Removing a unit takes two merges.** No Application carries the resources finalizer, so removing
an Application file leaves its workloads running, unmanaged. First the unit's source is reduced
to one marker ConfigMap and the unit is synced with prune, which removes the workloads and
leaves the data; then its Application file is removed. The marker is what makes this work:
automated prune refuses a source that renders nothing unless `allowEmpty` is set.

**What guards `main`.** The bootstrapping guide's warning applies: whoever can change the
root's source is an administrator of the cluster. That source is a path on `main`, so the
boundary is the ruleset that task 0.6 sets and reads back: a pull request and the required
checks, no direct, forced or deleting push. Read on 2026-11-21, `main` here requires a pull
request with zero approvals and two status checks, `gate` and `pixels`, without the up-to-date
requirement; `tool-fleet:check` runs only in a workflow that is not required. The `delivery`
rules therefore also run as a test over the real tree inside `gate` (slice 2.4). The fleet
repository's `main` had no rule; task 0.6 gives it one before A2 writes there. With R20 a merge
reaches staging at once and production only through a sync, so the ruleset is the whole guard
for staging and half of it for the rest.

The server has a ClusterIP Service, no Ingress and a NetworkPolicy; it is reached by
`kubectl port-forward` through the operator's tunnel. `policy.default` is `role:readonly`, and
the built-in `admin` account is disabled (R23).

**Data survives delivery mistakes.** Every PersistentVolumeClaim in the tree, and every
namespace that holds one, carries `Prune=false` and `Delete=false`, so removing a manifest
never deletes it. Claims that an operator creates from a custom resource are not in the tree.
The Elasticsearch, Prometheus and Alertmanager resources carry the same two options, and
Elasticsearch keeps `volumeClaimDeletePolicy: DeleteOnScaledownOnly`, which the copied manifest
already sets. A custom resource deleted by hand is outside what delivery can protect. No
Application carries the resources finalizer, so deleting an Application leaves its resources.

### 4. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md). Slices 1.1 to 1.3, 2.1 to 2.7 and 2.9 are
needed before the platform stage can start; 2.8, 3.2 and 3.6 before stage 3; 3.1 and 3.5
before stage 4. Slice 3.7 blocks nothing.

| Gap                                                                                                                                                                        | Slice |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No capability for platform services                                                                                                                                        | 1.1   |
| Nothing refuses a server with `product` or `ingress`, a gate host that is a k3s node, or an untainted server                                                               | 1.2   |
| `validate-enrollment.yml` replaces CoreDNS's tolerations, and has never run on a cluster of one tainted node                                                               | 1.2   |
| One static inventory and one hard-coded cluster id in `placement.test.ts`                                                                                                  | 1.3   |
| The coexistence record and reservations describe h3mon with its Docker services                                                                                            | 1.4   |
| `observability-source.ts` hard-codes the inventory path, the two peers and the API endpoint                                                                                | 1.5   |
| No locked Argo CD install and no locked `argocd` CLI                                                                                                                       | 2.1   |
| Every chart is consumed through a Flux `HelmRelease`                                                                                                                       | 2.2   |
| The platform-stage manifests exist only under Flux-reconciled paths                                                                                                        | 2.3   |
| `validatePlatform` checks Flux units; nothing checks an Application graph, its environments, its isolation or its placement                                                | 2.4   |
| `tool-fleet:check` is not a required check, so a merge can skip the `delivery` rules                                                                                       | 2.4   |
| `playbooks/platform.yml` installs Flux and needs the age key on the server; only it writes the cluster identity ConfigMap; nothing syncs a unit on command                 | 2.5   |
| The controller image has no `sops`, and `fleet_ansible` mounts no fleet checkout                                                                                           | 2.5   |
| `tool-fleet:health` reports "no Flux objects" as a failure; the recovery manifest and drill assume Flux                                                                    | 2.6   |
| The lab's `platform` profile runs Flux; nothing rehearses the new tree, a one-node start or staged joins                                                                   | 2.7   |
| The observability, alert and backup manifests exist only under Flux-reconciled paths; the copied alert rules watch a CronJob and a cluster that do not exist yet           | 2.8   |
| The only build runbook is written for two adopted hosts                                                                                                                    | 2.9   |
| Retention and the freshness alert for `sqlite/<database>/` run on h1claw; both clusters would share the prefix                                                             | 3.1   |
| No probe of a node from outside itself                                                                                                                                     | 3.2   |
| The gate instructions name h2puni and h4claw                                                                                                                               | 3.3   |
| `desired.yaml` and the inventories still name the old cluster after retirement                                                                                             | 3.4   |
| The WBS `staging` and `prod` overlays both render the namespaces `wbs` and `wbs-solver`, select no node for three workloads, set no cluster prefix and expect SOPS Secrets | 3.5   |
| MLflow runs as a Compose service with no backup of its own                                                                                                                 | 3.6   |
| Nothing turns a merge to `main` into an image pin in a staging overlay                                                                                                     | 3.7   |

Outside this repository: the fleet repository's check and its website overlays are written for
Flux (decision 9).

### 5. Secrets

OpenBao is the store for every Secret a workload reads, from the first day (R22). What is left
for Ansible is what must exist before OpenBao can serve or Argo CD can read a repository.

The age private key stays on the controller and in escrow. Encrypted files for the new cluster
live in the private fleet repository, in a directory that no Application reads, encrypted to
the new recipient. The bootstrap playbook decrypts them on the controller and applies them
through the API; nothing is written to the node's disk. Namespaces come first: the playbook
applies the `namespaces` unit before any Secret. The playbook is idempotent and takes the
secret file list as input, so a Secret that arrives later is added by running it again; slice
2.5 tests a second run that adds one file and changes nothing else.

**Applied by the bootstrap playbook.**

| Secret                                                                                | Namespace                     | New or carried | When                                   | Before the cluster exists           |
| ------------------------------------------------------------------------------------- | ----------------------------- | -------------- | -------------------------------------- | ----------------------------------- |
| Read keys for the fleet repository and the WBS deploy repository; host keys           | `argocd`                      | new            | A4, and its rerun before the first app | fleet repository, encrypted         |
| Local account password hash                                                           | `argocd`                      | new            | A4                                     | fleet repository, encrypted         |
| OpenBao seal key                                                                      | OpenBao's namespace           | new            | A7                                     | fleet repository, encrypted; escrow |
| OpenBao server CA signing Secret                                                      | as pull request #935 names it | new            | A7                                     | fleet repository, encrypted         |
| What else #935's bootstrap set gives OpenBao itself, such as its snapshot credentials | OpenBao's namespace           | as #935 states | A7                                     | fleet repository, encrypted         |

**On hosts, not in the cluster.** The k3s server and agent credentials (new, A2) and the object
storage credentials for etcd snapshots (carried, written by the `backup` role in A5). The new
SOPS age identity never leaves the controller and escrow.

**Written into OpenBao by the owner, read through ExternalSecrets.** Paths are separate per
environment, and the store's Kubernetes roles are bound per namespace, so a staging workload
cannot read a production path.

| Secret                                                         | Consumer                 | New or carried                         | Written in | Source                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------ | -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry CA key pair                                           | `issuers`                | carried                                | A7         | escrow                                                                                                                                                                                 |
| `velero-credentials`, `velero-repo-credentials`                | `velero`                 | carried; generated                     | A14        | escrow; the repository password is escrowed before it is written                                                                                                                       |
| `elastic-s3-credentials`                                       | Elasticsearch snapshots  | carried                                | A14        | escrow                                                                                                                                                                                 |
| `alertmanager-puni`                                            | Alertmanager             | new                                    | A14        | **decided:** alerts go to Slack. The owner writes the incoming-webhook address; the channel is his to name (open question 1), and until then the configuration has no outside receiver |
| `otel-server-ca`, `otel-client-trust`, nine `signal-*` Secrets | observability            | new                                    | A14        | generated by the operator                                                                                                                                                              |
| MLflow backup credentials                                      | `mlflow`                 | carried                                | A15        | escrow                                                                                                                                                                                 |
| Staging app Secrets: runtime, pull and backup credentials      | staging namespaces       | carried from dev                       | A18        | the fleet repository under the old key; the dev stacks' env files                                                                                                                      |
| Production app Secrets                                         | production namespaces    | carried; WBS as its overlay names them | A19, A20   | the fleet repository under the old key; escrow                                                                                                                                         |
| Harbor's Secrets and robot credentials                         | Harbor and its consumers | as the Harbor change states            | its steps  | generated                                                                                                                                                                              |

Not carried: the registry's `registry-auth` (Harbor's robots replace it). Kept outside any
cluster: the backup archive key, which only reads the old archive, and the old cluster's age
identity, which A18 and A19 use on the controller to read the website's present Secrets.

**While OpenBao is sealed or down.** The External Secrets Operator stops refreshing. Secrets
already written to the cluster stay, so running pods keep running and restart normally. A new
ExternalSecret gets no value, its unit is not Healthy, and the sync playbook stops there.
Nothing else waits. A cold rebuild restores the store before any consumer is synced. Pull
request #935 owns the alerts for a sealed store and a failed sync.

### 6. Build order

| Stage | Role          | Needs                                                                             | Receipt that ends the stage                                                                                                                       |
| ----- | ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Decisions     | none                                                                              | overrules recorded; the secrets of task 0.5 read back from escrow; both `main` rulesets read back; the slices decision 4 lists for stage 1 landed |
| 1     | Platform      | stage 0; pull request #935 merged and amended, for A7 only                        | server Ready; orders 0 to 7 Synced and Healthy; a canary read from OpenBao through an ExternalSecret; one etcd restore on the empty cluster       |
| 2     | CI            | nothing from the cluster                                                          | a gate exits 0 on the new host and its calibration is recorded by the pool's owner                                                                |
| 3     | Observability | the server; OpenBao serving; slices 2.8, 3.2 and 3.6                              | orders 8 to 12 Healthy; memory and disk measured; a test alert raised                                                                             |
| 4     | Apps          | the server; orders 11 and 12 Healthy; slices 3.1 and 3.5; Harbor serving, for WBS | staging and then production answer on their names with their data checked against the final backup                                                |
| 5     | Retirement    | stage 4's receipts; stage 2's receipt for the gate hosts                          | old servers deleted; `desired.yaml` and the inventories name only the new cluster                                                                 |

- **Platform first, and OpenBao first on it.** Every other node joins this server, and every
  later unit reads its Secrets from the store.
- **CI second.** It depends on nothing in the cluster and has the longest lead: three
  calibrations of over five hours each on today's hosts. The old gate hosts keep gating until
  then. It may run in parallel with stages 1 and 3.
- **Observability third.** Alerts and backups wait on it.
- **Apps last, staging before production.** They carry the data, and staging is the rehearsal
  of the production move.

Harbor lands on the platform node by its own change. It blocks the two WBS units and nothing
else.

### 7. The switch

The switch is unsafe by decision (R26). An app is stopped on the old side, backed up once,
restored on the new cluster and started; then DNS is pointed at the new node and cert-manager
issues fresh certificates there. The app is down from the stop until issuance completes.
Nothing is fenced, staged or kept in step.

The only guards:

1. **Irreplaceable data is verified before its old host is deleted.** The WBS dev database,
   which is the agents' live tracker; the WBS production database; the website data; MLflow.
   Each gets one final backup after its writer is stopped, a restore of that named stamp, and
   a check against the backup's report. A store is restored while its workload is at zero
   replicas and its backup job is suspended. Until the old host is deleted, going back is
   starting the old app again and pointing DNS back.
2. **What the new cluster needs from escrow is read back first** (task 0.5): the registry CA
   key pair, the object storage credentials, the old cluster's age identity, and the backup
   archive key. This happens before stage 1 and before h1claw is deleted (R30).
3. **The new side backs itself up under its own prefix.** The k3s runner writes
   `sqlite/<database>/` with no cluster part and restores the newest report, so two clusters on
   one prefix can restore each other's data. The new cluster's overlays set a prefix that names
   the cluster and the environment and lies outside `sqlite/`. A host is deleted only after one
   verified backup exists on the new side that was taken after the restore and holds the
   restored data.
4. **The old Flux paths stay unedited** (decision 3).
5. **Gates do not stop for other sessions.** No gate host is deleted before the new CI host is
   calibrated.
6. **Staging never receives production data.** The staging stores are restored from the dev
   stores only.

The final backup of a store on an old host is taken with the store's own tool after its writer
stops: the cluster's backup job for the website, and for the Compose databases and MLflow a
`sqlite3` `.backup` on the host with `integrity_check` and a recorded SHA-256. If h1claw still
exists its pull may serve instead; the plan does not depend on it.

### 8. What crosses and what is left

| What                             | How                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| WBS dev database                 | Final backup on h2puni after the dev stack stops, restored into the staging WBS claim (R29)                                                |
| WBS production database          | Final backup on h2puni after production stops, restored into the production claim (R28)                                                    |
| Website data, dev and production | The website's own backup job run once after scale-down, restored into a new claim                                                          |
| MLflow store                     | Final backup on h3mon after the service stops, restored into the `mlflow` unit's claim (R15)                                               |
| DNS records                      | One reviewed plan per name (`platform-dns.ts plan`), applied by hand at the registrar                                                      |
| Registry CA key pair             | From escrow into OpenBao, so `registry.puni.internal` keeps the chain that nodes and build tools trust                                     |
| Object storage credentials       | From escrow. etcd snapshots go to their own bucket: the snapshot folder is the cluster id, which is shared                                 |
| Fleet repository                 | A new directory for the new cluster (decision 9). The old one is removed in stage 5, on the word of the session that owns `release-pin.ts` |

Not carried: public certificates and ACME accounts (issued and registered anew), k3s
credentials, the SOPS identity, registry push credentials, the old registry's one proof image,
Victoria and Grafana data, stopped containers, the old cluster's etcd, the Compose dev stacks
themselves, and anything else on the old hosts: the owner named nothing further.

### 9. Dependencies on other owners

**OpenBao design (pull request #935).** Owned by another session and not edited. It is on the
path of A7, so its merge, and its amendment for this cluster, are preconditions of that step.
Read at its branch on 2026-11-23, it places the store on a platform node, initialises it by
declarative self-init, unseals it with a static key from a bootstrap Secret, and issues its
server certificate from a cert-manager CA issuer. What this plan needs from it:

- Its three Flux stages (`secret-store`, `secret-operator`, `secret-sync`) and their
  `dependsOn` order become the Applications of orders 4 to 6, synced on command, under
  `infra/argocd`.
- Its bootstrap set is applied by the bootstrap playbook, not by a decrypting Flux unit, and
  shrinks to what OpenBao itself reads (decision 5). The members it kept there for Flux's sake,
  such as `velero-credentials` and `alertmanager-puni`, become values in the store.
- Its namespace is an object of the `namespaces` unit, so the playbook can create it before
  the seal key.
- One capability, `platform-services` (R8), or its own `secret-store` beside it; the taint of
  R25.
- Paths and roles that separate staging from production (decision 5).
- Its image is never pulled from Harbor, which it already requires.
- Its memory figure, which decision 2 assumes at 1,024 MiB with the operator.
- If its server certificate is to come from somewhere other than cert-manager, the order table
  loses the one unit that precedes it for that reason.

**Harbor change (`adopt-harbor-registry`).** This change edits none of its files. Step and
assumption ids in this list are the Harbor change's own.

- Delivery: its `HelmRelease` and overlays (its decision 4 and slice 3) become a wrapper chart
  and an Application at order 14, synced on command, with the selector and toleration of
  decision 1.
- The Certificate `registry-tls` for `registry.puni.internal` belongs to Harbor's unit (its
  H9). The `issuers` unit here carries the CA issuer only.
- Rendered values: every value the chart would otherwise generate at install time comes from
  OpenBao, or each comparison renders a different one. The Harbor change has to list them.
- Placement: assumptions H1, H9 and H13 and decision 2 name h4claw. The node is h5plat.
- Stop rule: task 1.3 computes 1,949 MiB from h4claw's memory under a gate. On h5plat the
  figure comes from that node's reading and decision 2 here, and no gate runs there.
- No Distribution on the new cluster: its H11, its migration steps 10 and 12, its attended
  steps Harbor-A9 and Harbor-A11 and the `:5000` endpoint fall away, and so do Harbor-A1 and
  Harbor-A2a, which read and re-enroll h4claw.
- A project and robots for WBS images, staging and production, before A18's WBS part.
- Its first slice can measure on h5plat once A3 is done.

**Fleet repository and release bootstrap.** Website registry routing, the fleet's website pins
and `release-pin.ts` stay untouched. The website's present overlays cannot be read by Argo CD
as they are: they carry encrypted Secrets that only a decrypting reconciler can apply. The new
cluster needs a directory of its own there with the public-name issuers, a staging and a
production overlay per app whose Secrets are ExternalSecrets, and a check that plays the part
`fleet-check` plays for Flux units. That check carries rules (f) and (g) of slice 2.4 and the
prefix rule of slice 3.1 for its overlays. Each stateful app lands there in two merges: first
with its workload at zero replicas and its backup job suspended, then, after the restore, at
one replica with the job running (guard 1). The session that holds the release bootstrap
writes that directory, after its bootstrap finishes (R11). The Applications follow that
repository's `main`; task 0.6 gives it a ruleset before A2.

**How a merge becomes a staging pin (slice 3.7).** "Staging follows `main`" is true of
manifests from the first day. It is true of code only when something builds an image for a
merge and moves the staging overlay's pin, and nothing does today: the website's pins are moved
by hand through `release-pin.ts`, and WBS dev runs from source. Until that exists, staging
advances when a pin is moved. Who builds, and where, is open question 2; it belongs to the
owners of the release bootstrap and of the WBS deploy tooling.

**WBS overlays (slice 3.5).** Owned by the WBS deploy tooling's owner. Both overlays render the
namespaces `wbs` and `wbs-solver`, so staging and production cannot share a cluster as written.
Needed: distinct namespaces for staging; the selector patches of decision 1; a backup prefix
per decision 7; ExternalSecrets where the overlays expect SOPS Secrets; images from Harbor
(R28). The simple move of R28 uses none of the cutover plan's Flux objects. What a later WBS
deployment needs beyond a sync, such as the migration capture `AGENTS.md` requires of
Kubernetes callers, is that owner's to state; this plan does not design it.

**Gate pool (`dash-host-jobs`).** Needed from its owner: enrollment and calibration of h8ci,
its pool budget and headroom, and whether it runs two gates at once; before A21 and A22, either
a withdrawal step for h4claw and h2puni or written confirmation that none is needed; cleanup of
the capacity those hosts report.

**Where images come from.** No node is configured with a registry mirror: `bootstrap.yml` and
`join.yml` do not run the `registry_client` role.

| Images                                                 | Pulled from                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Argo CD, cert-manager, the observability stack, MLflow | their upstream registries, by digest                                                      |
| Harbor, OpenBao, the External Secrets Operator         | upstream, by digest; never from Harbor                                                    |
| Website and request app, both environments             | the registry the fleet's release pins name today, with the pull Secret from OpenBao (R11) |
| WBS, both environments                                 | Harbor (R28), pushed there by the release builds on the CI host                           |

**Documents that describe Flux as the only delivery path.** `docs/infra/platform.md`,
`README.md`, `recovery.md`, `fleet.md`, `local.md`, `registry.md`, `registry-consumers.md`,
`deployment.md`, `cutover-plan.md`, `otlp-mtls.md`, the three observability pages,
`docs/platform-map.md` and `docs/runbook-prod-deploy.md`. Slice 2.9 adds the new runbook; the
rest are rewritten when the old cluster is removed.

### 10. What must be settled before stage 1

The owner's answers of 2026-11-23 closed the questions that blocked the first stage. What is
left before A1:

| Item                                              | Why it blocks                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Task 0.5: the escrow check                        | guard 2; it is also the one thing to do before h1claw is deleted                |
| Task 0.6: the rules on both `main` refs           | A2 writes to the fleet repository and A4 makes `main` here the cluster's source |
| A host for the rehearsal of slice 2.7             | see below                                                                       |
| A place to build the controller image             | see below                                                                       |
| An owner for the fleet repository's new directory | A2 writes encrypted files there; R11 names the session, which has to agree      |

The operator workstation cannot host the rehearsal today: its disk is full and the labs need
about 60 GiB. The alternative is to run it on the first new server before that server becomes
the platform node: the k3d part on a server created as in A1, and the staged build as a
throwaway pass on that server and one temporary server. The throwaway pass uses secrets made
for it, an inventory that is not committed, and a scratch bucket, because the snapshot folder
is the cluster id. Both servers are then deleted. A1's receipt, and the first revision of
slice 1.3 that records it, are taken from the server created after that, so no machine id of a
deleted server reaches `main`. Whether the provider's servers offer `/dev/kvm` was not checked,
so the QEMU lab is not assumed there.

The controller image is built from `infra/controller/Containerfile`, which slice 2.5 extends.
The workstation of R17 cannot build it while its disk is full. Until it can, the image is built
and the controller run on h2puni, where the controller runs today.

Pull request #935 does not block A1 to A6. It blocks A7.

The rest can wait: open question 1 until A14 at the earliest and A21 at the latest; open
question 2 blocks no step.

## Decision records (become ADRs at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so both texts stay here. Task 0.2 files them.

> # Each fleet host has one node role, on a cluster rebuilt from source
>
> One host was the k3s server, the public edge, the product node, the registry host and a gate
> host. A gate reserves its whole host and Harbor did not fit beside it, and the secret store
> would have sat next to the internet-facing ingress. On 2026-11-21 the owner decided that each
> host is reserved for one kind of work (platform services, continuous integration,
> observability, or production apps) and that the cluster is recreated on new servers.
>
> ## Considered options
>
> - Move roles in place: the control plane has to change hosts by a snapshot restore that k3s
>   does not document for a host that stays up.
> - Resize the one host: the secret store stays on the public edge and a gate still competes
>   with production.
> - Platform services on the observability node: that node is reserved for Elasticsearch and
>   Prometheus.
> - One larger node for platform services and CI: branch code would run beside the secret store.
>
> ## Consequences
>
> The control plane never moves: it starts on the platform node. Every store crosses by a
> restore, which is also the first full test of those restores. With no production users the
> switch is allowed to be unsafe; that licence ends with the first user. Each role is still one
> host: losing it stops that role until it is rebuilt.

> # The rebuilt platform cluster is delivered by Argo CD
>
> The first cluster is delivered by Flux: a pinned source, eleven units in a dependency graph,
> SOPS decryption in the cluster, and checks in `tool-fleet` written against those units. For
> the rebuilt cluster the owner chose Argo CD on 2026-11-21, for its interface: a live tree of
> every resource, its difference from Git and its health.
>
> ## Considered options
>
> - Flux with a read-only dashboard, which the planning session recommended. It keeps every
>   existing check, decrypts SOPS natively, uses about a third of the memory and exposes no
>   service. Its dashboards show less than Argo CD's.
> - Argo CD with a decryption plugin: keeps encrypted files in the reconciled tree, at the
>   price of a plugin in the repo server.
>
> ## Consequences
>
> The delivery tooling is written twice: the stage checks, the bootstrap play, the health and
> recovery tools and the lab profile each gain an Argo CD counterpart, and the fleet repository
> needs one too. Workers clusters and the existing labs stay on Flux, so the repository carries
> both tools until a later change. Charts are rendered, not installed, so install hooks follow
> sync phases and generated values must be supplied. No key that decrypts repository files
> enters the cluster. Argo CD adds an API and an interface with cluster-wide reach; it is kept
> off the public edge, and its one account can sync production apps and nothing else. Staging
> follows `main`, production and the platform change on command, and the rules that guard
> `main` are the administrative boundary of the cluster.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving.
- **One apps node for production and staging.** Its loss stops both, and SQLite loses up to an
  hour. Limits bound staging's memory; CPU, disk I/O and the node's disk are shared, and a
  container escape in staging reaches production data (decision 1).
- **Monitoring on one node.** It cannot report its own loss; R16 covers only liveness.
- **OpenBao is on the path of everything after it.** A sealed or lost store stops every later
  first sync and every Secret change, and its design is not merged. The store, Harbor and the
  control plane share one node.
- **Shared vCPUs for CI**, and one CI host: its loss stops gating until it is rebuilt.
- **A merge deploys to staging.** The pull request, its required checks and the `delivery`
  rules inside `gate` are the guards. Staging holds the agents' tracker, so a bad merge to a
  staging overlay can stop it; its data is protected by `Prune=false` and its backup.
- **What guards `main` is thin.** A pull request needs no approval, so whoever can open one can
  merge it once `gate` and `pixels` pass. The checks are not required to have run against the
  current `main`. `tool-fleet:check` as a whole stays outside the required checks; only the
  `delivery` rules are pulled into `gate`. The fleet repository has one required check.
- **Production and the platform drift quietly.** Nothing repairs a manual change there; it is
  reported, and the alert for it exists only once stage 3 is done.
- **Sync deploys whatever `main` holds at that moment**, not a named release. Two merges
  between two syncs go out together.
- **Staging follows manifests, not yet code** (slice 3.7).
- **Two delivery tools.** See the second decision record.
- **Two clusters with one identity** during the build. Separate credentials, a separate
  snapshot bucket, a separate SQLite prefix and distinct kubeconfig context names are the
  guards. Argo CD targets only the cluster it runs in.
- **Restores are the migration.** A store whose backup has never been restored fails at the
  switch. With R26 that costs downtime, not data, as long as guard 1 holds.
- **Old-host stores may run without an off-host backup** from the day h1claw is deleted until
  each has moved (R30).
- **The observability units have never been healthy in production.**
- **Losing the platform node loses the jump.** The controller then reaches each server through
  that server's own public SSH endpoint (R17).
- **WBS waits on two things this change does not own**: Harbor, and overlays that let staging
  and production share a cluster (slice 3.5). Until then the dev tracker stays on h2puni and
  h2puni cannot be deleted.
- **Removing a unit takes two merges** (decision 3).

## Open questions for the owner

1. Which Slack channel receives the alerts? Slack is decided; the channel and its webhook are
   the owner's to supply. Stage 1 does not wait for them. A14 proves delivery only once they
   exist, and A21 waits for that proof. The Harbor change waits on the same answer. The old
   path, a message relayed from h1claw, ends with that host.
2. What turns a merge into a staging image pin (slice 3.7): a build on the provider's hosted
   runners, or on the CI host, and may it commit the pin to the fleet repository by itself?

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings, and no Argo CD
  instance was run.
- That the `argocd` CLI in core mode syncs an Application and waits for its health with the
  node's credential alone. Fallback: a second local account limited to `platform` (decision 3).
- That an Application with no automated sync, tracked by an automated root, is left unsynced by
  the root, and that the root reverts an edit to its sync policy.
- That `application.sync.requireOverridePrivilegeForRevisionSync` refuses a revision in the
  interface as well as in the CLI.
- That helm follows a symbolic link to a chart archive in `charts/`. If not, the wrapper holds
  a copy.
- That a sync of `argocd` leaves the password hash and the generated keys in `argocd-secret`
  alone. Fallback: the Secret leaves the managed set (decision 3).
- That `validate-enrollment.yml`, with its patch changed to append, passes on a cluster of one
  node registered with both taints. If it still cannot pass, the cause is reported and the
  owner decides; R25's alternative is not taken silently.
- That a Helm source includes a dependency's `crds/` directory at any depth, and that kustomize
  does with `includeCRDs: true`. Rehearsal 2.7(k) reads the CRDs back.
- Whether the provider's servers offer `/dev/kvm`.
- That kustomize inflates a chart from a local archive without fetching. Fallback: a committed
  render (decision 3).
- That `Force=true,Replace=true` recreates a changed Job, and that
  `RespectIgnoreDifferences=true` leaves `solverImages` alone, on this version.
- That Argo CD's bundled health check holds an ExternalSecret unhealthy until its value
  arrives.
- The exact `ignoreDifferences` list, and the memory of Argo CD, the k3s server and etcd.
- How the public certificates are solved, and the content of the fleet repository's overlays
  beyond their file list: both are private.
- How MLflow stores its data on h3mon, and whether one SQLite file and one directory are all
  of it.
- The figures for `puni-request-app`, OpenBao and the staging WBS database's growth.
- Pull request #935 beyond its design file at its branch on 2026-11-23.
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
