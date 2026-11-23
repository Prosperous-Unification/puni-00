## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. This change keeps the cluster rebuild, with
the minimal placement profile the owner asked for on 2026-11-22 (R45, decision 11).
PostgreSQL hosting is the change `host-postgres`, the hosts for agents are the change
`add-agent-hosts`, and CI orchestration is the change `run-ci-on-argo-workflows`; the four
are in one pull request and together are the new setup plan. [verify.md](verify.md) records
what was read, what was not, and the owner's decisions by date.

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

What exists of the new setup, as the owner stated it on 2026-11-22 (verify.md; no host was
read for this plan):

- The platform server `m1plat1`: 8 vCPUs, 32 GB of memory (`free -g` shows 31), 200 GB of
  disk, Ubuntu 26.04.1, private address 10.10.1.11. It has no host firewall yet (A26).
- A bastion, `m2bast1`: 1 vCPU, 2 GB, private address 10.10.1.12. SSH reaches the servers
  only through it, as a `jump` user with no shell whose `PermitOpen` lists each server's
  private address and port 22 (R55). Its nftables admit SSH in and send anything out.
- Both are on a new private network, 10.10.1.0/24, with an MTU of 1442. It is not joined to
  the old hosts' network. The provider's panel firewall refuses outbound traffic that is not
  allowed once it is attached, and m1plat1's public SSH is closed there.
- Names follow the owner's scheme: `m`, the server's index at the provider, its function,
  and its index within that function (R3, decision 11).

What the repository can already do from an empty host, and what Argo CD changes about it:

| Need                            | Source                                                                                                       | Reusable for the new cluster                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| First server with embedded etcd | `playbooks/bootstrap.yml`: `base`, `network`, `storage`, k3s server                                          | yes                                                                         |
| Agents                          | `playbooks/join.yml`, `validate-enrollment.yml`, `firewall.yml`                                              | yes                                                                         |
| etcd snapshots and cold restore | `playbooks/backup.yml`, `restore.yml`, `tool-fleet:recover`                                                  | yes, after slice 2.6                                                        |
| Gate host                       | `playbooks/gate-host.yml` and the gate-host runbook                                                          | yes                                                                         |
| Delivery and the stage graph    | `playbooks/platform.yml`, `infra/clusters`, `validatePlatform`                                               | no: Flux only (decision 3)                                                  |
| Workload definitions            | `infra/platform`: plain manifests and Flux `HelmRelease` objects                                             | plain ones as copies; each `HelmRelease` is rewritten                       |
| Secrets                         | SOPS files decrypted in the cluster by Flux                                                                  | no (decision 5)                                                             |
| WBS on k3s                      | `deploy/k8s/wbs` with `staging` and `prod` overlays; the [cutover plan](../../../docs/infra/cutover-plan.md) | manifests yes; both overlays name the same two namespaces (slices 3.5, 3.8) |

## Goals / Non-Goals

**Goals**

- One trust class per host, and every workload placed by capability, never by server name,
  so that one tree runs on the minimal layout that is built first and on the full layout it
  grows into (decision 11).
- The new cluster delivered by Argo CD from a tree of its own: staging follows `main`,
  production and the platform change on command.
- OpenBao as the first service after Argo CD, so every later Secret comes from it.
- No platform service on the internet: the operator reaches each over a private access
  network (decision 12).
- A cluster-management interface, Rancher Manager, on the platform node, while Argo CD stays
  the only delivery path (R54, decision 14).
- Every platform service built for one tenant in the form any tenant takes, with a named
  interface the `puni-user-platform` can drive (decision 13).
- A build order in which every stage has a receipt.
- A sized, grounded budget for each node.
- A plain list of what must survive the switch and what proves that it did.

**Non-Goals**

- Designing Harbor, OpenBao, the WBS overlays or each app's build and pin tools. Their
  changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- Moving workers clusters or the existing labs to `puni-01` (R27): a plan of its own.
- High availability, continuous SQLite replication, single sign-on for Argo CD.
- PostgreSQL hosting, and porting any app from SQLite to it: the change `host-postgres` and
  the follow-ups it names.
- The agents host and the workstation: the change `add-agent-hosts`.
- A switch without downtime (R26).
- Any duty of h1claw (R30).
- Delivering a dev environment. This change sizes and contains it; a follow-up change
  delivers it (R34, decision 9).
- Onboarding a tenant from the `puni-user-platform`, and the adapter through which it
  drives the services: follow-ups (decision 13).
- A way for clients to reach anything. The private access network is the operator's.

## Assumptions

Fixed by the owner on 2026-11-21, in this order: the four roles, the three production apps,
Elasticsearch and Prometheus as the observability stack, SQLite, a cluster recreated from
scratch, Argo CD as its delivery tool, and that the switch may be unsafe; then that OpenBao is
set up before everything else; that `main` deploys to staging and production deploys on
command; that alerts go to the Slack channel `#puni-alerts-dev`; that MLflow is kept; that
h1claw may be deleted at any time and the backup windows that follow are accepted; that one
executor serves every CI trigger; and that the recommendations then on the table
are accepted. He first chose the apps node for staging; after a review he decided that
dev and staging get a node of their own (R29). He then asked for PostgreSQL hosting and for
two hosts for agents; those are the changes `host-postgres` and `add-agent-hosts`. On
2026-11-22 he asked for the minimal setup that can grow, chose its three open points, and
said that every server is new and every old one is retired (R45, R46). Later that day he
bought the platform server and a bastion and asked for Rancher to be included (R2, R3,
R54, R55). On 2026-11-24 he answered task 0.1 row by row: most rows confirmed as written,
an object store and a naming rule added (R6, R8), storage off the root disk (R9), an
ApplicationSet (R19), the workers clusters and labs to another repository (R27), four-character
environment names (R34), the reason for one CI trust zone (R35) and a larger CI server
(R50); [verify.md](verify.md#owner-decisions) lists them.
A row marked **decided** records one of those; the rest (R5's cluster id, R12, and the
assumed parts of R3, R15 and R20) are assumed and can be overruled by id. The ids R14, R18 and R36 to R44 are not used: the first two were withdrawn, and the
rest moved to the changes `host-postgres` and `add-agent-hosts` under ids of their own.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Alternative and its cost                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Decided**, as written, on 2026-11-24. The new cluster is built on newly created servers. An old host is deleted once its data is confirmed restored and, for a gate host, once a full gate has passed on the CI cluster (change `run-ci-on-argo-workflows`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reinstall the existing servers. Cost: gates stop for other sessions while a gate host is rebuilt                                                                                                                                                                                                                                                                                                                                                                                  |
| R2  | **Decided**, on 2026-11-22, for the minimal profile (R45): a platform node of 8 vCPUs and 16 GiB, which he then bought that day at 8 vCPUs and 32 GB with 200 GB of disk (m1plat1), the size decision 2 now counts; a CI server which he first chose to start at the 8 vCPU and 16 GiB class, which R50 replaces with 16 vCPUs and 32 GiB; a production apps node of 4 vCPUs and 8 GiB as a trial (his choice of 2026-11-22), to be rescaled to 8 vCPUs and 16 GiB at the trigger of decision 2; and an observability server larger than that class, because it also carries the non-production environments: decided on 2026-11-22, after he was shown that staging did not fit beside the stack on 16 GiB on the declared figures. He named no size. Recorded: at least 24 GiB; assumed: 16 vCPUs and 32 GiB, because the provider has no 12 vCPU and 24 GiB class (R50) and A12 then takes the next one. It has a public IPv4 address. Every role has a minimum disk, which a server of any provider has to meet (decision 2). In the full profile the non-production server is 8 vCPUs and 16 GiB and the CI host is 16 vCPUs and 32 GiB in both, the size he had chosen on 2026-11-21 (R50)                                                                                                                                                                                      | A CI server of 8 vCPUs and 16 GiB, his first choice. Cost: one gate does not fit beside the CI cluster's own pods (R50). An observability server of 24 GiB. Cost: the provider has no such class (R50); the sum of decision 2 is what A14 measures either way                                                                                                                                                                                                                     |
| R3  | **Decided.** Node ids and host names follow the owner's scheme of 2026-11-22 (decision 11): `m1plat1` for the platform server and `m2bast1` for the bastion, both bought. `h6apps`, `h7obs`, `h8ci` and `h9stg` stay placeholders for the servers not yet bought; each is replaced by its real name in the 1.3 revision that records it. Assumed: `h9stg` is the non-production server of the full profile, which the minimal profile does not create                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R4  | **Decided.** The owner creates each server in the provider console; it is enrolled by static inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                                                                                                                                                                                                                                                                                                                                       |
| R5  | The new cluster keeps the cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed. **Decided:** machine ids and private addresses are recorded where the fleet model records them today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A new cluster id. Cost: the id list is closed in the `backup` role, `platform.ts` and `recover.ts`                                                                                                                                                                                                                                                                                                                                                                                |
| R6  | **Decided** on 2026-11-24, as written, with the object store added. AWS S3 is the object store for etcd snapshots, app backups, OpenBao snapshots and Harbor where Harbor supports it (R9), and a bucket in a region other than the servers' gives OpenBao's off-region snapshot copy an owner (change `openbao-secret-store`, D11). The region and the account are the owner's and are not in this repository. New: k3s credentials, a SOPS age identity that never enters the cluster, the repository read keys, the Argo CD account, the S3 keys, everything OpenBao generates. Carried from escrow: the registry CA, and the old object store's credentials, which only read the backups that cross (decision 8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Reuse every secret. Cost: the old cluster's credentials would open the new one                                                                                                                                                                                                                                                                                                                                                                                                    |
| R7  | **Decided**, as written, on 2026-11-24. Build order: platform, CI, observability, apps, then retirement (decision 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Apps before observability. Cost: data arrives before the alert and backup units are healthy                                                                                                                                                                                                                                                                                                                                                                                       |
| R8  | **Decided** on 2026-11-24. One new capability, `puni-platform-services-pv1` (`platform-services` in the text, decision 1), pins Argo CD, cert-manager, Harbor, OpenBao, the External Secrets Operator and Rancher Manager (R54). No plan places Harbor or OpenBao on a node of its own, so the placement stands. Names PUNI defines are scoped and versioned, by the rule the owner set that day (decision 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | One label per service, as pull request #935 proposes with `secret-store`. Cost: several labels that always sit on one node                                                                                                                                                                                                                                                                                                                                                        |
| R9  | **Decided** on 2026-11-24, overruling node-local storage. Data goes to S3 where an app supports it: backups, Harbor, MLflow artifacts and snapshots (R6). Every other persistent claim lives on a provider block volume attached to its node and mounted there, not on the server's root disk; the owner: "i want cloud storage when possible - so not on node disk". Claims keep the policy `Retain`. Two things are not known and are checked before a store lands on a volume (A29): whether a volume can be detached and re-attached to a replacement server, and its throughput. Where a check fails, the claims go on the root disk and the role's fallback minimum of decision 2 applies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Node-local claims on the root disk, as an earlier draft had it. Cost: a store moves only by a backup and a restore, and a server's disk bounds its data                                                                                                                                                                                                                                                                                                                           |
| R10 | Harbor is the only registry the new cluster ever runs. Its tree has no Distribution unit. **Decided** on 2026-11-22 that it is built and not deferred or replaced by a hosted registry, with the custom runner of R31: once both operate he may replace either with a cheaper option, and having built them he knows that the path to grow works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Install Distribution first. Cost: a registry replaced before its first consumer                                                                                                                                                                                                                                                                                                                                                                                                   |
| R11 | **Decided.** The website and the request app run on the new cluster from the same release pins and source registry as today, moved after the release bootstrap finishes; the session that owns it writes the fleet repository's directory for the new cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Route them to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                                                                                                                                                                                                                                                                                                                         |
| R12 | The CI role is gates and builds, on a cluster of its own that runs nothing else: release builds and the staging builds of R31, every one a Workflow there (change `run-ci-on-argo-workflows`). No app, staging or production, and no database runs there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Dev stacks on the CI host, as an earlier draft had it. Cost: the agents' tracker slows under every gate and sits beside branch code                                                                                                                                                                                                                                                                                                                                               |
| R13 | **Decided.** Backups of everything on the new cluster run inside it: each app's own backup job, and retention and the freshness alert as cluster units (slice 3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Keep an outside puller. Cost: a host whose only job is to watch another                                                                                                                                                                                                                                                                                                                                                                                                           |
| R15 | **Decided:** MLflow is kept. Assumed: it runs on the observability node as a cluster unit with one `Retain` claim and a backup and verify pair of its own, for a SQLite metadata store and an artifact root (slice 3.6); Victoria and Grafana are not rebuilt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A Compose service with a host timer. Cost: a second backup mechanism for one store                                                                                                                                                                                                                                                                                                                                                                                                |
| R16 | **Decided**, as written, on 2026-11-24. Each node is probed from another node; the observability node from the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                                                                                                                                                                                                                                                                                                                                       |
| R17 | **Decided**, as written, on 2026-11-24. The Ansible controller is the operator's laptop, or a workstation of its own as the full profile of `add-agent-hosts` defines it if the owner moves it there, and never a machine where gates or agents run (decision 10). Every SSH session of the operator's and the controller's, to every server and to the hosts of `add-agent-hosts`, passes the bastion m2bast1, which forwards to each server's port 22 and nothing else (R55). The tailnet carries the platform interfaces and the Kubernetes APIs, and no SSH (R47). The bastion holds no key and runs no gate or agent. When the bastion cannot be used, the break-glass of R49 applies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A jump on the CI host. Cost: a host that runs branch code sits on the path to every node                                                                                                                                                                                                                                                                                                                                                                                          |
| R19 | **Decided** on 2026-11-24, overruling app of apps: an ApplicationSet from the start. The ApplicationSet controller is installed, and one ApplicationSet per project generates an Application per unit, environment and tenant from Application files in this repository. The root Application stays the one entry point: it syncs automatically and manages only ApplicationSet and AppProject objects (decision 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | One root Application that owns plain Application files (app of apps), as an earlier draft had it. Cost: every unit, environment and tenant written out by hand, and a second shape to move to when tenants arrive                                                                                                                                                                                                                                                                 |
| R20 | **Decided.** The owner on 2026-11-21: what merges to `main` is deployed on staging; a production deployment is done by hand, on command. A merge to `main` that touches an app starts a build on the CI host, which commits that app's rendered staging manifests to the staging pins repository; the staging Application's source is that directory and it syncs automatically (decision 9). The website and the request app keep the fleet repository's staging overlays as their source until their owner adopts that path (R11). Production Applications track `main` with automated sync off. Every overlay names its images by digest, so what runs in production is the digest set of its overlay at the last sync, promoted there by a merge. Assumed: platform units have no staging copy and are synced on command too                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Platform units automated. Cost: a merged infrastructure change rolls out with no second look, on the one cluster there is                                                                                                                                                                                                                                                                                                                                                         |
| R21 | **Decided**, as written, on 2026-11-24. The new cluster's definitions live under `infra/argocd` and share no file with a Flux-reconciled path, except chart archives locked by digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reference the existing plain manifests. Cost: an edit for one cluster reaches the workers clusters and the labs                                                                                                                                                                                                                                                                                                                                                                   |
| R22 | **Decided.** The owner on 2026-11-21: OpenBao is set up before the other services. No decryption runs in the cluster. Ansible applies only the bootstrap Secrets that Argo CD and OpenBao themselves need (decision 5); every other Secret is an ExternalSecret from the first day                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Bootstrap Secrets for the first stages. Cost: a second delivery path, built to be removed                                                                                                                                                                                                                                                                                                                                                                                         |
| R23 | **Decided.** The Argo CD interface has no public route, is reached over the private access network (R47) and has one local account, which reads everything and may sync Applications of the `prod` project only, at the revision the Application names; it may not roll back. The built-in `admin` account is disabled. Break-glass is `kubectl` on the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Keep `admin` enabled. Cost: a second write path with one shared password                                                                                                                                                                                                                                                                                                                                                                                                          |
| R24 | **Decided**, as written, on 2026-11-24. Argo CD's four workloads are limited to 1,536 MiB together until A8 measures them. The ApplicationSet controller (R19) is a fifth workload, assumed at 256 MiB, which A8 measures with them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | No limits. Cost: the repo server's rendering can take memory from the secret store                                                                                                                                                                                                                                                                                                                                                                                                |
| R25 | **Decided**, as written, on 2026-11-24. The platform node is registered with the taint `CriticalAddonsOnly=true:NoSchedule`. Platform services and three named node agents tolerate it; nothing else may                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Node selectors alone. Cost: a workload outside the checked tree can land beside the secret store                                                                                                                                                                                                                                                                                                                                                                                  |
| R26 | **Decided.** The switch may be unsafe. Decided by the owner on 2026-11-21: downtime and an unsafe switch are accepted, because there are no production users. It holds only while there are no production users; the guards of decision 7 stay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A staged switch with fences and a retained old side. Cost: the ceremony of an earlier draft                                                                                                                                                                                                                                                                                                                                                                                       |
| R27 | **Decided** on 2026-11-24: workers clusters and the existing labs move to the new repository `puni-01`; they do not stay on Flux in this repository. Until they move, Flux keeps reconciling them from here and this change edits none of their paths (R21). The move is planned in the platform's private records repository, not in this change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | They stay on Flux here, as an earlier draft had it. Cost: two delivery tools in one repository with no end                                                                                                                                                                                                                                                                                                                                                                        |
| R28 | **Decided.** WBS production crosses the simple way, like the website: stop, one backup, restore, start. The cutover plan's first-start coordinator and its replay and digest guards are not used for the move. Its images come from Harbor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The guarded cutover plan. Cost: its coordinator reads and patches Flux objects and would have to be ported first                                                                                                                                                                                                                                                                                                                                                                  |
| R29 | **Decided** by the owner on 2026-11-21: dev and staging run on a node apart from production, and they are two separate environments. A fifth server, `h9stg`, holds the non-production role, with the capabilities `nonproduction` and `ingress`, and is where two environments of the three apps run, staging and dev, each with its own namespaces, hostnames, certificates, claims, OpenBao paths and backup prefix. The production apps node carries production only. He had first chosen the apps node for staging; a review then read the WBS solver's host supervisor, which is written for one node (decision 1). This change delivers staging there and prepares dev (R34). On 2026-11-22 he placed both environments on the observability node for the minimal profile (R45): the two environments, their separation from production and everything else in this row hold unchanged, and `h9stg` becomes the first growth step (decision 11)                                                                                                                                                                                                                                                                                                                                                                                                                                | One capability per environment. Cost: two labels that always sit on one node; the AppProjects and namespaces already separate the two                                                                                                                                                                                                                                                                                                                                             |
| R30 | **Decided.** The owner may delete h1claw at any time. Asked on 2026-11-21 to choose between accepting the backup windows of decision 7's table and keeping h1claw until WBS has moved, he accepted the windows. One step must precede the deletion: the escrow of task 0.5, because the existing encrypted archive is unreadable without its key. On 2026-11-22 he said every old server is retired (R46); the step that retires h1claw is in the change `add-agent-hosts`, and he may delete it before that step on the two receipts that step names: the escrow read back, and his recorded yes or no on OpenClaw's state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep h1claw until retirement as a rule of the plan. Cost: a guard the owner said he does not want                                                                                                                                                                                                                                                                                                                                                                                 |
| R31 | **Decided, and restated on 2026-11-22.** On 2026-11-21 the owner decided to keep his own runner, started by the provider's CI or by agents through a command line, MCP or the platform's API, all of it converging on the `puni-user-platform`. On 2026-11-22 he confirmed that CI of his own is built and not replaced by hosted runners (R10), asked for a self-hosted tool that orchestrates it so that he does not have to build one, and chose Argo Workflows and Argo Events with Dagger, without the host pool underneath. The change `run-ci-on-argo-workflows` defines it: a CI cluster on the CI server, a trigger job that joins the private access network (R51) and the command line as triggers, the scheduler as admission. What stays from this row: one executor and thin triggers, with MCP and the `puni-user-platform` API as the direction; staging images are built there and pushed to Harbor by digest, and the same job commits the rendered staging manifests to a staging pins repository that nothing but staging reads (decision 9)                                                                                                                                                                                                                                                                                                                      | The host pool behind a self-hosted GitHub Actions runner, as an earlier draft had it. Cost: an orchestrator kept in this repository, and no tenants. The provider's hosted runners. Cost: they cannot reach Harbor on the private network                                                                                                                                                                                                                                         |
| R33 | **Decided** for staging. Asked on 2026-11-21 whether staging is automatic from `main`, holds the agents' tracker and promotes to production, the owner confirmed all three. **Staging** is deployed automatically from `main` (R20) and is the rehearsal of exactly what production will get; it holds the agents' live tracker, because today's WBS dev, which holds it, follows `main`. It replaces today's dev stacks: the `website-dev` namespace and the Compose dev stacks. Assumed, and the follow-up's to confirm (R34): **dev** is deployed on command from any ref, by an agent or the owner, to try a branch or a pull request; its data is disposable and it is never synced from `main` by itself. Promotion is staging to production only; dev promotes nowhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The tracker on dev. Cost: it stops following `main`, or dev stops being disposable                                                                                                                                                                                                                                                                                                                                                                                                |
| R32 | **Decided**, as written, on 2026-11-24. On the rebuilt cluster the WBS solver is bound per environment: a trusted namespace, a selector and a parameter ConfigMap for each, and each backend's caller name in the supervisor's closed list. A node runs one supervisor with one pod caller: production's on the production apps node, staging's on the non-production node. The staging caller's rule names no caller image, which the supervisor's decoder is changed to allow for that one name; the staging list of trusted backend images is rendered by the staging build into the pins repository, and production's stays outside Git (decision 1, slice 3.8). A second caller on the non-production node, dev's, waits for the follow-up (R34)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Per-digest rules for staging as for production. Cost: every staging backend deploy waits for a person to run `solver.yml`, which is what R20 rules out                                                                                                                                                                                                                                                                                                                            |
| R34 | **Decided**, as written, on 2026-11-24: staging first. This change delivers staging and only prepares dev: the non-production node is sized for both, the capability `nonproduction` and three dev namespaces exist from the start, and the platform-side containment of decision 3 binds every non-production namespace at admission, whatever a ref holds. Dev's Applications, project, account, build trigger and solver use are a follow-up change, proposed name `add-dev-environment` (decision 9). Environment names are `prod`, `stag` and `dev0`, the owner's uniform four-character names of the same day; later dev environments are `dev1`, `dev2` and on (decision 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Dev delivered here, as an earlier draft had it. Cost: its isolation rested on rules in `gate`, which never see the ref a dev sync applies                                                                                                                                                                                                                                                                                                                                         |
| R35 | **Decided**, as written, on 2026-11-24, with the owner's rationale: only code PUNI controls runs on PUNI infrastructure, and a client who leaves takes the code and runs the PUNI platform themselves. So the CI cluster is one trust zone, and that no longer rests on R26 alone. Dependencies count as code: lockfiles are frozen, images are pinned by digest, and a new dependency goes through review. A gate needs a privileged Docker daemon beside it and a build needs a privileged engine, so code that a gate runs can take the node, read the build credentials and change what a later build produces. What is accepted is the integrity of images built there, which staging runs at once and production runs after a promotion. The credentials themselves reach staging only: the push robot writes one Harbor project, and the GitHub App is installed on the staging pins repository alone. There they can commit any manifest that the `stag` project and admission allow, the list that admits a backend to the solver socket included (decision 9). The CI cluster holds no credential for the platform cluster. If the rule on code ever changes, per-job VM isolation (Kata Containers or Firecracker as a RuntimeClass under Argo Workflows) is required before any foreign code runs; it needs nested virtualisation on the CI server, which is not verified | A build node that gates never run on. Cost: one more server; it is phase 4 of the CI change                                                                                                                                                                                                                                                                                                                                                                                       |
| R45 | **Decided** by the owner on 2026-11-22: separate only the nodes that will be hard to scale out later, spend conservatively, and build the smallest setup that can grow. There is one design and two placement profiles (decision 11). The **minimal** profile is built first: the platform node also carries the capability `database`; the observability node also carries `nonproduction` and `ingress`, on his decision that staging and dev stay on the observability node; the CI host starts at 8 vCPUs and 16 GiB, which R50 replaces on paper; for OpenClaw and his own sessions he first said "two hosts" and later that day chose one host for both in this profile (change `add-agent-hosts`). The **full** profile, one role per server, is what it grows into. The planning session's reasoning, which he agreed to as a shape: three things are hard to change later and have a machine of their own from the first day, the single k3s server, continuous integration outside the cluster and observability; everything else is placed by capability, so a later split is a new server and a moved label                                                                                                                                                                                                                                                               | The full profile from the start. Cost: two more servers and a larger CI host before anything shows they are needed                                                                                                                                                                                                                                                                                                                                                                |
| R46 | **Decided** by the owner on 2026-11-22: every server is new and every existing one is retired. No existing server is reused in either profile. h4claw, h3mon and h2puni are retired by stage 5 of this change, and h1claw by the change `add-agent-hosts` (R30)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Keep h1claw as the OpenClaw host and h2puni as the gate host. Cost: none in work; the planning session had offered it, and the owner chose new servers                                                                                                                                                                                                                                                                                                                            |
| R47 | **Decided** by the owner on 2026-11-22: Tailscale is the access path; the services that run the platform are reached through it and are not exposed to the internet. Both clusters' APIs and every platform interface are reached by the operator over a private access network, Tailscale; SSH to a server passes the bastion (R55). No platform service has a public route. What is public is Traefik, for the apps of each environment, and SSH on the bastion (R55, decision 12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Public names with a login for each platform tool. Cost: a login page on the internet for tools that hold the cluster's keys                                                                                                                                                                                                                                                                                                                                                       |
| R48 | **Decided** by the owner on 2026-11-22: everything must be orchestratable by the `puni-user-platform` and multitenant. Every platform service names its tenant boundary and the interface through which the `puni-user-platform` drives it. One tenant, `puni`, is built, in the form any later tenant takes (decision 13). Onboarding a tenant and the adapter that drives these interfaces are follow-ups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Design tenancy when the first client arrives. Cost: names, labels and credentials retrofitted across every service                                                                                                                                                                                                                                                                                                                                                                |
| R49 | **Decided** on 2026-11-24, with the option the row names: SSH through the bastion, the API on the tailnet only. SSH through the bastion does not depend on the private access network, so an outage of the tailnet costs the interfaces and the API names and no login; when the bastion cannot be used, break-glass is the provider's console and nothing else. No new server but the bastion has a public SSH rule (decision 12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | One public SSH rule from a fixed address. Cost: a standing rule for an operator whose address changes, and it is the exposure R47 removes                                                                                                                                                                                                                                                                                                                                         |
| R50 | **Decided** on 2026-11-24: the CI server is 16 vCPUs and 32 GiB. The provider has no 12 vCPU and 24 GiB class, which the planning session had assumed. He had chosen to start at the 8 vCPU and 16 GiB class; on the figures of the CI change's decision 5 one gate does not fit that class beside the CI cluster's own pods. The plan stays provider-neutral: no provider name and no price is in this repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 8 vCPUs and 16 GiB with a lower limit for the gate. Cost: a limit under the gate's measured use, where the kernel kills it                                                                                                                                                                                                                                                                                                                                                        |
| R51 | **Decided**, as written, on 2026-11-24. The CI cluster has no public webhook. A push to `main` starts a small job on the provider's hosted runner that joins the private access network for the length of the job and submits the Workflow there (CI change, decision 2). It is what R47 asks for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The signed, path-restricted webhook of the CI change's earlier draft. Cost: one public endpoint on the CI cluster, with an ingress and a certificate issuer there                                                                                                                                                                                                                                                                                                                 |
| R52 | **Decided**, as written, on 2026-11-24. Tailnet Lock is on, key expiry is off for tagged servers, and login stays `sshd` with operator keys, admitted from the bastion's private address alone (R55); Tailscale SSH is not enabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tailscale SSH. Cost: who may log in is then decided by the coordination service's policy alone, without a key the operator holds                                                                                                                                                                                                                                                                                                                                                  |
| R53 | **Decided**, as written, on 2026-11-24: the staging migration is automatic. a schema change reaches WBS staging with no command, through a hook Job of the staging Application that captures, migrates and reverses with the candidate image's own CLIs while the old backend keeps serving, as the old colour does in the Compose swap. The website API applies its own migrations at start, read from source, so its staging needs no hook (decision 9, slice 3.9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Keep every schema change on the attended path, as production's is. Cost: R20 would not hold for a WBS merge that carries a migration                                                                                                                                                                                                                                                                                                                                              |
| R54 | **Decided** by the owner on 2026-11-22: Rancher Manager is in the plan. It runs on the platform node's k3s cluster, as that cluster's own ("local") cluster, as an interface for looking at and managing the cluster, and it deploys nothing: Argo CD stays the one delivery path. Assumed by the planning session, as the working-out of that: chart v2.15.3, the newest that SUSE certifies for k3s v1.36 on a cluster that hosts Rancher (verify.md); one replica; delivered by Argo CD as the unit `rancher` at order 7, synced on command; no public route, reached over the tailnet through an Ingress of the Tailscale operator's class (decision 12); its bootstrap password from OpenBao; the Fleet it bundles run without its GitOps part and with no `GitRepo`, which checks hold; Rancher's own k3s version management off; 4,096 MiB until A28 measures it (decision 14). Confirmed as written on 2026-11-24, with that working-out: an interface only, Argo CD the only deploy path, Fleet's continuous delivery off, Turtles and k3s version management off, the browser shell disabled (decision 14)                                                                                                                                                                                                                                                                  | Headlamp, a read-only-capable Kubernetes interface. Cost: about a tenth of the memory and no second GitOps engine in the cluster, and none of Rancher's cluster management. No interface beyond Argo CD's. Cost: nothing to run, and only Argo CD's view of what it delivers, not of the cluster as a whole                                                                                                                                                                       |
| R55 | **Decided**, as written, on 2026-11-24. One SSH rule. The bastion m2bast1, which he set up that day, is the one SSH path: every SSH session to every server, the operator's and the controller's, goes through it, and the hosts of `add-agent-hosts` follow the same rule. The tailnet carries the platform interfaces and the Kubernetes APIs and no SSH; Tailscale SSH stays off (R47, R52). Three keys, each distinct and escrowed apart: the jump key, which only the bastion's `jump` user accepts; the servers' admin key, which only the servers accept; and the bastion's own admin key, for the operator's shell on the bastion. A login to a server takes the first two. The bastion does not join the tailnet, holds no key, and is probed from outside like every node (R16). There is no interim forward of the Kubernetes API: until the tailnet is set up, `kubectl` runs on the server itself, reached through the bastion                                                                                                                                                                                                                                                                                                                                                                                                                                           | SSH over the tailnet as well, beside the bastion. Cost: two SSH paths with two firewall rules, and a login that then rests on tailnet membership and one key. Tailscale for SSH, with the bastion removed. Cost: no way in that does not depend on the vendor's service, short of the console. The bastion for everything, without Tailscale. Cost: a forward per interface in `PermitOpen`, no names with certificates, and no identity mapping for the CI trigger (decision 12) |

## Decisions

### 1. Roles, capabilities and placement

Workloads select capabilities and never server names. A placement profile is the mapping
from capability to server in the fleet inventory (R45, decision 11). The minimal profile is
the one every step, budget and receipt below names; the full profile is its growth target.
Where the text says "the non-production node" it means the node that carries
`nonproduction`, and "the database node" the node that carries `database`: h7obs and m1plat1
in the minimal profile.

| Capability, scoped name                                | What selects it                                                                                                      | Minimal profile  | Full profile     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| `puni-control-plane-pv1`, `puni-platform-services-pv1` | the k3s server; Argo CD, cert-manager, OpenBao, the External Secrets Operator, Harbor, Rancher Manager (decision 14) | m1plat1          | m1plat1          |
| `puni-database-pv1` (change `host-postgres`)           | the PostgreSQL instances of `platform-db`, its dump job and its restore drill                                        | m1plat1          | a database node  |
| `puni-product-pv1`                                     | the production apps and production's solver supervisor                                                               | h6apps           | h6apps           |
| `puni-observability-pv1`                               | Elasticsearch, Prometheus, MLflow                                                                                    | h7obs            | h7obs            |
| `puni-nonproduction-pv1`                               | staging and dev, their database cluster, their solver supervisor                                                     | h7obs            | h9stg            |
| `puni-ingress-pv1`                                     | Traefik                                                                                                              | h6apps and h7obs | h6apps and h9stg |
| none: not a k3s node                                   | gates and builds                                                                                                     | h8ci             | h8ci             |
| none: not a k3s node                                   | OpenClaw; the owner's agent sessions (change `add-agent-hosts`)                                                      | one host         | two hosts        |
| none: not a k3s node                                   | the SSH bastion, which forwards port 22 and holds no key (R55)                                                       | m2bast1          | m2bast1          |

- **Names PUNI defines are scoped and versioned.** Decided by the owner on 2026-11-24 (R8):
  "add explicit scoping with prefixes and versioning everywhere". A name PUNI defines
  carries the prefix `puni-` and the suffix `-pv<N>`; pv is puni-version, which tells what
  PUNI versions apart from what a third party versions. A name a third party defines keeps
  its form: the keys of k3s, Argo CD and Rancher are not renamed. A capability's scoped name
  is the one in the table above; its node label drops the prefix that the `puni.dev/`
  domain already gives, so `puni-platform-services-pv1` is the label
  `puni.dev/capability-platform-services-pv1=true`. The text, the checks and the other
  three changes write a capability by its short name, `platform-services` for
  `puni-platform-services-pv1`, and the short name always means the scoped one. The code
  merged in pull request #988 uses the short names; slice 1.10 renames them, and with them
  the other names PUNI defines that the new cluster reads (label and annotation keys under
  `puni.dev/`, the taint `puni.dev/role`), listing each old and new name before it changes
  one. The environment names `prod`, `stag` and `dev0` are the owner's of the same day and
  are used as he gave them (R34).
- `platform-services` and `nonproduction` are new. Each is added to `CapabilitySchema`,
  `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`.
  `database` is added by the change `host-postgres`, which defines it.
- **One trust class per host.** A host holds one of: the platform's secrets, control plane,
  registry and production database; production apps and their data; monitoring and
  non-production; branch code under a gate; agents; the operator's own sessions; the SSH
  bastion, which holds no key and runs nothing but `sshd`. The agents and the sessions
  share one host in the minimal profile, which the change `add-agent-hosts` records as
  an accepted residual with its limits. The
  co-locations a profile may make are named, and the placement check refuses every other
  (rule 1.2):
  - `database` may sit with `control-plane` and `platform-services`. A production database
    is in the trust class of the secret store. The split later is that change's growth
    step, which counts on a restore with the writers stopped.
  - `nonproduction` and `ingress` may sit with `observability`. Neither serves a user, and
    this is the owner's choice of 2026-11-22.
- What stays forbidden in both profiles: the server carries none of `product`,
  `nonproduction`, `ingress` and `observability`; no node carries both `product` and
  `nonproduction`; no gate host is a k3s node; the CI server is the one node of the CI cluster and of no
  other, and nothing else shares it;
  and nothing but the agents role, in the minimal profile, shares one with the workstation.
- **Why only three things have a machine of their own from the first day** (R45). The fleet
  model allows one k3s server, and moving it is a restore with the old one powered off.
  Continuous integration is a trust boundary: code under a gate is root-equivalent on its
  host. Observability holds the largest volumes, is the noisiest neighbour and grows by a
  larger machine. Everything else can be given a server of its own later without a change
  to a manifest; what each such step costs beyond the server and the label is in decision 11.
- The last two rows are here so that the list is whole; those hosts are outside the cluster.
  Nothing in this change's stages needs the agents' hosts; every SSH session of the
  operator's passes the bastion (R55).
- `ingress` is the one capability two roles share: Traefik is a DaemonSet on every node that
  carries it, and each environment's names point at its own node. Either Traefik would route
  for the other environment's hosts if a name pointed at it; rule 2.4(m) keeps the two sets of
  hosts apart.
- **Why non-production never shares a node with production** (R29). The owner first chose the apps node. The WBS
  backend talks to a solver supervisor that the `solver` role installs on the host, outside
  Kubernetes, and that program is written for one WBS per node:
  - when it starts it kills every container labelled `wbs-managed-solver=true` on the node,
    and its cap on managed containers counts node-wide
    (`solver-supervisor-lifecycle.ts`), so a staging supervisor restart would end production
    solves;
  - the pod reaches the socket only as the supervisor's uid, and the role installs one
    sudoers entry, one runtime directory and one link.

  On separate nodes each Docker daemon, supervisor, uid and directory is that node's own, and
  none of that changes. What a separate node does not remove is the part that is cluster-wide
  or in the program's closed lists; that is slice 3.8, below.

- **The non-production supervisor on the observability node** (minimal profile). The sweep
  lists and kills only Docker containers that carry the label `wbs-managed-solver=true`
  (`solver-supervisor-command.ts`, `solver-supervisor-lifecycle.ts`). The observability
  stack runs as pods under the k3s container runtime and is not in Docker's list, so the
  sweep cannot touch it. The `solver` role installs the pinned Docker package on the node
  beside k3s, as it does on a product node today, and after slice 3.8 it asserts that the
  node carries exactly one of `product` and `nonproduction`, which holds here. What the
  stack does share with solves is the node's memory and CPU (decision 2).

- **Two environments on the non-production node** (R29, R33, R34). One capability,
  `nonproduction`, places both: a label per environment would always sit on the same node and
  separate nothing that the AppProjects, namespaces, store paths and claims do not already.
  This change delivers staging there. For dev it provides the room (decision 2), three empty
  namespaces, `wbs-dev0`, `wbs-solver-dev0` and `apps-dev0` (R34's names; the old cluster's
  `website-dev`, which holds what is now staging, keeps its name there), and the
  admission-time containment of decision 3.
- **One supervisor with one pod caller on each of the two nodes that run WBS.** Production's serves
  production; the non-production node's serves staging. The role's user, directory, socket
  and uid are unchanged on both. On each node the only pod that mounts the supervisor's
  runtime directory is that node's one backend. The directory is writable by the pod's uid,
  so a backend could replace `supervisor.sock`; with one caller per node that harms no other
  environment.
- **What a second caller would need**, which is why dev's solver is not in this change. The
  supervisor's start-up sweep and its cap (`maxManagedContainers: 4`, a literal in the role's
  tasks) are node-wide, so one environment's restart ends the other's solves. And a dev
  backend that runs branch code as the same uid on the same directory could replace the
  socket and read or forge the solves of the staging tracker. Before dev may use a solver,
  the follow-up has to give it a supervisor instance of its own (user, directory, socket and
  uid) or a directory its pod cannot write. Until then no dev namespace is admitted to the
  host path.
- Staging workloads select `nonproduction` and production workloads select `product`, in the
  tree and at admission (decision 3). Rule 1.2 refuses a node that carries both, which is the
  check that the two solver instances are on different nodes.
- What the separation leaves shared: the control plane, the secret store, the registry, the
  observability stack and the private network. A staging pod cannot reach production data on
  a disk it is not on.
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
- **The WBS solver is bound to one environment today, in four places** (slice 3.8, R32).
  - _Admission._ The policy trusts the namespace `wbs-solver` by name: it admits one
    `hostPath`, `/run/puni/solver`, there, requires the `product` selector and reads one
    parameter ConfigMap. Namespaces are cluster-wide, so staging needs a namespace of its
    own, `wbs-solver-stag`, a row for it with the `nonproduction` selector, and its own
    parameter ConfigMap. The host directory is the same path on each node.
  - _The supervisor's caller list._ It is closed and holds `k8s_wbs-solver_backend`; a staging
    pod presents `k8s_wbs-solver-stag_backend` and is refused until the list names it.
  - _The supervisor's rule decoder._ `solver-supervisor-image-map.ts` accepts a rule without
    a caller image for the Compose caller `wbs-dev-src` alone. For every pod caller it
    throws, under a `Proof:` comment and a test. A staging rule without a caller image is
    therefore refused by the program as it stands.
  - _The role._ It asserts `product`; it has to accept a node that carries exactly one of
    `product` and `nonproduction`.
- **Who writes the trusted-image lists.** Two lists name a backend image by digest: the
  admission ConfigMap's `solverImages`, and the supervisor's rule for its caller. For
  production both stay outside Git, as today: nothing in the tree carries the ConfigMap's
  list, and the operator writes both before the owner syncs a new backend (the WBS owner's
  procedure, decision 9). For staging that would make every merge wait for a person, so
  staging differs in two ways, and slice 3.8 makes both possible. Its parameter ConfigMap is
  an object of the staging overlay, so the staging build renders it with the backend's
  digest into the same commit of the pins repository: the commit that deploys a backend
  also admits it. And the decoder allows a null caller image for
  `k8s_wbs-solver-stag_backend` and for no other pod caller; production's refusal and its
  proof stay. A staging backend deploy then needs no command; only a new solver image needs
  a run of `solver.yml`. What this gives up is stated plainly: on staging the supervisor
  checks the caller's name and not its image, so a commit in the pins repository is the only
  authority for which backend may reach the solver socket, and that repository is written
  with a credential that code in a gate can read (R35).
- The capability floors of a cluster apply as soon as it has one node (`decodeFleet`). The new
  cluster entry starts with the floor `platform-services: 1` and gains `observability: 1`
  with h7obs, `nonproduction: 1` and `ingress: 1` in the revision that gives h7obs those
  two capabilities (A17), and `product: 1` with h6apps.
- k3s applies the labels of a node's configuration when the node registers (the option's
  description in the k3s documentation; believed, as for taints). A capability added to or
  taken from a node that has already joined therefore needs a step of its own: slice 1.7
  reconciles a registered node's capability labels with the inventory. Every growth step of
  decision 11 depends on it, and A17 is its first use.

### 2. Budgets

Memory in MiB. Limits are used where they exist. Capacity of a 16 GiB server is assumed to be
15,602, the reading of both current nodes, and of a 24 GiB server 23,400, in the same
proportion and not read anywhere. The platform server bought on 2026-11-22 has 32 GB, and
`free -g` shows 31 GiB there; its capacity is taken as 31,204, the same proportion
(32,768 × 15,602 / 16,384), until A1's `free -m` replaces it by a commit.

**Platform node.** Reservations assumed 2,816 (system 1,024, kubelet with the k3s server and
etcd 1,536, eviction 256), kept from the 16 GiB plan.

| Workload                                                                   |      Limit | Source                                                                                                         |
| -------------------------------------------------------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------- |
| Harbor                                                                     |      2,112 | Harbor change, decision 2: planned, to be measured                                                             |
| Harbor backup                                                              |        768 | Harbor change, decision 2                                                                                      |
| OpenBao and the External Secrets Operator                                  |      1,024 | assumed: pull request #935 measures it                                                                         |
| Argo CD: controller, repo server, server, Redis, ApplicationSet controller |      1,792 | assumed (R24): 768, 384, 256 and 128, and 256 for the ApplicationSet controller (R19); A8 measures             |
| cert-manager, three pods                                                   |      1,536 | sizing document; no limits set live, 115 in use                                                                |
| CoreDNS                                                                    |        170 | live limit; not pinned, counted here as worst case                                                             |
| Node exporter, OTel collector, Velero node agent                           |      1,408 | sizing document: 1,920 per node less Traefik's 512                                                             |
| Rancher Manager: server, webhook, Fleet and the system pods it installs    |      4,096 | assumed (R54): 3,072 for the server, 1,024 for the rest, a limit only where a chart takes values; A28 measures |
| **Sum**                                                                    | **12,906** | with reservations 15,722; margin 15,482 on 31,204                                                              |

The change `host-postgres` adds its operator and, in the minimal profile, the one instance
of `platform-db` to this node and recounts the margin: with its rows at their limits the
node keeps 12,410 while the nightly dump runs, and 11,130 with an attended restore drill
beside the dump, far above the 1,024 the plan stops on. It fits without a bigger server.
On the 16 GiB first planned it would not: Rancher alone would have left 136, and with
`platform-db` the node would have been 2,936 short. Its restore drill is run there by
hand while the server carries the database, at an hour the operator picks, and weekly only
once a database server exists; nothing of it lands on another node.
With its data on volumes (R9) the root disk is at least 50 GiB, and the volumes are sized
below (minimum disk per role). On the fallback of R9, with every claim on the root disk,
the root disk is at least 182 GiB: Harbor's 40 GiB, 30 for `platform-db`, 30 for one
restore drill, 10 assumed for OpenBao's store and local etcd snapshots, 30 for the
system and images and 5 assumed for the images Rancher pulls, with a fifth kept free:
145 / 0.8. A1 compares in bytes: the root filesystem's size from `df -B1 --output=size /`
against 182 × 2³⁰ = 195,421,011,968. The size and not the space available, because the 30
GiB for the system already counts what the installed system uses. m1plat1's 200 GB is
186.3 GiB if the provider counts in decimal units, and its filesystem is smaller than its
disk, so the floor may not be met. The exit is decided now, for the owner to overrule:
the restore drill's row shrinks from 30 to 20 GiB, which makes the floor
(40 + 30 + 20 + 10 + 30 + 5) / 0.8 = 169 GiB, and the drill of `host-postgres` then
refuses to start with less than its claim free, as its free-space guard already does. The
alternative is the provider's disk upgrade, which cannot be undone.

**Production apps node.** Reservations assumed 1,664 (system 1,024, kubelet 384, eviction 256);
allocatable 13,938 on 16 GiB, the full profile's size. In the minimal profile the node is 4
vCPUs and 8 GiB, a trial the owner decided on 2026-11-22 (R2); what that leaves is below the
table.

| Workload                                                         |     Limit | Source                                        |
| ---------------------------------------------------------------- | --------: | --------------------------------------------- |
| Traefik                                                          |       512 | sizing document; no limit set live, 47 in use |
| Production: `puni-website` `site` and its log shipper            |       256 | live limits                                   |
| Production: `puni-request-app`                                   |       640 | assumed: not deployed yet                     |
| Production: `puni-user-platform` backend, gateway, MCP, frontend |     2,176 | `deploy/k8s/wbs/base`                         |
| Production: `puni-user-platform` hourly backup and daily verify  |     1,024 | `deploy/k8s/wbs/base`, both counted           |
| Node exporter, OTel collector, Velero node agent                 |     1,408 | sizing document                               |
| **Sum**                                                          | **6,016** | margin 7,922 on 16 GiB                        |

On 8 GiB the same reservations are assumed to leave about 6,000 MiB, so the limits alone
fill the node: there is no margin on paper, before any solve (up to 2,048 MiB for four).
The trial rests on use being far
below the limits, which is so today for the one workload that runs (the production website
holds 14 MiB of its 128) and unknown for the rest: the request app is not deployed and
`puni-user-platform` has never run in this cluster. It is therefore measured, not assumed.
A19 and A20 read the node's available memory at rest, during the hourly backup and during a
solve. The trigger to rescale to 8 vCPUs and 16 GiB, in place and with the disk kept: the
node's available memory under 1,024 MiB at any of those readings, or a pod killed for
memory. Both are alerts as well (slice 3.2), so the trigger does not wait for someone to
look. A19 stops on the first before WBS production is added, which is before the node
serves the app that needs most. The root disk is at least 38 GiB with a volume of 10 (R9),
and on the fallback at least 50 GiB either way (A16): the three claims' 8 GiB and 30 for the system and images, with a fifth kept free.

**Non-production workloads** (R29). In the full profile they have a server of their own,
with the same reservations and allocatable on 16 GiB; the table is that server's budget. In
the minimal profile the same rows land on the observability node, counted below.

| Workload                                                                                                     |     Limit | Source                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------: | ------------------------------------------------------- |
| Traefik                                                                                                      |       512 | sizing document                                         |
| Staging: `website-dev` (website and request app)                                                             |       768 | live limits; 71 in use                                  |
| Staging: `puni-user-platform`, the same workloads and jobs                                                   |     3,200 | `deploy/k8s/wbs/base`, as production's two rows         |
| Dev, reserved for the follow-up (R34): the website, the request app and `puni-user-platform`, no backup jobs |     2,944 | assumed: staging's rows less the backup and verify jobs |
| Node exporter, OTel collector, Velero node agent                                                             |     1,408 | sizing document                                         |
| **Sum**                                                                                                      | **8,832** | margin 5,106                                            |

Half the size does not hold it: a server of 8 GiB is assumed to offer about 6,000 MiB after
the same reservations, and staging alone with Traefik and the node agents is 5,888, which
leaves less than one solve. The server is therefore 8 vCPUs and 16 GiB (R2). The margin of
5,106 MiB is what the solver containers share: the supervisor allows each up to 512 MiB
(`maxMemoryLimitMb`) and four at once (`maxManagedContainers: 4`, a literal in the role's
tasks), so 2,048 at most. The solver's memory in use was not measured, and dev has no figures
of its own. The change `host-postgres` adds a database instance to this node and recounts the
margin.

Not counted on either node that runs WBS: the host-owned solver supervisor itself.

**Observability node.** `infra/platform/observability/base/coexistence.json` describes h3mon:
reservations 1,792, platform requests 6,182, application requests 1,664, preserved Docker
services 2,560, and 5,632 more during a migration overlap. A new node has neither the Docker
services nor an overlap, so its requests are 9,638 of 15,602, or 10,150 with MLflow (R15).
Those are requests. The sizing document's limits for the same node sum to 17,088 and it calls
its figures unmeasured. A14 measures on the node and the owner then keeps or changes its size.

**The observability node with non-production on it** (minimal profile, R45). This is the
least certain node of the plan. On 16 GiB the same rows were 2,356 MiB short with the
database and four solves, which an earlier draft showed the owner; he chose a larger server
(R2). The provider has no 12 vCPU and 24 GiB class (R50), so the next one is assumed, 16
vCPUs and 32 GiB. On it:

| What                                                           |        MiB | Kind                            |
| -------------------------------------------------------------- | ---------: | ------------------------------- |
| Allocatable: 31,204 less the record's reservations of 1,792    |     29,412 | assumed capacity                |
| Observability and MLflow: 10,150 less those reservations       |      8,358 | declared requests, not measured |
| Traefik                                                        |        512 | sizing document                 |
| Staging: the website, the request app and `puni-user-platform` |      3,968 | limits, from the table above    |
| `nonproduction-db` (change `host-postgres`)                    |      1,280 | assumed limit                   |
| Four solves at once                                            |      2,048 | the supervisor's cap            |
| **Left after those**                                           | **13,246** |                                 |
| Dev, reserved for the follow-up                                |      2,944 | assumed                         |
| **Left with dev as well**                                      | **10,302** |                                 |

So it fits on paper, with requests for the stack and limits for the rest, and it would fit
if the stack used its limits: the sizing document's limits for that node sum to 17,088,
which with staging, the database and four solves leaves 4,516. A14's measurement is
therefore still the check, and it is expected to pass. With `O` the sum of the 24-hour
peak working sets of the observability and MLflow pods and the node agents, staging joins
h7obs only if

`O × 1.25 + 512 + 3,968 + 1,280 + 2,048 + 1,024 ≤ allocatable`

which on 29,412 MiB means `O` of at most 16,464 MiB. The 1,024 is the same floor A14 stops
on. A14 takes `O` after MLflow has been restored (A15) and with the stack ingesting from
the platform node and from itself; what it cannot yet see is the telemetry of the apps,
which arrive in stage 4, so the reading is repeated a day after A18 and again after A20,
against the same sum and the same stop. If the sum does not hold, A17 does not give h7obs
the two capabilities, or staging leaves again, and the owner chooses between the two exits
decision 11 lists: the next class for h7obs, or the non-production server. Dev is not in
the sum: its follow-up measures again before it adds a workload. What protects the stack
once staging is there: every staging and dev namespace has a ResourceQuota and limits
(slice 2.10), solves are capped at 2,048 MiB by the supervisor, and the observability and
MLflow pods carry a PriorityClass above the default from their first start (slice 2.8),
which no pod in a non-production namespace may name (slice 2.10), so that under memory
pressure the kubelet prefers a staging pod among the pods that use more than they request
(Kubernetes documents that ranking, and it was not exercised here). What shares the node
with staging beyond memory is under Risks: production's logs and metrics, and the object
storage keys the stack and MLflow carry.

Its disk is decided before the server is created. The declared claims are 114 GiB:
Elasticsearch 100, Prometheus 10, two signal stores of 2 each. With 30 GiB assumed for the
system and images and a fifth of the whole disk kept free, the root disk needs
(114 + 30) / 0.8 = 180 GiB on the fallback of R9; with the claims on a volume, the volume
needs 114 / 0.8 = 143 GiB and the root disk 38. The kubelet evicts at 10% free on the node filesystem and 15% on
the image filesystem (both k3s templates), so a fifth leaves room above both. With
non-production on the node the claims grow by 42 GiB: the three staging claims at 19,
with the tracker's at 16 for the schema hook's snapshots (decision 9), 13 reserved for dev
and 10 for `nonproduction-db`. The fallback floor is then (114 + 42 + 30) / 0.8 = 233 GiB,
and the volume (114 + 42) / 0.8 = 195 GiB. A12 reads the new server's disk and volume and
stops on a smaller one, and A14 measures growth.

**CI server.** It carries a cluster of its own, and its budget is decision 5 of the change
`run-ci-on-argo-workflows`. A gate is measured at 6 cores and a 95th percentile of 10.01 GiB,
under a bound of 13 GiB. With that cluster's own pods beside it, one gate does not fit a
server of 16 GiB on paper, the class the owner named for the minimal profile (R2), so the
server is 16 vCPUs and 32 GiB, the next class the provider has (R50). One gate runs at a
time, at about 5 h 20 min by the calibrations of h4claw, and a build waits behind a gate
until the CI change's measurement shows that both fit (its decision 5): on 32 GiB they fit
by their limits on paper, on figures that are mostly assumed.

**Private access.** The Tailscale daemon on each host, and the operator with its proxies in
each cluster, are small beside these rows and are not budgeted separately; they are
assumed under 256 MiB per cluster, and A8 reads them with Argo CD.

**Storage** (R9, decided by the owner on 2026-11-24: "i want cloud storage when possible -
so not on node disk").

- _S3 where an app supports it._ etcd snapshots, every app's backups, OpenBao's snapshots,
  Elasticsearch's snapshots, Velero, the database backups of `host-postgres`, Harbor's
  registry storage where Harbor supports it, and MLflow's artifact root, each in a bucket
  or prefix of its own with a key of its own (R6). Harbor's own change decides how much of
  its 40 GiB moves; until it does, they are counted on a volume below. MLflow crosses as
  slice 3.6 and A15 read its layout, and its artifact root moves to S3 by a later revision
  of the `mlflow` unit; it held no file when read.
- _An attached volume for every other persistent claim._ Each node that holds claims has a
  provider block volume, created by the owner in the provider console beside its server
  (R4) and attached to that server alone. Slice 1.11 formats it once, mounts it by its
  filesystem UUID and points k3s's local-path storage there, so every claim of the
  `Retain` class lands on the volume and not on the root disk; a store that needs a bound
  of its own (`platform-db`, change `host-postgres`) gets a volume of its own. A volume is
  attached to one server and is a local filesystem there, so SQLite's locking is the local
  filesystem's; what the earlier wording of R9 ruled out was a network filesystem.
- _What stays on the root disk._ The system, images and container layers, scratch, and
  etcd's own data, whose write latency the control plane depends on: it does not move
  unless A29's reading shows the volume fit for it. CI keeps everything on its root disk:
  gate trees, caches and build layers are refilled by a rebuild and are not data kept.
- _Two unknowns, checked by A29 before a store lands on a volume._ Whether a volume can be
  detached and re-attached to a replacement server, and its throughput. If re-attaching
  works, a store whose node is replaced moves with its volume instead of by a restore; the
  backups under guard 3 stay either way. If a check fails, the claims go on the root disk,
  each role's fallback minimum below applies, and the owner hears it in A29's receipt.
- Claims keep `Retain`, `Prune=false` and `Delete=false` (decision 3) on either.

**Disk elsewhere.** Every row but CI's lands on the node's volume (R9), or on the root
disk on the fallback.

| Node            | What lands there                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots; `platform-db` and a drill, at first                                                                   |
| Production apps | Production SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB                                                                                                            |
| Non-production  | The same three claims, with staging's `wbs-data` at 16 GiB: the dev database is 2.2 GB today and the schema hook keeps two snapshots beside it (decision 9); on h7obs in the minimal profile |
| CI              | gate trees, caches, 11 GiB of temporary space per gate, release build layers                                                                                                                 |

**Minimum disk per role.** A requirement of the role, not of a provider's product: the step
that creates a server reads `df -h /` and each attached volume's size and stops on less,
before anything is installed. A type that has the memory and not the disk fails there,
whoever sells it. With the data on volumes (R9) the root disk holds 30 GiB for the system
and images and a fifth kept free, 38 GiB; the platform server's root adds 5 GiB for the
images Rancher pulls and 5 for etcd and its local snapshots, 50 GiB. Each volume holds its
node's claims with a fifth kept free. The fallback column is the root disk a role needs
when A29 rules volumes out, as counted above.

| Role, minimal profile                    | Minimum root disk |                       Minimum volume | Fallback root disk | How it is counted                                                                                                           |
| ---------------------------------------- | ----------------: | -----------------------------------: | -----------------: | --------------------------------------------------------------------------------------------------------------------------- |
| Platform, with `platform-db`             |            50 GiB | 94 GiB, and 30 GiB for `platform-db` |            182 GiB | Harbor 40, OpenBao 5 and a drill 30 on the volume, with a fifth free; `platform-db`'s bounded 30 on its own; fallback above |
| Production apps                          |            38 GiB |                               10 GiB |             50 GiB | the three claims' 8 GiB, with a fifth free                                                                                  |
| Observability with non-production        |            38 GiB |                              195 GiB |            233 GiB | the 114 GiB of claims and the 42 of non-production, with a fifth free; 143 and 180 without non-production                   |
| CI                                       |           150 GiB |                                 none |            150 GiB | assumed: today's gate hosts have that and run near full; the CI change's decision 5 counts it                               |
| Non-production, on a server of its own   |            38 GiB |                               53 GiB |             90 GiB | the 42 GiB of claims, with a fifth free                                                                                     |
| Database server (change `host-postgres`) |            38 GiB |                               93 GiB |            140 GiB | that change's decision 2: 30 GiB and a drill's 30 under its 65% ceiling                                                     |
| Operator host (change `add-agent-hosts`) |           100 GiB |                                 none |            100 GiB | not a k3s node, outside R9; that change: OpenClaw's state is about 21 GiB today, and the sessions' work filled 460 GB       |

The readings of about 150 GiB quoted in this plan are of the existing servers, which were
created at a smaller type and later given more memory without a larger disk. A new server
gets the disk its type includes, read against the listing it comes from; the platform
server was bought on 2026-11-22 with 200 GB at 8 vCPUs and 32 GB, which meets its minimum
with volumes and may miss the fallback (A1). Whether a volume can be grown in place was not
read and is not assumed. A later rescale of
memory and CPU keeps the disk the server has, so it never lowers a server under its
minimum, and it never raises the disk either: a role whose minimum grows needs the
provider's disk upgrade, which cannot be undone, or a new server.

### 3. Delivery by Argo CD

Checked against Argo CD v3.6.2, the current release; [verify.md](verify.md#argo-cd-behaviour)
lists what was read and what was not.

**Tree.** Everything the new cluster reconciles from this repository is under `infra/argocd`:

| Path                                        | Holds                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `infra/argocd/install`                      | the vendored install manifest and its kustomize patches                        |
| `infra/argocd/clusters/platform-production` | three AppProjects and one ApplicationSet per project; the root's source path   |
| `infra/argocd/apps/<project>`               | the Application files the ApplicationSets read, outside the root's source path |
| `infra/argocd/units/<unit>`                 | a kustomize directory or a wrapper chart per unit                              |
| `infra/argocd/root`                         | the root Application and its AppProject, applied by the playbook only          |

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
`infra/versions/toolchain.json` (`manifests.argocdInstall`). The kustomization removes Dex and
the notifications controller, keeps the ApplicationSet controller (R19) with its policy set to
`create-update` and per-ApplicationSet overrides off, pins every image by digest, sets the
selector, toleration and limits, and carries the settings of this decision. From then on
an Application named `argocd` holds the same path with `ServerSideApply=true`, which is the
self-management the declarative setup guide describes, without its remote base. The bootstrap
playbook writes the local account's password hash into `argocd-secret`, where Argo CD also
keeps its generated keys. With a server-side apply Argo CD owns only the fields it sends, and
the vendored manifest sends none of that Secret's data. Rehearsal 2.7 asserts that the hash and
the keys survive a sync of `argocd`. If they do not, the kustomization drops `argocd-secret`
from the managed set and the playbook alone creates it.

**Environments, projects and who syncs.**

| Project    | Holds                                        | Source                                                                                                                                                                                   | Sync                                            |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `root`     | the root Application alone                   | this repository, the root's one path                                                                                                                                                     | automatic: self-heal, no prune                  |
| `platform` | every platform unit, the public-name issuers | this repository; one path of the fleet repository for the issuers                                                                                                                        | on command, by the operator                     |
| `stag`     | the staging copy of the three apps           | the staging pins repository, one rendered directory per app (decision 9); the fleet repository's staging overlays for the website and the request app until their owner adopts that path | automatic: prune, self-heal, retry with backoff |
| `prod`     | the three production apps                    | the fleet repository and the WBS deploy repository, production overlays                                                                                                                  | on command, by the owner                        |

- The root Application is the one automated Application outside staging. It belongs to a
  project of its own, `root`, whose only destination is the `argocd` namespace and whose only
  admitted kinds are ApplicationSet and AppProject. Its source path may hold nothing else, and
  the `delivery` check refuses any other kind there (rule 2.4(l)). The root and its project
  are applied by the bootstrap playbook from `infra/argocd/root`, which is not in the root's
  own source path, so no Application owns them. The other three AppProjects and the
  ApplicationSets lie in the source path and the root manages them.
- **Application files and ApplicationSets** (R19, decided by the owner on 2026-11-24). Each
  project's Applications are generated by one ApplicationSet of that project, whose Git
  files generator reads this repository at `main`. An Application file is that generator's
  element: one file per unit, environment and tenant under `infra/argocd/apps/<project>`,
  which the root does not apply, holding what the template fills in (the unit,
  tenant, source, destination, `puni.dev/sync-order` and `puni.dev/needs`). The template,
  not the file, sets the sync policy, so no production or platform file can switch
  automation on. Every rule below that reads an Application file reads both the file and
  the Application its ApplicationSet renders from it; the `delivery` check expands the
  generators itself from the tree. Three settings keep the behaviour this decision
  describes: the controller's policy `create-update`, so a removed file leaves its
  Application in place; `preserveResourcesOnDeletion: true` on every ApplicationSet; and no
  generator but the Git files generator on this repository, no `templatePatch` and no
  progressive sync (rule 2.4(l)). The controller also restores a generated Application
  edited in the cluster, as the root's self-heal did for plain files. These field and flag
  names are from memory: slice 2.1 reads them in Argo CD v3.6.2 and rehearsal 2.7/A3 shows
  the removal and the restore.
- **What a merge does to an Application file.** Its ApplicationSet renders it at once, with
  the policy `create-update`:
  - _Added._ The Application object appears. A production or platform one is not synced.
  - _Edited._ The object changes at once; its workloads do not. A changed source, values or
    destination only changes what the next sync applies. The fields that could make the edit
    deploy by itself are refused by the `delivery` check inside the required `gate`: automated
    sync on a production or platform Application (rule (b)), a project other than the one the
    order table names (rule (c)), a revision other than `main` (rule (a)), and an `operation`
    block, which starts a sync when the object is applied (rule (l)).
  - _Deleted._ Nothing happens in the cluster: the ApplicationSet does not delete under
    `create-update`, the root does not prune, and no Application carries the resources
    finalizer. `tool-fleet:health` lists an Application that has no
    file. Removing a unit is the procedure below.
- So "production deploys only on command" covers every object in a production namespace and
  every object of a platform unit. It does not cover the Application and AppProject objects
  themselves, which follow `main`, and it rests on those four rules being in a required check.
  The ApplicationSet controller reverts an Application edited in the cluster, which keeps
  automation from being switched on for a production unit outside Git.
- `stag` and `prod` each have as destinations an allow-list of their own
  namespaces, written out by name. They admit no cluster-scoped kind and no Namespace object,
  and each carries a `namespaceResourceWhitelist` of exactly the kinds its overlays render.
  Rule 2.4(a) compares each project file with the list the `namespaces` unit declares for it,
  so a merge cannot widen staging to a platform namespace.
- `platform` is the project that admits cluster-scoped kinds, and three of its units write
  into app namespaces by design: `namespaces` (the Namespace objects), `policy` (admission
  bindings, quotas and the default-deny policies) and `secret-sync` (one SecretStore per
  reading namespace). Rule 2.4(a) names those three and refuses any other platform
  Application whose objects land in an app namespace.
- Every namespace is an object of the `namespaces` unit in this repository and carries the
  label `puni.dev/environment`: `prod`, `stag`, `dev0` or `platform`. These are the owner's
  environment names of 2026-11-24, four characters each; a later dev environment is `dev1`,
  `dev2` and on (R34). The projects and each environment's namespaces carry them, as in
  `wbs-stag`, `wbs-solver-stag` and `wbs-dev0`. Names already in merged code, such as the
  WBS overlay `deploy/k8s/wbs/overlays/staging`, are renamed by slice 1.10 where the new
  tree reads them; the old cluster's live namespaces, `website-dev` among them, keep theirs
  until it is retired.
- An AppProject is applied by the root as soon as it is merged, so its file is held as
  tightly as an Application's: no `roles`, no `syncWindows`, and no file in the root's path
  may define an object named like the root or its project (rule 2.4(l)). The public-name
  `ClusterIssuer` objects live in the fleet repository; their Application belongs to
  `platform`, and the `delivery` check holds a fleet-sourced Application in `platform` to that
  one path.
- **Staging follows `main`** (R20). A merge to `main` that touches an app's paths starts the
  staging build on the CI cluster. The job builds the images, pushes them to Harbor, renders
  the app's staging overlay at that commit with the new digests, and commits the result to
  the app's directory in the staging pins repository. The staging Application's source is
  that directory, plain manifests at that repository's `main`: it applies a new commit
  within the reconciliation interval and reverts a manual edit in the cluster. So staging
  follows `main` for code and for manifests with no command, once slice 3.7 and A23 are in
  place (R31, decision 9). Until then nothing replaces the poller that makes the tracker
  follow `main` today, so A18's WBS part waits for A23's receipt or the owner's dated
  waiver. The `delivery` check reads the staging overlay in its source repository, which
  is what the build renders. What the pins repository holds is written with the build's
  credential and is bounded by the `stag` project and by admission, not by `gate`
  (R35).
- **Containment that does not depend on what a ref holds** (slice 2.10). The rules of slice
  2.4 run in `gate` and read `main`. That is enough for staging and production, which sync
  nothing else. A rule in `gate` cannot bind an object that is applied from another ref or by
  hand. So the `policy` unit, which only the operator syncs, carries what must hold whatever
  is applied, keyed on the namespace's environment label:
  - _Placement._ An admission policy denies a pod in a `stag` or `dev0` namespace that
    does not select `nonproduction`, and one in a `prod` namespace that does not
    select `product`. Nothing is exempt, so a pod that a controller makes there has to
    carry the selector too (below).
  - _Names._ An admission policy denies an Ingress, a Traefik `IngressRoute` or
    `IngressRouteTCP`, and a Certificate whose host is not in the list the `policy` unit
    holds for that namespace, and one with no host, a wildcard host or a host pattern. The
    lists are one ConfigMap in a platform namespace, which the policy reads as its
    parameter, so nothing in an app namespace can change its own list. Rule 2.4(m) reads
    the same list in `gate`, for the same kinds.
  - _Quota._ Every non-production namespace has a ResourceQuota from the `policy` unit.
  - _Network._ Every non-production namespace has a default-deny NetworkPolicy from the
    `policy` unit, and every app namespace an allow for Traefik to reach pods that carry
    cert-manager's HTTP-01 solver label. Traefik runs on the host network
    (`infra/platform/networking/traefik.yaml`), so no namespace or pod selector matches its
    traffic; the allow is an `ipBlock`, as `otlp-ingress.yaml` already uses for senders on
    the private network. Which source address a pod sees for traffic from its own node's
    host network, under flannel and the policy controller k3s embeds, was not established:
    slice 2.10's k3d case sends from a host-network pod on the same node and on another, and
    the allow names the addresses that case shows. NetworkPolicy is additive, so another
    object in the namespace can still allow more. For the website and the request app that
    object comes from the fleet repository's `main`, and rule 2.4(k) reads its peers there.
    For WBS staging it comes from the pins repository, which `gate` never reads: its peers
    are unbounded from pins. What bounds them is that the render step refuses a
    NetworkPolicy the staging overlay at the built commit does not hold, that the overlay is
    read by rule 2.4(k) on `main`, and R35 for a commit made with the App's key outside a
    build. For anything applied from another ref the plan relies on the project's kind
    list: a project whose whitelist leaves NetworkPolicy out cannot widen the policy.
    Whether an admission policy can bound a NetworkPolicy's peers reliably was not
    established and is not claimed.
  - _Pod security._ Every staging and dev namespace carries
    `pod-security.kubernetes.io/enforce: restricted` with `enforce-version: latest`, as the
    app namespaces of `infra/platform/policy/namespaces.yaml` do, so a privileged pod or one
    with a `hostPath` is refused whatever commit it came from. The one exception is each
    environment's solver namespace, which mounts the supervisor's directory and, like
    `wbs-solver` today, carries `warn` and `audit` only; there the trusted-hostpath policy
    of slice 3.8 admits that one path and nothing else. The dev solver namespace enforces
    `restricted` until the follow-up gives dev a solver.
  - _Kinds._ The `namespaceResourceWhitelist` of a project, which Argo CD applies at sync
    time to any revision.
  - _Pods a controller makes._ cert-manager creates an HTTP-01 solver pod in the
    Certificate's namespace, with no selector unless the issuer gives it one. Every ACME
    issuer therefore carries one solver per environment, chosen by that environment's
    host names (`selector.dnsNames`, as the staging issuer does today), whose
    `podTemplate.spec.nodeSelector` names the environment's capability. The field is in
    the `ClusterIssuer` CRD of the locked cert-manager chart, v1.21.2. This holds for the
    staging ACME issuer of the `issuers` unit and for the fleet repository's public-name
    issuers alike; without it no public certificate becomes Ready. A
    hook Job is rendered from the tree and falls under rule 2.4(f). The External Secrets
    Operator, ECK and Velero make no pod in an app namespace.

  The label is guarded too: the namespace-label policy of the `policy` unit reserves
  `puni.dev/environment`, and no app project admits a Namespace. This is the base the dev
  follow-up starts from (R34, decision 9).

- **Production is synced on command.** A production Application tracks `main` with no automated
  sync. After a merge it shows OutOfSync with its difference in the interface, and it changes
  when the owner presses Sync there or runs `argocd app sync`. The local account holds
  `applications, sync` on `prod/*` and nothing else beyond `role:readonly`. It does not
  hold `override`, and `application.sync.requireOverridePrivilegeForRevisionSync` is set, so a
  sync deploys the revision the Application names and no other. It does not hold `rollback`
  either, and `server.rbac.rollback.enforce.enable` is set in `argocd-cm`: without that key
  Argo CD authorises a rollback with the `sync` permission, and a rollback deploys an earlier
  revision.
- **Platform units are synced on command by the operator**, through a sync playbook
  (`playbooks/argocd-sync.yml`, slice 2.5) that runs the locked `argocd` CLI in core mode on
  the server with the node's credential. No Argo CD account can sync a platform unit. If core
  mode cannot sync without the API server's account (rehearsal 2.7), the owner decides: a
  second account limited to `platform` and used by the playbook only would amend R23.
- **Drift on a unit that is not automated is reported, not repaired.** OutOfSync on a
  production or platform unit means either that `main` is ahead or that the cluster was
  changed; the difference view tells which. `tool-fleet:health` lists such units with their
  age, and once the Prometheus stack runs an alert fires when one has been OutOfSync for 24
  hours (assumed), which calls for either a deployment or a look.
- Break-glass: `kubectl` on the platform node. An edit to a production or platform object
  holds, because nothing self-heals it; the runbook requires the same change on `main` before
  the next sync, which would otherwise undo it. An edit to an Application object needs the
  ApplicationSet controller scaled to zero first, and an edit to an ApplicationSet the
  root's automation disabled. The root is owned by no Application, so that setting stays
  until the playbook runs again; the controller's replica count is restored by the next
  sync of `argocd`.

**Order.** With children that are synced on command, sync waves on the root would order nothing
useful: a wave waits for health, and a unit that has never been synced has none. The health
customization for `argoproj.io/Application` is therefore not restored, and no Application
carries a sync-wave annotation. The order of the first sync is data instead: every Application
file carries `puni.dev/sync-order`, the `delivery` check holds it to the table below, and the
sync playbook syncs the units it is given in that order, waiting for each to be Synced and
Healthy. Every Application file also carries `puni.dev/needs`, the units of the Needs column
below. The playbook refuses a unit while one of its needs is not Synced and Healthy, and only
then: a unit that is unhealthy or merged-but-unsynced holds back the units that need it and no
others. An unhealthy Harbor holds back the WBS units and not `public-issuers`; a sealed store
holds back `secret-sync` and what needs it.

Order and needs are derived from what each unit reads and from the Flux `dependsOn` graph,
not from the Flux stage names. A need is always of a lower order.

| Order | Unit                         | Project    | Needs                                                                                                                                                                                                  | First synced                         |
| ----: | ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
|     0 | `argocd`                     | platform   | none                                                                                                                                                                                                   | A4                                   |
|     1 | `namespaces`                 | platform   | none; the playbook applied them already                                                                                                                                                                | A4                                   |
|     2 | `policy`, `storage`          | platform   | `namespaces`                                                                                                                                                                                           | A4                                   |
|     2 | `tailscale-operator`         | platform   | `namespaces`; its OAuth client Secret from the playbook (decision 12)                                                                                                                                  |
|     3 | `cert-manager`               | platform   | `namespaces`; from A7, the server CA Secret from the playbook, for the OpenBao Issuer and Certificate (change `openbao-secret-store`)                                                                  | A4                                   |
|     4 | `openbao`                    | platform   | `storage`; `cert-manager`, for its server certificate; the seal key from the playbook                                                                                                                  | A7                                   |
|     5 | `external-secrets`           | platform   | `policy`                                                                                                                                                                                               | A7                                   |
|     6 | `secret-sync`                | platform   | `openbao`, `external-secrets`                                                                                                                                                                          | A7                                   |
|     7 | `issuers`                    | platform   | `secret-sync`, for `registry-ca`; `cert-manager`                                                                                                                                                       | A7                                   |
|     7 | `rancher`                    | platform   | `namespaces`, for the annotated `cattle-` namespaces; `policy`, for its PriorityClass and the shell denial; `secret-sync`, for `bootstrap-secret`; `tailscale-operator`, for its Ingress (decision 14) | A27                                  |
|     8 | `otel-certificates`          | platform   | `secret-sync`, for `otel-server-ca`; `cert-manager`                                                                                                                                                    | A14                                  |
|     8 | `eck-operator`               | platform   | `policy`                                                                                                                                                                                               | A14                                  |
|     8 | `prometheus-stack`           | platform   | `secret-sync`; `storage`                                                                                                                                                                               | A14                                  |
|     9 | `elasticsearch`              | platform   | `eck-operator`; `storage`; `secret-sync`                                                                                                                                                               | A14                                  |
|    10 | `kibana`, `elastic-settings` | platform   | `elasticsearch` and the Secrets ECK makes for it                                                                                                                                                       | A14                                  |
|    10 | `otel-collector`             | platform   | `elasticsearch`; `otel-certificates`                                                                                                                                                                   | A14                                  |
|    10 | `signals`                    | platform   | `elasticsearch`; `otel-certificates`; `prometheus-stack`                                                                                                                                               | A14                                  |
|    11 | `alerts`, `probes`           | platform   | `prometheus-stack`                                                                                                                                                                                     | A14                                  |
|    12 | `velero`                     | platform   | `alerts`, as the Flux `backup` stage does; `secret-sync`                                                                                                                                               | A14                                  |
|    12 | `elastic-snapshots`          | platform   | `alerts`; `elasticsearch`                                                                                                                                                                              | A14                                  |
|    12 | `mlflow`                     | platform   | `alerts`; `secret-sync`; `storage`                                                                                                                                                                     | A15                                  |
|    12 | `sqlite-custody`             | platform   | `alerts`; `secret-sync`                                                                                                                                                                                | A18                                  |
|    13 | `traefik`                    | platform   | `policy`; a node that carries `ingress`                                                                                                                                                                | A17                                  |
|    14 | `harbor`                     | platform   | `secret-sync`; `storage`; `issuers`                                                                                                                                                                    | Harbor's change, before any WBS unit |
|    15 | `public-issuers`             | platform   | `traefik`; `cert-manager`                                                                                                                                                                              | A18                                  |
|    16 | `website-stag`               | staging    | `policy`; `public-issuers`; `secret-sync`                                                                                                                                                              | A18                                  |
|    16 | `wbs-stag`                   | staging    | `policy`; `public-issuers`; `secret-sync`; `harbor`                                                                                                                                                    | A18                                  |
|    17 | `website`                    | production | `policy`; `public-issuers`; `secret-sync`                                                                                                                                                              | A19                                  |
|    17 | `wbs`                        | production | `policy`; `public-issuers`; `secret-sync`; `harbor`                                                                                                                                                    | A20                                  |

- **OpenBao is first among the services** (R22). The four units before it are Argo CD, the
  namespaces, policy and storage it runs under, and cert-manager, which is there only because
  pull request #935 issues OpenBao's server certificate from a cert-manager CA issuer. Nothing
  else precedes it.
- `secret-sync` holds every SecretStore and every platform ExternalSecret; it grows with each
  stage. Pull request #935 allows stores per namespace only, so `secret-sync` carries one
  SecretStore for each namespace that reads a Secret, the app namespaces included, each bound
  to that namespace's role in the store. An app's own ExternalSecrets are in its overlay. The plan relies on Argo CD's bundled health check for
  ExternalSecret, so the unit is Healthy only when every value has arrived.
- `issuers` holds the registry CA issuer and the staging ACME issuer, with its solver per
  environment. The `otel-server` Issuer
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
- `rancher` follows OpenBao, the External Secrets Operator and cert-manager, though it uses
  no certificate of cert-manager's: its one Secret is an ExternalSecret of `secret-sync`, and
  its interface's certificate comes from the tailnet. No unit lists it as a need, and yet
  once it runs every unit that writes a Namespace depends on it: its webhook refuses
  Namespace creates and updates while it is down (failure policy `Fail`). So a sync of
  `namespaces`, or of any unit that creates a namespace, needs Rancher's webhook Ready, and
  the runbook's way out when it is not is in decision 14.
- `harbor` precedes the WBS units because WBS pulls its images from Harbor (R28). The website
  and the request app do not (R11), so a missing Harbor holds back WBS only.
- An Application file is merged in the revision that adds its node or its dependency.
- The `alerts` unit carries only rules whose subject exists at that revision. The copied rule
  set has a group that watches the WBS backup CronJob and a rule that watches a workers
  cluster. The WBS group lands with each WBS Application; the workers rule is not copied
  (R27). The stale-backup rule of each app lands with that app, not with `sqlite-custody`.

**What the order guarantees.** It orders the first sync of each unit. After that the playbook
still refuses a platform unit whose needs are not Synced and Healthy, and nothing more: a
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
  2.4(j) looks for `crds/` at any depth of an archive, and rehearsal 2.7 reads all three
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

| Flux semantic and where it is used                                                                                                                    | In the new tree                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssa: IfNotPresent` on the ConfigMap `wbs-solver/puni-trusted-workload`: created once, then the release coordinator owns `solverImages`               | Production: `ignoreDifferences` on `/data/solverImages` with `RespectIgnoreDifferences=true`; the option acts only on an existing object. Staging: the ConfigMap is an object of the staging overlay and carries its list (decision 1) |
| `force: enabled` on the Jobs `elastic-snapshots`, `elastic-settings` and `kibana-objects`: deleted and recreated when their spec changes              | The annotation `Force=true,Replace=true` on those three Jobs. `Force` alone is ignored under server-side apply                                                                                                                         |
| `dependsOn` between `HelmRelease` objects: Elasticsearch after the ECK operator; Kibana and the OTel collector after Elasticsearch                    | Orders 8 to 10 of the first sync                                                                                                                                                                                                       |
| `dependsOn`, `wait` and `timeout` on the Flux units                                                                                                   | The sync order, with each unit Healthy before the next; retry with backoff on staging                                                                                                                                                  |
| The `target` unit's health check on the ConfigMap `kube-system/puni-cluster-platform-production`: a wrong cluster reconciles nothing                  | The bootstrap playbook refuses a cluster whose identity ConfigMap differs. Every Application targets the cluster it runs in                                                                                                            |
| `kubeConfig.secretRef` on every unit                                                                                                                  | Not needed: no Application names a remote cluster                                                                                                                                                                                      |
| `decryption: sops` on every unit                                                                                                                      | None, by decision 5                                                                                                                                                                                                                    |
| `prune: true`                                                                                                                                         | Prune on every sync, automatic on staging only; `Prune=false` on data                                                                                                                                                                  |
| `postRenderers` on the Velero `HelmRelease`: size limits on two `emptyDir` volumes                                                                    | A kustomize unit that inflates the chart and patches it (`kustomize.buildOptions: --enable-helm`). Fallback: a committed render                                                                                                        |
| A kustomize patch on a `HelmRelease`'s `spec.values` (the cluster name in the Prometheus stack)                                                       | The value moves into the wrapper chart's values file                                                                                                                                                                                   |
| Helm release history, rollback and `helm test`                                                                                                        | None: the chart is rendered. Going back is a revert on `main` and a sync                                                                                                                                                               |
| Variable substitution after the build                                                                                                                 | Not used: the only `${…}` in these manifests is shell                                                                                                                                                                                  |
| `healthCheckExprs` on the `certificates` unit: a Certificate is failed when `Ready` is False and current only when `Ready` is True for its generation | Argo CD's bundled health check for `cert-manager.io/Certificate`. Rehearsal 2.7/A14 watches a failing Certificate keep its unit from Healthy                                                                                           |
| Chart `crds/` directories (Traefik, Velero, the Prometheus stack's subchart), which a `HelmRelease` installs by its CRD policy                        | Included by a Helm source; `includeCRDs: true` in the Velero kustomize unit                                                                                                                                                            |
| The Helm release name. Flux uses the `HelmRelease` name, and `otlp-ingress.yaml` selects pods by `app.kubernetes.io/instance: otel-collector`         | Every wrapper sets `releaseName` to the old release's name, and the equality test compares it                                                                                                                                          |

Rehearsal 2.7 observes the first two rows, the Velero row and the last three. For the Velero
fallback, the `delivery` check proves the committed render equal to the chart's output.

**Removing a unit takes two merges and one command.** No Application carries the resources
finalizer, the ApplicationSets do not delete and the root does not prune, so removing an
Application file changes nothing in the cluster. First the unit's source is reduced to one marker ConfigMap and the unit is synced with
prune, which removes the workloads and leaves the data. The marker is what makes this work:
prune refuses a source that renders nothing unless `allowEmpty` is set. Then the Application
file is removed. Last, the sync playbook's removal mode deletes the Application object; it
refuses one that still has a file or whose live source is more than the marker. The removal
mode takes a unit of any project, since nothing else can delete a staging or production
Application; syncing stays limited to platform units. A staging unit reduced to its marker is
pruned by its own automation. An object that carries `Prune=false` stays through all of
this, as data must.

**What guards `main`.** The bootstrapping guide's warning applies: whoever can change the
root's source is an administrator of the cluster. That source is a path on `main`, so the
boundary is the ruleset that task 0.6 sets and reads back: a pull request and the required
checks, no direct, forced or deleting push. Read on 2026-11-21, `main` here requires a pull
request with zero approvals and two status checks, `gate` and `pixels`, without the up-to-date
requirement; `tool-fleet:check` runs only in a workflow that is not required. The `delivery`
rules therefore also run as a test over the real tree inside `gate` (slice 2.4). The fleet
repository's `main` had no rule; task 0.6 gives it one before A2 writes there, and gives the
WBS deploy repository one before its first Application is merged. The staging pins
repository is different by design: the build's App writes its `main` without a pull request,
and a forced or deleting push is refused for everyone (decision 9). With R20 a merge
reaches staging at once and production only through a sync, so the ruleset is the whole guard
for staging and half of it for the rest.

The server has a ClusterIP Service, no Ingress and a NetworkPolicy; it is reached over
the private access network, by a name the Tailscale operator gives it (decision 12). `policy.default` is `role:readonly`, and
the built-in `admin` account is disabled (R23).

**Data survives delivery mistakes.** Every PersistentVolumeClaim in the tree, and every
namespace that holds one, carries `Prune=false` and `Delete=false`, so removing a manifest
never deletes it. Claims that an operator creates from a custom resource are not in the tree.
The Elasticsearch, Prometheus and Alertmanager resources carry the same two options, and Elasticsearch keeps `volumeClaimDeletePolicy: DeleteOnScaledownOnly`, which the copied manifest
already sets. A custom resource deleted by hand is outside what delivery can protect. No
Application carries the resources finalizer, so deleting an Application leaves its resources.

### 4. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md). Slices 1.1 to 1.3, 1.10, 1.11, 2.1 to 2.6, 2.9 and
the first receipt of 2.7 are needed before the platform stage can start, 1.9 before A26 and
2.11 before A27; 1.4, 1.5, 2.8, 3.2
and 3.6 before stage 3; 1.7, 2.10, 3.1, 3.5 and 3.7 to 3.9 before stage 4. One missing piece has no row
in the table below: nothing reconciles the capability labels of a node that has already
joined, which the minimal profile's A17 and every growth step need; slice 1.7 adds it.
Slice 3.7 is due before A23, which A18's WBS part waits for.

| Missing                                                                                                                                                                                                                                                                | Slice                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| No capability for platform services                                                                                                                                                                                                                                    | 1.1                   |
| The capabilities merged in #988 carry short names, which the naming rule of decision 1 scopes and versions                                                                                                                                                             | 1.10                  |
| Nothing attaches, formats or mounts a provider volume, or points local-path storage at it (R9)                                                                                                                                                                         | 1.11                  |
| The bastion exists by hand: no inventory names it, nothing renders its `PermitOpen`, and the server firewall does not know its address                                                                                                                                 | 1.9                   |
| Nothing delivers a cluster-management interface; nothing refuses a Fleet object or compares the k3s pin with the versions the Rancher pin certifies                                                                                                                    | 2.11                  |
| Nothing refuses a server with `product` or `ingress`, a gate host that is a k3s node, or an untainted server                                                                                                                                                           | 1.2                   |
| `validate-enrollment.yml` replaces CoreDNS's tolerations, and has never run on a cluster of one tainted node                                                                                                                                                           | 1.2                   |
| One static inventory and one hard-coded cluster id in `placement.test.ts`                                                                                                                                                                                              | 1.3                   |
| The coexistence record and reservations describe h3mon with its Docker services                                                                                                                                                                                        | 1.4                   |
| `observability-source.ts` hard-codes the inventory path, the two peers and the API endpoint                                                                                                                                                                            | 1.5                   |
| No locked Argo CD install and no locked `argocd` CLI                                                                                                                                                                                                                   | 2.1                   |
| Every chart is consumed through a Flux `HelmRelease`                                                                                                                                                                                                                   | 2.2                   |
| The platform-stage manifests exist only under Flux-reconciled paths                                                                                                                                                                                                    | 2.3                   |
| `validatePlatform` checks Flux units; nothing checks an Application graph, its environments, its isolation or its placement, or that a claim has a backup                                                                                                              | 2.4                   |
| `tool-fleet:check` is not a required check, so a merge can skip the `delivery` rules                                                                                                                                                                                   | 2.4                   |
| `playbooks/platform.yml` installs Flux and needs the age key on the server; only it writes the cluster identity ConfigMap; nothing syncs a unit on command                                                                                                             | 2.5                   |
| The controller image has no `sops`, and `fleet_ansible` mounts no fleet checkout                                                                                                                                                                                       | 2.5                   |
| `tool-fleet:health` reports "no Flux objects" as a failure; the recovery manifest and drill assume Flux                                                                                                                                                                | 2.6                   |
| The lab's `platform` profile runs Flux; nothing rehearses the new tree, a one-node start or staged joins                                                                                                                                                               | 2.7                   |
| The observability, alert and backup manifests exist only under Flux-reconciled paths; the copied alert rules watch a CronJob and a cluster that do not exist yet                                                                                                       | 2.8                   |
| The only build runbook is written for two adopted hosts                                                                                                                                                                                                                | 2.9                   |
| Retention and the freshness alert for `sqlite/<database>/` run on h1claw; both clusters would share the prefix                                                                                                                                                         | 3.1                   |
| No probe of a node from outside itself                                                                                                                                                                                                                                 | 3.2                   |
| The gate instructions name h2puni and h4claw                                                                                                                                                                                                                           | 3.3                   |
| `desired.yaml` and the inventories still name the old cluster after retirement                                                                                                                                                                                         | 3.4                   |
| The WBS `staging` and `prod` overlays both render the namespaces `wbs` and `wbs-solver`, select no node for three workloads, set no cluster prefix, expect SOPS Secrets, and nothing stops staging configuration from naming a production Service                      | 3.5                   |
| The solver admission policy trusts one namespace, one selector and one parameter ConfigMap; the supervisor's caller list has no staging name and its decoder refuses a pod caller's rule without a caller image; the `solver` role asserts `product`                   | 3.8                   |
| Nothing binds at admission: a pod in an app namespace may select any node, an Ingress, IngressRoute or Certificate may claim any host, a non-production namespace has no quota or default-deny of the platform's own, and cert-manager's solver pods carry no selector | 2.10                  |
| MLflow runs as a Compose service with no backup of its own: a SQLite metadata store and an artifact root on one volume                                                                                                                                                 | 3.6                   |
| Nothing turns a merge to `main` into a staging deployment: no job builds on a merge, renders the staging manifests or writes them where Argo CD reads; nothing on a host is started by GitHub                                                                          | 3.7 and the CI change |
| An automated sync has no schema step: the WBS backend starts with startup migrations off, and the only caller of the schema Job is the release coordinator, which needs a Flux unit                                                                                    | 3.9                   |

Six slices have no requirement in the delta spec, on purpose. Slices 1.4 and 1.5 turn two
hard-coded inputs into data, and the checks that already read those inputs are their test.
Slices 2.9, 3.3 and 3.4 are documents and the removal of the old cluster's entries, which
`AGENTS.md` exempts from a spec. Slice 2.6 had none in an earlier draft and has one now:
health and recovery of a cluster delivered by Argo CD.

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

| Secret                                                                                 | Namespace                     | New or carried | When                                   | Before the cluster exists           |
| -------------------------------------------------------------------------------------- | ----------------------------- | -------------- | -------------------------------------- | ----------------------------------- |
| Read keys for the fleet repository and the WBS deploy repository; host keys            | `argocd`                      | new            | A4, and its rerun before the first app | fleet repository, encrypted         |
| Read-only deploy key for the staging pins repository, which is private                 | `argocd`                      | new            | A23, by a rerun of `argocd.yml`        | fleet repository, encrypted         |
| Local account password hash                                                            | `argocd`                      | new            | A4                                     | fleet repository, encrypted         |
| OAuth client of the Tailscale operator, which may create devices with its own tag only | the operator's namespace      | new            | A4                                     | fleet repository, encrypted         |
| OpenBao seal key                                                                       | OpenBao's namespace           | new            | A7                                     | fleet repository, encrypted; escrow |
| OpenBao server CA signing Secret                                                       | as pull request #935 names it | new            | A7                                     | fleet repository, encrypted         |
| What else #935's bootstrap set gives OpenBao itself, such as its snapshot credentials  | OpenBao's namespace           | as #935 states | A7                                     | fleet repository, encrypted         |

**On hosts, not in the cluster.** The k3s server and agent credentials (new, A2) and the S3
key for etcd snapshots (new since R6, written by the `backup` role in A5). The new
SOPS age identity never leaves the controller and escrow.

**Written into OpenBao by the owner, read through ExternalSecrets.** Paths are separate per
environment, and the store's Kubernetes roles are bound per namespace, so a staging workload
cannot read a production path. Staging backup jobs get an object storage credential of their
own that cannot read production's backups: an S3 key limited to a staging bucket (R6). S3's
access policies name a bucket and a prefix; that this holds for the keys made here is read
back, not assumed. Either way A18 does not start on a shared
key: its receipt includes one of staging's own objects read with the staging credential,
and a read of a named production object refused with an authorisation error. A refused
listing alone would not show it, because listing and reading are separate permissions.

| Secret                                                         | Consumer                                                       | New or carried                         | Written in | Source                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry CA key pair                                           | `issuers`                                                      | carried                                | A7         | escrow                                                                                                                                                                                |
| `velero-credentials`, `velero-repo-credentials`                | `velero`                                                       | carried; generated                     | A14        | escrow; the repository password is escrowed before it is written                                                                                                                      |
| `elastic-s3-credentials`                                       | Elasticsearch snapshots                                        | carried                                | A14        | escrow                                                                                                                                                                                |
| `alertmanager-puni`                                            | Alertmanager                                                   | new                                    | A14        | **decided:** alerts go to the Slack channel `#puni-alerts-dev`. Its incoming-webhook address exists and the owner holds it outside the repository; he writes it into the store in A14 |
| `otel-server-ca`, `otel-client-trust`, nine `signal-*` Secrets | observability                                                  | new                                    | A14        | generated by the operator                                                                                                                                                             |
| MLflow backup credentials                                      | `mlflow`                                                       | carried                                | A15        | escrow                                                                                                                                                                                |
| Rancher's bootstrap password, key `bootstrapPassword`          | `rancher`, as the Secret `bootstrap-secret` in `cattle-system` | new                                    | A27        | generated by the owner and escrowed before it is written (decision 14)                                                                                                                |
| Staging app Secrets: runtime, pull and backup credentials      | staging namespaces                                             | carried from dev                       | A18        | the fleet repository under the old key; the dev stacks' env files                                                                                                                     |
| Production app Secrets                                         | production namespaces                                          | carried; WBS as its overlay names them | A19, A20   | the fleet repository under the old key; escrow                                                                                                                                        |
| Harbor's Secrets and robot credentials                         | Harbor and its consumers                                       | as the Harbor change states            | its steps  | generated                                                                                                                                                                             |

Since R6 (2026-11-24) every object storage key in this table that writes is new, for its S3
bucket; the old store's keys only read the backups that cross (decision 8). Not carried: the
registry's `registry-auth` (Harbor's robots replace it). Kept outside any
cluster: the backup archive key, which only reads the old archive, and the old cluster's age
identity, which A18 and A19 use on the controller to read the website's present Secrets.

**While OpenBao is sealed or down.** The External Secrets Operator stops refreshing. Secrets
already written to the cluster stay, so running pods keep running and restart normally. A new
ExternalSecret gets no value, `secret-sync` is not Healthy, and the sync playbook refuses the
units that need it. A unit that does not need it can still be synced. A cold rebuild restores the store before any consumer is synced. Pull
request #935 owns the alerts for a sealed store and a failed sync.

### 6. Build order

| Stage | Role          | Needs                                                                                                                                                      | Receipt that ends the stage                                                                                                                                                                                                                      |
| ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Decisions     | none                                                                                                                                                       | overrules recorded; the secrets of task 0.5 read back from escrow; the `main` rulesets read back; the slices decision 4 lists for stage 1 landed, except 1.3, whose first revision follows A1                                                    |
| 1     | Platform      | stage 0; slices 1.9 and, for A27, 2.11; rehearsal receipts 2.7/A3, 2.7/A7 and 2.7/A27; pull request #935, for A7 only                                      | server Ready behind its host firewall (A26); orders 0 to 7 Synced and Healthy, `rancher` with every pod it starts on m1plat1 and no `GitRepo` (A27); a canary read from OpenBao through an ExternalSecret; one etcd restore on the empty cluster |
| 2     | CI            | stage 1's Argo CD, to deliver it; the change `run-ci-on-argo-workflows`                                                                                    | a full gate exits 0 through a Workflow on the CI cluster, on a commit that also passed on an old gate host (CI-A4)                                                                                                                               |
| 3     | Observability | the server; OpenBao serving; slices 2.8, 3.2 and 3.6                                                                                                       | orders 8 to 12 Healthy, `sqlite-custody` excepted, which lands in stage 4; memory and disk measured; a test alert raised; MLflow restored (A15)                                                                                                  |
| 4     | Apps          | the server; orders 11 and 12 Healthy; slices 2.10, 3.1, 3.5, 3.8; for WBS, Harbor, slices 3.7 and 3.9 and A23; the server of A16; A14's placement decision | staging and then production answer on their names with their data checked against the final backup                                                                                                                                               |
| 5     | Retirement    | stage 4's receipts; stage 2's receipt for the gate hosts                                                                                                   | old servers deleted; `desired.yaml` and the inventories name only the new cluster                                                                                                                                                                |

- **Platform first, and OpenBao first on it.** Every other node joins this server, and every
  later unit reads its Secrets from the store.
- **CI second.** Its server and its k3s need nothing from the platform cluster; its units
  need that cluster's Argo CD (A4), and its tenant the store (A7). It is not enrolled in the
  host pool, so no calibration is repeated. The old gate hosts keep gating until a full gate
  has passed there. It may run in parallel with stages 1 and 3 from A4 on.
- **Observability third.** Alerts and backups wait on it.
- **Apps last, staging before production.** They carry the data, and staging is the rehearsal
  of the production move. In the minimal profile one server is created here, the production
  apps node (A16); the non-production environments land on the observability node, which
  gains its two capabilities in A17 once the sum of decision 2 holds at the reading after
  A15.

Harbor lands on the platform node by its own change. It blocks the two WBS units and nothing
else. It is built, not deferred: the owner confirmed on 2026-11-22 that Harbor and the
owner's own CI stay in the build (R10, R31), so that the path the plan grows along has been
run once.

The database stage and the two hosts outside the cluster are in the changes `host-postgres`
and `add-agent-hosts`. Nothing in stages 0 to 5 waits for either. The minimal profile
creates four servers in these stages: m1plat1, which exists, h8ci, h7obs and h6apps. The
bastion m2bast1 exists as well and is outside every cluster (R55).

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
   replicas and its backup job is suspended, and its workload is not started until the
   image that is about to run has captured the store's applied-migration ledger with its
   own tool, accepted every applied name and hash against its own scripts, and reported
   no pending migration; anything else goes through the attended schema Job with its
   capture and rollback (decision 9). Going back is bounded by the first write on the new side,
   as the paragraph after this list states.
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
5. **Gates do not stop for other sessions.** No gate host is deleted before a full gate has
   passed on the CI cluster (CI-A4).
6. **Staging never receives production data.** The staging stores are restored from the dev
   stores only. The final backup of a dev store records its SHA-256, and the restore is run
   against that recorded value with `sha256sum --check`: a file with another digest stops the
   step before anything is written.

**Going back.** The old writer is never started while the new one runs, and never over
data the new side has accepted. The order is the same before and after the names are
pointed at the new node, because the new writer may be running in both cases:

1. _Hold the new side at zero in the source Argo CD reads._ A scale to zero in the cluster
   is not enough: staging's self-heal reverts it, a later staging build would publish one
   replica again, and a production sync would apply `main`. For an app whose staging
   source is its pins directory, the owner merges a pull request there that sets the
   workload to zero replicas, suspends its backup job and adds a file `HOLD`, which is not
   a manifest; the render step of slice 3.7 refuses to commit to a directory that holds
   it. For the website and request app in staging, whose source is the fleet overlay, the
   hold is the zero-replica overlay merged there; their owner's tooling moves a pin and
   does not change the replica count, so the merge alone holds, which task 0.4 asks that
   owner to confirm. For production
   and for MLflow the hold is the zero-replica overlay merged to `main` and synced by the
   owner; nothing else syncs them.
2. _See every writer pod of the new side gone_: the workload reports zero replicas and no
   pod with the app's selector is left in its namespace.
3. _Only then compare_ the stopped store with the restored stamp, so no write can land
   between the comparison and the stop. The comparison covers the whole durable state and
   not one table: a write to WBS can land outside `event_log`, an account created in
   `users` for one, so the test of [the cutover plan](../../../docs/infra/cutover-plan.md),
   a count of `event_log`, is not enough here. For each SQLite store, WBS and its MCP
   store, the website and the request app, it is the SHA-256 of `sqlite3 <store> .dump`
   taken from the stopped store against the same digest of the restored stamp; for MLflow
   it is that digest of the metadata store and the manifest of the artifact store, each
   object with its checksum, against the manifest of slice 3.6's stamp. Any difference
   counts as a write, a migration the new side applied included.
4. _Only then may the old writer start._ If the two are equal, the names are pointed back
   where they had been moved, and the old side is started. If they differ, the choice is
   to recover forward, by lifting the hold, or to take the stopped writer's final backup,
   restore that onto the old side, check it and only then start the old side. In that
   second case too the names are pointed back at the old side and the app is read through
   them, so the newer data is what serves.

A hold is lifted by a pull request that removes the marker and restores one replica; the
next build publishes again. A18 proves the hold, the order and the comparison once, with
one edit made after the first app's switch and one merge made during the hold.

The final backup of a store on an old host is taken with the store's own tool after its writer
stops: the cluster's backup job for the website, and for the Compose databases a
`sqlite3` `.backup` on the host with `integrity_check` and a recorded SHA-256. The new
servers' private network is not joined to the old hosts' (Context), so a final backup
reaches the new side through the object store, never over a private path between the two. MLflow is
not one database file: it keeps a SQLite metadata store and an artifact root on one volume
(verify.md, the reading of 2026-11-22; the root held no file), and its custody is slice
3.6's own pair of jobs, because the apps' runner accepts only a database with the apps'
migration table. A15 reads the layout again before it moves anything. The final
backup is always taken from the stopped store itself. A pull h1claw made earlier is never a
substitute for it: an older copy is a valid database that lacks every edit made since. If
h1claw still exists, a member of its set may be used only when its `.dump` digest equals
that of the stopped store, which makes it the same data and proves nothing more. Its set
mixes production and dev databases and a configuration archive with production env files, so
nothing else of it is used and the archive is never unpacked on the new cluster. The plan
does not depend on h1claw.

**When a store has no off-host backup.** Stated once; R30 refers to this table.

| Store                                                                                           | Unprotected from                                                                                                                           | Until                                | Why                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| WBS production database on h2puni                                                               | the day h1claw is deleted                                                                                                                  | A20                                  | h1claw's pull is its only off-host backup; A20 waits on Harbor and slices 3.5 and 3.8                                     |
| WBS dev database on h2puni, the agents' tracker                                                 | the day h1claw is deleted                                                                                                                  | A18's WBS part                       | the same                                                                                                                  |
| MLflow store on h3mon                                                                           | the day h1claw is deleted                                                                                                                  | A15                                  | the same pull, daily                                                                                                      |
| Website data                                                                                    | never: its own job in the old cluster continues. Its pruning and its freshness alert stop with h1claw, so a job that stops is not reported | A18, A19                             |                                                                                                                           |
| Two other dev databases on h2puni, `aivn-dev` and `aivn-cms-dev`, and the configuration archive | the day h1claw is deleted                                                                                                                  | never: this plan does not carry them | they are members of the same hourly set ([recovery](../../../docs/infra/recovery.md)); A22 needs the owner's word on them |
| `wbs-mcp`, the MCP server's store                                                               | always: nothing backs it up today                                                                                                          | never                                | not carried; a new claim starts empty and its clients sign in again (assumed; the WBS owner confirms in A18)              |
| The new cluster's etcd                                                                          | A3                                                                                                                                         | A5                                   | empty until then                                                                                                          |
| OpenBao's store                                                                                 | A7                                                                                                                                         | its first snapshot, in A7            | pull request #935 owns its backup; no drill restores a cluster that holds the store, since A6 precedes it                 |
| Harbor                                                                                          |                                                                                                                                            |                                      | its own change                                                                                                            |

The first three windows have no fixed end, because A18 and A20 wait on work this change does
not own. The owner accepted them on 2026-11-21 (R30). A manual copy of the three stores to the
bucket before h1claw is deleted would narrow the loss to what is written afterwards; it is
offered, not required.

### 8. What crosses and what is left

| What                             | How                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WBS dev database                 | Final backup on h2puni after the dev stack stops, restored into the staging WBS claim (R29)                                                                                                          |
| WBS production database          | Final backup on h2puni after production stops, restored into the production claim (R28)                                                                                                              |
| Website data, dev and production | The website's own backup job run once after scale-down, restored into a new claim                                                                                                                    |
| MLflow store                     | Final backup on h3mon after the service stops, restored into the `mlflow` unit's claim (R15)                                                                                                         |
| DNS records                      | One reviewed plan per name (`platform-dns.ts plan`), applied by hand at the registrar                                                                                                                |
| Registry CA key pair             | From escrow into OpenBao, so `registry.puni.internal` keeps the chain that nodes and build tools trust                                                                                               |
| Object storage credentials       | The old store's, from escrow, to read the backups that cross; new S3 keys for everything written (R6). etcd snapshots go to their own bucket: the snapshot folder is the cluster id, which is shared |
| Fleet repository                 | A new directory for the new cluster (decision 9). The old one is removed in stage 5, on the word of the session that owns `release-pin.ts`                                                           |

All four old servers are retired (R46): h4claw and h3mon in A21 and h2puni in A22, and
h1claw by the change `add-agent-hosts`, once OpenClaw's state has moved or the owner has said
it is not wanted. The owner may delete h1claw earlier (R30), on the same two receipts. Each
retirement step carries a list of what its host still holds, begun from
`production-existing-hosts.yml` and completed by a reading of the host, which the owner
signs off entry by entry as restored or discarded: A21 names the `openhands-app` container
and its mounts on h4claw among them.

Not carried: public certificates and ACME accounts (issued and registered anew), k3s
credentials, the SOPS identity, registry push credentials, the old registry's one proof image,
Victoria and Grafana data, stopped containers, the old cluster's etcd, the Compose dev stacks
themselves, the MCP server's store, the two other dev databases on h2puni and its
configuration archive, and anything else on the old hosts: the owner named nothing further.

### 9. Dependencies on other owners

**OpenBao design (pull request #935).** Owned by another session and not edited. It is on the
path of A7, so its merge, and its amendment for this cluster, are preconditions of that step.
Read at its branch on 2026-11-21, it places the store on a platform node, initialises it by
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
- Paths and roles that separate staging from production, and a role and path set for each
  app namespace and for `cattle-system`, whose one Secret is Rancher's bootstrap password, which its design scopes to platform Secrets today (decision 5).
- Its image is never pulled from Harbor, which it already requires.
- Its memory figure, which decision 2 assumes at 1,024 MiB with the operator.
- If its server certificate is to come from somewhere other than cert-manager, the order table
  loses the one unit that precedes it for that reason.
- Paths and policies under one prefix per tenant, `puni` first, with the environment below
  it, so that a tenant is a path prefix and a policy (decision 13); and no public route to
  its interface, which is reached over the private access network (decision 12).

**Harbor change (`adopt-harbor-registry`).** This change edits none of its files. Step and
assumption ids in this list are the Harbor change's own.

- Delivery: its `HelmRelease` and overlays (its decision 4 and slice 3) become a wrapper chart
  and an Application at order 14, synced on command, with the selector and toleration of
  decision 1.
- The Certificate `registry-tls` for `registry.puni.internal` belongs to Harbor's unit (its
  H9). The `issuers` unit here carries the CA issuer only.
- Rendered values: every value the chart would otherwise generate at install time comes from
  OpenBao, or each comparison renders a different one. The Harbor change has to list them.
- Placement: assumptions H1, H9 and H13 and decision 2 name h4claw. The node is m1plat1.
  The endpoint `10.1.0.4:8443` is an address of the old hosts' network; on the new one it is
  an address of 10.10.1.0/24, which the Harbor change picks.
- Stop rule: task 1.3 computes 1,949 MiB from h4claw's memory under a gate. On m1plat1 the
  figure comes from that node's reading and decision 2 here, and no gate runs there.
- No Distribution on the new cluster: its H11, its migration steps 10 and 12, its attended
  steps Harbor-A9 and Harbor-A11 and the `:5000` endpoint fall away, and so do Harbor-A1 and
  Harbor-A2a, which read and re-enroll h4claw.
- A project and robots for WBS images, staging and production, before A23.
- Its first slice can measure on m1plat1 once A3 is done.
- Tenancy and access (decisions 12 and 13): its projects, quotas, retention rules and robots
  are the tenant `puni`'s and are created through its API, which is the interface the
  `puni-user-platform` would drive; its interface and admin API get a tailnet name and no
  public route, while nodes and builds keep pulling and pushing on the provider's private
  network at `registry.puni.internal`.
- Its bundled PostgreSQL stays. Whether Harbor uses the shared service instead is a question
  of the change `host-postgres`, which lists what the Harbor change would then need.

**Fleet repository and release bootstrap.** Website registry routing, the fleet's website pins
and `release-pin.ts` stay untouched. The website's present overlays cannot be read by Argo CD
as they are: they carry encrypted Secrets that only a decrypting reconciler can apply. The new
cluster needs a directory of its own there with the public-name issuers, each with the
solver per environment of decision 3, a staging and a
production overlay per app whose Secrets are ExternalSecrets, and a check that plays the part
`fleet-check` plays for Flux units. That check carries rules (f), (g), (k), (m)
and (n) of slice 2.4 and the prefix rule of slice 3.1 for its overlays. No automated identity
writes to that repository. Each stateful app lands there in two merges: first with its
workload at zero replicas and its backup job suspended, then, after the restore, at one
replica with the job running (guard 1). The session that holds the release bootstrap
writes that directory, after its bootstrap finishes (R11). The Applications follow that
repository's `main`; task 0.6 gives it a ruleset before A2.

**Continuous integration (R31; change `run-ci-on-argo-workflows`).** Read on 2026-11-21:
the `ci` workflow runs on the provider's hosted runners for every pull request and every push
to `main`. The host gate and the release builds are started by hand over SSH, through
`run_heavy_job`, which admits each as a job of the host pool from
`infra/jobs/catalogue.json`. Nothing on a host is started by GitHub, and nothing reports a
host job back to it. WBS dev follows `main` through a poller on h2puni and runs from source.

On 2026-11-22 the owner chose an orchestrator he does not have to build (R31). The CI change
defines it, and this change no longer designs a trigger: an earlier draft's self-hosted
GitHub Actions runner, its runner group, its job-started hook and its workflow lint are not
built. What that change gives this one:

- **A trigger.** A push to `main` that touches an app starts a `staging-build` Workflow on
  the CI cluster, through a trigger job on the provider's hosted runner that joins the
  private access network for the length of the job (R51). A pull request starts nothing there. A person
  or an agent starts a Workflow by one command over the private access network.
- **An executor.** The CI cluster's scheduler admits a job by its requests. The new capacity
  is not enrolled in the host pool.
- **Where the build's credentials live.** In the tenant's namespace on the CI cluster, from
  the store, and no longer in files on a host.

What stays here is what the build does for staging, which is the rest of this decision.

The build itself:

- **Push.** Images go to Harbor by digest with a robot that may push to one project.
- **Render and commit.** The job then renders the app's staging overlay at the built
  commit, with its images set to the new digests, and commits the rendered manifests to
  the app's directory in a **staging pins repository**: a new private repository that holds
  rendered staging manifests and nothing else, and that only staging Applications read. A
  staging Application's source is its directory there, so no overlay reads a second
  repository: Argo CD documents a reference source for Helm value files only, and rule
  2.4(d) refuses a remote kustomize base. The render runs the `kustomize` binary locked in
  `infra/versions/toolchain.json`, with no cluster and no secret: the overlay holds
  ExternalSecrets, never values. Before it commits, the job checks that the built commit is
  on `main` of the source repository and that the render holds only kinds and namespaces
  the `stag` project admits. It refuses a render that holds a Secret object, one that is
  empty, and one whose command failed or printed nothing for a file the overlay names, so a
  partial render never replaces a directory. The staging Applications leave `allowEmpty`
  off, so even a directory emptied by hand prunes nothing. The job replaces the directory
  whole, so a manifest removed from the overlay is pruned. Each commit names the source
  commit and the digests.
- **Never backwards.** The job refuses to commit unless its source commit is a descendant
  of the one the directory's head names, so a build that finishes late cannot replace a
  newer render. The first build has a head to compare with because A23 seeds each app's
  directory with a baseline, the zero-replica render at a named commit of `main`.
- **A schema change rides the automatic path through a hook (R53).** The WBS backend
  starts with `MIGRATE_ON_STARTUP` off, because a migration Job is the single migration
  actor (`deploy/k8s/wbs/base/backend.yaml`), and `AGENTS.md` requires a Kubernetes caller
  to ask the candidate's capability command, to capture the applied set before moving
  forward and to reverse exactly the additions on abort. The release coordinator does
  this for production, but it suspends a Flux unit and writes with a cluster credential,
  and neither exists for an automated sync. So the staging render carries a Job that does
  the same with the candidate image's own CLIs and no credential beyond the backend's
  own environment (slice 3.9):
  - _Where it runs._ It is a hook of the staging Application in the `Sync` phase, one
    wave before the Deployment and one after the solver parameter ConfigMap and the
    candidate's `wbs-backend-config`. `PreSync`
    was not taken: that phase holds hooks only, and the Job's image has to be in the
    admission list before its pod is created. Argo CD applies waves in order and waits
    for each to be healthy; a hook that fails marks the sync failed, and the Deployment's
    wave is not applied.
  - _What it does._ Capability check; then, on every run and before anything is
    written, the candidate's two boot preflights on the live store, read-only: the
    machine grant settings and the trusted issuer audience, which the release
    coordinator runs before its snapshot (`execute.ts`). The backend refuses to boot on
    an activated store that lacks those settings (`boot.ts`), and `Recreate` removes the
    serving pod before the new one starts, so a candidate that would refuse must fail
    the sync here, while the old pod serves, also when nothing is pending. Then the
    capture; nothing more when nothing is pending; otherwise a `VACUUM INTO` snapshot
    with its integrity check and SHA-256, the capture, the list of schema objects and an
    attempt record written to the data claim; the forward migration; and a second
    capture that must equal the first plus what was pending. On a failure it runs the
    exact-set reversal against the recorded capture and compares the complete ledger
    and the list of schema objects.
  - _What the preflights read._ `DB_PATH` on the data claim and the backend's own
    environment, by the `envFrom` the Deployment has: the candidate render's
    `wbs-backend-config`, applied in the wave before the hook, and
    `wbs-backend-secrets`. The Job holds nothing the backend does not hold, and still
    no ServiceAccount token. A candidate image without the two CLIs is refused: the
    coordinator's exception for a declared older candidate has no place on a path that
    never moves backwards.
  - _Where the capture lives._ On the data claim, under `/data/schema-hook`. A ConfigMap
    or a Secret would need a ServiceAccount token, and the solver namespace's admission
    admits the backend's account without one. The capture is as durable as the database
    it describes, and a second pod finds it after the first one died.
  - _No fence, and what gives exclusive access._ The release coordinator refuses a
    schema Job while a writer pod exists (`execute.ts`), and a `ReadWriteOnce` claim
    does not keep a second pod of the same node out. The hook does not ask for zero
    writers: scaling the backend down from the hook needs a token and a Role in the
    trusted namespace, and a failed hook would then have to bring the old pod back. It
    relies on SQLite's own lock, as the Compose swap does while the old colour serves
    (`AGENTS.md`, Migrations): forward migrations are additive, which the migration lint
    holds; the store opens with a busy timeout (`db.ts`); a migration and a reversal
    hold the write lock for their transactions, and the old backend's writes wait
    behind them or fail with a busy error once the timeout passes. The consequence is
    accepted for staging: during a long migration writes may be slow or refused, and
    what was acknowledged must still be there. Ledger equality does not prove that, so
    the rehearsal has the old backend acknowledge an edit while a failing migration and
    its reversal run, and reads that edit afterwards, with no table's row count lower
    than before and no schema object left over. A lost edit is slice 3.9's stop. With
    no fence a failed hook changes nothing that serves: the old pod runs on, on the old
    schema.
  - _The admission list._ The render writes the candidate digest first, then the digest
    that serves and every digest published since it. Nothing is counted out: the render
    reads the boot commit from the staging backend's identity route, takes that
    commit's render from the pins repository's history and lists its digest and every
    later one, however many publications failed or are still in progress. So a restart
    of the running pod is always admitted, also when another candidate became Healthy
    between two renders. A built image has no repository to read, so the build writes
    the source commit into it and the backend reports that. If the render cannot read
    the route, reads no commit, or finds no render for it, it publishes nothing for
    the app.
  - _The identity route._ The backend's health document is at `/health` on its own
    port, and the staging Ingress sends `/` to the frontend and only `/api` to the
    backend, so the public `/health` is not the backend's. The backend gains one route
    at an exact path under its API prefix that answers its boot commit and nothing
    else. A rewrite of a public path to `/health` was the alternative; it needs a
    Traefik `Middleware`, a kind the staging project and the names policy do not admit,
    so the route is the smaller change. The render reads it over HTTPS and verifies the
    host name against the public roots. For that the WBS staging overlay on the new
    cluster names the public-name issuer, not the ACME staging issuer it names today
    (slice 3.5): a certificate from a test issuer fails the read and is not trusted.
    One name issues there, far inside the public issuer's limits. The same commit is
    what the render's migration comparison is made against (below). Over a zero-replica head (the baseline, the first activation, a hold)
    nothing serves, and it lists every digest since the baseline without reading. The
    staging sync alert fires at the first failure.
  - _The attempt record after success._ The hook removes its record once the forward
    ledger is verified and before it exits 0. A record left behind would make a later
    sync of the same candidate reverse a schema the new backend already writes with.
  - _The backup before a change, and its room._ The snapshot above, on the claim, kept
    until the next one succeeds, and the hourly custody job, which reads one
    transaction and needs no pause. At the worst moment the claim holds the store, its
    WAL, the retained snapshot, the incoming one and what a migration or a reversal
    rewrites when it rebuilds a table. For the tracker's 2.2 GB of today that is three
    copies, 1 GiB of WAL and one more copy for a rebuild: about 10 GiB. The base
    claim's 5 GiB (`deploy/k8s/wbs/base/storage.yaml`) is too small, and the 10 GiB
    first assumed for staging leaves no margin, so the staging overlay requests 16 GiB
    (decision 2). The hook refuses before any write unless the claim's free space is at
    least twice the store's size plus 1 GiB, and removes the retained snapshot only
    after the new attempt has succeeded.
  - _When the render carries no hook._ A render at zero replicas carries none: the
    baseline A23 seeds, the first sync of A18, which comes before the store is
    restored, and a directory under the `HOLD` marker of decision 7, which the render
    step leaves untouched. The hook is in a render exactly when the backend has a
    replica, and rule 2.4(w) holds both directions. A hook that finds no store at
    `DB_PATH` fails the sync and writes nothing.
  - _What stays attended, and when._ Three cases, each refused by the render step or by
    the hook and named in its message. A source commit whose migration set is not a
    superset of the one staging runs, which is a revert or an edit of an applied
    migration: the candidate image no longer holds the script that reverses it. The
    comparison is with the commit that serves, read from the identity route, and over
    a zero-replica head with the baseline's; it is not with the pins directory's head,
    so a corrected candidate is published after a migration that failed and was
    reversed. An
    unfinished attempt left by another candidate. And a reversal that failed: the hook
    keeps its record and prints the manual completion command. In each the old pod
    serves and a person runs the schema step. Production never takes this path: its
    schema step is attended in A20, and the rule of slice 3.9 refuses the hook there.
  - _The attended schema step._ It is the same script, run as a plain Job that the
    operator creates from the manifest the tool prints, with the image about to run and
    the workload at zero replicas; A18 to A20 use it when a restored store is behind its
    image. A commit that removes a migration takes more care, because the operator
    interface `AGENTS.md` keeps for it, `migrate-down-cli.ts --to=<name>`, selects by
    stamp: it reverses every applied migration stamped after the named one
    (`migrate-down.ts`), which can include migrations the target still needs, and a
    `down.sql` may drop a table with its rows, as the one that removes `actual` does.
    So the order is fixed, and nothing is run on a stamp alone. The writers are fenced:
    the workload at zero replicas and its pods read gone. A fresh backup of the stopped
    store is taken and verified as decision 7 states. The operator writes down the
    intended set of removals, reads the applied ledger with the capture, and computes
    the set `--to=<name>` would reverse; the step refuses before any SQL unless the two
    sets are equal by name and hash. The `down.sql` of each selected migration is read:
    a statement that drops a table or a column, or deletes rows, of a table that holds
    rows in the stopped store stops the step for the owner's dated decision, because
    that data is the tracker's. Only then does the Job, from the image that applied the
    migrations, run the reversal; the ledger is read back and must equal the one before
    less the intended set, and only then is the render committed by hand.
    The release coordinator's own transaction is not used on the new cluster: it
    requires a Flux unit to suspend, which an Argo CD cluster does not have.
  - _Repeated attempts._ With self-heal on, Argo CD may try a failed sync of the same
    commit again. A run that finds an attempt record never captures again and never
    exits 0. For its own candidate it resumes from the recorded capture: it runs the
    exact-set reversal against that capture, compares the ledger and the schema
    objects, removes the record and exits nonzero, so that the next attempt starts from
    the captured state and not from partial progress. A record of another candidate,
    or one that marks a failed reversal, is refused with the manual completion
    command. What this version does at the same commit is read in the rehearsal.
- **The website API migrates itself at start, and that is safe to automate.** Read from
  source (verify.md has the lines). The API is the one owner of the website database; the
  request app is a browser application and holds no store. `WebsiteStore`'s constructor
  runs every catalogued migration that the ledger `schema_migration` lacks, each in one
  immediate transaction with its ledger row, so a start is idempotent and a failed
  migration leaves no half of itself. It refuses to start on an applied migration whose
  bytes changed. It starts on a database that a newer release migrated additively, which
  a test holds, so going back is the previous image on the newer schema. Every migration
  ships a `down.sql` that a test proves exact, but no command applies one: a destructive
  change has no automatic reversal, and the migration lint that guards the store's path
  keeps forward migrations additive. So an automated sync of a new API image needs no
  hook and no contract from its owner: a migration that fails keeps the new pod from
  becoming Ready and loses nothing. The Deployment is in the private fleet repository
  and was read there on 2026-11-22 (verify.md): the API runs one replica with the
  `Recreate` strategy, selects `product`, mounts one 2 GiB `ReadWriteOnce` claim of the
  retaining class, takes a snapshot of the store in an init container before it starts,
  and is probed on `/health`; the site and the app run one replica each and hold no
  store. With one replica and `Recreate` there is never a second writer during an
  automated sync, at the price of a gap while the new pod starts, and the snapshot before
  the start is the backup before a schema change. A18's website part therefore waits on
  no answer about the Deployment; it checks that the new staging directory keeps these
  properties.
- **A stateful app's first render.** Guard 1 restores a store while its workload is at zero
  replicas. For WBS staging the first overlay merged is the zero-replica one with the backup
  job suspended; A23 seeds the pins directory with that render as the baseline, and a
  build after it commits the same; and only then is the staging Application
  file merged, because the root applies it at once and it syncs whatever the pins directory
  holds. A18 stops if the directory's head is anything else.
- **How the commit lands.** The job writes as a GitHub App installed on that repository
  alone, with permission to write contents and nothing else. It pushes to `main` directly:
  a pull request that the App merged itself would add a step and no second pair of eyes.
  Two rulesets hold `main` there. One has no bypass actor and refuses a forced or deleting
  push, so history cannot be rewritten by anyone. The other requires a pull request and
  names the App as its only bypass actor, so a person still needs one. That rulesets
  combine this way is from memory and is read back in A23.
- **What limits the App.** It is not installed on this repository, whose `main` is the
  cluster's administrative boundary (decision 3), nor on the fleet repository, whose `main`
  the old cluster's Flux reads and which holds production overlays and the bootstrap
  Secret files. Nothing it can write is read by a production or platform Application.
  What it can write is applied to staging at once and is never read by `gate`: the bounds
  are the `stag` project's namespaces and kinds and the admission policies of slice
  2.10.
- **The website and the request app.** Their pins and overlays are in the private fleet
  repository and belong to the session that owns `release-pin.ts`. This plan designs no
  change to that tool. Their staging advances as their dev copy does today, when that
  owner's tooling moves a pin; whether they take the path above is that owner's to decide
  and is asked in task 0.4.
- **One milestone for all three apps.** A18's receipt, per app, is a merge to the app's
  source that reaches staging with no command. For WBS the path is slices 3.5, 3.7 and
  CI-S7 and steps A23 and CI-A5. For the website and the request app it is their owner's
  tooling, which moves a pin as it does today; the API's own start applies a schema
  change. Where that tooling does not exist when A18 runs, the owner's dated waiver is
  recorded for that app, and the app is listed as not yet following `main`.
- **Under the owner's waiver.** If A23 or the CI change's CI-A5 cannot be done and the owner waives it in writing,
  a person renders and commits each staging change by a pull request in the pins
  repository. Staging then does not follow `main` by itself, and R20 does not hold for
  WBS until the build path exists.
- **Promotion.** A person's pull request copies digests from the staging manifests into
  the production overlay, in the repository that holds it. Before opening it the person
  checks three things: the build's Workflow and its pins commit name that digest and a commit
  of `main`; the staging Application runs that digest and is Healthy; and it has run there
  long enough to have been used. Production is not a copy of what staging ran: Argo CD
  renders the production overlay at `main` when the owner syncs, and the base may have
  changed since the commit staging ran. Copying the rendered form was weighed and not
  taken, because a staging render carries staging's namespaces, hosts and store paths. So
  a fourth check compares commits: `tool-fleet promotion-check` (slice 3.7) reads the
  source commit from the pins commit that staging runs and refuses the promotion when the
  app's base or its production overlay differs between that commit and `main` in anything
  but the digests. Then a new build has to reach staging first. After the merge the
  production Application is OutOfSync, and the owner syncs it (R20). None of the four
  detects a build that was altered on the CI cluster; that is R35.
- **Retired by this.** The WBS dev poller, with the dev stacks. A18's WBS part stops it
  only when A23's receipt or the owner's waiver exists.

**Credentials, and what the CI cluster is trusted with (R35).** Two belong to this
decision: the App's private key and the Harbor push robot's configuration. Each is a Secret
in the tenant's namespace on the CI cluster, made from the store; the CI change adds a third
for commit statuses. Namespaces do not put them out of a gate's reach, and the plan does not
claim so: a gate runs beside a privileged Docker daemon, so code that a gate runs can take
the node and read every Secret on it, and can change what a later build produces. The
credentials reach staging only: the robot pushes to one project and the App writes the
staging pins repository. Within staging the App's key is a wide authority. Whoever holds it
can commit any manifest the `stag` project and admission allow, with no check in between,
and that includes the parameter ConfigMap that admits a backend image to the staging solver
socket (decision 1). What is not bounded beyond staging is image integrity. An image built
there may not be what its commit says; staging runs it at once and production runs it after
a promotion. That is the accepted blast radius of the CI cluster while there are no
production users. A build node that gates never run on would shrink it. The CI cluster holds
no credential for the platform cluster.

**A build waits behind a gate** until the CI change's measurement shows that both fit, so a
merge can reach staging hours later (its decision 5).

Needed from other owners: from the CI change, the trigger, the tenant's namespace, engine
and store path, and the `staging-build` template; from the WBS deploy tooling's owner, the
build entrypoint and a staging overlay the job can render at a commit, which carries the
schema hook of slice 3.9; from the release
bootstrap's owner, whether the website takes the same path; from the Harbor change, the
project and the push robot; from the owner, the staging pins repository and the App.

**Dev environment (follow-up change, proposed name `add-dev-environment`; R34).** Not
designed here. Its three namespaces are created empty by this change so that their
quota, default-deny and admission policies bind before anything can be applied there.
They are not an open end: step A25 is that change's first deployment into them, with its
precondition, that change merged, and its receipt. It
has to design:

- a `dev0` AppProject with its own namespaces and a kind whitelist that leaves NetworkPolicy
  out, unless admission is shown to bound it;
- dev Applications with automated sync off;
- an account that may sync `dev0/*` at another revision, and what that privilege admits
  besides a revision, local manifests among them;
- a template that builds a named ref on the CI cluster;
- store paths, roles and hosts for dev;
- a solver for dev on the terms of decision 1;
- dev's budget, from measurement.

It may rely on what this change leaves in place: the node and its capability; the three
namespaces with their quota and default-deny; the admission policies for placement and
names; the taint on the platform node; per-namespace store roles; and the project
allow-lists.

**PostgreSQL hosting and the hosts for agents.** The changes `host-postgres` and
`add-agent-hosts`. Each names its own follow-ups: the four ports of the
apps from SQLite and client databases; OpenClaw's installation and the workstation's setup.

**WBS overlays and the WBS deploy repository (slices 3.5 and 3.8).** Owned by the WBS deploy
tooling's owner. Both overlays render the namespaces `wbs` and `wbs-solver`, so staging and
production cannot share a cluster as written, and the solver binding is literal (decision 1).
Needed: distinct namespaces for staging, and no staging value that names a production
namespace or Service; the staging parameter ConfigMap of decision 1; the selector patches of
decision 1; a backup prefix
per decision 7; ExternalSecrets where the overlays expect SOPS Secrets; images from Harbor
(R28); for staging, the hostnames and the issuer its overlay names today, which is the ACME
staging issuer; a staging overlay that renders without a cluster, since the build renders
it on the CI cluster. The cutover plan lists the deploy repository and its read key as a
prerequisite; if it does not exist when A2 runs, the WBS Applications read
`deploy/k8s/wbs` in this repository and no key is made. The `delivery` check reads the
overlays in this repository. What the deploy repository renders from them is checked there, by
a check that carries rules (f), (g), (k), (m) and (n), as the fleet repository's does. For
production, the operator writes the admission list and the supervisor's rule before the owner
syncs a new backend (decision 1); that procedure is this owner's. The simple
move of R28 uses none of the cutover plan's Flux objects. What a later WBS deployment needs
beyond a sync, such as the migration capture `AGENTS.md` requires of Kubernetes callers, is
that owner's to state; this plan does not design it.

**Gate pool (`dash-host-jobs`).** The new CI capacity is not enrolled (R31), so nothing is
asked of its owner there. Needed: which pool facts to carry as hand-written limits, which the
CI change lists; and, before A21 and A22, either a withdrawal step for h4claw and h2puni or
written confirmation that none is needed, with cleanup of the capacity those hosts report.

**Where images come from.** No node is configured with a registry mirror: `bootstrap.yml` and
`join.yml` do not run the `registry_client` role.

| Images                                                                     | Pulled from                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argo CD, cert-manager, the observability stack, MLflow                     | their upstream registries, by digest                                                                                                                                                                                                                                                                           |
| Harbor, OpenBao, the External Secrets Operator                             | upstream, by digest; never from Harbor                                                                                                                                                                                                                                                                         |
| Rancher Manager, and the webhook and Fleet charts it installs itself       | upstream: what the chart renders by digest; what Rancher installs from the charts bundled in its image, at the tags that image names (decision 14)                                                                                                                                                             |
| Website and request app, both environments                                 | the registry the fleet's release pins name today, with the pull Secret from OpenBao (R11)                                                                                                                                                                                                                      |
| WBS, both environments                                                     | Harbor (R28), pushed there by the builds on the CI cluster (R31)                                                                                                                                                                                                                                               |
| The WBS solver image, pulled by each app node's own Docker in `solver.yml` | the registry its reference names. The reference is an input of the play that no inventory here sets, and the role logs in nowhere and installs no CA. If it names Harbor, the host first needs Harbor's CA and a pull robot, from the `registry_client` role or what the Harbor change puts in its place (A17) |

**Documents that describe Flux as the only delivery path.** `docs/infra/platform.md`,
`README.md`, `recovery.md`, `fleet.md`, `local.md`, `registry.md`, `registry-consumers.md`,
`deployment.md`, `cutover-plan.md`, `otlp-mtls.md`, the three observability pages,
`docs/platform-map.md` and `docs/runbook-prod-deploy.md`. Slice 2.9 adds the new runbook; the
rest are rewritten when the old cluster is removed.

### 10. What must be settled before stage 1

The owner's answers of 2026-11-21 closed the questions that blocked the first stage. What is
left before A1:

| Item                                              | Why it blocks                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Task 0.5: the escrow check                        | guard 2; it has to precede h1claw's deletion as well                            |
| Task 0.6: the rules on the `main` refs            | A2 writes to the fleet repository and A4 makes `main` here the cluster's source |
| Task 0.7: the tailnet's settings and its policy   | every server joins it when it is created, A1 first (decision 12)                |
| A host for the rehearsal of slice 2.7             | see below                                                                       |
| The controller image, built on the laptop         | see below                                                                       |
| An owner for the fleet repository's new directory | A2 writes encrypted files there; R11 names the session, which has to agree      |

The escrow is not the only thing to settle before h1claw is deleted: if the owner wants
OpenClaw's state, that has to be copied first, which is a question of the change
`add-agent-hosts`.

The operator's laptop cannot host the rehearsal today: its disk is full and the labs need
about 60 GiB. The alternative is to run it on the first new server before that server becomes
the platform node: the k3d part on a server created as in A1, and the staged build as a
throwaway pass on that server and one temporary server. The throwaway pass uses secrets made
for it, an inventory that is not committed, and a scratch bucket, because the snapshot folder
is the cluster id. Both servers are then deleted. A1's receipt, and the first revision of
slice 1.3 that records it, are taken from the server created after that, so no machine id of a
deleted server reaches `main`. Whether the provider's servers offer `/dev/kvm` was not checked,
so the QEMU lab is not assumed there.

**The controller is the operator's laptop.** The new age identity, the admin key, the
jump key with its `ProxyJump` setting, and
`$OPS` are held and used there and nowhere else. They never go to h2puni, where the
controller runs today, to the CI cluster or to the shared operator host: on each of those,
code in a gate or an agent's session is or may become root, and it would then hold the
authority over the replacement platform. A workstation of its own, as the full profile of
`add-agent-hosts` defines it, may take the role if the owner moves it. The image that
mounts those keys is built by a **trusted builder**: the controller itself, from a clean
checkout of a named commit of `main`, with the locked BuildKit. A digest pin alone is not
provenance, since a pin of an image a compromised builder made preserves what it made. So
the lock's digest for the controller image is accepted only when the controller's own
build of that commit yields the same digest, which the image's reproducible build allows
(its `Containerfile` records two builds that came out equal); an image built anywhere
else, the provider's hosted runner included, is never run with the keys unless that
comparison holds. Until the laptop can build it, the keys are not mounted. In the access
policy the controller is one of the owner's own devices and needs no tag (decision 12).

Pull request #935 does not block A1 to A6. It blocks A7.

The rest can wait. The staging pins repository, its rulesets, its read key and its App are
due before A23, and A23 before A18's WBS part: without them the tracker's poller is not
retired, so they are on the path of stage 4, not of stage 1. This change has no open question
left. The CI server's size is decided (R50) and blocks nothing.

### 11. Placement profiles and growth steps

Decided by the owner on 2026-11-22 (R45, R46). One tree, one set of slices and steps, two
mappings of capability to server. The minimal profile is built; the full profile is what it
grows into, one split at a time, each when its trigger shows.

| Server            | Minimal profile carries                                                           | Size, both profiles unless a step says otherwise               |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| m1plat1           | control plane, platform services with Rancher, and `database` at first            | 8 vCPUs, 32 GB, 200 GB of disk: bought on 2026-11-22 (R2)      |
| h6apps            | Traefik and the production apps                                                   | 4 vCPUs, 8 GiB as a trial; 8 vCPUs, 16 GiB in the full profile |
| h7obs             | observability, MLflow, and `nonproduction` and `ingress` at first                 | at least 24 GiB; 16 vCPUs and 32 GiB assumed (R2, R50)         |
| h8ci              | gates and builds, on a cluster of its own                                         | 16 vCPUs, 32 GiB (R50)                                         |
| One operator host | OpenClaw and the owner's sessions, outside the cluster (change `add-agent-hosts`) | defined there                                                  |
| m2bast1           | the SSH bastion, outside every cluster (R55)                                      | 1 vCPU, 2 GB: bought on 2026-11-22                             |

**Names.** The owner's scheme of 2026-11-22 (R3) is `m`, the server's index at the
provider, its function and its index within that function. The plan's names for servers
not yet bought stay placeholders until each 1.3 revision records the real one; no manifest
names a server, so the change is in the inventory, `desired.yaml` and this text alone.

| Planned name | Real name                                   | State                                     |
| ------------ | ------------------------------------------- | ----------------------------------------- |
| `h5plat`     | `m1plat1`                                   | bought 2026-11-22                         |
| none         | `m2bast1`                                   | bought 2026-11-22; not in the plan before |
| `h6apps`     | the scheme's next index, function `apps`    | not yet bought                            |
| `h7obs`      | the scheme's next index, function `obs`     | not yet bought                            |
| `h8ci`       | the scheme's next index, function `ci`      | not yet bought                            |
| `h9stg`      | as above, at the full profile's growth step | not yet bought                            |

**What has to be true from the first day**, so that no step below changes a manifest. A
step still costs what its row says: a store moves by a backup and a restore with that app
stopped, or, if A29 shows that a volume re-attaches, with its volume (R9), and a rescale
stops everything on the server.

- every pod template selects a capability and none names a server (rule 2.4(f));
- staging and dev select `nonproduction`, production selects `product`, in the tree and at
  admission (slice 2.10), and no node carries both (rule 1.2);
- each environment has its own names, certificates, claims, store paths and backup prefix
  (R29), so a store moves by its own backup and restore;
- PostgreSQL instances select `database` and tolerate both taints they can meet (change
  `host-postgres`);
- a registered node's capability labels, and the host settings that follow from them,
  follow the inventory (slice 1.7);
- every claim is `Retain` with a verified backup under its own prefix (guard 3).

| Growth step                           | Trigger                                                                                                                                                                                                   | Procedure, in existing slices and steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Non-production to a server of its own | A14's sum does not hold (decision 2); the node's available memory falls under 1,024 MiB or a monitoring gap is traced to staging; the dev follow-up needs room or a solver; the first production user     | Create and join `h9stg` as A16 and A17 do for a node, with `nonproduction` and `ingress` in its 1.3 revision; `solver.yml` on it. Then, in this order, so that nothing re-created can land on h7obs while both nodes carry the label: stop every non-production app and `nonproduction-db` (zero replicas, jobs suspended); take each final backup and check it as guard 1 asks; delete their claims and the released volumes on h7obs; run slice 1.7's play, which takes `nonproduction` from h7obs once no pod but a DaemonSet's selects it there and no `Retain` volume of a non-production namespace is bound there; sync, so that each claim binds on `h9stg`, the only node that now carries the label; restore each store as A18 does; point the names at `h9stg`; then the play takes `ingress` from h7obs and re-applies its host settings. **Cost:** staging as a whole, the agents' tracker included, is down from the first stop to the last restore, and its names move |
| Database to a server of its own       | the change `host-postgres` names it: an instance that needs more than 3,072 MiB, below the 4,096 MiB the database server gives it, etcd latency that follows the database's load, or the first app's data | That change's steps for the database server; a replica and a switchover if the operator places one on a volume of the server's static class there, otherwise a restore; slice 1.7 then takes `database` from m1plat1. **Cost:** that change plans for the restore, with the ported apps' writers stopped for its length                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Observability to the next class       | A14's stop conditions, at any of its three readings; a pod killed for memory                                                                                                                              | The provider's rescale of memory and CPU with the disk kept, which stays reversible. **Cost:** the server is off for it, so monitoring is blind and staging, dev and the agents' tracker are down; R16's probe and a quiet hour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| CI to the next class                  | gates or builds wait on each other long enough that the owner says so                                                                                                                                     | The same rescale; the limits file of the CI change is then raised by hand. **Cost:** no gate and no staging build while the server is off. More nodes and a second provider are that change's phases 4 and 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Production apps to the full size      | the node's available memory under 1,024 MiB at rest, in a backup or in a solve; a pod killed for memory (decision 2); both are alerts                                                                     | The provider's rescale of memory and CPU with the disk kept. **Cost:** production is down while the server is off, so the owner picks the hour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A second apps node                    | an app that has been ported to PostgreSQL needs a second replica or more memory than the node has                                                                                                         | Create and join as A16 and A17 with `product` and, if it takes traffic, `ingress`. Not available to an app still on SQLite, whose claim is node-local, nor to the WBS backend while its solver supervisor is one per node. **Cost:** that app's port comes first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The operator host split in two        | the change `add-agent-hosts` names it                                                                                                                                                                     | That change's step for the second host                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Not a growth step of this kind: a second k3s server. The fleet model's `controlPlane: single`
and two-member etcd rule it out, and three servers are a change of their own.

What the minimal profile gives up is listed once, under Risks.

### 12. Private access

Decided by the owner on 2026-11-22 (R47); the bastion he set up that day is the one SSH
path, and the tailnet carries no SSH (R55). What was read in Tailscale's documentation that day, and what was not, is in
verify.md.

**What is reached only over it.**

| Reached                                                                                         | How                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSH to every server                                                                             | not over it: `sshd`, by operator key, through the bastion m2bast1 to the server's private address, and from nowhere else (R55)                                                                |
| The platform cluster's Kubernetes API                                                           | the server's tailnet address, with the admin kubeconfig; the server's certificate names include it. Before the tailnet is set up, `kubectl` on the server itself, reached through the bastion |
| The CI cluster's Kubernetes API                                                                 | the same for the operator; for a caller that acts by identity, the Tailscale operator's API server proxy (CI change, decision 2)                                                              |
| Argo CD, Argo Workflows, Harbor's interface and admin API, OpenBao, Grafana, Kibana, Prometheus | a ClusterIP Service that the Tailscale Kubernetes operator exposes to the tailnet under a name of its own. No Ingress of another class, no IngressRoute, no Service of type LoadBalancer      |
| Rancher                                                                                         | an Ingress of the Tailscale operator's class, in the `rancher` unit, which ends TLS with a certificate for its tailnet name (decision 14)                                                     |
| PostgreSQL administration                                                                       | `kubectl` through the API. No database Service leaves the cluster                                                                                                                             |

**What stays public.** Traefik, on a node that carries `ingress`, for the apps of each
environment: ports 80 and 443; and SSH on the bastion, port 22, by key only. Nothing else,
on any server. The CI cluster has no public
port (R51). Among the apps' own paths is the WBS backend's identity route under its API
prefix, which answers the boot commit and nothing else (decision 9); the commit is one of
this public repository.

**The data path between servers is not Tailscale.** Node to node, node to registry, a build
to Harbor and to object storage use the provider's private network, 10.10.1.0/24 for the new
servers. It is the faster path, and it does not depend on a coordination service. Tailscale
carries the operator's and the controller's interface and API traffic, the trigger job,
and later a link to a second provider; SSH goes through the bastion on the private
network. The private network's MTU is 1442. k3s's configuration names `node-ip`, the
server's private address (10.10.1.11 on m1plat1), and `flannel-iface`, the private
interface; both templates already take them as `puni_node_ip` and
`puni_private_interface`. Flannel derives its VXLAN MTU from that interface, 50 less, so
pods get 1392; A3 reads it back. A VXLAN on an interface that flannel did not detect would
fragment or drop large packets, which is why the interface is named and not guessed.

**Hosts (slice 1.8).** The `base` role installs Tailscale from the vendor's package
repository, at a version and a repository key locked in `infra/versions/toolchain.json`,
and joins the server with an auth key the owner makes for that one server: single-use,
tagged, and signed for Tailnet Lock. The key is an input in `$OPS`; it is never in a
repository and is spent by the join. Tags follow the trust class: `tag:platform`,
`tag:apps`, `tag:observability`, `tag:ci`, `tag:operator-host`; the bastion does not join
(R55). A device that is tagged when
it first authenticates has key expiry disabled by default, which is what a server needs;
the play reads it back. Login stays `sshd` with the operator's keys (R52), and arrives
only through the bastion (R55). Tailnet membership no longer guards a login; two keys do:
the jump key, which the bastion's `jump` user accepts, and the server's admin key, which
only the servers accept. A third key, the bastion's own admin key, opens a shell on the
bastion and nothing else. The three are distinct and escrowed apart, so neither of the
first two alone reaches a server; a stolen pair does, from anywhere (Risks).

**Firewall.** The fleet firewall (`roles/network/templates/k3s.nft.j2`) accepts by default
today and admits SSH from anywhere, under the comment "retain SSH recovery". For the
inventories of the new cluster and of the hosts outside it, a new input lists the public
ports a host may serve, and anything else that arrives on the public interface is dropped:
80 and 443 on a node that carries `ingress`, none elsewhere. The Kubernetes API is
admitted on the tailnet interface. SSH is admitted on the private interface from the
bastion's address (10.10.1.12) alone, and on no other interface. The cluster's own ports,
6443, 2379, 2380 and 10250 over TCP and 8472 over UDP, stay as the template writes them
today: from the set of enrolled private addresses alone, of which the bastion is never a
member. 8472 is VXLAN with no authentication, so a member of that set can inject pod
traffic; the bastion, which has public SSH, is kept out of it, and so is any host that is
not a node. Those rules sit in the input hook, which sees only traffic for the host
itself. Traffic for a pod address, a ClusterIP or a NodePort is forwarded or rewritten
before it, so a host on 10.10.1.0/24 that routes the cluster CIDR or the service CIDR via
a node's private address would reach pods and Services past every input rule; and the
input chain's policy stays accept, so a port it does not name (the node exporter's,
Traefik's 80 and 443 on a node that carries `ingress`, Tailscale's UDP port) answers any
private address. So for the new inventories two more rules sit in the prerouting hook,
before destination NAT, beside the public drop of slice 1.8: from the bastion's address on
the private interface, everything is dropped but TCP 22 to the host's own address; and
from any private address that is not an enrolled node, traffic to the cluster CIDR, to the
service CIDR or to a NodePort is dropped, except the two named exceptions, the
`otel-gateway` NodePorts for the CI server and the store's private listener (decision 9).
Then all the bastion can reach on a server is `sshd`, and a host that is not a node reaches
no pod and no Service. The chain is stateful. It sits at priority −150, after connection
tracking (−200) and before destination NAT (−100), accepts `ct state established,related`
first, drops `ct state invalid` next, and its other drops match new connections only, the
public drop of slice 1.8 included; they are not widened to all traffic, because IPv6
neighbour discovery on the public interface is not tracked:
otherwise the replies to a server's own outbound connections, which arrive on the public
interface, and the replies from the bastion to a connection a server opened, would be
dropped as well. Tailscale's own UDP port
stays open so that connections are direct and not relayed. The existing inventories keep
today's behaviour by default, so no old host changes. The bastion has a group of its own
(slice 1.9): its firewall admits SSH on the public interface, new connections limited
per source address, nothing else inbound but SSH on the private interface from the
observability node's address alone, so that R16's probe has a target, and sends anything
out. That address admits more than the prober: traffic that a pod on that node sends off
the cluster is masqueraded to it, and in the minimal profile staging and dev run there. So
the planning session's choice, recorded for the owner to overrule: every non-production
namespace's default-deny NetworkPolicy of slice 2.10 covers egress, and no egress allow
of the `policy` unit or of an overlay may cover 10.10.1.12, the address in the inventory's
`bastion` group, which the `delivery` check holds (rule 2.4(k): an egress rule with no
`to`, or an `ipBlock` that contains the address without excepting it, covers it); a NetworkPolicy from the pins repository is bounded only as the
Risks entry on it says; a host-network prober was the alternative and would not help, since
the masqueraded pods share its address. What a pod would still reach there is a TCP
handshake with `sshd`, which wants the jump key. In front of every server the provider's panel firewall refuses, once
it is attached, any outbound traffic it does not allow, so each server's rule set there
allows outbound explicitly; package mirrors, registries, the object store and the
tailnet's coordination service are reached that way. m1plat1 has no host firewall until
slice 1.8 lands; A26 closes that window, and until then the panel firewall, with no public
SSH, is its only filter.

**Clusters.** A unit `tailscale-operator` in each cluster, from the vendor's chart, locked
like the others. Its OAuth client is a bootstrap Secret (decision 5), because the operator
is needed before OpenBao serves. It exposes the Services named above, each under a tailnet
name with a certificate. Turning that feature on publishes machine names and the tailnet's
DNS name in the public certificate ledger, so the names are plain (`argocd`, `registry`),
and the tailnet's name is never written in this repository. On the CI cluster the operator
also runs the API server proxy in its `auth` mode: a caller is impersonated as its tailnet
identity, a tagged device with its tags as Kubernetes groups, and plain RBAC decides what it
may do.

**One policy file.** `infra/access/policy.hujson`, in this repository, names tags and the
service's built-in groups only; no person is named, because the repository is public. Its
grants are rows:

| Who                                     | May reach                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| the tailnet's admins, who are the owner | the two clusters' Kubernetes APIs and every exposed Service; no server's SSH |
| `tag:ci-trigger`                        | the CI cluster's API server proxy, and nothing else                          |
| `tag:operator-host`                     | the CI cluster's API server proxy, so that a session can start a gate        |
| each cluster's Kubernetes operator tag  | nothing; it owns the proxy devices it creates                                |
| the proxies' tag                        | nothing outbound; each is reached as the rows above allow                    |
| every server tag                        | nothing over the tailnet                                                     |

It is applied by a named step (task 0.7) through the vendor's API, with a credential that
may write the policy and nothing else. A test in this repository parses the file and
asserts, for each tag, that what it may reach is exactly its row.

**Tailnet Lock** is on (R52): a device joins only when a device the owner trusts has signed
it, so the coordination service alone cannot add one. For a server that means the owner
signs its auth key from his own device when he creates the server: one more action in A1,
A9, A12, A16 and for each host of `add-agent-hosts`. The disablement secret goes to escrow.
The lock has two signing devices of the owner's, so that losing one does not stop every
later join (task 0.7).

**Devices the operator makes.** The Kubernetes operator creates one device for each Service
it exposes and one for the API server proxy, with keys it mints itself, and under Tailnet
Lock each needs a signature. So every step that syncs a unit exposing a Service has one
more action of the owner's, signing that device, and its receipt; recreating a proxy is in
the rehearsal list, with what it then needed. Whether a proxy keeps its identity across a
restart, and so needs signing once, was not found in the documentation. If signing these
devices proves unworkable, the lock is not relaxed for them. The fallback is not to use the
operator for those exposures: each interface is served from the host's own, already signed
device (`tailscale serve` on the node, to the Service's cluster address), and the CI
trigger then reaches the CI server's API on its tailnet address with a ServiceAccount token
scoped as its Role is. That fallback costs the identity mapping of the proxy and a stored
token, and is the owner's to choose at that point.

**Paths that are not the tailnet.** Argo CD on the platform node reaches the CI cluster's
API on the CI server's private address, which that server's firewall admits from the
platform node only, with the token of the cluster Secret. The CI cluster's External Secrets
Operator reaches the store on the private listener pull request #935 defines, admitted from
the CI server's private address only and authenticated by that cluster's JWT mount. Neither
depends on the coordination service.

**The controller** (R17) is a device of the owner's on the tailnet, for the clusters' APIs.
It reaches each server over SSH through the bastion alone, with a `ProxyJump` as the `jump`
user. The bastion's own address for that is an input in `$OPS`, as `ansible_host`, never in
this repository. The bastion is not the platform node, so the restore drill
that powers the platform node off (A6) loses no path, and its temporary server is added to
the bastion's `PermitOpen` like any other (slice 1.9).

**Break-glass (R49).** No server but the bastion has a public SSH rule. When the tailnet
cannot be used, because the coordination service or the identity provider is down or a
device is locked out, SSH through the bastion still works, since it depends on neither,
and `kubectl` runs on the server itself; what is lost for the time is every tailnet name.
When the bastion cannot be used, the way in is the provider's console: a login on the
server's own console as a local account that `sshd` refuses and whose password is in
escrow, and from there a repair of the path through the bastion (its `sshd`, its firewall,
or the server's rule for the bastion's address), or a repair of Tailscale. The bastion has
a console account of its own in the same way. With the console the operator can still
reach the cluster's API on the server itself and restore etcd as recovery describes. A public rule
scoped to an address was weighed: the operator's address changes, so the rule would either
be wide or wrong on the day it is needed; the bastion takes that place with one host that
runs nothing else. A24 tests both paths once, on the platform node.

**Tenants, later.** The model: a tenant is a group, its services carry a tag, and a grant
gives the group its own services; the API server proxy maps a person to Kubernetes groups,
and RBAC confines them to the tenant's namespaces; a client who needs one thing is given
that one device or Service by sharing; a client who needs hard isolation gets a tailnet of
its own. Only the owner's access is built. This is operator access. It is not how clients
reach anything: client-facing pages stay public, behind Traefik, with their own login.

**Not used.** Funnel, which publishes a device's port through the vendor's relays; subnet
routers; exit nodes; Tailscale SSH.

### 13. Tenancy and the orchestration contract

Decided by the owner on 2026-11-22 (R48). One rule: every platform service names its tenant
boundary and the interface through which the `puni-user-platform` drives it. Only the
tenant `puni` is built, and it is built in the form any later tenant takes.

| Service                     | A tenant is                                                             | Driven through                                | Built now                                                                        | Held by                           |
| --------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| Apps and environments       | an AppProject per environment, with its namespaces                      | manifests in Git; Argo CD's API for a sync    | `puni`: the projects `stag` and `prod`                                           | rules 2.4(a) and (b)              |
| CI                          | two namespaces and a quota on the CI cluster                            | submissions through the CI cluster's API; Git | `puni` (CI change, decision 4)                                                   | that change's rules               |
| Registry                    | a Harbor project with its quota, retention and robots                   | Harbor's API                                  | the Harbor change's projects are `puni`'s; its amendment is listed in decision 9 | the Harbor change                 |
| Secrets                     | a path prefix and a policy in OpenBao; a SecretStore per namespace      | OpenBao's API                                 | `puni`'s paths, per environment                                                  | pull request #935, a precondition |
| Database                    | a database and its owner role; a cluster of its own for a large tenant  | CloudNativePG resources in Git                | change `host-postgres`                                                           | that change's rules               |
| Observability               | a `tenant` label on metrics and logs; an index pattern per tenant       | queries                                       | the label                                                                        | rule 2.4(r)                       |
| Network and placement       | NetworkPolicy, ResourceQuota and LimitRange per namespace; a capability | Git                                           | every app namespace (slice 2.10)                                                 | slice 2.10, rule 2.4(f)           |
| Private access              | a group and its grants; a tag on the tenant's services                  | the policy file; the vendor's API             | the owner only                                                                   | the policy test of slice 1.8      |
| Cluster interface (Rancher) | none: one local administrator, the owner                                | not driven by the platform                    | the owner's login only                                                           | decision 14                       |

**One tenant label.** Every namespace of an app, a CI tenant or a database unit carries
`puni.dev/tenant`, and a tenant-scoped object is named from its tenant, environment and
app. Today the namespaces carry Pod Security labels and `puni.dev/trusted-hostpath` and no
tenant (`infra/platform/policy/namespaces.yaml`), and the WBS namespaces keep their names,
because renaming them is a non-goal; `puni`'s existing names are therefore listed once, in
the unit that holds the label, as the exception. Rule 2.4(r) refuses a namespace of the
`stag`, `prod`, CI or database units that has no tenant label, and an object in
such a namespace that carries another tenant's. That rule holds the label on namespaces
and objects; that a series or a log line carries it is not checked by anything in this
change, and the observability row is marked accordingly.

**What is not isolated.**

- Prometheus has no tenancy. A view per tenant is a query by label, not access control.
- Elasticsearch can hold a tenant's logs in indices of its own; finer isolation is not
  planned.
- A point-in-time restore of a PostgreSQL cluster rewinds every tenant in it, which is why a
  large tenant gets a cluster of its own (change `host-postgres`).
- There is one Argo CD, whose controller acts with cluster-wide rights, one Rancher, whose
  administrator is cluster-wide too, one Harbor, one
  OpenBao and one control plane.
- A tenant cannot install anything cluster-scoped: no custom resource definition, cluster
  role or admission policy.

**The isolation level, stated.** Namespaces are soft isolation: tenants share the kernel,
the nodes and the control plane. That is accepted for `puni` and for a tenant trusted as
PUNI is. Code that is not trusted needs nodes or a cluster of its own. The Dagger engine is
privileged, so tenant CI needs nodes per tenant or a server per job, which are phases 4 and
5 of the CI change.

**The platform as driver.** Once the `puni-user-platform` drives these interfaces it is the
most valuable target of the setup, and it runs on the public apps node as one replica on
SQLite. Two consequences bind the follow-ups:

- the adapter holds one narrow credential per service, issued by OpenBao and scoped to a
  tenant, and never a broad one in the platform's database;
- Git with a manual Argo CD sync stays the path that never depends on the platform. The
  platform cannot deploy its own fix, so every platform and production unit keeps that path
  (R20).

**Follow-ups, with this table as their contract.** `onboard-tenant`: creating a client end to
end from the platform. `connect-platform-adapter`: the adapter, which is what is left of
Dash. Neither is designed here. With `add-dev-environment`, which also takes an environment
per pull request, and the CI change's phases 2 to 5, they are what this plan leaves open.

### 14. Rancher Manager

Decided by the owner on 2026-11-22 (R54). Checked against chart v2.15.3 and the Rancher,
webhook (v0.11.4) and Fleet (v0.16.3) sources it bundles, read that day;
[verify.md](verify.md#rancher-and-the-servers-that-exist-2026-11-22) lists what was read
and what was not.

**What it is for, and what it is not.** Rancher Manager runs in the platform cluster, which
is Rancher's "local" cluster: an interface for the cluster's nodes, workloads, events and
logs. It deploys nothing. Argo CD stays the only delivery path. Rancher's Apps catalogue
and its continuous-delivery pages are not used, and no other cluster is registered with
it in this change; importing the CI cluster would be a change of its own.

**Version, and the rule for a k3s bump.** The chart and the image are v2.15.3, the newest
release on 2026-11-22. SUSE's support matrix for v2.15.3 lists k3s v1.34 to v1.36 for a
cluster that hosts Rancher Manager; the one for v2.14.7 stops at v1.35. The pinned k3s
v1.36.4+k3s1 therefore needs a 2.15 release; the matrix names minors, not patch builds.
The chart itself declares `kubeVersion: < 1.37.0-0`, which the toolchain test checks by
rendering with `helm template --kube-version` set to the k3s pin. The lock entry
`charts.rancher` in `infra/versions/toolchain.json` follows the other chart entries:
version, URL, SHA-256 and the images the chart renders, by digest; and it adds the k3s
minors the matrix certifies for that version, with the page and the date it was read. **A
k3s minor bump needs a Rancher version whose matrix certifies the new minor, locked in the
same pull request or an earlier one**, and the toolchain check refuses a k3s pin whose
minor the Rancher lock does not list (slice 2.11). Before each Rancher minor upgrade the
operator reads Rancher's upgrade page for the path it allows; that a minor may not be
skipped is from memory. Rancher itself never upgrades k3s here:
`CATTLE_IMPORTED_CLUSTER_VERSION_MANAGEMENT=false` turns its version management off, and
with it the system-upgrade-controller chart is not installed on the local cluster
(`pkg/controllers/dashboard/systemcharts`), and health fails on any
`plans.upgrade.cattle.io` object and on a node whose kubelet version is not the pin.

**Delivery.** A kustomize unit, `infra/argocd/units/rancher`, that inflates the locked
archive, as the Velero unit does (`kustomize.buildOptions: --enable-helm`), with
`releaseName: rancher` in `cattle-system`, a namespace of the `namespaces` unit; order 7,
synced on command by the operator (decision 3). A plain wrapper chart is not enough,
because the chart renders objects that its values cannot place or remove:

- the pre-upgrade hook: a Job, its ConfigMap, ServiceAccount, ClusterRole and binding,
  rendered on every render with no toleration, selector or affinity. Argo CD runs a Helm
  `pre-upgrade` hook as `PreSync` on every sync, so on a tainted server alone its pod would
  stay Pending and the sync would never finish, and it fails rule 2.4(f). Its script only
  looks for RKE1 clusters, which this cluster never has. The unit deletes the five objects;
  patching them with the toleration and selector was the alternative, and keeps a check
  that cannot find anything here;
- the PriorityClass `rancher-critical` at 1,000,000,000, which would let Rancher's pods
  preempt the secret store. The unit deletes it and names `puni-platform-interface`
  instead, a class of the `policy` unit whose value, −10, lies below the default 0 that
  OpenBao and `platform-db` run at, so that under memory pressure Rancher goes first;
- the ConfigMap `rancher-config`, through which Rancher hands values to the charts it
  installs itself, needs nothing added: the chart's keys for `rancher-webhook` and `fleet` are the
  only two that matter here. The remote dialer proxy is never installed, because the
  chart sets `IMPERATIVE_API_DIRECT="true"` (`templates/deployment.yaml`) and Rancher runs
  it only when that variable is not "true" (`pkg/ext/rdp.go`); the system-upgrade-
  controller is not installed while version management is off (below). Rule 2.4(y)
  refuses a render whose `IMPERATIVE_API_DIRECT` is not "true".

Values:

- `replicas: 1`;
- `networkExposure.type: none` and `ingress.enabled: false`, and one Ingress of the
  Tailscale operator's class added by the unit, which ends TLS with a certificate for the
  tailnet name and sends plain HTTP to the Service's port 80 (decision 12). So
  `tls: external` is right: Rancher serves no TLS of its own, the chart renders no
  cert-manager Issuer, and no cert-manager is needed for it, a second one least of all;
- `useBundledSystemChart: true`, so the charts Rancher installs itself come from its image
  rather than from a chart repository at run time; what each of those charts pulls is
  still fetched, by tag;
- `features: continuous-delivery=false,turtles=false`: Fleet's GitOps controllers are not
  run, so a `GitRepo` is prevented rather than only found; Turtles, Rancher's Cluster API
  integration, is not installed. Rancher warns at start that without Turtles cluster
  provisioning will not work (`pkg/rancher/rancher.go`); this plan provisions no cluster
  through Rancher, and importing the CI cluster later means turning Turtles back on;
- `extraEnv`: `CATTLE_BOOTSTRAP_PASSWORD` from the Secret `bootstrap-secret` by
  `secretKeyRef`; `CATTLE_IMPORTED_CLUSTER_VERSION_MANAGEMENT=false`;
  `CATTLE_AUTH_TOKEN_MAX_TTL_MINUTES=720`,
  `CATTLE_KUBECONFIG_DEFAULT_TOKEN_TTL_MINUTES=720`,
  `CATTLE_AUTH_USER_SESSION_TTL_MINUTES=720` and
  `CATTLE_AUTH_USER_SESSION_IDLE_TTL_MINUTES=60`, so every API key, every kubeconfig and
  every login session Rancher issues expires within 12 hours, and a session left idle
  for an hour ends (the idle figure is the planning session's, for the owner to
  overrule);
  `CATTLE_FLEET_AGENT_DEFAULT_AFFINITY` (below) (its settings read `CATTLE_` and the setting's
  name from the environment, `pkg/settings`). No tool of this plan uses a Rancher token:
  `kubectl` uses the cluster's admin kubeconfig;
- `extraTolerations` for `CriticalAddonsOnly=true:NoSchedule` (R25) and
  `extraNodeSelectorTerms` for the `platform-services` capability, a memory limit, and
  `priorityClassName: puni-platform-interface`; the same placement and class handed to the
  webhook and Fleet through the `webhook` and `fleet` values;
- `postDelete.enabled: false`, so removing the unit follows the procedure below and no hook
  Job deletes what Rancher made;
- no `hostname`: the server URL is set at the first login to the tailnet name, which is
  never written in this repository.

**Bootstrap password.** Rancher reads the Secret `bootstrap-secret` in its namespace first
and uses its key `bootstrapPassword` when it is there; only without it does it take
`CATTLE_BOOTSTRAP_PASSWORD` or generate one, and it then writes the Secret itself
(`pkg/data/management/bootstrap_password.go`). The chart renders that Secret only when the
value `bootstrapPassword` is set; the value is left empty, so the render holds no Secret
(rule 2.4(d)). An ExternalSecret of `secret-sync` writes `bootstrap-secret` from OpenBao
(decision 5), and the variable's `secretKeyRef` keeps the pod from starting until it
exists, so Rancher never writes a generated password first. That ExternalSecret and its
SecretStore are merged in the revision A27 merges, after A7 has synced `secret-sync`, and
not before. At the first login the owner sets the administrator's password, which goes to
escrow; the bootstrap value is then spent. The local administrator is Rancher's one
account, and no authentication provider is configured.

**Fleet, and one deploy path.** Rancher installs Fleet, and since 2.6 it cannot be removed.
With `continuous-delivery` off its GitOps part does not run. The `delivery` check refuses
any object of the `fleet.cattle.io` group in the tree (rule 2.4(x)), and
`tool-fleet:health` fails on a `GitRepo` or a `HelmOp` in the cluster, on a `Bundle` that
is not one of Rancher's own, and on a Helm release that is not one of Rancher's own: Argo
CD renders charts and leaves no Helm release, so any other release was installed through
Rancher's Apps or by hand. A27 reads Rancher's own bundles and releases, and those lists
are kept beside the check.

**What Rancher starts itself is outside the tree.** The webhook, Fleet's controller, the
local cluster's Fleet agent, the pods of a Helm operation that
installs one of those charts, and a shell pod for each browser shell. None of them is
rendered by Argo CD, so rule 2.4(f) and the namespace rules of decision 3 do not see them,
and the admission policies of slice 2.10, which key on the environment label, do not bind
them. What places them:

- the `webhook` and `fleet` values, above;
- the local Fleet agent: its tolerations are the control-plane node's taints, which
  Rancher adds for the local cluster (`fleetcluster.go` under
  `pkg/controllers/provisioningv2`), so it tolerates `CriticalAddonsOnly` on m1plat1; its affinity is the
  setting `fleet-agent-default-affinity` unless a cluster object overrides it
  (`pkg/cluster/agent_customization.go`), and the unit sets that setting through
  `CATTLE_FLEET_AGENT_DEFAULT_AFFINITY` to the `platform-services` capability, so no
  object of Rancher's is edited by hand;
- a Helm operation's pod: Rancher sets `AutomaticCPTolerations` for every system chart and
  adds the control-plane nodes' taints as tolerations
  (`pkg/catalogv2/system/system.go`, `pkg/catalogv2/helmop/operation.go`), so on m1plat1 it
  tolerates `CriticalAddonsOnly`; its node selector comes from the namespace (below);
- the shell pod: it tolerates a fixed list that does not hold `CriticalAddonsOnly`
  (`pkg/api/steve/clusters/shell.go`) and would run with the administrator's rights.
  Decided by the planning session: the browser shell is not used; the operator uses
  `kubectl` from the laptop. It is refused, not only found: an admission policy of the
  `policy` unit denies a pod in `cattle-system` whose `metadata.name` or
  `metadata.generateName` begins `dashboard-shell-`, the prefix Rancher generates; the
  policy matches both, because at admission a generated name may not be set yet.

**Placement forced at admission.** A pod's tolerations decide where it may run, not where
it must. So the API server's `PodNodeSelector` admission plugin is enabled through the
k3s server's configuration, on a server that carries `platform-services` only, as its
taint is (slice 1.2, before A3, so that it needs no restart later). k3s sets
`enable-admission-plugins=NodeRestriction` itself (`pkg/daemons/control/server.go`); a
plain `kube-apiserver-arg` for the same flag replaces that default, and the form
`enable-admission-plugins+=PodNodeSelector` appends to it (`pkg/util/args.go`, read at
the k3s source the reviewer fetched), so the template writes the `+=` form and the API
server receives the flag twice, which accumulates: `--enable-admission-plugins` is a string
slice (`k8s_apiserver_opts.go`), and `PodNodeSelector` is still registered among the
plugins in v1.36.0 (`k8s_plugins.go`), both read in the Kubernetes source the reviewer
fetched; A27 reads the running arguments. Each namespace in which Rancher runs pods,
`cattle-system`, `cattle-fleet-system` and `cattle-fleet-local-system`, is created by the
`namespaces` unit with the annotation `scheduler.alpha.kubernetes.io/node-selector` set to
the `platform-services` capability. The plugin merges that selector into every pod of the
namespace and refuses a pod whose own selector gives the same key another value
(Kubernetes' admission-controllers page, read 2026-11-22; alpha since v1.5, disabled by
default, no deprecation). A pod that selects a different key is not refused: it is
admitted with the namespace's selector added, so it can be scheduled only where both
match, which is never off the platform node. If k3s v1.36 does not take the flag, the
fallback is a `MutatingAdmissionPolicy` of the `policy` unit that sets the same selector:
`admissionregistration.k8s.io/v1`, stable and enabled by default since v1.36, with no
`runtime-config` flag (Kubernetes' mutating admission policy page, read 2026-11-22). A namespace Rancher makes that is not in
that list is not bound.

What checks all of it is `tool-fleet:health`: any pod in a `cattle-` namespace or in a
namespace Rancher made that runs on a node other than the platform node fails, and an alert
from kube-state-metrics fires for a pod with one of those namespace prefixes on another
node. While m1plat1 is the only node that reading cannot fail, so it is read again after
A13 and A17, when the first other nodes join, and the rehearsal runs with a second,
untainted node.

**The webhook is a fail-closed dependency.** `rancher-webhook` registers validating
webhooks with the failure policy `Fail`, among them creates and updates of Namespace
objects outside `kube-system` (the webhook's namespace validator). While its pod is down a
sync of `namespaces` fails, and so does any unit that creates a namespace. Decision 3's
order notes say so. An alert fires when the webhook has no ready pod for ten minutes
(slice 2.11), and the runbook of slice 2.9 says what to do: delete the
`ValidatingWebhookConfiguration` and `MutatingWebhookConfiguration` objects named
`rancher.cattle.io`, which Rancher recreates when the webhook returns.

**Removal.** Reducing the unit to its marker (decision 3) removes Rancher's workloads and
leaves what Rancher made at run time: the webhook configurations, which would then refuse
namespace writes for good; the `APIService` `v1.ext.cattle.io`, whose loss of a backend
makes API discovery report an error; the namespaces Rancher made; its custom resource
definitions; and objects whose finalizers only Rancher removes. So the order is fixed: the
webhook configurations and the `APIService` are deleted first, right after the workloads
go; then the remaining Rancher-made objects are listed, and those that hold a Rancher
finalizer have it removed by hand; then the namespaces and the custom resource definitions
go. Rancher's own clean-up tool is read before it is used and is not relied on.

**Budget.** 4,096 MiB for all of the above, assumed (R54): 3,072 for the server and 1,024
for the webhook, Fleet's controller and agent and the rest. It is a sum of limits only for
the pods whose charts take values; the others run without a limit and are counted at
what A28 measures. A rolling update of the server briefly runs a second server pod, which
the 15,738 MiB margin of decision 2 covers. A28 measures them as A8 measures Argo CD.

**Tenancy** (decision 13). Rancher is not a tenant boundary here: it has one administrator,
the owner, and the `puni-user-platform` does not drive it.

## Decision records (become ADRs at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so the three texts stay here. Task 0.2 files them. The record for PostgreSQL hosting is in the
change `host-postgres`, and the one for the agents' hosts in `add-agent-hosts`.

> # Each fleet host has one trust class, on a cluster rebuilt from source
>
> One host was the k3s server, the public edge, the product node, the registry host and a gate
> host. A gate reserves its whole host and Harbor did not fit beside it, and the secret store
> would have sat next to the internet-facing ingress. On 2026-11-21 the owner decided that each
> host is reserved for one kind of work (platform services, continuous integration,
> observability, or production apps) and that the cluster is recreated on new servers. Later
> that day he added a fifth kind, non-production, for staging and dev as two environments.
> Three more kinds, database, agents and workstation, are recorded by the changes that define
> them. On 2026-11-22 he asked for the smallest setup that can grow: a host holds one trust
> class, workloads are placed by capability, and two profiles map capabilities to servers. The
> minimal one, built first, puts the production database on the platform node and the
> non-production environments on the observability node; the full one gives each kind its own
> server.
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
> - Staging on the production apps node, which the owner chose first. The WBS solver's host
>   supervisor would have to be reworked for two instances on one Docker daemon, and a fault in
>   that rework would end production solves.
>
> ## Consequences
>
> The control plane never moves: it starts on the platform node. Every store crosses by a
> restore, which is also the first full test of those restores. With no production users the
> switch is allowed to be unsafe; that licence ends with the first user. Each role is still one
> host: losing it stops that role until it is rebuilt. In the minimal profile a host carries
> more than one kind, so its loss stops each of them, and a later split is a new server and a
> moved label only while every workload keeps selecting a capability.

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
> - A cluster interface beside Argo CD: on 2026-11-22 the owner chose Rancher Manager, which
>   deploys nothing here, over Headlamp, lighter and without a second GitOps engine, and
>   over no interface beyond Argo CD's.
> - Argo Workflows for continuous integration, which the owner considered on 2026-11-21 and did
>   not take then. On 2026-11-22 he chose it, on a cluster of its own; the change
>   `run-ci-on-argo-workflows` holds that record.
>
> ## Consequences
>
> The delivery tooling is written twice: the stage checks, the bootstrap play, the health and
> recovery tools and the lab profile each gain an Argo CD counterpart, and the fleet repository
> needs one too. Workers clusters and the existing labs stay on Flux until they move to the
> repository `puni-01` (decided 2026-11-24), so this repository carries both tools until then. Charts are rendered, not installed, so install hooks follow
> sync phases and generated values must be supplied. No key that decrypts repository files
> enters the cluster. Argo CD adds an API and an interface with cluster-wide reach; it is kept
> off the public edge, and its one account can sync production apps and nothing else. Staging
> follows `main`, production and the platform change on command, and the rules that guard
> `main` are the administrative boundary of the cluster. Staging follows `main` through a
> build that commits rendered manifests to a repository of its own; until that build runs,
> staging follows nothing by itself, and the poller that does it today is kept.

> # Platform services are reached over a private network and built per tenant
>
> ## Status
>
> Proposed, 2026-11-22.
>
> ## Context
>
> The tools that run the platform were to be reached through SSH tunnels and a jump host,
> with SSH open to the internet on every server. The owner wants them off the internet, and
> wants everything the platform runs to be multitenant and drivable by the
> `puni-user-platform`.
>
> ## Decision
>
> The operator reaches every platform service and both clusters' APIs over Tailscale; no
> platform service has a public route. SSH to every server passes one bastion, the only
> server with a public SSH rule, which forwards port 22 and holds no key; the tailnet
> carries no SSH (amended 2026-11-22). Every platform service
> names its tenant boundary and the interface the `puni-user-platform` drives it through,
> and one tenant is built in that form.
>
> ## Alternatives
>
> - Public names with a login for each tool. Simple to reach, and a login page on the
>   internet for tools that hold the cluster's keys.
> - Tunnels and a jump host for everything, without a vendor. SSH public on the jump alone,
>   as now, and one forward per interface with no names or certificates.
> - SSH over the tailnet as well as through the bastion. Two SSH paths, and a login that
>   rests on tailnet membership and one key.
> - Headscale, a self-hosted coordination server. No vendor's service to trust, one more
>   service to run, and fewer features. It is the exit if the vendor has to go.
> - Tenancy designed when the first client arrives. Less work now, and names, labels and
>   credentials retrofitted across every service then.
>
> ## Consequences
>
> Access depends on a vendor's coordination service and on the owner's identity provider;
> the fallbacks are the bastion and then the provider's console. Tenancy is soft: shared kernel, nodes and control
> plane, which fits trusted tenants only. The `puni-user-platform` becomes the most valuable
> target once it holds credentials for these services, so its adapter is given narrow ones
> and Git with a manual sync stays independent of it.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving.
- **Production on one node, non-production on another.** Losing the production apps node
  stops production and loses up to an hour of SQLite; losing the node that carries
  `nonproduction` stops staging and the agents' tracker. Staging and production still share
  the control plane, the secret store and the registry.
- **What the minimal profile gives up** (R45, decision 11).
  - _Staging and dev can disturb monitoring, and the reverse._ They share h7obs's memory,
    CPU and disk. On 32 GiB they fit on the declared requests and on the stack's limits
    (decision 2), on figures that are not measured; A14 measures, three times, and losing that node stops
    monitoring, staging and the agents' tracker at once.
  - _Staging shares a node with production's telemetry and with carried keys._ h7obs holds
    production's logs and metrics, and the object storage keys of the stack's snapshots, of
    Velero's node agent and of MLflow's backup. A pod that breaks out of a staging
    container reaches them. What bounds it: `restricted` Pod Security and the kind
    allow-list on every non-production namespace (slice 2.10), default-deny NetworkPolicy,
    and store paths per environment (R29); nothing bounds a kernel escape. It ends with
    the non-production server.
  - _The production database and the control plane share a node and a disk._ A database
    that fills the disk or saturates it can slow etcd, and the reverse. The guards are the
    instance's memory limit, a claim on a bounded filesystem, the disk and WAL-archive
    alerts of the change `host-postgres`, and a restore drill that runs there only by hand.
    The bounded filesystem is a volume of its own (R9), whose separation of I/O from etcd's
    disk A29 does not measure; on R9's fallback it is a loop device on the root filesystem,
    which bounds space and not I/O. The k3s server template does not expose etcd's metrics today; slice 1.2 adds
    the option, and until a rule reads them the trigger is read from the server's log.
  - _Gates are slow_: one at a time on one CI node, and a build waits behind one until
    measurement allows otherwise.
  - _The production apps node has no margin on paper_ at 8 GiB (decision 2). The trial ends
    at the first of its triggers, by a rescale that stops production for its duration.
  - _OpenClaw's agents and the operator's credentials share a host_ (change
    `add-agent-hosts`).
  - _A growth step changes no manifest only while the first-day rules hold._ One workload
    that names a server, or one store without its own backup, turns a split into a
    migration. Even then a step is not free: decision 11 gives each one's downtime.
- **Dev is not delivered by this change** (R34). The owner asked for two environments; this
  change builds staging and leaves dev sized and contained. Once dev runs it shares the
  node's CPU and disk with the tracker, and it gets no solver until the follow-up closes the
  socket and sweep problems of decision 1.
- **Containment at admission is new and unproven.** The placement and name policies of
  slice 2.10 have never run; a NetworkPolicy's peers are not bounded at admission at all.
- **Monitoring on one node.** It cannot report its own loss; R16 covers only liveness.
- **Rancher's administrator is cluster-admin with a web interface** (R54, decision 14). It
  can change any object and install a chart, which is a second write path beside the one
  Argo CD account and break-glass `kubectl`. What bounds it: one login, the owner's, with
  its password in escrow; no public route; tokens that expire within 12 hours; its edits
  are drift that Argo CD reports (decision 3); and health fails on a `GitRepo`, a `HelmOp`,
  a foreign `Bundle` or a Helm release that Rancher did not install for itself. A stolen
  session owns the cluster, the secret store with it.
- **Fleet is a second GitOps engine that cannot be removed.** Its GitOps part is switched
  off (`continuous-delivery=false`), rule 2.4(x) keeps its objects out of the tree, and
  health finds one made by hand; a feature flag set back on in the interface is found by
  health afterwards, not refused.
- **Rancher's webhook is fail-closed for Namespace writes** (decision 14). While it is
  down, no namespace can be created or updated, so a sync of `namespaces` fails; an alert
  and a runbook step cover it, and removing Rancher has a fixed order so that its webhook
  configurations and `APIService` do not outlive it.
- **Rancher ties the k3s version to its support matrix.** A k3s minor bump waits for a
  Rancher release that certifies it, and Rancher upgrades by its own path; the toolchain
  check holds the pair (slice 2.11).
- **What Rancher starts itself is outside the tree**: the webhook, Fleet, the local Fleet
  agent and Helm operation pods, with their namespaces and images by tag. Placement is
  forced at admission in the three namespaces Rancher runs pods in, and checked by health
  and an alert; health cannot fail while m1plat1 is the only node and is read again after
  A13 and A17. `PodNodeSelector` is an alpha plugin. The shell is refused at admission.
- **The bastion is the one public SSH port and the path to every server** (R55). It admits
  keys only; its `jump` user has no shell and may forward to each server's port 22 alone;
  the operator's own login there, with a shell and `sudo`, is on the same public port, by
  a key of its own. On the private interface a server admits from the bastion's address
  TCP 22 and nothing else, so taking the bastion over gives a place to try SSH from and no
  path to the kubelet, etcd or VXLAN. Its loss leaves the console. It is probed from
  outside like every node (R16).
- **A key pair alone now admits.** Before R55 a login needed tailnet membership and a key.
  Now it needs the jump key and a server's admin key, from anywhere on the internet. The two
  are distinct from each other and from the bastion's own admin key, escrowed apart, and
  the bastion's `sshd` refuses passwords, but a laptop that holds both is enough.
- **The bastion's public port can be flooded.** New connections are limited per source
  address, which slows one address and not many. A flood from many addresses can deny the
  operator SSH to every server for its length; the tailnet still carries the interfaces
  and the APIs, and the console stays.
- **The bastion is unprobed until stage 3.** Its probe runs from the observability node,
  which joins in A13; until then nothing reports its loss but a failed login.
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
- **Sync deploys the overlay as `main` holds it at that moment.** The images are the digests
  promoted there; manifests changed by two merges between two syncs go out together. The
  promotion check refuses a base that staging has not run (decision 9); it is run by a
  person, not by `gate`.
- **An Application object follows `main` even for production.** Only its workloads wait for a
  sync. Four rules in a required check keep an edit from deploying by itself (decision 3).
- **The CI cluster is one trust zone** (R35), because only code PUNI controls runs there;
  dependencies count as code. If foreign code is ever to run, per-job VM isolation comes
  first. A gate runs beside a privileged Docker daemon,
  so branch code in a gate can read the robot and the App key and can alter a later build.
  The credentials reach staging only; the integrity of an image that production later runs
  by promotion is what is accepted. A build node that gates never run on would shrink it.
  The CI change lists its own risks.
- **A staging build waits behind a gate** on the sizes assumed.
- **On staging, a commit in the pins repository admits a backend to the solver socket**,
  and the supervisor there checks the caller's name, not its image (decision 1).
- **Staging follows `main` only once the build path exists** (slice 3.7, A23). The tracker's
  poller is not retired before that without the owner's written waiver, under which a
  person renders and commits each staging change.
- **The pins repository is unchecked.** What the build's App commits there reaches staging
  at once, and `gate` never reads it. The `stag` project and admission bound it; its
  key is readable by code in a gate (R35).
- **Two delivery tools** until the workers clusters and labs move to `puni-01` (R27). See the
  second decision record.
- **Two clusters with one identity** during the build. Separate credentials, a separate
  snapshot bucket, a separate SQLite prefix and distinct kubeconfig context names are the
  guards. Argo CD targets only the cluster it runs in.
- **Restores are the migration.** A store whose backup has never been restored fails at the
  switch. With R26 that costs downtime, not data, as long as guard 1 holds.
- **Old-host stores run without an off-host backup** from the day h1claw is deleted until
  each has moved, with no fixed end. The owner accepted this (R30, decision 7's table).
- **The observability units have never been healthy in production.**
- **Private access rests on a vendor's coordination service and on an identity provider.**
  Tailscale decides which devices are in the network, and the owner signs in to it through
  an outside account. Tailnet Lock means a new device needs a signature from one of his
  own, so the service alone cannot add one; key expiry is off for servers, so an outage
  does not log them out; existing connections mostly outlive an outage, new ones may not.
  Then the way in is SSH through the bastion, and failing that the provider's console
  (R49), which is slow and manual. The exit is
  Headscale, a self-hosted coordination server; it is named, not designed.
- **One policy file guards every private path.** A wrong grant opens a service to a device
  that should not reach it. The file is tested for each tag's reach (slice 1.8), and no
  server is granted a path to another over the tailnet.
- **Tenancy here is soft.** Tenants share the kernel, the nodes and the control plane. That
  is accepted for `puni` and for tenants trusted as PUNI is. Code that is not trusted needs
  nodes or a cluster of its own, and tenant CI needs them because the build engine is
  privileged (decision 13).
- **The `puni-user-platform` will hold the keys.** Once it drives these services it is the
  most valuable target of the setup, and it runs on the public apps node as one replica on
  SQLite. Its adapter gets one narrow credential per service from OpenBao, and Git with a
  manual sync stays the path that never depends on it (decision 13).
- **Several services have no tenant boundary.** Prometheus has none; a point-in-time restore
  of a PostgreSQL cluster rewinds every tenant in it; one Argo CD, one Harbor, one OpenBao
  and one control plane serve all (decision 13).
- **WBS waits on work this change does not own**: Harbor, and overlays that let staging and
  production share a cluster (slice 3.5), beside the solver binding (slice 3.8). Until then
  the dev tracker stays on h2puni and h2puni cannot be deleted.
- **Two dev databases and a configuration archive on h2puni are not carried** and lose their
  only backup with h1claw (decision 7).
- **Removing a unit takes two merges and a command** (decision 3).
- **A schema change reaches WBS staging through a hook that does not fence the writer**
  (R53, decision 9). It rests on forward migrations being additive, which the migration
  lint holds and nothing at run time does. Three cases stay attended: a commit that
  removes or edits an applied migration, an attempt left by another candidate, and a
  reversal that failed. The render publishes nothing for the app while it cannot read
  which commit serves.
- **The website API applies a schema change at its own start, with no reversal command**
  (decision 9). Going back is the previous image on the newer, additive schema. Its
  Deployment runs one replica with `Recreate`, so a failed start leaves the API down
  until the previous pin is restored; the snapshot taken before each start is the copy
  to go back to.
- **MLflow's artifact root was empty when read.** The custody archives it with a manifest
  all the same, and A15 stops if it has grown past what the claim was sized for. h3mon is
  not deleted before metadata and artifacts have been restored together.
- **Devices the Kubernetes operator makes need the owner's signature** under Tailnet Lock,
  and how often is unknown. The fallback gives up the operator for those exposures, not
  the lock (decision 12).
- **Tailnet Lock and the console are the owner's alone.** Two signing devices and one
  console account; if both devices and the escrowed disablement secret were lost, no
  server could be added.
- **A NetworkPolicy from the pins repository is not read by `gate`.** Its peers are bounded
  only by what the staging overlay on `main` holds and by R35 (decision 3).

## Open questions for the owner

None in this change. an earlier draft's question, whether a self-hosted orchestrator
stands in front of the host pool, is answered: Argo Workflows and Argo Events, without the
pool (R31). The CI server's size is decided: 16 vCPUs and 32 GiB (R50).

The observability server's starting size, an earlier draft's question, is answered: larger
than 16 GiB (R2).

The four an earlier draft carried went with their subjects: when to
create the database server and whether Harbor uses the shared database are questions of
`host-postgres`; the agents host's region and OpenClaw's state, and the workstation's region
and size, are questions of `add-agent-hosts`.

On 2026-11-24 he decided every row that task 0.1 named (verify.md); what is still assumed
is listed in the Assumptions section, and the 169 GiB disk exit of decision 2 is now the
fallback's. The planning
session also recommends a second Slack channel for production alerts once production has
users.

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings, and no Argo CD
  instance was run.
- That the `argocd` CLI in core mode syncs an Application and waits for its health with the
  node's credential alone. If not, the owner decides (decision 3).
- That `server.rbac.rollback.enforce.enable` refuses a rollback by the local account, and that
  an `operation` block in an applied Application starts a sync. Both are documented; neither
  was run.
- That an ApplicationSet under the policy `create-update` leaves an Application whose file
  was removed, and the ApplicationSet field and flag names of decision 3.
- That each S3 key made here is limited to its bucket or prefix; A18 and task 4.1 of the
  OpenBao change read it back.
- Whether a provider volume can be detached and re-attached to a replacement server, and its
  throughput (R9, A29).
- That `alembic_version` holds one row on the real MLflow store: the table and the server's
  refusal of an out-of-date schema were read in MLflow's source at v3.7.0, not on the store.
- That the new cluster's staging directory for the website, which its owner writes (R11),
  keeps the Deployment as it was read on 2026-11-22. A18 checks it.
- That the staging build's container trusts the public roots the staging certificate
  chains to. Slice 3.9's rehearsal reads the identity route from it.
- What Argo CD does with a failed sync of the same commit under self-heal: its page on
  automated sync says both that it is not attempted again and that self-heal attempts it
  again after a timeout. Slice 3.9's rehearsal records it.
- That a hook Job and the serving backend can hold the node-local claim together; the
  claim is `ReadWriteOnce` and both pods are on one node, as in the Compose swap.
- That a rule in the prerouting hook, before destination NAT, drops a forwarded port on the
  public interface with the firewall as the role writes it; slice 1.8's negative shows it.
- Whether a device the Tailscale operator makes keeps its identity across a restart, and so
  how often the owner signs one; and the fallback that serves an interface from the node's
  own device (decision 12).
- That the role's inventory can express a rule with no caller image once the decoder allows
  it for the staging caller, and that a staging-owned parameter ConfigMap satisfies the
  admission policy as copied.
- That the admission policies of slice 2.10 can be written in the form the trusted-workload
  policies use, for Traefik's custom resources as well as for Ingress and Certificate.
- Which registry the solver image reference names, and so what the app nodes' Docker needs
  to pull it.
- That a ruleset which names a GitHub App as its only bypass actor lets that App push to
  `main` while a second ruleset without bypass still refuses a forced or deleting push
  (from memory; read back in A23).
- That cert-manager gives its HTTP-01 solver pod the issuer's `podTemplate` selector at run
  time. The field was read in the locked chart's CRD; nothing was run.
- Which source address a pod sees for traffic from host-network Traefik on its own node and
  on another, and so which `ipBlock` the solver allow needs (decision 3).
- That Pod Security at `restricted` admits every pod the staging overlays render today.
- What the MCP server keeps in `wbs-mcp`, and so what is lost by not carrying it.
- That a generated Application with no automated sync is left unsynced, and that the
  ApplicationSet controller reverts an edit to its sync policy.
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
  does with `includeCRDs: true`. Rehearsal 2.7 reads the CRDs back.
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
- The figures for `puni-request-app`, OpenBao and the staging WBS database's growth.
- Pull request #935 beyond its design file at its branch on 2026-11-21.
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
- The facts of m1plat1, m2bast1 and the private network were stated by the owner; this
  plan read neither host. A1's receipt reads m1plat1, its root filesystem against 50 GiB
  in bytes and, on R9's fallback, against 182 GiB or the 169 GiB exit of decision 2.
- That per-job VM isolation would run on the CI server: it needs nested virtualisation,
  which was not checked (R35).
- That `useBundledSystemChart` covers the webhook and Fleet charts on 2.15; that the
  Tailscale Ingress carries Rancher's interface, websockets included, to its port 80; that
  a PriorityClass may have a negative value; and Rancher's memory. Slice 2.11's rehearsal and A27 and A28 show each.
- That k3s v1.36.4+k3s1 itself, and not only its minor, runs Rancher v2.15.3; the matrix
  names minors only.
