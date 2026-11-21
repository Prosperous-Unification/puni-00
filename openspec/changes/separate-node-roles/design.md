## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. This is the eighth draft of the change: the
seventh, revised after a seventh review, with PostgreSQL hosting added at the owner's request
(decision 11). [verify.md](verify.md#replaced-drafts) records the drafts it replaces, what the
seven reviews found, and how ids moved. The PostgreSQL part has not been reviewed.

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

- One node role per host, in the fleet model and in workload selectors.
- The new cluster delivered by Argo CD from a tree of its own: staging follows `main`,
  production and the platform change on command.
- OpenBao as the first service after Argo CD, so every later Secret comes from it.
- A build order in which every stage has a receipt.
- A sized, grounded budget for each node.
- A plain list of what must survive the switch and what proves that it did.
- PostgreSQL hosted on the cluster with a backup and a proven restore, ready for the apps
  to move to (R36).

**Non-Goals**

- Designing Harbor, OpenBao, the WBS overlays or each app's build and pin tools. Their
  changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- Moving workers clusters or the existing labs off Flux (R27).
- High availability, continuous SQLite replication, single sign-on for Argo CD.
- Porting any app from SQLite to PostgreSQL. Each port is a follow-up change (decision 11).
- Databases for client apps, and a database replica (decision 11).
- A switch without downtime (R26).
- Any duty of h1claw (R30).
- Delivering a dev environment. This change sizes and contains it; a follow-up change
  delivers it (R34, decision 9).

## Assumptions

Fixed by the owner on 2026-11-21, in this order: the four roles, the three production apps,
Elasticsearch and Prometheus as the observability stack, SQLite, a cluster recreated from
scratch, Argo CD as its delivery tool, and that the switch may be unsafe; then that OpenBao is
set up before everything else; that `main` deploys to staging and production deploys on
command; that alerts go to the Slack channel `#puni-alerts-dev`; that MLflow is kept; that
h1claw may be deleted at any time and the backup windows that follow are accepted; that one
executor on the CI host serves every trigger; and that the recommendations then on the table
are accepted. He first chose the apps node for staging; after the sixth review he decided that
dev and staging get a node of their own (R29). Last, he asked for PostgreSQL hosting in this
plan, said that every app uses it once it is in place, which reverses SQLite as the lasting
store, and that the database server is planned now and created when he chooses (R36, R37).
A row marked **decided** records one of those; the rest are assumed and can be overruled by
id. R14 and R18 of the second draft stay withdrawn.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Alternative and its cost                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new cluster is built on newly created servers. An old host is deleted once its data is confirmed restored and, for a gate host, once its successor is calibrated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reinstall the existing servers. Cost: gates stop for other sessions while a gate host is rebuilt                                                                                                                                                    |
| R2  | **Decided.** Three servers of 8 vCPUs and 16 GiB, and a CI host of 16 vCPUs and 32 GiB. The observability server's root disk is at least 180 GiB (decision 2). Assumed: the non-production server of R29 is 8 vCPUs and 16 GiB as well; the database server is R37's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A CI host of the smaller class. Cost: one gate at a time at about 5 h 20 min. A non-production server of half the size. Cost: decision 2 shows staging alone does not fit beside one solve, before any dev environment                              |
| R3  | **Decided.** Node ids and host names are `h5plat`, `h6apps`, `h7obs` and `h8ci`. Assumed: `h9stg` for the non-production server and `h10db` for the database server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | none                                                                                                                                                                                                                                                |
| R4  | **Decided.** The owner creates each server in the provider console; it is enrolled by static inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                                                                                                         |
| R5  | The new cluster keeps the cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed. **Decided:** machine ids and private addresses are recorded where the fleet model records them today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A new cluster id. Cost: the id list is closed in the `backup` role, `platform.ts` and `recover.ts`                                                                                                                                                  |
| R6  | New: k3s credentials, a SOPS age identity that never enters the cluster, the repository read keys, the Argo CD account, everything OpenBao generates. Carried from escrow: the registry CA, the object storage credentials                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Reuse every secret. Cost: the old cluster's credentials would open the new one                                                                                                                                                                      |
| R7  | Build order: platform, CI, observability, apps, then retirement (decision 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Apps before observability. Cost: data arrives before the alert and backup units are healthy                                                                                                                                                         |
| R8  | One new capability, `platform-services`, pins Argo CD, cert-manager, Harbor, OpenBao and the External Secrets Operator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | One label per service, as pull request #935 proposes with `secret-store`. Cost: several labels that always sit on one node                                                                                                                          |
| R9  | Storage stays node-local with policy `Retain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Provider volumes. Cost: SQLite on a network volume is what the owner ruled out                                                                                                                                                                      |
| R10 | Harbor is the only registry the new cluster ever runs. Its tree has no Distribution unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Install Distribution first. Cost: a registry replaced before its first consumer                                                                                                                                                                     |
| R11 | **Decided.** The website and the request app run on the new cluster from the same release pins and source registry as today, moved after the release bootstrap finishes; the session that owns it writes the fleet repository's directory for the new cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Route them to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                                                                                           |
| R12 | The CI role is gates and builds: release builds and the staging builds of R31, every one a job of the host pool. No app, staging or production, and no database runs there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dev stacks on the CI host, as the third draft had it. Cost: the agents' tracker slows under every gate and sits beside branch code                                                                                                                  |
| R13 | **Decided.** Backups of everything on the new cluster run inside it: each app's own backup job, and retention and the freshness alert as cluster units (slice 3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Keep an outside puller. Cost: a host whose only job is to watch another                                                                                                                                                                             |
| R15 | **Decided:** MLflow is kept. Assumed: it runs on the observability node as a cluster unit with a `Retain` claim and the same backup job as the apps (slice 3.6); Victoria and Grafana are not rebuilt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A Compose service with a host timer. Cost: a second backup mechanism for one store                                                                                                                                                                  |
| R16 | Each node is probed from another node; the observability node from the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                                                                                                         |
| R17 | The Ansible controller lives on the operator workstation and reaches private addresses through a jump on `h5plat`. When `h5plat` is off, the jump is the target server's own public SSH endpoint, which the fleet firewall keeps open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A jump on the CI host. Cost: a host that runs branch code sits on the path to every node                                                                                                                                                            |
| R19 | One root Application owns plain Application files (app of apps). It syncs automatically and manages only Application and AppProject objects. The ApplicationSet controller is not installed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | An ApplicationSet with a cluster generator. Cost: a generator and a controller for one cluster                                                                                                                                                      |
| R20 | **Decided.** The owner on 2026-11-21: what merges to `main` is deployed on staging; a production deployment is done by hand, on command. Staging Applications sync automatically from `main`. Production Applications track `main` with automated sync off. Every overlay names its images by digest, so what runs in production is the digest set of its overlay at the last sync, promoted there by a merge. Assumed: platform units have no staging copy and are synced on command too                                                                                                                                                                                                                                                                                                                                                                                                            | Platform units automated. Cost: a merged infrastructure change rolls out with no second look, on the one cluster there is                                                                                                                           |
| R21 | The new cluster's definitions live under `infra/argocd` and share no file with a Flux-reconciled path, except chart archives locked by digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reference the existing plain manifests. Cost: an edit for one cluster reaches the workers clusters and the labs                                                                                                                                     |
| R22 | **Decided.** The owner on 2026-11-21: OpenBao is set up before the other services. No decryption runs in the cluster. Ansible applies only the bootstrap Secrets that Argo CD and OpenBao themselves need (decision 5); every other Secret is an ExternalSecret from the first day                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Bootstrap Secrets for the first stages. Cost: a second delivery path, built to be removed                                                                                                                                                           |
| R23 | **Decided.** The Argo CD interface has no public route and one local account, which reads everything and may sync Applications of the `production` project only, at the revision the Application names; it may not roll back. The built-in `admin` account is disabled. Break-glass is `kubectl` on the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Keep `admin` enabled. Cost: a second write path with one shared password                                                                                                                                                                            |
| R24 | Argo CD's four workloads are limited to 1,536 MiB together until A8 measures them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No limits. Cost: the repo server's rendering can take memory from the secret store                                                                                                                                                                  |
| R25 | The platform node is registered with the taint `CriticalAddonsOnly=true:NoSchedule`. Platform services and three named node agents tolerate it; nothing else may                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Node selectors alone. Cost: a workload outside the checked tree can land beside the secret store                                                                                                                                                    |
| R26 | **Decided.** The switch may be unsafe. The owner on 2026-11-21: "we can make the switch unsafe that's ok / no prod users yet". It holds only while there are no production users; the guards of decision 7 stay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A staged switch with fences and a retained old side. Cost: the ceremony of the second draft                                                                                                                                                         |
| R27 | Workers clusters and the existing labs stay on Flux. The repository carries two delivery tools until a later change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Move them now. Cost: no workers cluster exists in production to prove it on                                                                                                                                                                         |
| R28 | **Decided.** WBS production crosses the simple way, like the website: stop, one backup, restore, start. The cutover plan's first-start coordinator and its replay and digest guards are not used for the move. Its images come from Harbor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The guarded cutover plan. Cost: its coordinator reads and patches Flux objects and would have to be ported first                                                                                                                                    |
| R29 | **Decided.** The owner on 2026-11-21: "let's do dev & staging on a sep node", and then "yeah - staging and dev must be separate envs". A fifth server, `h9stg`, holds the non-production role, with the capabilities `nonproduction` and `ingress`, and is where two environments of the three apps run, staging and dev, each with its own namespaces, hostnames, certificates, claims, OpenBao paths and backup prefix. The production apps node carries production only. He had first chosen the apps node for staging; the sixth review then read the WBS solver's host supervisor, which is written for one node (decision 1). This change delivers staging there and prepares dev (R34)                                                                                                                                                                                                        | One capability per environment. Cost: two labels that always sit on one node; the AppProjects and namespaces already separate the two                                                                                                               |
| R30 | **Decided.** h1claw is outside this plan and the owner may delete it at any time. Asked on 2026-11-21 to choose between accepting the backup windows of decision 7's table and keeping h1claw until WBS has moved, he answered "backup - ok". One step must precede the deletion: the escrow of task 0.5, because the existing encrypted archive is unreadable without its key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Keep h1claw until retirement as a rule of the plan. Cost: a guard the owner said he does not want                                                                                                                                                   |
| R31 | **Decided.** The owner on 2026-11-21: "let's keep the custom runner that can be triggered either by github actions or by agents through cli/mcp/call to 'wbs' api (it will all converge to puni-user-platform)". One executor runs every job on the CI host: the host pool and its job catalogue. A trigger is a thin adapter that submits a catalogue job through the pool's admission; it has no execution path, credential store or queue of its own. This plan has two adapters: GitHub Actions, through a self-hosted runner on the CI host, for a push to `main` and a manual run at `main`; and the command line that agents use for gates today. MCP and the `puni-user-platform` API are a direction and are not designed here. Assumed: staging images are built this way, pushed to Harbor by digest, and pinned in a staging pins repository that nothing but staging reads (decision 9) | Argo Workflows, which he considered. Cost: an inbound webhook, CI inside the production cluster, and a second scheduler beside the pool. The provider's hosted runners. Cost: they cannot reach Harbor on the private network                       |
| R33 | **Decided** for staging. Asked on 2026-11-21 whether staging is automatic from `main`, holds the agents' tracker and promotes to production, the owner answered "ok for all three". **Staging** is deployed automatically from `main` (R20) and is the rehearsal of exactly what production will get; it holds the agents' live tracker, because today's WBS dev, which holds it, follows `main`. It replaces today's dev stacks: the `website-dev` namespace and the Compose dev stacks. Assumed, and the follow-up's to confirm (R34): **dev** is deployed on command from any ref, by an agent or the owner, to try a branch or a pull request; its data is disposable and it is never synced from `main` by itself. Promotion is staging to production only; dev promotes nowhere                                                                                                                | The tracker on dev. Cost: it stops following `main`, or dev stops being disposable                                                                                                                                                                  |
| R32 | On the rebuilt cluster the WBS solver is bound per environment: a trusted namespace, a selector and a parameter ConfigMap for each, and each backend's caller name in the supervisor's closed list. A node runs one supervisor with one pod caller: production's on the production apps node, staging's on the non-production node. The staging caller's rule names no caller image, which the supervisor's decoder is changed to allow for that one name; the staging list of trusted backend images is owned by the staging pins, and production's stays outside Git (decision 1, slice 3.8). A second caller on the non-production node, dev's, waits for the follow-up (R34)                                                                                                                                                                                                                     | Per-digest rules for staging as for production. Cost: every staging backend deploy waits for a person to run `solver.yml`, which is what R20 rules out                                                                                              |
| R34 | The planning session's scoping, made on 2026-11-21 after the seventh review so that the plan converges; the owner may overrule it. This change delivers staging and only prepares dev: the non-production node is sized for both, the capability `nonproduction` and three dev namespaces exist from the start, and the platform-side containment of decision 3 binds every non-production namespace at admission, whatever a ref holds. Dev's Applications, project, account, build trigger and solver use are a follow-up change, proposed name `add-dev-environment` (decision 9)                                                                                                                                                                                                                                                                                                                 | Dev delivered here, as the sixth draft had it. Cost: its isolation rested on rules in `gate`, which never see the ref a dev sync applies                                                                                                            |
| R35 | Assumed, under the condition of R26 (no production users): the CI host is one trust zone. The gate user is root-equivalent there, so code that a gate runs can read the build credentials and change what a later build produces. What is accepted is the integrity of images built on that host, which staging runs at once and production runs after a promotion. The credentials themselves reach staging only: the push robot writes one Harbor project, and the GitHub App is installed on the staging pins repository alone (decision 9)                                                                                                                                                                                                                                                                                                                                                       | Rootless Docker for gates, or builds on a host of their own. Cost: a change to the gate role and a new calibration, or one more server                                                                                                              |
| R36 | **Decided.** The owner on 2026-11-21: "i'll also need you to include hosting postgres in the plan", and, asked who uses it, "i want everybody to use it once it's in place". Earlier the same day he had said "I want to use SQLite for as long as possible"; this reverses it. A brief from another session came with the request; he then said "this session supersedes the decisions from brief". Assumed: this change hosts PostgreSQL and ports no app. The three apps and MLflow arrive on SQLite as already planned and move in follow-up changes (decision 11); every SQLite-specific element of this plan holds until that app's port lands                                                                                                                                                                                                                                                 | SQLite kept, with continuous replication to object storage. Cost: one writer bound to one node stays, so deployments stop the backend and nothing fails over; far less work, and it remains the fallback for an app whose port proves too expensive |
| R37 | A sixth role, `database`: one server, `h10db`, assumed 4 vCPUs and 8 GiB with a root disk of at least 135 GiB (decision 2), an agent of the new cluster that carries the capability `database` alone and is registered with the taint `puni.dev/role=database:NoSchedule`. **Decided:** the owner on 2026-11-21, "just plan for it for now, i'll evaluate the options": the server is created when he chooses, and nothing in stages 1 to 5 waits for it                                                                                                                                                                                                                                                                                                                                                                                                                                             | The production instance on the production apps node. Cost: the database shares a node with the public edge and with the apps it serves. Dedicated vCPUs or 16 GiB from the start. Cost: paid before the first consumer exists                       |
| R38 | CloudNativePG runs PostgreSQL: operator v1.30.2 on the platform node, physical backups and WAL archiving through its Barman Cloud plugin v0.16.0. The in-tree Barman integration is deprecated and is not used (decision 11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A hand-written StatefulSet with nightly dumps. Cost: no point-in-time recovery and no managed switchover when a replica comes                                                                                                                       |
| R39 | One production cluster, `platform-db`, with one instance. Each app gets one database and one owner role, and no role can read another app's database. A cluster for client apps and a cluster per large client come later, each with its first consumer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A cluster per app. Cost: an instance's memory for each, on a server of 8 GiB                                                                                                                                                                        |
| R40 | Staging's databases are in a second cluster, `nonproduction-db`, one instance on the non-production node, with its own backup credential and bucket. It needs no database server, so it can run as soon as the operator does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A second cluster on the database node. Cost: staging, which follows `main`, shares a disk and a kernel with production data, and the node's taint no longer means production only                                                                   |
| R41 | Recovery targets for `platform-db`, assumed: at most 5 minutes of committed data lost when the node is lost (the WAL archive interval), 30 days of point-in-time recovery, logical dumps kept 90 days, and a full restore into a new cluster within 2 hours, to be replaced by the measured time of the first drill (A28)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Hourly base backups without WAL archiving. Cost: up to an hour lost, which is what SQLite gives today                                                                                                                                               |
| R42 | Harbor keeps the database its own change bundles, on the platform node. "Everybody" (R36) is read as the apps and MLflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Harbor on `platform-db`. Cost: a registry that cannot serve a pull while the database node is down, and a start-up loop if a database image ever came from Harbor                                                                                   |

## Decisions

### 1. Roles, capabilities and placement

| Role            | Host   | Capabilities                         | In the k3s cluster |
| --------------- | ------ | ------------------------------------ | ------------------ |
| Platform        | h5plat | `control-plane`, `platform-services` | server             |
| CI              | h8ci   | none: it is not a k3s node           | no                 |
| Observability   | h7obs  | `observability`                      | agent              |
| Production apps | h6apps | `product`, `ingress`                 | agent              |
| Non-production  | h9stg  | `nonproduction`, `ingress`           | agent              |
| Database        | h10db  | `database`                           | agent              |

- `platform-services`, `nonproduction` and `database` are new. Each is added to
  `CapabilitySchema`, `fleetCapabilities`, `purposeCapabilities.platform` and
  `RequiredCapabilitiesSchema`; `database` by slice 4.1, with its role.
- The database node carries `database` and nothing else, and is registered with the taint
  `puni.dev/role=database:NoSchedule` (R37). The agent template already writes `node-taint`
  entries; slice 4.1 adds this one for a node that carries `database`. Unlike the platform
  node's taint it is a key of our own: no packaged k3s workload has to run on an agent, so
  none has to tolerate it. Only the PostgreSQL instances of `platform-db`, their backup
  sidecars and the three node agents may tolerate it (decision 11).
- The server carries none of `product`, `nonproduction` and `ingress`; no node carries both
  `product` and `nonproduction`; and no gate host is a k3s node.
- `ingress` is the one capability two roles share: Traefik is a DaemonSet on every node that
  carries it, and each environment's names point at its own node. Either Traefik would route
  for the other environment's hosts if a name pointed at it; rule 2.4(m) keeps the two sets of
  hosts apart.
- **Why non-production has a node of its own** (R29). The owner first chose the apps node. The WBS
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

- **Two environments on the non-production node** (R29, R33, R34). One capability,
  `nonproduction`, places both: a label per environment would always sit on the same node and
  separate nothing that the AppProjects, namespaces, store paths and claims do not already.
  This change delivers staging there. For dev it provides the room (decision 2), three empty
  namespaces, `wbs-dev`, `wbs-solver-dev` and `apps-dev` (assumed names; `website-dev` is
  taken, because the fleet's overlays already use it for what is now staging), and the
  admission-time containment of decision 3.
- **One supervisor with one pod caller on each of the two app nodes.** Production's serves
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
    own, `wbs-solver-staging`, a row for it with the `nonproduction` selector, and its own
    parameter ConfigMap. The host directory is the same path on each node.
  - _The supervisor's caller list._ It is closed and holds `k8s_wbs-solver_backend`; a staging
    pod presents `k8s_wbs-solver-staging_backend` and is refused until the list names it.
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
  an object of the staging overlay and takes its digests from the staging pins, so the pin
  that deploys a backend also admits it. And the decoder allows a null caller image for
  `k8s_wbs-solver-staging_backend` and for no other pod caller; production's refusal and its
  proof stay. A staging backend deploy then needs no command; only a new solver image needs
  a run of `solver.yml`. What this gives up is stated plainly: on staging the supervisor
  checks the caller's name and not its image, so a merged pin is the only authority for
  which backend may reach the solver socket.
- The capability floors of a cluster apply as soon as it has one node (`decodeFleet`). The new
  cluster entry starts with the floor `platform-services: 1` and gains `observability: 1`, then
  `nonproduction: 1`, `product: 1` and `ingress: 1`, in the revision that adds each node.

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
| CloudNativePG operator and the Barman plugin     |       512 | assumed (decision 11): 256 each; A26 measures      |
| **Sum with the database stage**                  | **9,066** | with reservations 11,882; margin 3,720             |

**Production apps node.** Reservations assumed 1,664 (system 1,024, kubelet 384, eviction 256);
allocatable 13,938.

| Workload                                                         |     Limit | Source                                        |
| ---------------------------------------------------------------- | --------: | --------------------------------------------- |
| Traefik                                                          |       512 | sizing document; no limit set live, 47 in use |
| Production: `puni-website` `site` and its log shipper            |       256 | live limits                                   |
| Production: `puni-request-app`                                   |       640 | assumed: not deployed yet                     |
| Production: `puni-user-platform` backend, gateway, MCP, frontend |     2,176 | `deploy/k8s/wbs/base`                         |
| Production: `puni-user-platform` hourly backup and daily verify  |     1,024 | `deploy/k8s/wbs/base`, both counted           |
| Node exporter, OTel collector, Velero node agent                 |     1,408 | sizing document                               |
| **Sum**                                                          | **6,016** | margin 7,922                                  |

**Non-production node** (R29). The same reservations and allocatable on 16 GiB.

| Workload                                                                                                     |      Limit | Source                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------: | ------------------------------------------------------- |
| Traefik                                                                                                      |        512 | sizing document                                         |
| Staging: `website-dev` (website and request app)                                                             |        768 | live limits; 71 in use                                  |
| Staging: `puni-user-platform`, the same workloads and jobs                                                   |      3,200 | `deploy/k8s/wbs/base`, as production's two rows         |
| Dev, reserved for the follow-up (R34): the website, the request app and `puni-user-platform`, no backup jobs |      2,944 | assumed: staging's rows less the backup and verify jobs |
| Node exporter, OTel collector, Velero node agent                                                             |      1,408 | sizing document                                         |
| **Sum**                                                                                                      |  **8,832** | margin 5,106                                            |
| `nonproduction-db`: one instance and its backup sidecar (R40)                                                |      1,280 | assumed: 1,024 and 256                                  |
| **Sum with the database stage**                                                                              | **10,112** | margin 3,826                                            |

Half the size does not hold it: a server of 8 GiB is assumed to offer about 6,000 MiB after
the same reservations, and staging alone with Traefik and the node agents is 5,888, which
leaves less than one solve. The server is therefore 8 vCPUs and 16 GiB (R2). The margin of
5,106 MiB is what the solver containers share: the supervisor allows each up to 512 MiB
(`maxMemoryLimitMb`) and four at once (`maxManagedContainers: 4`, a literal in the role's
tasks), so 2,048 at most; with `nonproduction-db` the margin is 3,826 and 1,778 are left
beside four solves. The solver's memory in use was not measured, and dev has no figures of
its own.

Not counted on either app node: the host-owned solver supervisor itself.
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

**Database node** (R37). A server of 8 GiB is assumed to offer about 6,000 MiB after the same
reservations as an app node, as above.

| Workload                                                    |     Limit | Source                                             |
| ----------------------------------------------------------- | --------: | -------------------------------------------------- |
| `platform-db`: one PostgreSQL instance                      |     2,560 | assumed; `shared_buffers` a quarter of it          |
| Its backup sidecar                                          |       256 | assumed                                            |
| Node exporter, OTel collector, Velero node agent            |     1,408 | sizing document                                    |
| **Steady sum**                                              | **4,224** | margin about 1,776                                 |
| Restore drill: a throwaway instance and its sidecar, weekly |     1,280 | assumed: 1,024 and 256                             |
| Nightly logical dump                                        |       256 | assumed                                            |
| **Peak sum**                                                | **5,760** | margin about 240, if the drill and a dump coincide |

These are limits, and every figure but the node agents' is assumed: no app has run on
PostgreSQL here. The peak is tight and is shown as it is. The drill and the dump
are scheduled apart, and A27 and A28 measure. What moves the server up to 16 GiB: a measured
peak that leaves less than 512 MiB, or a `shared_buffers` the first ported app needs. What
moves it to dedicated vCPUs: commit or query latency that follows the neighbours' load and
not the database's own. CloudNativePG moves an instance by adding a replica on the new node
and switching over, so either change needs a second node for a while and no restore.

Its disk: a data claim of 30 GiB and a separate WAL claim of 8 GiB for `platform-db`, the
same again while a restore drill runs, and 30 GiB assumed for the system and images. With a
fifth kept free that is (38 + 38 + 30) / 0.8 = 133 GiB, so the root disk is at least 135 GiB
and A24 stops on a smaller one. The largest SQLite store today is 2.2 GB. A WAL volume
cannot be removed from a cluster once it has one (storage page at the tag), so it is there
from the first sync.

**CI host.** A gate is measured at 6 cores, 9 GiB and 11 GiB of temporary space, and runs under
`min(13 GiB, pool budget − headroom)`. On 16 vCPUs and 32 GiB (R2) two such gates fit side by
side on paper, or one gate can run more tasks in parallel. Which one, and the pool budget and
headroom, are the pool owner's to set from the calibration (A10).

**Disk elsewhere.**

| Node            | What lands there                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots                                                                            |
| Production apps | Production SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB                                                                                |
| Non-production  | The same three claims, with `wbs-data` assumed at 10 GiB because the dev database is 2.2 GB today; `nonproduction-db`: 10 GiB of data and 4 GiB of WAL (assumed) |
| CI              | gate trees, caches, 11 GiB of temporary space per gate, release build layers                                                                                     |
| Database        | `platform-db`: 30 GiB of data and 8 GiB of WAL, and the same for a restore drill while it runs                                                                   |

### 3. Delivery by Argo CD

Checked against Argo CD v3.6.2, the current release; [verify.md](verify.md#argo-cd-behaviour)
lists what was read and what was not.

**Tree.** Everything the new cluster reconciles from this repository is under `infra/argocd`:

| Path                                        | Holds                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `infra/argocd/install`                      | the vendored install manifest and its kustomize patches                     |
| `infra/argocd/clusters/platform-production` | three AppProjects and one Application file per unit; the root's source path |
| `infra/argocd/units/<unit>`                 | a kustomize directory or a wrapper chart per unit                           |
| `infra/argocd/root`                         | the root Application and its AppProject, applied by the playbook only       |

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

| Project      | Holds                                                            | Source                                                               | Sync                                                        |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `root`       | the root Application alone                                       | this repository, the root's one path                                 | automatic: self-heal, no prune                              |
| `platform`   | every platform unit, the database units, the public-name issuers | this repository; one path of the fleet repository for the issuers    | on command, by the operator                                 |
| `staging`    | the staging copy of the three apps                               | the fleet repository and the WBS deploy repository, staging overlays | automatic from `main`: prune, self-heal, retry with backoff |
| `production` | the three production apps                                        | the same repositories, production overlays                           | on command, by the owner                                    |

- The root Application is the one automated Application outside staging. It belongs to a
  project of its own, `root`, whose only destination is the `argocd` namespace and whose only
  admitted kinds are Application and AppProject. Its source path may hold nothing else, and
  the `delivery` check refuses any other kind there (rule 2.4(l)). The root and its project
  are applied by the bootstrap playbook from `infra/argocd/root`, which is not in the root's
  own source path, so no Application owns them. The other three AppProjects lie in the
  source path and the root manages them.
- **What a merge does to an Application file.** The root applies it at once, with self-heal
  and without prune:
  - _Added._ The Application object appears. A production or platform one is not synced.
  - _Edited._ The object changes at once; its workloads do not. A changed source, values or
    destination only changes what the next sync applies. The fields that could make the edit
    deploy by itself are refused by the `delivery` check inside the required `gate`: automated
    sync on a production or platform Application (rule (b)), a project other than the one the
    order table names (rule (c)), a revision other than `main` (rule (a)), and an `operation`
    block, which starts a sync when the object is applied (rule (l)).
  - _Deleted._ Nothing happens in the cluster: the root does not prune, and no Application
    carries the resources finalizer. `tool-fleet:health` lists an Application that has no
    file. Removing a unit is the procedure below.
- So "production deploys only on command" covers every object in a production namespace and
  every object of a platform unit. It does not cover the Application and AppProject objects
  themselves, which follow `main`, and it rests on those four rules being in a required check.
  The root's self-heal reverts an Application edited in the cluster, which keeps automation
  from being switched on for a production unit outside Git.
- `staging` and `production` each have as destinations an allow-list of their own
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
  label `puni.dev/environment`: `production`, `staging`, `dev` or `platform`.
- An AppProject is applied by the root as soon as it is merged, so its file is held as
  tightly as an Application's: no `roles`, no `syncWindows`, and no file in the root's path
  may define an object named like the root or its project (rule 2.4(l)). The public-name
  `ClusterIssuer` objects live in the fleet repository; their Application belongs to
  `platform`, and the `delivery` check holds a fleet-sourced Application in `platform` to that
  one path.
- **Staging follows `main`** (R20). A merge that changes a staging overlay is applied within
  the reconciliation interval, and a manual edit in the cluster is reverted. A staging overlay
  names images by digest, so staging runs new code only when a merge moves a pin; how a merge
  to `main` of an app becomes a pin is slice 3.7 (R31, decision 9).
- **Containment that does not depend on what a ref holds** (slice 2.10). The rules of slice
  2.4 run in `gate` and read `main`. That is enough for staging and production, which sync
  nothing else. A rule in `gate` cannot bind an object that is applied from another ref or by
  hand. So the `policy` unit, which only the operator syncs, carries what must hold whatever
  is applied, keyed on the namespace's environment label:
  - _Placement._ An admission policy denies a pod in a `staging` or `dev` namespace that
    does not select `nonproduction`, and one in a `production` namespace that does not
    select `product`.
  - _Names._ An admission policy denies an Ingress, a Traefik `IngressRoute` or
    `IngressRouteTCP`, and a Certificate whose host is not in the list the `policy` unit
    holds for that namespace. Rule 2.4(m) reads the same list in `gate`, for the same kinds.
  - _Quota._ Every non-production namespace has a ResourceQuota from the `policy` unit.
  - _Network._ Every non-production namespace has a default-deny NetworkPolicy from the
    `policy` unit. NetworkPolicy is additive, so another object in the namespace can still
    allow more. For staging that object comes from `main`, and rule 2.4(k) reads its peers.
    For anything applied from another ref the plan relies on the project's kind list: a
    project whose whitelist leaves NetworkPolicy out cannot widen the policy. Whether an
    admission policy can bound a NetworkPolicy's peers reliably was not established and is
    not claimed.
  - _Kinds._ The `namespaceResourceWhitelist` of a project, which Argo CD applies at sync
    time to any revision.

  The label is guarded too: the namespace-label policy of the `policy` unit reserves
  `puni.dev/environment`, and no app project admits a Namespace. This is the base the dev
  follow-up starts from (R34, decision 9).

- **Production is synced on command.** A production Application tracks `main` with no automated
  sync. After a merge it shows OutOfSync with its difference in the interface, and it changes
  when the owner presses Sync there or runs `argocd app sync`. The local account holds
  `applications, sync` on `production/*` and nothing else beyond `role:readonly`. It does not
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
  root's automation disabled first. The root is owned by no Application, so that setting
  stays until the playbook runs again.

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

| Order | Unit                         | Project    | Needs                                                                                                               | First synced                         |
| ----: | ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
|     0 | `argocd`                     | platform   | none                                                                                                                | A4                                   |
|     1 | `namespaces`                 | platform   | none; the playbook applied them already                                                                             | A4                                   |
|     2 | `policy`, `storage`          | platform   | `namespaces`                                                                                                        | A4                                   |
|     3 | `cert-manager`               | platform   | `namespaces`                                                                                                        | A4                                   |
|     4 | `openbao`                    | platform   | `storage`; `cert-manager`, for its server certificate; the seal key and the server CA Secret from the playbook      | A7                                   |
|     5 | `external-secrets`           | platform   | `policy`                                                                                                            | A7                                   |
|     6 | `secret-sync`                | platform   | `openbao`, `external-secrets`                                                                                       | A7                                   |
|     7 | `issuers`                    | platform   | `secret-sync`, for `registry-ca`; `cert-manager`                                                                    | A7                                   |
|     8 | `otel-certificates`          | platform   | `secret-sync`, for `otel-server-ca`; `cert-manager`                                                                 | A14                                  |
|     8 | `eck-operator`               | platform   | `policy`                                                                                                            | A14                                  |
|     8 | `prometheus-stack`           | platform   | `secret-sync`; `storage`                                                                                            | A14                                  |
|     9 | `elasticsearch`              | platform   | `eck-operator`; `storage`; `secret-sync`                                                                            | A14                                  |
|    10 | `kibana`, `elastic-settings` | platform   | `elasticsearch` and the Secrets ECK makes for it                                                                    | A14                                  |
|    10 | `otel-collector`             | platform   | `elasticsearch`; `otel-certificates`                                                                                | A14                                  |
|    10 | `signals`                    | platform   | `elasticsearch`; `otel-certificates`; `prometheus-stack`                                                            | A14                                  |
|    11 | `alerts`, `probes`           | platform   | `prometheus-stack`                                                                                                  | A14                                  |
|    12 | `velero`                     | platform   | `alerts`, as the Flux `backup` stage does; `secret-sync`                                                            | A14                                  |
|    12 | `elastic-snapshots`          | platform   | `alerts`; `elasticsearch`                                                                                           | A14                                  |
|    12 | `mlflow`                     | platform   | `alerts`; `secret-sync`; `storage`                                                                                  | A15                                  |
|    12 | `sqlite-custody`             | platform   | `alerts`; `secret-sync`                                                                                             | A18                                  |
|    13 | `traefik`                    | platform   | `policy`; a node that carries `ingress`                                                                             | A17                                  |
|    14 | `harbor`                     | platform   | `secret-sync`; `storage`; `issuers`                                                                                 | Harbor's change, before any WBS unit |
|    15 | `public-issuers`             | platform   | `traefik`; `cert-manager`                                                                                           | A18                                  |
|    16 | `website-staging`            | staging    | `public-issuers`; `secret-sync`                                                                                     | A18                                  |
|    16 | `wbs-staging`                | staging    | `public-issuers`; `secret-sync`; `harbor`                                                                           | A18                                  |
|    17 | `website`                    | production | `public-issuers`; `secret-sync`                                                                                     | A19                                  |
|    17 | `wbs`                        | production | `public-issuers`; `secret-sync`; `harbor`                                                                           | A20                                  |
|    18 | `cnpg-operator`              | platform   | `policy`                                                                                                            | A26                                  |
|    19 | `barman-plugin`              | platform   | `cnpg-operator`; `cert-manager`, which issues the plugin's certificates                                             | A26                                  |
|    20 | `nonproduction-db`           | platform   | `barman-plugin`; `storage`; `secret-sync`; `prometheus-stack`, for the PodMonitor kind; a node with `nonproduction` | A26                                  |
|    20 | `platform-db`                | platform   | `barman-plugin`; `storage`; `secret-sync`; `prometheus-stack`; a node that carries `database`                       | A27                                  |

- **OpenBao is first among the services** (R22). The four units before it are Argo CD, the
  namespaces, policy and storage it runs under, and cert-manager, which is there only because
  pull request #935 issues OpenBao's server certificate from a cert-manager CA issuer. Nothing
  else precedes it.
- `secret-sync` holds every SecretStore and every platform ExternalSecret; it grows with each
  stage. Pull request #935 allows stores per namespace only, so `secret-sync` carries one
  SecretStore for each namespace that reads a Secret, the app namespaces included, each bound
  to that namespace's role in the store. An app's own ExternalSecrets are in its overlay. The plan relies on Argo CD's bundled health check for
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
- Orders 18 to 20 are the database stage (decision 11). They are numbered after the apps
  because no app needs them yet, not because they need the apps: every need outside the
  stage is of order 8 or lower. `nonproduction-db` needs no database node.
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
finalizer and the root does not prune, so removing an Application file changes nothing in the
cluster. First the unit's source is reduced to one marker ConfigMap and the unit is synced with
prune, which removes the workloads and leaves the data. The marker is what makes this work:
prune refuses a source that renders nothing unless `allowEmpty` is set. Then the Application
file is removed. Last, the sync playbook's removal mode deletes the Application object; it
refuses one that still has a file or whose live source is more than the marker. The removal
mode takes a unit of any project, since nothing else can delete a staging or production
Application; syncing stays limited to platform units. A staging unit reduced to its marker is
pruned by its own automation.

**What guards `main`.** The bootstrapping guide's warning applies: whoever can change the
root's source is an administrator of the cluster. That source is a path on `main`, so the
boundary is the ruleset that task 0.6 sets and reads back: a pull request and the required
checks, no direct, forced or deleting push. Read on 2026-11-21, `main` here requires a pull
request with zero approvals and two status checks, `gate` and `pixels`, without the up-to-date
requirement; `tool-fleet:check` runs only in a workflow that is not required. The `delivery`
rules therefore also run as a test over the real tree inside `gate` (slice 2.4). The fleet
repository's `main` had no rule; task 0.6 gives it one before A2 writes there, and gives the
WBS deploy repository one before its first Application is merged. With R20 a merge
reaches staging at once and production only through a sync, so the ruleset is the whole guard
for staging and half of it for the rest.

The server has a ClusterIP Service, no Ingress and a NetworkPolicy; it is reached by
`kubectl port-forward` through the operator's tunnel. `policy.default` is `role:readonly`, and
the built-in `admin` account is disabled (R23).

**Data survives delivery mistakes.** Every PersistentVolumeClaim in the tree, and every
namespace that holds one, carries `Prune=false` and `Delete=false`, so removing a manifest
never deletes it. Claims that an operator creates from a custom resource are not in the tree.
The Elasticsearch, Prometheus and Alertmanager resources and every CloudNativePG `Cluster`
carry the same two options, and
Elasticsearch keeps `volumeClaimDeletePolicy: DeleteOnScaledownOnly`, which the copied manifest
already sets. A custom resource deleted by hand is outside what delivery can protect. No
Application carries the resources finalizer, so deleting an Application leaves its resources.

### 4. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md). Slices 1.1 to 1.3, 2.1 to 2.6, 2.9 and
the first receipt of 2.7 are needed before the platform stage can start; 1.4, 1.5, 2.8, 3.2
and 3.6 before stage 3; 2.10, 3.1, 3.5 and 3.8 before stage 4; 4.1 to 4.5 before stage 6. Slice
3.7 blocks no step: until it lands, staging advances when a pin is moved by hand.

| Gap                                                                                                                                                                                                                                                  | Slice |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No capability for platform services                                                                                                                                                                                                                  | 1.1   |
| Nothing refuses a server with `product` or `ingress`, a gate host that is a k3s node, or an untainted server                                                                                                                                         | 1.2   |
| `validate-enrollment.yml` replaces CoreDNS's tolerations, and has never run on a cluster of one tainted node                                                                                                                                         | 1.2   |
| One static inventory and one hard-coded cluster id in `placement.test.ts`                                                                                                                                                                            | 1.3   |
| The coexistence record and reservations describe h3mon with its Docker services                                                                                                                                                                      | 1.4   |
| `observability-source.ts` hard-codes the inventory path, the two peers and the API endpoint                                                                                                                                                          | 1.5   |
| No locked Argo CD install and no locked `argocd` CLI                                                                                                                                                                                                 | 2.1   |
| Every chart is consumed through a Flux `HelmRelease`                                                                                                                                                                                                 | 2.2   |
| The platform-stage manifests exist only under Flux-reconciled paths                                                                                                                                                                                  | 2.3   |
| `validatePlatform` checks Flux units; nothing checks an Application graph, its environments, its isolation or its placement, or that a claim has a backup                                                                                            | 2.4   |
| `tool-fleet:check` is not a required check, so a merge can skip the `delivery` rules                                                                                                                                                                 | 2.4   |
| `playbooks/platform.yml` installs Flux and needs the age key on the server; only it writes the cluster identity ConfigMap; nothing syncs a unit on command                                                                                           | 2.5   |
| The controller image has no `sops`, and `fleet_ansible` mounts no fleet checkout                                                                                                                                                                     | 2.5   |
| `tool-fleet:health` reports "no Flux objects" as a failure; the recovery manifest and drill assume Flux                                                                                                                                              | 2.6   |
| The lab's `platform` profile runs Flux; nothing rehearses the new tree, a one-node start or staged joins                                                                                                                                             | 2.7   |
| The observability, alert and backup manifests exist only under Flux-reconciled paths; the copied alert rules watch a CronJob and a cluster that do not exist yet                                                                                     | 2.8   |
| The only build runbook is written for two adopted hosts                                                                                                                                                                                              | 2.9   |
| Retention and the freshness alert for `sqlite/<database>/` run on h1claw; both clusters would share the prefix                                                                                                                                       | 3.1   |
| No probe of a node from outside itself                                                                                                                                                                                                               | 3.2   |
| The gate instructions name h2puni and h4claw                                                                                                                                                                                                         | 3.3   |
| `desired.yaml` and the inventories still name the old cluster after retirement                                                                                                                                                                       | 3.4   |
| The WBS `staging` and `prod` overlays both render the namespaces `wbs` and `wbs-solver`, select no node for three workloads, set no cluster prefix, expect SOPS Secrets, and nothing stops staging configuration from naming a production Service    | 3.5   |
| The solver admission policy trusts one namespace, one selector and one parameter ConfigMap; the supervisor's caller list has no staging name and its decoder refuses a pod caller's rule without a caller image; the `solver` role asserts `product` | 3.8   |
| Nothing binds at admission: a pod in an app namespace may select any node, an Ingress, IngressRoute or Certificate may claim any host, and a non-production namespace has no quota or default-deny of the platform's own                             | 2.10  |
| MLflow runs as a Compose service with no backup of its own                                                                                                                                                                                           | 3.6   |
| Nothing turns a merge to `main` into an image pin in a staging overlay; the one self-hosted runner serves a manual deploy workflow only, and its job-started hook admits that one workflow                                                           | 3.7   |
| No role or capability for a database node; the agent template writes one taint, the enrollment one                                                                                                                                                   | 4.1   |
| No PostgreSQL operator, backup plugin or operand image is locked or has a unit                                                                                                                                                                       | 4.2   |
| No PostgreSQL cluster is defined; nothing checks where its instances run, that its WAL is archived, that it is scraped, or that Velero leaves its volumes alone                                                                                      | 4.3   |
| No alert rule, log setting or query statistics for PostgreSQL                                                                                                                                                                                        | 4.4   |
| No logical dump, no scheduled restore drill, no way to roll back one database                                                                                                                                                                        | 4.5   |

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
cannot read a production path. Staging backup jobs get an object storage credential of their
own that cannot read production's backups: a key limited to a staging bucket. Whether the
provider can limit a key to one bucket was not checked; if it cannot, staging's backups go to
a second project there, with that project's key. Either way A18 does not start on a shared
key: its receipt includes a listing of a production prefix refused with the staging
credential.

| Secret                                                         | Consumer                                                                               | New or carried                         | Written in           | Source                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry CA key pair                                           | `issuers`                                                                              | carried                                | A7                   | escrow                                                                                                                                                                                |
| `velero-credentials`, `velero-repo-credentials`                | `velero`                                                                               | carried; generated                     | A14                  | escrow; the repository password is escrowed before it is written                                                                                                                      |
| `elastic-s3-credentials`                                       | Elasticsearch snapshots                                                                | carried                                | A14                  | escrow                                                                                                                                                                                |
| `alertmanager-puni`                                            | Alertmanager                                                                           | new                                    | A14                  | **decided:** alerts go to the Slack channel `#puni-alerts-dev`. The owner writes its incoming-webhook address (open question 1); until then the configuration has no outside receiver |
| `otel-server-ca`, `otel-client-trust`, nine `signal-*` Secrets | observability                                                                          | new                                    | A14                  | generated by the operator                                                                                                                                                             |
| MLflow backup credentials                                      | `mlflow`                                                                               | carried                                | A15                  | escrow                                                                                                                                                                                |
| Staging app Secrets: runtime, pull and backup credentials      | staging namespaces                                                                     | carried from dev                       | A18                  | the fleet repository under the old key; the dev stacks' env files                                                                                                                     |
| Production app Secrets                                         | production namespaces                                                                  | carried; WBS as its overlay names them | A19, A20             | the fleet repository under the old key; escrow                                                                                                                                        |
| Harbor's Secrets and robot credentials                         | Harbor and its consumers                                                               | as the Harbor change states            | its steps            | generated                                                                                                                                                                             |
| Object storage credential for `nonproduction-db`'s backups     | its `ObjectStore`                                                                      | new                                    | A26                  | a key that cannot read a production bucket, as for staging's SQLite backups                                                                                                           |
| Object storage credential for `platform-db`'s backups          | its `ObjectStore`, the dump job                                                        | new                                    | A27                  | a key of its own, limited to the database bucket if the provider can (not checked)                                                                                                    |
| One owner-role password per app and environment                | the role's Secret in the database namespace and the app's connection Secret in its own | generated in the store                 | with each app's port | the port's follow-up change; this change makes them for the canary databases only                                                                                                     |

Not carried: the registry's `registry-auth` (Harbor's robots replace it). Kept outside any
cluster: the backup archive key, which only reads the old archive, and the old cluster's age
identity, which A18 and A19 use on the controller to read the website's present Secrets.

**While OpenBao is sealed or down.** The External Secrets Operator stops refreshing. Secrets
already written to the cluster stay, so running pods keep running and restart normally. A new
ExternalSecret gets no value, `secret-sync` is not Healthy, and the sync playbook refuses the
units that need it. A unit that does not need it can still be synced. A cold rebuild restores the store before any consumer is synced. Pull
request #935 owns the alerts for a sealed store and a failed sync.

### 6. Build order

| Stage | Role          | Needs                                                                                                              | Receipt that ends the stage                                                                                                                                                                   |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Decisions     | none                                                                                                               | overrules recorded; the secrets of task 0.5 read back from escrow; the `main` rulesets read back; the slices decision 4 lists for stage 1 landed, except 1.3, whose first revision follows A1 |
| 1     | Platform      | stage 0; rehearsal receipts 2.7/A3 and 2.7/A7; pull request #935, for A7 only                                      | server Ready; orders 0 to 7 Synced and Healthy; a canary read from OpenBao through an ExternalSecret; one etcd restore on the empty cluster                                                   |
| 2     | CI            | nothing from the cluster                                                                                           | a gate exits 0 on the new host and its calibration is recorded by the pool's owner                                                                                                            |
| 3     | Observability | the server; OpenBao serving; slices 2.8, 3.2 and 3.6                                                               | orders 8 to 12 Healthy, `sqlite-custody` excepted, which lands in stage 4; memory and disk measured; a test alert raised; MLflow restored (A15)                                               |
| 4     | Apps          | the server; orders 11 and 12 Healthy; slices 2.10, 3.1, 3.5, 3.8; Harbor, for WBS; the two servers of A16          | staging and then production answer on their names with their data checked against the final backup                                                                                            |
| 5     | Retirement    | stage 4's receipts; stage 2's receipt for the gate hosts                                                           | old servers deleted; `desired.yaml` and the inventories name only the new cluster                                                                                                             |
| 6     | Database      | stage 3's receipt; slices 4.1 to 4.5; for `platform-db`, the server, which the owner creates when he chooses (R37) | both clusters Healthy with WAL archived; a base backup of each; a restore of `platform-db` into a throwaway cluster, timed; one database rolled back by the runbook                           |

- **Platform first, and OpenBao first on it.** Every other node joins this server, and every
  later unit reads its Secrets from the store.
- **CI second.** It depends on nothing in the cluster and has the longest lead: three
  calibrations of over five hours each on today's hosts. The old gate hosts keep gating until
  then. It may run in parallel with stages 1 and 3.
- **Observability third.** Alerts and backups wait on it.
- **Apps last, staging before production.** They carry the data, and staging is the rehearsal
  of the production move. The non-production server and the production apps server are created and
  joined together (A16, A17).

Harbor lands on the platform node by its own change. It blocks the two WBS units and nothing
else.

- **The database stage is numbered last and waits for no one.** It needs the alert and
  metrics units of stage 3 and nothing of stages 4 and 5, and nothing in stages 1 to 5
  needs it: no app reads PostgreSQL until its own port lands. Its first half, the operator,
  the plugin and `nonproduction-db`, needs no new server and may follow stage 3 at once.
  Its second half starts when the owner creates the server.

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
   stores only. The final backup of a dev store records its SHA-256, and the restore is run
   against that recorded value with `sha256sum --check`: a file with another digest stops the
   step before anything is written.

The final backup of a store on an old host is taken with the store's own tool after its writer
stops: the cluster's backup job for the website, and for the Compose databases and MLflow a
`sqlite3` `.backup` on the host with `integrity_check` and a recorded SHA-256. If h1claw still
exists, the member of its set that is the store in question may serve instead, named by file.
Its set mixes production and dev databases and a configuration archive with production env
files, so nothing else of it is used and the archive is never unpacked on the new cluster. The
plan does not depend on h1claw.

**When a store has no off-host backup.** Stated once; R30 refers to this table.

| Store                                                                                           | Unprotected from                                                                                                                           | Until                                                                  | Why                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| WBS production database on h2puni                                                               | the day h1claw is deleted                                                                                                                  | A20                                                                    | h1claw's pull is its only off-host backup; A20 waits on Harbor and slices 3.5 and 3.8                                     |
| WBS dev database on h2puni, the agents' tracker                                                 | the day h1claw is deleted                                                                                                                  | A18's WBS part                                                         | the same                                                                                                                  |
| MLflow store on h3mon                                                                           | the day h1claw is deleted                                                                                                                  | A15                                                                    | the same pull, daily                                                                                                      |
| Website data                                                                                    | never: its own job in the old cluster continues. Its pruning and its freshness alert stop with h1claw, so a job that stops is not reported | A18, A19                                                               |                                                                                                                           |
| Two other dev databases on h2puni, `aivn-dev` and `aivn-cms-dev`, and the configuration archive | the day h1claw is deleted                                                                                                                  | never: this plan does not carry them                                   | they are members of the same hourly set ([recovery](../../../docs/infra/recovery.md)); A22 needs the owner's word on them |
| `wbs-mcp`, the MCP server's store                                                               | always: nothing backs it up today                                                                                                          | never                                                                  | not carried; a new claim starts empty and its clients sign in again (assumed; the WBS owner confirms in A18)              |
| The new cluster's etcd                                                                          | A3                                                                                                                                         | A5                                                                     | empty until then                                                                                                          |
| OpenBao's store                                                                                 | A7                                                                                                                                         | its first snapshot, in A7                                              | pull request #935 owns its backup; no drill restores a cluster that holds the store, since A6 precedes it                 |
| Harbor                                                                                          |                                                                                                                                            |                                                                        | its own change                                                                                                            |
| `platform-db` and `nonproduction-db`                                                            | their first sync                                                                                                                           | their first base backup with WAL archived, in the same step (A26, A27) | empty until an app is ported; a port may not write production data before A28's restore receipt                           |

The first three windows have no fixed end, because A18 and A20 wait on work this change does
not own. The owner accepted them on 2026-11-21 (R30). A manual copy of the three stores to the
bucket before h1claw is deleted would narrow the loss to what is written afterwards; it is
offered, not required.

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
  app namespace, which its design scopes to platform Secrets today (decision 5).
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
- Its bundled PostgreSQL stays (R42). If the owner overrules that, the Harbor change needs:
  the chart's external database settings in place of the bundled one, a database and owner
  role on `platform-db`, its memory figure and stop rule recomputed without the database
  pod, its backup step replaced by the cluster's, and an order after `platform-db`, which
  would then block the WBS units.

**Fleet repository and release bootstrap.** Website registry routing, the fleet's website pins
and `release-pin.ts` stay untouched. The website's present overlays cannot be read by Argo CD
as they are: they carry encrypted Secrets that only a decrypting reconciler can apply. The new
cluster needs a directory of its own there with the public-name issuers, a staging and a
production overlay per app whose Secrets are ExternalSecrets, and a check that plays the part
`fleet-check` plays for Flux units. That check carries rules (f), (g), (k), (m)
and (n) of slice 2.4 and the prefix rule of slice 3.1 for its overlays. No automated identity
writes to that repository. Each stateful app lands there in two merges: first with its
workload at zero replicas and its backup job suspended, then, after the restore, at one
replica with the job running (guard 1). The session that holds the release bootstrap
writes that directory, after its bootstrap finishes (R11). The Applications follow that
repository's `main`; task 0.6 gives it a ruleset before A2.

**Continuous integration: one executor, several triggers (R31, slice 3.7).** Read on
2026-11-21: the `ci` workflow runs on the provider's hosted runners for every pull request and
every push to `main`. The host gate and the release builds are started by hand over SSH,
through `run_heavy_job`, which admits each as a job of the host pool from
`infra/jobs/catalogue.json`; the catalogue has `gate`, `release-build` and
`solver-image-publish`. Nothing on a host is started by GitHub, and nothing reports a host
job back to it. One self-hosted runner, `puni-deploy`, serves the manual `deploy-k3s` workflow;
[deployment](../../../docs/infra/deployment.md) requires it to sit in a runner group limited to
that workflow file at `refs/heads/main` and to run the hook
`infra/ci/deploy-runner/job-started.sh`, which fails every job with another workflow
reference. WBS dev follows `main` through a poller on h2puni and runs from source.

The owner's decision keeps that executor and adds triggers to it:

- **Executor.** The host pool on the CI host. Every job is a catalogue entry started through
  `run_heavy_job`, so one admission, one queue and one record cover gates and builds.
- **Trigger: command line.** As today: an agent logs in and starts the launcher.
- **Trigger: GitHub Actions.** A workflow whose one job runs on a self-hosted runner on the CI
  host and does nothing but start a catalogue job and report its exit. It fires on `push` to
  `main`, filtered by the app's paths, and on a manual run at `main`.
- **Triggers to come.** MCP and the `puni-user-platform` API. Not designed here. The
  constraint they inherit: a trigger submits a catalogue job through the pool and has no
  execution path, credential store or queue of its own.

What makes the GitHub trigger safe on a public repository is configuration outside this
repository's checks, so both parts are preconditions of A23, read back there, and the lint is
only the third line:

- **Runner group.** The runner is in a group of its own, limited to the repositories that
  build and to "selected workflows": the build workflow file at `refs/heads/main`. GitHub then
  sends that runner no job of a pull request, of a workflow added on a branch, or of a manual
  run on another ref. The organisation's plan is `team`; that it offers the selected-workflows
  limit is believed and is read back in A23.
- **Hook on the host.** The runner's `.env` sets `ACTIONS_RUNNER_HOOK_JOB_STARTED` to a
  root-owned copy of a job-started hook that fails every job whose `GITHUB_WORKFLOW_REF` is
  not in the runner's own allow-list of workflow files at `refs/heads/main`. Slice 3.7
  generalises the existing hook to such a list and keeps its proof. While the group limit
  works no such job arrives, so A23 proves the hook by running it directly.
- **A persistent runner**, registered once, like `puni-deploy`. An ephemeral runner needs a
  credential on the host that can mint registration tokens, which reaches further than the
  runner's own.
- **Lint.** A workflow that names the build label may have two triggers and no other: `push`
  to `main` and `workflow_dispatch`. The rule is an allow-list, so a trigger it does not
  know is refused. A lint cannot stop a run: a pull request's own workflow runs before `gate`
  decides. That is why the first two are required and this one is not relied on.

The build itself:

- **Push.** Images go to Harbor by digest with a robot that may push to one project.
- **Pin.** The job writes the new digests into a **staging pins repository**: a new private
  repository that holds staging pins and nothing else, and that only staging Applications
  read. It writes there as a GitHub App installed on that repository alone. The App is not
  installed on this repository, whose `main` is the cluster's administrative boundary
  (decision 3), nor on the fleet repository, whose `main` the old cluster's Flux reads and
  which holds production overlays and the bootstrap Secret files. Its reach is staging by
  construction: nothing it can write is read by a production or platform Application.
- **How an overlay reads its pins.** Not settled by reading. Argo CD documents a second
  source by reference for Helm value files only (the multiple-sources guide at the tag), and
  rule 2.4(d) refuses a remote kustomize base. Two candidates for slice 3.7 and the app
  owners: the pins repository carries each app's top `kustomization.yaml` with its `images`
  entries and reaches the overlay through a Git submodule fixed at a commit; or the staging
  unit is rendered as a chart whose value file is the pin. Until one is shown in the
  rehearsal, a staging pin is moved by a person's pull request in the repository that holds
  the overlay.
- **The website's pins.** The website's and the request app's pins are in the private fleet
  repository and belong to the session that owns `release-pin.ts`. This plan designs no
  change to that tool. Whether those apps' staging pins move to the pins repository is that
  owner's to decide.
- **Promotion.** A person's pull request copies digests from the staging pins into the
  production overlay, in the repository that holds it. Before opening it the person checks
  three things: the pool's record of the build job names that digest and a commit of `main`;
  the staging Application runs that digest and is Healthy; and it has run there long enough
  to have been used. After the merge the production Application is OutOfSync, and the owner
  syncs it (R20). None of the three detects a build that was altered on the CI host; that is
  R35.
- **Retired by this.** The WBS dev poller, with the dev stacks (A18).

**Credentials on the CI host, and what that host is trusted with (R35).** Three: the runner's
own credential from its one registration, the App's private key, and the Harbor push robot's
Docker config, which the Harbor change's reconciler writes. Each is a file owned by a build
user, `puni-build`, in a directory of mode 0700; none is a GitHub secret, and the runner user
has no login to another host. File modes do not put them out of a gate's reach, and the plan
does not claim so: the gate user is in the `docker` group, which the `gate_host` role itself
calls root-equivalent, so code that a gate runs can read any file on the host and can change
what a later build produces. The credentials reach staging only: the robot pushes to one
project, the App writes the staging pins repository, and the runner accepts one workflow at
`main`. What is not bounded is image integrity. An image built on this host may not be what
its commit says; staging runs it at once and production runs it after a promotion. That is
the accepted blast radius of the CI host while there are no production users. Two things
would shrink it later: gates that run without root-equivalent Docker, which means rootless
Docker for the gate user, or builds on a host of their own.
**A build waits behind a gate.** The pool reserves the whole host for a gate, and `gate` may
not be listed in `concurrencyEligible`. Until the pool owner makes the build eligible to run
beside a gate on the larger host, a merge reaches staging only after the running gate ends,
which can be hours.

Needed from other owners: from the gate pool's owner, a catalogue entry for the staging build
(or the use of `release-build`), its launcher checkout, its entry in `concurrencyEligible`, the
build user in the gate-host role and how that user submits to the pool; from the release
bootstrap's owner and the WBS deploy tooling's owner, the build entrypoint and how their
staging overlay reads its pins; from the Harbor change, the project and the push robot; from
the owner, the staging pins repository and the App.

**Dev environment (follow-up change, proposed name `add-dev-environment`; R34).** Not
designed here. It has to design:

- a `dev` AppProject with its own namespaces and a kind whitelist that leaves NetworkPolicy
  out, unless admission is shown to bound it;
- dev Applications with automated sync off;
- an account that may sync `dev/*` at another revision, and what that privilege admits
  besides a revision, local manifests among them;
- a catalogue job that builds a named ref through the same pool and runner;
- store paths, roles and hosts for dev;
- a solver for dev on the terms of decision 1;
- dev's budget, from measurement.

It may rely on what this change leaves in place: the node and its capability; the three
namespaces with their quota and default-deny; the admission policies for placement and
names; the taint on the platform node; per-namespace store roles; and the project
allow-lists.

**Ports from SQLite to PostgreSQL (four follow-up changes; R36).** Not designed here. Proposed
names and what each has to decide:

| Change                                                     | Decides                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port-wbs-to-postgres`                                     | the large one. Its first step is a count of raw SQL, SQLite-only features and synchronous database call sites, which is being taken separately and is not estimated here. Then: the driver and query layer, a new migration baseline, the data move for production and for the staging tracker, what replaces the SQLite backup and verify jobs, and whether the solver's node binding and `Recreate` still apply |
| `port-website-to-postgres`, `port-request-app-to-postgres` | owned with the release tooling's session: the same questions at smaller size, and where the connection Secret enters the fleet repository's overlays                                                                                                                                                                                                                                                              |
| `port-mlflow-to-postgres`                                  | MLflow's backend store on PostgreSQL, where its artifacts stay, and the move of the existing runs                                                                                                                                                                                                                                                                                                                 |

Each inherits these rules, which are requirements on the port and not slices here: schema
steps that run while the backend is stopped are fast (create or drop a table, add a nullable
column, rename, a small index); a long change is expand and contract (new structure,
backfill in small batches by the running app, switch reads, drop in a later release); a gate
check times each new migration against a production-size copy and fails above about 5
seconds, with a proof that a deliberately slow migration trips it; the backend answers 503
with `Retry-After` during its restart and the frontend retries. Each port also provides its
app's database, owner role and connection Secret as objects of the database units, moves its
staging copy first, removes its SQLite claim, backup jobs and custody rule only after its
PostgreSQL data has a base backup, and may not write production data to `platform-db`
before A28's receipt exists. What ends with a port: for that app, R9's node-local SQLite
volume, `Recreate`, the hourly SQLite backup, its row in `sqlite-custody`, and guard 3's
prefix rule.

**Client databases and a replica (follow-up, proposed name `add-client-databases`).** A
cluster `clients-db` for small client apps, a cluster of its own for a large or sensitive
client, one database per client so that a handover is a dump and an offboarding is a drop;
and the second database node with a replica of `platform-db`. Triggers: the first client app
that needs a database; the first user who depends on uptime. An offsite copy of the backups
at a second provider belongs there too and is recommended; this plan names no provider.

**WBS overlays and the WBS deploy repository (slices 3.5 and 3.8).** Owned by the WBS deploy
tooling's owner. Both overlays render the namespaces `wbs` and `wbs-solver`, so staging and
production cannot share a cluster as written, and the solver binding is literal (decision 1).
Needed: distinct namespaces for staging, and no staging value that names a production
namespace or Service; the staging parameter ConfigMap of decision 1; the selector patches of
decision 1; a backup prefix
per decision 7; ExternalSecrets where the overlays expect SOPS Secrets; images from Harbor
(R28); for staging, the hostnames and the issuer its overlay names today, which is the ACME
staging issuer. The cutover plan lists the deploy repository and its read key as a
prerequisite; if it does not exist when A2 runs, the WBS Applications read
`deploy/k8s/wbs` in this repository and no key is made. The `delivery` check reads the
overlays in this repository. What the deploy repository renders from them is checked there, by
a check that carries rules (f), (g), (k), (m) and (n), as the fleet repository's does. For
production, the operator writes the admission list and the supervisor's rule before the owner
syncs a new backend (decision 1); that procedure is this owner's. The simple
move of R28 uses none of the cutover plan's Flux objects. What a later WBS deployment needs
beyond a sync, such as the migration capture `AGENTS.md` requires of Kubernetes callers, is
that owner's to state; this plan does not design it.

**Gate pool (`dash-host-jobs`).** Needed from its owner: enrollment and calibration of h8ci,
its pool budget and headroom, and whether it runs two gates at once; what the continuous
integration paragraph above lists, the build's place beside a gate first;
before A21 and A22, either
a withdrawal step for h4claw and h2puni or written confirmation that none is needed; cleanup of
the capacity those hosts report.

**Where images come from.** No node is configured with a registry mirror: `bootstrap.yml` and
`join.yml` do not run the `registry_client` role.

| Images                                                                                                          | Pulled from                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argo CD, cert-manager, the observability stack, MLflow                                                          | their upstream registries, by digest                                                                                                                                                                                                                                                                           |
| Harbor, OpenBao, the External Secrets Operator, the CloudNativePG operator, its plugin and the PostgreSQL image | upstream, by digest; never from Harbor                                                                                                                                                                                                                                                                         |
| Website and request app, both environments                                                                      | the registry the fleet's release pins name today, with the pull Secret from OpenBao (R11)                                                                                                                                                                                                                      |
| WBS, both environments                                                                                          | Harbor (R28), pushed there by the builds on the CI host (R31)                                                                                                                                                                                                                                                  |
| The WBS solver image, pulled by each app node's own Docker in `solver.yml`                                      | the registry its reference names. The reference is an input of the play that no inventory here sets, and the role logs in nowhere and installs no CA. If it names Harbor, the host first needs Harbor's CA and a pull robot, from the `registry_client` role or what the Harbor change puts in its place (A17) |

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
| Task 0.5: the escrow check                        | guard 2; it is also the one thing to do before h1claw is deleted                |
| Task 0.6: the rules on the `main` refs            | A2 writes to the fleet repository and A4 makes `main` here the cluster's source |
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

Pull request #935 does not block A1 to A6. It blocks A7. Nothing of decision 11 blocks any
stage before the sixth.

The rest can wait: open question 1 until A14 at the earliest and A21 at the latest; open
questions 2 and 3 until the owner takes up stage 6; the staging pins repository and its App
until A23.

### 11. PostgreSQL hosting

Requested by the owner on 2026-11-21 (R36). A brief from another session came with the request;
where it differs from this plan, this plan holds, by his word. What the brief marked as from
memory was read in the CloudNativePG documentation at tag v1.30.2 and the Barman Cloud
plugin's at v0.16.0 ([verify.md](verify.md#cloudnativepg-behaviour)).

**What this change does and does not do.** It stands the service up: an operator, a backup
plugin, a production cluster on a node of its own, a non-production cluster, backups, alerts,
and a restore that has been seen to work. It ports no app. Until an app's own change lands,
that app keeps its SQLite store and everything this plan says about it.

**Operator and plugin.** Two platform units, synced on command, on the platform node with the
selector and toleration of decision 1:

- `cnpg-operator`: the `cloudnative-pg` chart 0.29.2, which carries operator v1.30.2, as a
  wrapper chart around the locked archive. Its CRDs are chart templates (`crds.create`), not a
  `crds/` directory, so rule 2.4(j) has nothing to add; they are large, so the unit uses
  `ServerSideApply=true`. The chart's own PodMonitor and Grafana dashboard are off: the
  dashboard is a subchart behind a condition, and the Prometheus stack here runs without
  Grafana. The operator watches every namespace; rule (o) of the `delivery` check refuses a
  `Cluster` outside the two database units.
- `barman-plugin`: the `plugin-barman-cloud` chart 0.9.0, plugin v0.16.0, in the operator's
  namespace, as its installation page requires. It needs operator 1.30 or newer and
  cert-manager, both present. It is the supported way to back up to object storage: the
  in-tree Barman integration has been deprecated since 1.26, 1.31 is the last minor release
  that carries it (backup page at the tag), and this plan never uses it.

**Clusters.** Each is a kustomize unit in the `platform` project: a `Cluster`, an
`ObjectStore`, a `ScheduledBackup`, a PodMonitor, and the `Database` and `DatabaseRole`
objects of its apps.

|                                     | `platform-db`                                                   | `nonproduction-db`                                  |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| Node                                | the database node: selector `database`, toleration of its taint | the non-production node: selector `nonproduction`   |
| Namespace and its environment label | `postgres`, `platform`                                          | `postgres-nonproduction`, `staging`                 |
| Instances                           | 1                                                               | 1                                                   |
| Storage                             | `puni-retain`, 30 GiB data and 8 GiB WAL                        | `puni-retain`, 10 GiB data and 4 GiB WAL            |
| Backups                             | its own bucket and key                                          | the non-production bucket and key                   |
| Serves                              | production databases                                            | staging databases; dev's, once the follow-up exists |

- **Why staging has a cluster of its own** (R40). Staging follows `main`, so a merged
  migration or a runaway query lands there first, and point-in-time recovery restores a whole
  cluster. On one instance either would reach production data. On the non-production node
  the staging cluster sits behind the same admission rule as every staging pod (slice 2.10:
  its namespace is labelled `staging`, so its pods must select `nonproduction`), behind the
  staging backup key, and on a disk that holds no production data. A second cluster on the
  database node would share that node's disk and kernel and would make its taint mean less.
- **One database and one owner role per app**, declared with the operator's `Database` and
  `DatabaseRole` resources (the second is new in 1.30). A role owns its database and cannot
  connect to another: the connect privilege of `public` is revoked on each database, and how
  that is declared is slice 4.3's to establish. No shared tables. This
  change declares two databases, `canary-a` and `canary-b`, in each cluster, so that the units,
  the backups, the drill and the isolation negative have a subject; each port adds its own.
- **A single instance is a single point of failure**, also for every k3s or kernel upgrade of
  its node: the database is down for that reboot. Node-local storage binds the instance to
  its node; a lost node is a restore from object storage (R41), not a reschedule. The replica
  is the follow-up's (decision 9), and moving the instance is replica then switchover.
- **Deleting a `Cluster` deletes its claims.** The storage class retains the volume's data on
  the node, and the two sync options keep delivery from deleting the object, but a `Cluster`
  deleted by hand is outside what delivery can protect; the backups are what remain.

**Placement and containment.** The instances are pods the operator makes, so no pod template
of theirs is in the tree. Rule (o) of the `delivery` check reads each `Cluster` instead: its
`affinity.nodeSelector` names the capability of its row above, `platform-db` alone tolerates
the database taint, and no other object in the tree does. The three node agents tolerate every
taint and run there as on every node (decision 1). The admission policy of slice 2.10 already
denies a pod in `postgres-nonproduction` that does not select `nonproduction`; slice 4.3 adds
the matching clause for `postgres`, which must select `database`. Each database namespace has
the `policy` unit's default-deny; what it allows is the operator, the scrape, and port 5432
from the namespaces of the apps that have a database there, production to `postgres` and
staging to `postgres-nonproduction`. Rule 2.4(k) already refuses a staging object that names a
production namespace or Service, which now includes the production database's.

**Secrets.** No superuser access is enabled, so no superuser Secret exists to guard. An owner
role's password is generated in OpenBao at a path of its app and environment. Two
ExternalSecrets read that one path: one in the database namespace, which the `DatabaseRole`
names as its `passwordSecret`, and one in the app's namespace, which is its connection Secret.
`secret-sync` gains a SecretStore for each database namespace, bound to that namespace's role
in the store, as for every other namespace. Rotation is a new value at the path: the operator
changes the role when its Secret changes, and the app reads the new one at its next restart.
Between the two refreshes the app can hold the old password; a rotation is therefore followed
by a restart of that app, and the port's change says how.

**Backups and recovery** (R41).

- _Physical._ The plugin archives WAL continuously and a `ScheduledBackup` takes a base
  backup every night, both to the cluster's `ObjectStore`, with a 30-day recovery window that
  the plugin's retention enforces. PostgreSQL switches a WAL file at least every five
  minutes by the operator's default (from memory; slice 4.3 sets it explicitly), which is the
  loss bound of R41.
- _Logical._ A nightly CronJob dumps each database on its own, so that one app's data can be
  handed over or put back without the rest. Dumps are kept 90 days by the planner of slice
  3.1, under a prefix of their own.
- _Credentials._ Each cluster has its own object storage key. `nonproduction-db` uses a key
  that cannot read a production bucket, as staging's SQLite backups do (decision 5); A26's
  receipt repeats that refusal. Barman does not encrypt on the client as today's SQLite
  archive is encrypted: these backups rely on the bucket. Whether the provider encrypts at
  rest was not read, and it is listed under Risks.
- _Recovery is never in place._ The operator restores by bootstrapping a new cluster from the
  object store, to the end of the archive or to a point in time. So rolling one app back
  means restoring the whole cluster beside the live one and copying that one database
  across. Slice 4.5 writes that as a runbook and A28 runs it once.
- _The drill._ A weekly CronJob restores `platform-db` into a throwaway cluster on the
  database node, runs sanity queries, records the duration, deletes the cluster and exports
  the result as a metric; a failed or missing drill is an alert.
- _Velero stays out._ A file copy of a running PostgreSQL is not consistent. Velero's one
  schedule here names the registry namespace and takes no volume by default; rule (o)
  refuses a schedule that includes a database namespace.
- _Offsite._ A copy at a second provider is recommended and not planned (decision 9).

**Observability.**

- Metrics: each instance serves them on port 9187, named `metrics`. The `Cluster` field that
  made a PodMonitor is deprecated at this version, so each unit carries its own PodMonitor;
  the Prometheus stack's selectors are open, so nothing else is needed. The plugin adds the
  backup timestamps under the prefix `barman_cloud_cloudnative_pg_io`.
- Alerts, as PrometheusRules that land with each cluster unit, since a rule lands with its
  subject (decision 3): data or WAL volume above 80% and above 90%; WAL not archived for 10
  minutes; no base backup for 26 hours; instance not ready; connections above 80% of the
  limit; a transaction open for more than 5 minutes; the restore drill failed or absent. The
  replica-lag rule lands with the replica. The exact series are read from the operator's
  default monitoring ConfigMap at the pinned version in slice 4.4, not written from memory.
- Logs: the operator writes PostgreSQL's log as JSON to standard output, which the OTel
  collector already ships. The units set `log_min_duration_statement` to 500 ms,
  `log_lock_waits` on and `log_temp_files` to 0. Slice 4.4 checks that the collector's
  redaction covers a connection string in a logged statement.
- Query statistics: `pg_stat_statements`, which the operator loads when one of its
  parameters is set, with a custom metrics query for the heaviest statements.
- No dashboard: the Prometheus stack here runs without Grafana, and the brief's interim
  scrape into Victoria is dropped with Victoria (R15).

**What it needs from other owners.** From pull request #935: a path, a policy and a role per
database namespace, and a way to generate a password at a path. From the fleet repository's
and the WBS overlays' owners: nothing until their port. From the owner: the two object
storage keys, and the server.

## Decision records (become ADRs at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so the three texts stay here. Task 0.2 files them.

> # Each fleet host has one node role, on a cluster rebuilt from source
>
> One host was the k3s server, the public edge, the product node, the registry host and a gate
> host. A gate reserves its whole host and Harbor did not fit beside it, and the secret store
> would have sat next to the internet-facing ingress. On 2026-11-21 the owner decided that each
> host is reserved for one kind of work (platform services, continuous integration,
> observability, or production apps) and that the cluster is recreated on new servers. Later
> that day he added a fifth kind, non-production, for staging and dev as two environments, and
> a sixth, database, with the decision to host PostgreSQL.
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
> - Argo Workflows for continuous integration, which the owner considered on 2026-11-21 and did
>   not take. It needs an inbound webhook and runs branch code inside the production cluster,
>   and it would be a second scheduler beside the host pool that already admits gates.
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

> # PostgreSQL is hosted on the platform cluster, and the apps move to it
>
> Every app kept its data in SQLite: one writer, on a volume bound to one node, so a
> deployment stops the backend and nothing fails over. On 2026-11-21 the owner had first said
> he wanted SQLite for as long as possible; later that day he asked for PostgreSQL hosting and
> said that every app uses it once it is in place.
>
> ## Considered options
>
> - SQLite with continuous replication to object storage. Far less work, and loss falls from
>   an hour to seconds. The one writer and its node stay, so deployments still stop the
>   backend. It remains the fallback for an app whose port proves too expensive.
> - A managed database at the provider or elsewhere: a meter and a dependency outside the
>   platform, which the owner ruled out for compute and data.
> - PostgreSQL on the production apps node: the database beside the public edge.
> - One cluster for staging and production: a merged migration reaches production data, and
>   point-in-time recovery restores both.
>
> ## Consequences
>
> CloudNativePG runs one production cluster on a node reserved for it and one non-production
> cluster on the non-production node. Each app has its own database and role. Backups are
> continuous WAL archiving, nightly base backups and nightly dumps per database; recovery
> restores a whole cluster beside the live one, so rolling one app back is a restore and a
> copy, practised by a drill. Targets: five minutes of loss at most, a restore within two
> hours until the first drill replaces that figure. One instance on one node is a single
> point of failure until a replica has a node. No app is ported by this decision: each port
> is its own change, the WBS one is large and unmeasured, and until a port lands that app
> stays on SQLite with everything that implies. Harbor keeps its own database, so that a
> pull never waits on the database node.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving.
- **Production on one node, non-production on another.** Losing the production apps node
  stops production and loses up to an hour of SQLite; losing the non-production node stops
  staging and the agents' tracker. Staging and production still share the control plane,
  the secret store and the registry.
- **Dev is not delivered by this change** (R34). The owner asked for two environments; this
  change builds staging and leaves dev sized and contained. Once dev runs it shares the
  node's CPU and disk with the tracker, and it gets no solver until the follow-up closes the
  socket and sweep problems of decision 1.
- **Containment at admission is new and unproven.** The placement and name policies of
  slice 2.10 have never run; a NetworkPolicy's peers are not bounded at admission at all.
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
- **Sync deploys the overlay as `main` holds it at that moment.** The images are the digests
  promoted there; manifests changed by two merges between two syncs go out together.
- **An Application object follows `main` even for production.** Only its workloads wait for a
  sync. Four rules in a required check keep an edit from deploying by itself (decision 3).
- **A self-hosted runner on a public repository.** Its restriction is a runner group and a
  hook on the host, both outside this repository's checks and read back only in A23
  (decision 9).
- **The CI host is one trust zone** (R35). The gate user is root-equivalent there, so branch
  code in a gate can read the robot, the App key and the runner credential, and can alter a
  later build. The credentials reach staging only; the integrity of an image that
  production later runs by promotion is what is accepted. Rootless Docker for gates or a
  build host of its own would shrink it.
- **A staging build queues behind a gate** until the pool owner lets it run beside one.
- **On staging, a merged pin admits a backend to the solver socket**, and the supervisor
  there checks the caller's name, not its image (decision 1).
- **How a staging overlay reads its pins is not settled** (decision 9). Until it is, a
  person moves each staging pin.
- **Staging follows manifests, not yet code** (slice 3.7).
- **Two delivery tools.** See the second decision record.
- **Two clusters with one identity** during the build. Separate credentials, a separate
  snapshot bucket, a separate SQLite prefix and distinct kubeconfig context names are the
  guards. Argo CD targets only the cluster it runs in.
- **Restores are the migration.** A store whose backup has never been restored fails at the
  switch. With R26 that costs downtime, not data, as long as guard 1 holds.
- **Old-host stores run without an off-host backup** from the day h1claw is deleted until
  each has moved, with no fixed end. The owner accepted this (R30, decision 7's table).
- **The observability units have never been healthy in production.**
- **Losing the platform node loses the jump.** The controller then reaches each server through
  that server's own public SSH endpoint (R17).
- **WBS waits on work this change does not own**: Harbor, and overlays that let staging and
  production share a cluster (slice 3.5), beside the solver binding (slice 3.8). Until then
  the dev tracker stays on h2puni and h2puni cannot be deleted.
- **Two dev databases and a configuration archive on h2puni are not carried** and lose their
  only backup with h1claw (decision 7).
- **Removing a unit takes two merges and a command** (decision 3).
- **PostgreSQL is hosted before anything uses it** (R36). Until the first port lands it is
  a service with a canary and no consumer, which is how the registry stood for a month. The
  owner chose when to create its server for that reason (R37).
- **One PostgreSQL instance on one node.** Its loss, and every reboot of its node, stops
  every app that has moved to it; a lost node is a restore of up to two hours (R41).
- **The database node's peak budget is tight** on 8 GiB, and every figure in it is assumed
  (decision 2).
- **Database backups are not encrypted by the client.** They rely on the bucket and on a
  key of their own; what the provider does at rest was not read.
- **Two stores per app for a while.** Between an app's arrival on SQLite and its port, the
  plan carries both mechanisms, and the ports are four changes this one does not size.
- **A password rotation needs an app restart** (decision 11).

## Open questions for the owner

1. The incoming-webhook address of `#puni-alerts-dev`. The channel is decided and the owner
   said the address comes later; it is a secret he writes into OpenBao. Stage 1 does not wait
   for it. A14 proves delivery only once it exists, and A21 and A22 wait for that proof. The
   Harbor change waits on the same answer. The old path, a message relayed from h1claw, ends
   with that host. The planning session recommends a second channel for production alerts
   once production has users.
2. When to create the database server, and whether its assumed shape stands (R37). He said
   he will evaluate the options. Stage 6's second half waits for it and nothing else does;
   the first half, with `nonproduction-db`, needs no server.
3. Whether Harbor keeps its bundled database (R42, the planning session's recommendation) or
   uses `platform-db`, which the words "everybody" could cover. Decision 9 lists what the
   Harbor change would need.

Not questions, but his to overrule by id: R34, that dev is delivered by a follow-up change;
R35, that the CI host is one trust zone while there are no production users; and R38 to R41,
the shape of the PostgreSQL service and its recovery targets.

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings, and no Argo CD
  instance was run.
- That the `argocd` CLI in core mode syncs an Application and waits for its health with the
  node's credential alone. If not, the owner decides (decision 3).
- That `server.rbac.rollback.enforce.enable` refuses a rollback by the local account, and that
  an `operation` block in an applied Application starts a sync. Both are documented; neither
  was run.
- That the root, without prune, leaves an Application whose file was removed.
- Whether the organisation's plan can limit a runner group to selected workflows (the plan
  reads as `team`; the group settings could not be read), and whether the object storage
  provider can limit a key to one bucket.
- That the role's inventory can express a rule with no caller image once the decoder allows
  it for the staging caller, and that a staging-owned parameter ConfigMap satisfies the
  admission policy as copied.
- That the admission policies of slice 2.10 can be written in the form the trusted-workload
  policies use, for Traefik's custom resources as well as for Ingress and Certificate.
- Which registry the solver image reference names, and so what the app nodes' Docker needs
  to pull it.
- How a second Unix user submits a job to the host pool, which today is configured for the
  gate user.
- How a kustomize overlay takes its image digests from a second repository. Only the Helm
  value-file reference was read in the multiple-sources guide; the submodule route was not
  tried.
- What the MCP server keeps in `wbs-mcp`, and so what is lost by not carrying it.
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
- How MLflow stores its data on h3mon, and whether one SQLite file and one directory are all
  of it.
- The figures for `puni-request-app`, OpenBao and the staging WBS database's growth.
- Pull request #935 beyond its design file at its branch on 2026-11-21.
- How the connect privilege of `public` is revoked declaratively on a database.
- Nothing of CloudNativePG was run. Read and not run: that a `Cluster` on a node-local
  `Retain` class with a separate WAL claim starts on one tainted agent; that the plugin
  archives WAL to this provider's object storage; that `enableSuperuserAccess` is off by
  default at this version (from memory); that a `DatabaseRole` follows a changed password
  Secret without a restart of PostgreSQL.
- The exact metric names behind the PostgreSQL alerts, and the memory of an instance, its
  sidecar, the operator and the plugin.
- Whether the object storage provider encrypts at rest, and whether Barman's own
  server-side encryption options work against it.
- How long a restore of `platform-db` takes; R41's two hours is a placeholder until A28.
- That the operator chart's archive, which carries a subchart behind a condition, renders
  with the network disabled.
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
