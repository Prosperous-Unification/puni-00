## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. This is the third draft of the change, revised
after a review; [verify.md](verify.md#replaced-drafts) records the two drafts it replaces and
what both reviews found.

What runs today:

- `infra/fleet/desired.yaml` declares one platform cluster, fleet id `platform`, with
  `controlPlane: single`. h4claw carries `control-plane`, `product` and `ingress`; h3mon carries
  `observability`. The live cluster's identity is `platform-production`.
- Flux delivers it. `infra/clusters/platform/production` holds eleven Flux units in a
  `dependsOn` graph, and nine workloads are Flux `HelmRelease` objects. Its platform source is
  pinned to one commit; a private fleet source follows a branch and owns the website units, the
  ACME issuers and two registry Secrets.
- h4claw is also a gate host. h2puni is a gate host, never a k3s node, and runs WBS production
  and dev on Compose, the dev website stack, the dev poller and the release builds.
- Elasticsearch and Prometheus have never run in this cluster: the stages `observability`,
  `alerts` and `backup` are not Ready.
- h1claw pulls hourly snapshots of the Compose databases on h2puni and a daily one of MLflow on
  h3mon, prunes the SQLite prefixes in the bucket, and sends the freshness alert
  ([recovery](../../../docs/infra/recovery.md)).

What the repository can already do from an empty host, and what Argo CD changes about it:

| Need                            | Source                                                              | Reusable for the new cluster                          |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| First server with embedded etcd | `playbooks/bootstrap.yml`: `base`, `network`, `storage`, k3s server | yes                                                   |
| Agents                          | `playbooks/join.yml`, `validate-enrollment.yml`, `firewall.yml`     | yes                                                   |
| etcd snapshots and cold restore | `playbooks/backup.yml`, `restore.yml`, `tool-fleet:recover`         | yes, after slice 2.6                                  |
| Gate host                       | `playbooks/gate-host.yml` and the gate-host runbook                 | yes                                                   |
| Delivery and the stage graph    | `playbooks/platform.yml`, `infra/clusters`, `validatePlatform`      | no: Flux only (decision 3)                            |
| Workload definitions            | `infra/platform`: plain manifests and Flux `HelmRelease` objects    | plain ones as copies; each `HelmRelease` is rewritten |
| Secrets                         | SOPS files decrypted in the cluster by Flux                         | no (decision 5)                                       |
| WBS from Compose to k3s         | [cutover plan](../../../docs/infra/cutover-plan.md), not authorized | its manifests yes; its Flux unit and first start no   |

## Goals / Non-Goals

**Goals**

- One node role per host, in the fleet model and in workload selectors.
- The new cluster delivered by Argo CD from a tree of its own, with Git as the only write path.
- A build order in which every stage has a receipt.
- A sized, grounded budget for each node.
- A plain list of what must survive the switch and what proves that it did.

**Non-Goals**

- Designing Harbor, OpenBao or the WBS cutover. Their changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- Moving workers clusters or the existing labs off Flux (R27).
- High availability, continuous SQLite replication, single sign-on for Argo CD, a new home for
  what h1claw runs.
- A switch without downtime (R26).
- A promotion step between `main` and the cluster (R20).

## Assumptions

Fixed by the owner on 2026-11-21: the four roles, the three production apps, Elasticsearch and
Prometheus as the observability stack, SQLite, a cluster recreated from scratch, Argo CD as its
delivery tool, and that the switch may be unsafe. Everything below is assumed and can be
overruled by id. R14 and R18 of the second draft are withdrawn (R26 replaces them).

| Id  | Assumption                                                                                                                                                                                                                                                                | Alternative and its cost                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new cluster is built on newly created servers. An old host is deleted once its data is confirmed restored and, for a gate host, once its successor is calibrated                                                                                                      | Reinstall the existing servers. Cost: gates stop for other sessions while a gate host is rebuilt                                                                                                                 |
| R2  | Four servers of 8 vCPUs and 16 GiB. The observability server's root disk is at least 180 GiB (decision 2)                                                                                                                                                                 | A smaller platform node. Cost: the limits in decision 2 leave it little margin                                                                                                                                   |
| R3  | Node ids and host names are `h5plat`, `h6apps`, `h7obs` and `h8ci`                                                                                                                                                                                                        | Any other names. Cost: none before slice 1.3 lands                                                                                                                                                               |
| R4  | The owner creates each server in the provider console; it is enrolled by static inventory                                                                                                                                                                                 | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                                                                      |
| R5  | The new cluster keeps the cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed                                                                                                        | A new cluster id. Cost: the id list is closed in the `backup` role, `platform.ts` and `recover.ts`                                                                                                               |
| R6  | New: k3s credentials, a SOPS age identity that never enters the cluster, the repository read keys, the Argo CD account. Carried from escrow: the registry CA, the object storage credentials, the backup archive key                                                      | Reuse every secret. Cost: the old cluster's credentials would open the new one                                                                                                                                   |
| R7  | Build order: platform, CI, observability, production apps, then retirement (decision 6)                                                                                                                                                                                   | Apps before observability. Cost: production data arrives before the alert and backup units are healthy                                                                                                           |
| R8  | One new capability, `platform-services`, pins Argo CD, cert-manager, Harbor, OpenBao and the External Secrets Operator                                                                                                                                                    | One label per service, as pull request #935 proposes. Cost: several labels that always sit on one node                                                                                                           |
| R9  | Storage stays node-local with policy `Retain`                                                                                                                                                                                                                             | Provider volumes. Cost: SQLite on a network volume is what the owner ruled out                                                                                                                                   |
| R10 | Harbor is the only registry the new cluster ever runs. Its tree has no Distribution unit                                                                                                                                                                                  | Install Distribution first. Cost: a registry replaced before its first consumer                                                                                                                                  |
| R11 | The website runs on the new cluster from the same release pins and source registry as today. How the pins reach a second overlay is decided with the session that owns the release bootstrap                                                                              | Route it to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                                                          |
| R12 | The CI role is "runs branch code": gates, release builds, and the Compose dev stacks (WBS dev, the dev website stack, the dev poller). No production database is ever restored there. `website-dev` stays a namespace beside production                                   | Dev in the cluster. Cost: the WBS dev pod selects `forge`, which no node carries. A fifth host for dev. Cost: one more server                                                                                    |
| R13 | Retention and the freshness alert for the k3s SQLite prefixes move into the cluster (slice 3.1). h1claw keeps its pull from h2puni until h2puni is deleted, gains a second set for the CI host, and judges each set's freshness on its own. Its MLflow pull is re-pointed | Replace the pulls too. Cost: a new push job on two hosts and a second alert path, for stores that are dev data                                                                                                   |
| R15 | The MLflow store is restored on the observability host as the Compose service it is today. Victoria and Grafana are not rebuilt                                                                                                                                           | Drop MLflow. Cost: its history                                                                                                                                                                                   |
| R16 | Each node is probed from another node; the observability node from the platform node                                                                                                                                                                                      | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                                                                      |
| R17 | The Ansible controller lives on the operator workstation and reaches private addresses through a jump on `h5plat`. When `h5plat` is off, the jump is the target server's own public SSH endpoint, which the fleet firewall keeps open                                     | A jump on the CI host, as h2puni is today. Cost: a host that runs branch code sits on the path to every node                                                                                                     |
| R19 | One root Application owns plain Application files, ordered by sync waves (app of apps). The ApplicationSet controller is not installed                                                                                                                                    | An ApplicationSet with a cluster generator, which the Argo CD guide recommends for many clusters. Cost: a generator and a controller for one cluster                                                             |
| R20 | The new cluster follows `main` of this repository, and `main` of the fleet repository for the apps. A change reaches either only through a pull request with its required checks; task 0.6 reads both rulesets back                                                       | A deploy branch that fast-forwards to gated commits. Cost: a second ref whose rule "a commit of `main`" a ruleset cannot state without a promotion workflow, for a cluster with no users                         |
| R21 | The new cluster's definitions live under `infra/argocd` and share no file with a Flux-reconciled path, except chart archives locked by digest                                                                                                                             | Reference the existing plain manifests. Cost: an edit for one cluster reaches the workers clusters and the labs                                                                                                  |
| R22 | No decryption runs in the cluster. Ansible applies the bootstrap Secrets of decision 5; every other Secret comes from OpenBao through the External Secrets Operator, so OpenBao serves before stage 3                                                                     | Apply all Secrets by Ansible until OpenBao serves. Cost: a second delivery path for 15 Secrets, built to be removed                                                                                              |
| R23 | The Argo CD UI has no public route, one local account that can read but not sync, and the built-in `admin` account disabled. Break-glass is `kubectl` on the platform node, root Application first (decision 3)                                                           | Keep `admin` enabled. Cost: a second write path with one shared password                                                                                                                                         |
| R24 | Argo CD's four workloads are limited to 1,536 MiB together until A5 measures them                                                                                                                                                                                         | No limits. Cost: the repo server's rendering can take memory from the secret store                                                                                                                               |
| R25 | The platform node is registered with the taint `CriticalAddonsOnly=true:NoSchedule`. Platform services and three named node agents tolerate it; nothing else may                                                                                                          | Node selectors alone. Cost: a workload outside the checked tree can land beside the secret store. A custom taint. Cost: k3s's own components do not tolerate it and k3s reverts a patch that adds the toleration |
| R26 | The switch may be unsafe. The owner on 2026-11-21: "we can make the switch unsafe that's ok / no prod users yet". It holds only while there are no production users; the guards of decision 7 stay                                                                        | A staged switch with fences and a retained old side. Cost: the ceremony of the second draft                                                                                                                      |
| R27 | Workers clusters and the existing labs stay on Flux. The repository carries two delivery tools until a later change                                                                                                                                                       | Move them now. Cost: no workers cluster exists in production to prove it on                                                                                                                                      |
| R28 | WBS production crosses by the cutover plan. Its first-start coordinator reads and patches Flux objects, so it needs an Argo CD source first (slice 3.5, owned by that plan's owner)                                                                                       | Cross it like the website: stop, one backup, restore, start. Cost: that plan's replay and digest guards are skipped; the owner may accept that under R26                                                         |

## Decisions

### 1. Roles, capabilities and placement

| Role            | Host   | Capabilities                         | In the k3s cluster |
| --------------- | ------ | ------------------------------------ | ------------------ |
| Platform        | h5plat | `control-plane`, `platform-services` | server             |
| CI              | h8ci   | none: it is not a k3s node           | no                 |
| Observability   | h7obs  | `observability`                      | agent              |
| Production apps | h6apps | `product`, `ingress`                 | agent              |

- `platform-services` is new. It is added to `CapabilitySchema`, `fleetCapabilities`,
  `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`.
- The server carries neither `product` nor `ingress`, and no gate host is a k3s node.
- The server template already writes `node-taint` entries. A server that carries
  `platform-services` is registered with `CriticalAddonsOnly=true:NoSchedule` (R25). The k3s
  documentation names this taint for a dedicated control plane, and the CoreDNS, volume
  provisioner and metrics server that k3s v1.36.4+k3s1 packages tolerate the key
  `CriticalAddonsOnly` (read upstream and on the live cluster,
  [verify.md](verify.md#k3s-behaviour)). A taint of our own would not last: k3s re-applies its
  packaged manifests when it starts, and the live CoreDNS no longer carries the enrollment
  toleration that `validate-enrollment.yml` patched in. k3s applies `node-taint` only when a
  node registers, so the taint is in the server's first configuration. Flannel and kube-proxy
  run inside the k3s process and need no toleration.
- Every pod template rendered from the new tree selects a capability, with one named
  exemption. Workloads that select `platform-services` tolerate the taint. The node exporter,
  the OTel collector and the Velero node agent are DaemonSets that run on every node: they
  select no capability and tolerate every taint, as they do today. No other workload may
  tolerate the taint.
- The WBS gateway, frontend and MCP manifests and the Velero server select no node today; the
  new cluster's overlays patch them, because `deploy/k8s/wbs/base` is shared with the lab.
- The capability floors of a cluster apply as soon as it has one node (`decodeFleet`). The new
  cluster entry starts with the floor `platform-services: 1` and gains `observability: 1`, then
  `product: 1` and `ingress: 1`, in the revision that adds each node.

### 2. Budgets

Memory in MiB. Limits are used where they exist. Capacity is assumed to be 15,602, the reading
of both current 16 GiB nodes.

**Platform node.** Reservations assumed 2,816 (system 1,024, kubelet with the k3s server and
etcd 1,536, eviction 256).

| Workload                                         |     Limit | Source                                             |
| ------------------------------------------------ | --------: | -------------------------------------------------- |
| Harbor                                           |     2,112 | Harbor change, decision 2: planned, to be measured |
| Harbor backup                                    |       768 | Harbor change, decision 2                          |
| OpenBao and the External Secrets Operator        |     1,024 | assumed: pull request #935 measures it             |
| Argo CD: controller, repo server, server, Redis  |     1,536 | assumed (R24): 768, 384, 256 and 128; A5 measures  |
| cert-manager, three pods                         |     1,536 | sizing document; no limits set live, 115 in use    |
| CoreDNS                                          |       170 | live limit                                         |
| Node exporter, OTel collector, Velero node agent |     1,408 | sizing document: 1,920 per node less Traefik's 512 |
| **Sum**                                          | **8,554** | with reservations 11,370; margin 4,232             |

**Production apps node.** Reservations assumed 1,664 (system 1,024, kubelet 384, eviction 256);
allocatable 13,938.

| Workload                                              |     Limit | Source                                        |
| ----------------------------------------------------- | --------: | --------------------------------------------- |
| Traefik                                               |       512 | sizing document; no limit set live, 47 in use |
| `puni-website` production `site`                      |       128 | live limit                                    |
| Website production log shipper                        |       128 | live limit                                    |
| `puni-request-app` production                         |       640 | assumed: not deployed yet                     |
| `website-dev` namespace (R12)                         |       768 | live limits; 71 in use                        |
| `puni-user-platform`: backend, gateway, MCP, frontend |     2,176 | `deploy/k8s/wbs/base`                         |
| `puni-user-platform`: hourly backup and daily verify  |     1,024 | `deploy/k8s/wbs/base`, both counted           |
| Node exporter, OTel collector, Velero node agent      |     1,408 | sizing document                               |
| **Sum**                                               | **6,784** | margin 7,154                                  |

Not counted: the host-owned solver supervisor and the solver pods that the cutover plan
requires on the product node.

**Observability node.** `infra/platform/observability/base/coexistence.json` describes h3mon:
reservations 1,792, platform requests 6,182, application requests 1,664, preserved Docker
services 2,560, and 5,632 more during a migration overlap. A new node has neither the Docker
services nor an overlap, so its requests are 9,638 of 15,602, or 10,150 with MLflow (R15).
Those are requests. The sizing document's limits for the same node sum to 17,088 and it calls
its figures unmeasured. A15 measures on the node and the owner then keeps or changes its size.

Its disk is decided before the server is created. The declared claims are 114 GiB:
Elasticsearch 100, Prometheus 10, two signal stores of 2 each. With 30 GiB assumed for the
system and images and a fifth of the whole disk kept free, the root disk needs
(114 + 30) / 0.8 = 180 GiB. The kubelet evicts at 10% free on the node filesystem and 15% on
the image filesystem (both k3s templates), so a fifth leaves room above both. The existing
hosts report about 150 GiB, which is below the floor. A13 reads the new server's disk and stops
on a smaller one, and A15 measures growth.

**CI host.** A gate is measured at 6 cores, 9 GiB and 11 GiB of temporary space, and runs under
`min(13 GiB, pool budget − headroom)`. Headroom is pinned when the pool is initialised, so the
dev stacks of R12 are measured on the host before that (A9). h2puni's pool budget of 14 GiB is
the only figure for them today.

**Disk elsewhere.**

| Node            | What lands there                                                                      |
| --------------- | ------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots |
| Production apps | SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB                |
| CI              | gate trees, caches, 11 GiB of temporary space per gate, the dev stacks' data          |

### 3. Delivery by Argo CD

Checked against Argo CD v3.6.2, the current release; [verify.md](verify.md#argo-cd-behaviour)
lists what was read and what was not.

**Tree.** Everything the new cluster reconciles from this repository is under `infra/argocd`:

| Path                                        | Holds                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `infra/argocd/install`                      | the vendored install manifest and its kustomize patches                       |
| `infra/argocd/clusters/platform-production` | the two AppProjects and one Application file per unit; the root's source path |
| `infra/argocd/units/<unit>`                 | a kustomize directory or a wrapper chart per unit                             |

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
an Application named `argocd` reconciles the same path with `ServerSideApply=true`, which is
the self-management the declarative setup guide describes, without its remote base. The
bootstrap playbook writes the local account's password hash into `argocd-secret`, where Argo
CD also keeps its generated keys. With a server-side apply Argo CD owns only the fields it
sends, and the vendored manifest sends none of that Secret's data. Rehearsal 2.7 asserts that
the hash and the keys survive a self-managed sync. If they do not, the kustomization drops
`argocd-secret` from the managed set and the playbook alone creates it.

**Root, projects and order.** One root Application reads
`infra/argocd/clusters/platform-production`. The bootstrap playbook applies the two AppProjects
and the root; the same AppProject files lie in the root's source path, so the root adopts them
on its first sync and every later change to a project is a reviewed change on `main`.

- `platform` admits this repository, every namespace and cluster-scoped resources. The root
  and every platform unit belong to it.
- `apps` admits the private fleet repository and the WBS deploy repository, only the app
  namespaces, and one cluster-scoped kind, `cert-manager.io/ClusterIssuer`, because the fleet
  repository owns the issuers for public names.

The root's children are plain Application files with `argocd.argoproj.io/sync-wave`
annotations. Argo CD stopped assessing the health of Application objects in 1.8; without it a
wave is done as soon as the child object exists. The health check for
`argoproj.io/Application` is therefore restored in `argocd-cm`, as the health guide prescribes
for this pattern.

The waves are derived from what each unit reads, not from the Flux stage names. The Flux graph
is `target`, `controllers`, then `policy` and `storage`, `secrets`, `certificates` (after
`controllers` and `secrets`), `platform`, `observability` (after `platform` and
`certificates`), `alerts`, `backup`.

| Wave | Units                                                                    | Needs                                                       | First lands |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------- |
| 0    | `argocd`                                                                 | nothing                                                     | A4          |
| 1    | `namespaces`                                                             | nothing; the playbook applied them already                  | A4          |
| 2    | `cert-manager`                                                           | its namespace                                               | A4          |
| 3    | `policy`, `storage`, `issuers`                                           | cert-manager's CRDs; `registry-ca`, applied by the playbook | A4          |
| 4    | `external-secrets`, `openbao`                                            | `policy`; the seal key, applied by the playbook             | #935        |
| 5    | `harbor`; `observability-secrets`                                        | OpenBao serving; `storage` and `issuers` for Harbor         | Harbor; A15 |
| 6    | `otel-certificates`, `eck-operator`, `prometheus-stack`                  | the Secret `otel-server-ca` from wave 5                     | A15         |
| 7    | `elasticsearch`, `signals`                                               | the ECK and Prometheus CRDs; the certificates of wave 6     | A15         |
| 8    | `kibana`, `otel-collector`                                               | Elasticsearch; the Prometheus stack                         | A15         |
| 9    | `alerts`, `probes`                                                       | the Prometheus stack                                        | A15         |
| 10   | `velero`, `elastic-snapshots`, `sqlite-custody`                          | `alerts`, as the Flux `backup` stage does                   | A15         |
| 11   | `traefik`                                                                | a node that carries `ingress`                               | A18         |
| 12   | the fleet Application (public-name issuers, website, request app); `wbs` | Traefik; cert-manager; the app Secrets in OpenBao           | A19; A20    |

- `issuers` holds the registry CA issuer and the staging ACME issuer. The Flux `certificates`
  stage holds one more pair, the `otel-server` Issuer and Certificate, which reads the Secret
  `otel-server-ca`. Flux orders that after `secrets`. Here the Secret comes from OpenBao, so the
  pair is its own unit, `otel-certificates`, one wave after the ExternalSecrets.
- `observability-secrets` is the fifteen ExternalSecrets of decision 5. The plan relies on
  Argo CD's bundled health check for ExternalSecret, so the unit is Healthy only when every
  value has arrived. Slice 2.8 tests that.
- An Application file is merged in the revision that adds its node or its dependency, so no
  wave waits on something that does not exist yet. Traefik therefore lands with the production
  apps node; nothing before wave 12 needs it.

**What the waves guarantee.** Waves order one sync of the root. That sync creates the child
Applications in order, each wave waiting for the one before to be Healthy: this is the build
from an empty cluster, and every later revision that adds Application files. Waves do not
order later changes inside the children. When one merge changes the source of several units,
each child syncs on its own as soon as it sees the revision. What protects that case is
convergence, not order: every Application retries a failed sync with exponential backoff and
self-heals, so a unit that is ahead of its dependency fails and is retried until the
dependency is there. A change that cannot tolerate that is split into two merges.

**Charts.** Argo CD renders a chart with `helm template` and owns the lifecycle itself; there is
no Helm release in the cluster. Each chart gets a wrapper chart directory whose `Chart.yaml`
names the archive as a dependency and whose `charts/` directory holds it. The repo server runs
`helm template` in that directory and calls `helm dependency build` only on a missing
dependency (read in its source), so nothing is fetched at render time. Consequences:

- Helm hooks are mapped onto Argo CD hooks: install and upgrade hooks become `PreSync` or
  `PostSync`, test hooks are skipped, and delete policies follow sync phases. cert-manager's
  start-up check, the Prometheus stack's webhook jobs and Velero's CRD job are such hooks.
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

| Flux semantic and where it is used                                                                                                       | In the new tree                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ssa: IfNotPresent` on the ConfigMap `wbs-solver/puni-trusted-workload`: created once, then the release coordinator owns `solverImages`  | `ignoreDifferences` on `/data/solverImages` with `RespectIgnoreDifferences=true`. The option acts only on an existing object    |
| `force: enabled` on the Jobs `elastic-snapshots`, `elastic-settings` and `kibana-objects`: deleted and recreated when their spec changes | The annotation `Force=true,Replace=true` on those three Jobs. `Force` alone is ignored under server-side apply                  |
| `dependsOn` between `HelmRelease` objects: Elasticsearch after the ECK operator; Kibana and the OTel collector after Elasticsearch       | Waves 6 to 8, with the limits stated above                                                                                      |
| `dependsOn`, `wait` and `timeout` on the Flux units                                                                                      | Waves, Application health, retry with backoff                                                                                   |
| The `target` unit's health check on the ConfigMap `kube-system/puni-cluster-platform-production`: a wrong cluster reconciles nothing     | The bootstrap playbook refuses a cluster whose identity ConfigMap differs. Every Application targets the cluster it runs in     |
| `kubeConfig.secretRef` on every unit                                                                                                     | Not needed: no Application names a remote cluster                                                                               |
| `decryption: sops` on every unit                                                                                                         | None, by decision 5                                                                                                             |
| `prune: true`                                                                                                                            | Automated prune, with `Prune=false` on data                                                                                     |
| `postRenderers` on the Velero `HelmRelease`: size limits on two `emptyDir` volumes                                                       | A kustomize unit that inflates the chart and patches it (`kustomize.buildOptions: --enable-helm`). Fallback: a committed render |
| A kustomize patch on a `HelmRelease`'s `spec.values` (the cluster name in the Prometheus stack)                                          | The value moves into the wrapper chart's values file                                                                            |
| Helm release history, rollback and `helm test`                                                                                           | None: the chart is rendered. Going back is a revert on `main`                                                                   |
| Variable substitution after the build                                                                                                    | Not used: the only `${…}` in these manifests is shell                                                                           |

Rehearsal 2.7 observes the first two rows and the Velero row. For the Velero fallback, the
`delivery` check proves the committed render equal to the chart's output.

**Git is the only write path.**

- Every Application has automated sync with `prune`, `selfHeal` and a retry policy, the
  in-cluster destination and `targetRevision: main` (R20). The one exception is the WBS
  Application, which pins a commit because the cutover plan requires it.
- The bootstrapping guide's warning applies: whoever can change the root's source is an
  administrator of the cluster. That source is a path on `main`, so the boundary is the
  ruleset that task 0.6 reads back: a pull request and the required checks, no direct, forced
  or deleting push. Going back is a revert merged the same way.
- `policy.default` is `role:readonly`; the one local account has no further grant; the built-in
  `admin` account is disabled (R23). The server has a ClusterIP Service, no Ingress and a
  NetworkPolicy; it is reached by `kubectl port-forward` through the operator's tunnel.
- Break-glass: `kubectl` on the platform node. The root's self-heal would restore a child
  Application that was edited, so a repair that must hold disables automation on the root
  first, then on the one child, then makes the change. The root is applied by the playbook and
  owned by no Application, so that setting stays until the playbook runs again. The runbook
  requires the same change on `main` before automation returns.

**Data survives delivery mistakes.** Every PersistentVolumeClaim in the tree, and every
namespace that holds one, carries `Prune=false` and `Delete=false`, so removing a manifest
never deletes it. Claims that an operator creates from a custom resource are not in the tree.
The Elasticsearch, Prometheus and Alertmanager resources carry the same two options, and
Elasticsearch keeps `volumeClaimDeletePolicy: DeleteOnScaledownOnly`, which the copied manifest
already sets. A custom resource deleted by hand is outside what delivery can protect. No
Application carries the resources finalizer, so deleting an Application leaves its resources.

### 4. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md). Slices 1.1 to 1.3, 2.1 to 2.7 and 2.9
are needed before the platform stage can start; 2.8 before stage 3; 3.1 and 3.5 before stage 4.

| Gap                                                                                                            | Slice |
| -------------------------------------------------------------------------------------------------------------- | ----- |
| No capability for platform services                                                                            | 1.1   |
| Nothing refuses a server with `product` or `ingress`, a gate host that is a k3s node, or an untainted server   | 1.2   |
| `validate-enrollment.yml` has never run on a cluster of one tainted node                                       | 1.2   |
| One static inventory and one hard-coded cluster id in `placement.test.ts`                                      | 1.3   |
| The coexistence record and reservations describe h3mon with its Docker services                                | 1.4   |
| `observability-source.ts` hard-codes the inventory path, the two peers and the API endpoint                    | 1.5   |
| No locked Argo CD install                                                                                      | 2.1   |
| Every chart is consumed through a Flux `HelmRelease`                                                           | 2.2   |
| The platform-stage manifests exist only under Flux-reconciled paths                                            | 2.3   |
| `validatePlatform` checks Flux units; nothing checks an Application graph, its isolation or its placement      | 2.4   |
| `playbooks/platform.yml` installs Flux and needs the age key on the server                                     | 2.5   |
| `tool-fleet:health` reports "no Flux objects" as a failure; the recovery manifest and drill assume Flux        | 2.6   |
| The lab's `platform` profile runs Flux; nothing rehearses the new tree, a one-node start or staged joins       | 2.7   |
| The observability, alert and backup manifests exist only under Flux-reconciled paths                           | 2.8   |
| The only build runbook is written for two adopted hosts                                                        | 2.9   |
| Retention and the freshness alert for `sqlite/<database>/` run on h1claw; both clusters would share the prefix | 3.1   |
| No probe of a node from outside itself                                                                         | 3.2   |
| The gate instructions name h2puni and h4claw                                                                   | 3.3   |
| `desired.yaml` and the inventories still name the old cluster after retirement                                 | 3.4   |
| The WBS first-start coordinator reads and patches a Flux `Kustomization` and `GitRepository`                   | 3.5   |

Outside this repository: the fleet repository's check and its website overlay are written for
Flux, and h1claw's backup sets are defined in its own repository (decision 9).

### 5. Secrets

The age private key stays on the controller and in escrow. Encrypted files for the new cluster
live in the private fleet repository, in a directory that no Application reads, encrypted to
the new recipient. The bootstrap playbook decrypts them on the controller and applies them
through the API; nothing is written to the node's disk. Namespaces come first: the playbook
applies the `namespaces` unit before any Secret, and Argo CD adopts those objects on its first
sync. The playbook is idempotent and takes the secret file list as input, so a Secret that
arrives later, such as OpenBao's seal key, is added by running it again; slice 2.5 tests a
second run that adds one file and changes nothing else.

| Secret                                                                                   | Namespace       | New or carried | Created by, when                     | Before the cluster exists     |
| ---------------------------------------------------------------------------------------- | --------------- | -------------- | ------------------------------------ | ----------------------------- |
| k3s server and agent credentials                                                         | host files      | new            | owner, A2                            | `$OPS`, escrow                |
| SOPS age identity                                                                        | not in cluster  | new            | owner, A2                            | `$OPS`, escrow                |
| Read keys for the fleet repository and, before A20, the WBS deploy repository; host keys | `argocd`        | new            | bootstrap playbook, A4 and its rerun | fleet repository, encrypted   |
| Local account password hash                                                              | `argocd`        | new            | bootstrap playbook, A4               | fleet repository, encrypted   |
| OpenBao seal key (name set by pull request #935)                                         | its namespace   | new            | bootstrap playbook, its change       | fleet repository, encrypted   |
| Registry CA key pair                                                                     | `puni-registry` | carried        | bootstrap playbook, A4               | escrow                        |
| Object storage credentials for etcd snapshots                                            | host file       | carried        | `backup` role, A6                    | escrow                        |
| `velero-credentials`, `velero-repo-credentials`                                          | `puni-backup`   | carried, new   | OpenBao, before stage 3              | escrow; generated             |
| `elastic-s3-credentials`                                                                 | `observability` | carried        | OpenBao, before stage 3              | escrow                        |
| `alertmanager-puni`                                                                      | `observability` | new            | OpenBao, before stage 3              | owner supplies (question 10)  |
| `otel-server-ca`, `otel-client-trust`                                                    | `observability` | new            | OpenBao, before stage 3              | generated by the operator     |
| Nine `signal-*` Secrets                                                                  | `observability` | new            | OpenBao, before stage 3              | generated by the operator     |
| SQLite backup credentials of each app                                                    | app namespaces  | carried        | owner writes to OpenBao, A19         | escrow                        |
| Website runtime and pull Secrets                                                         | website         | carried        | owner writes to OpenBao, A19         | fleet repository, old key     |
| WBS runtime Secrets                                                                      | WBS namespaces  | per its plan   | owner writes to OpenBao, A20         | the cutover plan names them   |
| Backup archive key                                                                       | not in cluster  | carried        | stays where the pulls run            | escrow, read back in task 0.5 |
| Old cluster's SOPS age identity                                                          | not in cluster  | carried        | used on the controller in A19        | escrow, read back in task 0.5 |
| Registry `registry-auth`                                                                 | none            | not carried    | Harbor's robots replace it           | none                          |

The seventeen operator-provided Secrets of
`infra/platform/secrets/platform-production/externally-provided.json` are the registry pair and
the fifteen of rows eight to twelve. The operator writes each of the fifteen into OpenBao once
(A15); an ExternalSecret in `observability-secrets` reads it. The app rows are written in A19
and A20, before the app's Application is merged. The website's present Secrets are encrypted to
the old cluster's age identity, which is why task 0.5 reads that identity back too. If OpenBao
is not serving when stage 3 is due, R22's alternative applies the fifteen by the bootstrap
playbook instead, and the owner decides.

### 6. Build order

| Stage | Role            | Needs                                                    | Receipt that ends the stage                                                                         |
| ----- | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0     | Decisions       | none                                                     | overrules recorded; irreplaceable secrets read back; both `main` rulesets read back; phases 1 and 2 |
| 1     | Platform        | stage 0                                                  | server Ready; waves 0 to 3 Synced and Healthy; one etcd restore on the empty cluster                |
| 2     | CI              | nothing from the cluster                                 | a gate exits 0 on the new host and its calibration is recorded by the pool's owner                  |
| 3     | Observability   | the server; OpenBao serving (R22); slice 2.8             | waves 5 to 10 Healthy; memory and disk measured; a test alert delivered                             |
| 4     | Production apps | the server; waves 9 and 10 Healthy; slices 3.1 and 3.5   | each app answers on its public name with its data checked against the final backup's report         |
| 5     | Retirement      | stage 4's receipts; stage 2's receipt for the gate hosts | old servers deleted; `desired.yaml` and the inventories name only the new cluster                   |

- **Platform first.** Every other cluster node joins this server, and Argo CD runs here.
- **CI second.** It depends on nothing in the cluster and has the longest lead: three
  calibrations of 5 h 16 min to 5 h 27 min each. The old gate hosts keep gating until then. It
  may run in parallel with stages 1 and 3.
- **Observability third.** Alerts and backups wait on it.
- **Production apps last.** They carry the data.

Harbor and OpenBao land on the platform node by their own changes. Harbor blocks no stage: the
website keeps its image source (R11) and the WBS cutover promotes digests its own plan names.
OpenBao blocks stage 3 under R22.

### 7. The switch

The switch is unsafe by decision (R26). An app is stopped on the old side, backed up once,
restored on the new cluster and started; then DNS is pointed at the new node and cert-manager
issues fresh certificates there. The app is down from the stop until issuance completes, and
the public name serves no valid certificate for the minutes between the DNS change and
issuance. Nothing is fenced, staged or kept in step.

The only guards:

1. **Irreplaceable data is verified before its old host is deleted.** The WBS dev database,
   which is the agents' live tracker; the WBS production database; the website data; MLflow if
   kept. Each gets one final backup after its writer is stopped, a restore of that named stamp,
   and a check against the backup's report. Until the old host is deleted, going back is
   starting the old app again and pointing DNS back.
2. **Secrets that cannot be regenerated are read back from escrow first** (task 0.5): the
   backup archive key, the registry CA key pair, the object storage credentials and the old
   cluster's age identity.
3. **The new side backs itself up under its own prefix.** The k3s runner writes
   `sqlite/<database>/` with no cluster part and restores the newest report, so two clusters on
   one prefix can restore each other's data. The new cluster's overlays set a prefix that names
   it, and a host is deleted only after one verified backup exists on the new side.
4. **The old Flux paths stay unedited** (decision 3).
5. **Gates do not stop for other sessions.** No gate host is deleted before the new CI host is
   calibrated.
6. **h1claw is not deleted by this plan, and no store loses its backup while it moves.** One
   h1claw service pulls all the Compose databases on h2puni, WBS production among them. That
   pull stays until h2puni is deleted. The CI host gets a second set of its own, and each set's
   freshness is judged on its own, so a fresh set from one host cannot hide a stale one from
   the other. The MLflow pull has one source and is re-pointed. A move is done only when the
   first verified set from the new host exists.

### 8. What crosses and what is left

| What                       | How                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| WBS production database    | The cutover plan's export and restore Job, after slice 3.5 (R28). Its fences are that plan's to keep or drop under R26 |
| WBS dev and Compose state  | A final h1claw set after the dev stacks stop on h2puni; its dev members only are restored on the CI host               |
| Website data               | The website's own backup job run once after scale-down, restored into a new claim                                      |
| MLflow store               | A final h1claw set after the service stops on h3mon, restored on the observability host (R15)                          |
| DNS records                | One reviewed plan per name (`platform-dns.ts plan`), applied by hand at the registrar                                  |
| Registry CA key pair       | From escrow, so `registry.puni.internal` keeps the chain that nodes and build tools trust                              |
| Object storage credentials | From escrow. etcd snapshots go to their own bucket: the snapshot folder is the cluster id, which is shared             |
| Fleet repository           | A new directory for the new cluster (decision 9). The old one is removed in stage 5                                    |

Not carried: public certificates and ACME accounts (issued and registered anew), k3s
credentials, the SOPS identity, registry push credentials, the old registry's one proof image,
Victoria and Grafana data, stopped containers, the old cluster's etcd, and the preserved
OpenHands container on h4claw unless the owner names it (open question 8).

### 9. Dependencies on other owners

**Harbor change (`adopt-harbor-registry`).** This change edits none of its files. It needs:

- Delivery: its `HelmRelease` and overlays (decision 4, slice 3) become a wrapper chart and an
  Application in wave 5, with the selector and toleration of decision 1.
- Rendered values: every value the chart would otherwise generate at install time is supplied
  from a Secret, or each comparison renders a different one. The Harbor change has to list
  them.
- Placement: assumptions H1, H9 and H13 and decision 2 name h4claw. The node is h5plat.
- Stop rule: task 1.3 computes 1,949 MiB from h4claw's memory under a gate. On h5plat the
  figure comes from that node's reading and decision 2 here, and no gate runs there.
- No Distribution on the new cluster: H11, migration steps 10 and 12, attended steps A9 and
  A11 and the `:5000` endpoint fall away, and so do A1 and A2a, which read and re-enroll h4claw.
- Its first slice can measure on h5plat once A3 is done.

**OpenBao design (pull request #935).** Owned by another session and not edited. It needs to
know: the node and label (R8), the taint (R25), that its Flux units and `dependsOn` order become
Applications in wave 4, that its seal key arrives by the bootstrap playbook (decision 5), that
it is due before stage 3 (R22), and that its image must never be pulled from Harbor.

**Fleet repository and release bootstrap.** Website registry routing, the fleet's website pins
and `release-pin.ts` stay untouched. The website's present overlay cannot be read by Argo CD
as it is: it carries encrypted Secrets that only a decrypting reconciler can apply. The new
cluster needs a directory of its own there with the public-name issuers, an overlay per app
whose Secrets are ExternalSecrets, and a check that plays the part `fleet-check` plays for Flux
units. Who writes it, and how the release pin reaches a second overlay, is for the owner and
the session that holds the release bootstrap (open question 5). The fleet Application follows
that repository's `main`; task 0.6 requires a ruleset there before wave 12 exists.

**Gate pool (`dash-host-jobs`).** Needed from its owner: enrollment and calibration of h8ci
with the dev stacks already running; the headroom for that host; before A21 and A22, either a
withdrawal step for h4claw and h2puni or written confirmation that none is needed; cleanup of
the capacity those hosts report.

**h1claw's backup sets.** Their definitions live in a repository this change does not edit.
Needed from the owner: a second SQLite set that pulls from h8ci, with its own local
directory, bucket prefix and entry in the freshness judgement; the MLflow set re-pointed at
h7obs. The existing h2puni set is not changed until A22.

**WBS cutover plan.** Its "New cluster" and "Ingress address" inputs resolve to the new cluster
and h6apps. Its overlay gains the selector patch of decision 1 and the backup prefix of
decision 7. Three things in it require Flux and cannot run on the new cluster as written:

- A prerequisite: `GitRepository flux-system/wbs-deploy` and `Kustomization flux-system/wbs`
  over the deploy repository, with `data.solverImages` excluded from reconciliation.
- Step 6: `flux suspend kustomization wbs` before the restore.
- Step 8: the first-start coordinator. Its request names a Flux unit and revision, and
  `first-start-source.ts` reads the `Kustomization` and the `GitRepository`, requires
  `suspend: true` and a source pinned to the desired commit, clears the suspension, and waits
  for `lastAppliedRevision`.

The Argo CD counterpart is an Application `wbs` in the `apps` project over the same deploy
repository path: automation disabled stands for suspended, `targetRevision` is the pinned
commit, `status.sync.revision` stands for the applied revision, and the `solverImages` rule is
the first row of decision 3's table. Slice 3.5 is that port. It belongs to the cutover plan's
owner and A20 cannot start before it (R28).

**Documents that describe Flux as the only delivery path.** `docs/infra/platform.md`,
`README.md`, `recovery.md`, `fleet.md`, `local.md`, `registry.md`, `registry-consumers.md`,
`deployment.md`, `cutover-plan.md`, `otlp-mtls.md`, the three observability pages,
`docs/platform-map.md` and `docs/runbook-prod-deploy.md`. Slice 2.9 adds the new runbook; the
rest are rewritten when the old cluster is removed.

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
> off the public edge and read-only. It follows `main`, so the rules that guard `main` are the
> administrative boundary of the cluster.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving.
- **One production apps node.** Its loss stops all three apps, and SQLite loses up to an hour.
- **Monitoring on one node.** It cannot report its own loss; R16 covers only liveness.
- **Shared vCPUs for CI.** A gate saturates the host for over five hours.
- **One gate host at the end**, at about 5 h 20 min a gate, unless a second CI host is added.
- **The CI host is not clean.** It holds the dev stacks, and the dev poller needs `sudo` for
  the gate account, as on h2puni. A gate payload can become root there. It holds no cluster
  credential and is not a jump host (R17).
- **A merge deploys to production.** Automated sync with prune means a merge to `main` that
  touches `infra/argocd` is applied within the reconciliation interval, with no promotion step
  (R20). The pull request, its required checks, the `delivery` check and the `Prune=false`
  data claims are the guards. A promotion step is worth adding when there are users.
- **Later changes are not ordered.** Waves order the root's sync only; a merge that changes
  several units converges by retry (decision 3).
- **Two delivery tools.** See the second decision record.
- **Two clusters with one identity** during the build. Separate credentials, a separate
  snapshot bucket, a separate SQLite prefix and distinct kubeconfig context names are the
  guards. Argo CD targets only the cluster it runs in, so no delivery credential can point at
  the other one.
- **Restores are the migration.** A store whose backup has never been restored fails at the
  switch. With R26 that costs downtime, not data, as long as guard 1 holds.
- **The observability units have never been healthy in production.**
- **OpenBao is on the path of stage 3** (R22), and its design is not merged.
- **Losing the platform node loses the jump.** The controller then reaches each server through
  that server's own public SSH endpoint (R17).
- **WBS production waits on code this change does not own** (R28, slice 3.5).

## Open questions for the owner

1. Are all four servers the 16 GiB class, with the larger disk for observability (R2), and are
   the names right (R3)?
2. Do you create the servers in the console (R4), all four at once or one per stage?
3. Is the CI host the home of the dev stacks and release builds (R12)?
4. Is MLflow kept (R15)?
5. Who writes the fleet repository's directory for the new cluster, and does the website cross
   before the release bootstrap finishes?
6. Is one CI host enough once h4claw and h2puni are gone?
7. Is re-pointing h1claw's pulls acceptable (R13), or do you want h1claw's duties replaced
   first?
8. Is anything on the old hosts worth keeping beyond decision 8's list?
9. Does WBS production cross by the guarded cutover plan, which needs slice 3.5 first, or like
   the website under R26 (R28)?
10. Where does the alert go? The Harbor change waits on the same answer.
11. Does stage 3 wait for OpenBao (R22)?
12. Is one local read-only account enough for the Argo CD interface until single sign-on?
13. The fleet model records each node's machine id and private address in `desired.yaml` and
    the inventory, in this public repository, as it does for the two existing nodes. Do the new
    nodes follow that, or should the inventory move to the private repository first?

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings, and no Argo CD
  instance was run.
- That helm follows a symbolic link to a chart archive in `charts/`. If not, the wrapper holds
  a copy.
- That self-management leaves the password hash and the generated keys in `argocd-secret`
  alone. Fallback: the Secret leaves the managed set (decision 3).
- That `validate-enrollment.yml` passes on a cluster of one node registered with the taint. The
  packaged components' tolerations were read, not run. Fallback: R25's alternative, selectors
  and the check alone.
- That kustomize inflates a chart from a local archive without fetching. Fallback: a committed
  render (decision 3).
- That `Force=true,Replace=true` recreates a changed Job, and that
  `RespectIgnoreDifferences=true` leaves `solverImages` alone, on this version.
- That Argo CD's bundled health check holds an ExternalSecret unhealthy until its value
  arrives.
- The exact `ignoreDifferences` list, and the memory of Argo CD, the k3s server and etcd.
- How the public certificates are solved, and the content of the fleet repository's overlays
  beyond their file list: both are private.
- The production figures for `puni-request-app`, OpenBao, and the dev stacks on a CI host.
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
