## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. This is the tenth draft of the change: the
ninth, revised after a ninth review and then split in three. This change keeps the cluster
rebuild. PostgreSQL hosting is the change `host-postgres`, and the two hosts for agents are
the change `add-agent-hosts`; each is stacked on this one, and the three together are the new
setup plan. [verify.md](verify.md#replaced-drafts) records the drafts it replaces, what the
nine reviews found, and how ids moved.

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

**Non-Goals**

- Designing Harbor, OpenBao, the WBS overlays or each app's build and pin tools. Their
  changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- Moving workers clusters or the existing labs off Flux (R27).
- High availability, continuous SQLite replication, single sign-on for Argo CD.
- PostgreSQL hosting, and porting any app from SQLite to it: the change `host-postgres` and
  the follow-ups it names.
- The agents host and the workstation: the change `add-agent-hosts`.
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
dev and staging get a node of their own (R29). Last, he asked for PostgreSQL hosting and for
two hosts for agents; those are the changes `host-postgres` and `add-agent-hosts`.
A row marked **decided** records one of those; the rest are assumed and can be overruled by
id. R14 and R18 of the second draft stay withdrawn, and R36 to R44 of the ninth moved to the two stacked changes ([verify.md](verify.md#ninth-review-at-5c54a1707-what-became-of-its-findings-and-the-split)).

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Alternative and its cost                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new cluster is built on newly created servers. An old host is deleted once its data is confirmed restored and, for a gate host, once its successor is calibrated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reinstall the existing servers. Cost: gates stop for other sessions while a gate host is rebuilt                                                                                                                              |
| R2  | **Decided.** Three servers of 8 vCPUs and 16 GiB and a CI host of 16 vCPUs and 32 GiB. The observability server's root disk is at least 180 GiB (decision 2). Assumed: the non-production server of R29 is 8 vCPUs and 16 GiB as well                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A CI host of the smaller class. Cost: one gate at a time at about 5 h 20 min. A non-production server of half the size. Cost: decision 2 shows staging alone does not fit beside one solve, before any dev environment        |
| R3  | **Decided.** Node ids and host names are `h5plat`, `h6apps`, `h7obs` and `h8ci`. Assumed: `h9stg` for the non-production server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                                                                                                                                          |
| R4  | **Decided.** The owner creates each server in the provider console; it is enrolled by static inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                                                                                   |
| R5  | The new cluster keeps the cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed. **Decided:** machine ids and private addresses are recorded where the fleet model records them today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A new cluster id. Cost: the id list is closed in the `backup` role, `platform.ts` and `recover.ts`                                                                                                                            |
| R6  | New: k3s credentials, a SOPS age identity that never enters the cluster, the repository read keys, the Argo CD account, everything OpenBao generates. Carried from escrow: the registry CA, the object storage credentials                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Reuse every secret. Cost: the old cluster's credentials would open the new one                                                                                                                                                |
| R7  | Build order: platform, CI, observability, apps, then retirement (decision 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Apps before observability. Cost: data arrives before the alert and backup units are healthy                                                                                                                                   |
| R8  | One new capability, `platform-services`, pins Argo CD, cert-manager, Harbor, OpenBao and the External Secrets Operator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | One label per service, as pull request #935 proposes with `secret-store`. Cost: several labels that always sit on one node                                                                                                    |
| R9  | Storage stays node-local with policy `Retain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Provider volumes. Cost: SQLite on a network volume is what the owner ruled out                                                                                                                                                |
| R10 | Harbor is the only registry the new cluster ever runs. Its tree has no Distribution unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Install Distribution first. Cost: a registry replaced before its first consumer                                                                                                                                               |
| R11 | **Decided.** The website and the request app run on the new cluster from the same release pins and source registry as today, moved after the release bootstrap finishes; the session that owns it writes the fleet repository's directory for the new cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Route them to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                                                                     |
| R12 | The CI role is gates and builds: release builds and the staging builds of R31, every one a job of the host pool. No app, staging or production, and no database runs there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dev stacks on the CI host, as the third draft had it. Cost: the agents' tracker slows under every gate and sits beside branch code                                                                                            |
| R13 | **Decided.** Backups of everything on the new cluster run inside it: each app's own backup job, and retention and the freshness alert as cluster units (slice 3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Keep an outside puller. Cost: a host whose only job is to watch another                                                                                                                                                       |
| R15 | **Decided:** MLflow is kept. Assumed: it runs on the observability node as a cluster unit with a `Retain` claim and the same backup job as the apps (slice 3.6); Victoria and Grafana are not rebuilt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A Compose service with a host timer. Cost: a second backup mechanism for one store                                                                                                                                            |
| R16 | Each node is probed from another node; the observability node from the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                                                                                   |
| R17 | The Ansible controller lives on the operator's laptop, or on the workstation that the change `add-agent-hosts` defines if the owner moves it there, and reaches private addresses through a jump on `h5plat`. When `h5plat` is off, the jump is the target server's own public SSH endpoint, which the fleet firewall keeps open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A jump on the CI host. Cost: a host that runs branch code sits on the path to every node                                                                                                                                      |
| R19 | One root Application owns plain Application files (app of apps). It syncs automatically and manages only Application and AppProject objects. The ApplicationSet controller is not installed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | An ApplicationSet with a cluster generator. Cost: a generator and a controller for one cluster                                                                                                                                |
| R20 | **Decided.** The owner on 2026-11-21: what merges to `main` is deployed on staging; a production deployment is done by hand, on command. A merge to `main` that touches an app starts a build on the CI host, which commits that app's rendered staging manifests to the staging pins repository; the staging Application's source is that directory and it syncs automatically (decision 9). The website and the request app keep the fleet repository's staging overlays as their source until their owner adopts that path (R11). Production Applications track `main` with automated sync off. Every overlay names its images by digest, so what runs in production is the digest set of its overlay at the last sync, promoted there by a merge. Assumed: platform units have no staging copy and are synced on command too                                                                                                                     | Platform units automated. Cost: a merged infrastructure change rolls out with no second look, on the one cluster there is                                                                                                     |
| R21 | The new cluster's definitions live under `infra/argocd` and share no file with a Flux-reconciled path, except chart archives locked by digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reference the existing plain manifests. Cost: an edit for one cluster reaches the workers clusters and the labs                                                                                                               |
| R22 | **Decided.** The owner on 2026-11-21: OpenBao is set up before the other services. No decryption runs in the cluster. Ansible applies only the bootstrap Secrets that Argo CD and OpenBao themselves need (decision 5); every other Secret is an ExternalSecret from the first day                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Bootstrap Secrets for the first stages. Cost: a second delivery path, built to be removed                                                                                                                                     |
| R23 | **Decided.** The Argo CD interface has no public route and one local account, which reads everything and may sync Applications of the `production` project only, at the revision the Application names; it may not roll back. The built-in `admin` account is disabled. Break-glass is `kubectl` on the platform node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Keep `admin` enabled. Cost: a second write path with one shared password                                                                                                                                                      |
| R24 | Argo CD's four workloads are limited to 1,536 MiB together until A8 measures them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No limits. Cost: the repo server's rendering can take memory from the secret store                                                                                                                                            |
| R25 | The platform node is registered with the taint `CriticalAddonsOnly=true:NoSchedule`. Platform services and three named node agents tolerate it; nothing else may                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Node selectors alone. Cost: a workload outside the checked tree can land beside the secret store                                                                                                                              |
| R26 | **Decided.** The switch may be unsafe. The owner on 2026-11-21: "we can make the switch unsafe that's ok / no prod users yet". It holds only while there are no production users; the guards of decision 7 stay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A staged switch with fences and a retained old side. Cost: the ceremony of the second draft                                                                                                                                   |
| R27 | Workers clusters and the existing labs stay on Flux. The repository carries two delivery tools until a later change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Move them now. Cost: no workers cluster exists in production to prove it on                                                                                                                                                   |
| R28 | **Decided.** WBS production crosses the simple way, like the website: stop, one backup, restore, start. The cutover plan's first-start coordinator and its replay and digest guards are not used for the move. Its images come from Harbor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The guarded cutover plan. Cost: its coordinator reads and patches Flux objects and would have to be ported first                                                                                                              |
| R29 | **Decided.** The owner on 2026-11-21: "let's do dev & staging on a sep node", and then "yeah - staging and dev must be separate envs". A fifth server, `h9stg`, holds the non-production role, with the capabilities `nonproduction` and `ingress`, and is where two environments of the three apps run, staging and dev, each with its own namespaces, hostnames, certificates, claims, OpenBao paths and backup prefix. The production apps node carries production only. He had first chosen the apps node for staging; the sixth review then read the WBS solver's host supervisor, which is written for one node (decision 1). This change delivers staging there and prepares dev (R34)                                                                                                                                                                                                                                                        | One capability per environment. Cost: two labels that always sit on one node; the AppProjects and namespaces already separate the two                                                                                         |
| R30 | **Decided.** h1claw is outside this plan and the owner may delete it at any time. Asked on 2026-11-21 to choose between accepting the backup windows of decision 7's table and keeping h1claw until WBS has moved, he answered "backup - ok". One step must precede the deletion: the escrow of task 0.5, because the existing encrypted archive is unreadable without its key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Keep h1claw until retirement as a rule of the plan. Cost: a guard the owner said he does not want                                                                                                                             |
| R31 | **Decided.** The owner on 2026-11-21: "let's keep the custom runner that can be triggered either by github actions or by agents through cli/mcp/call to 'wbs' api (it will all converge to puni-user-platform)". One executor runs every job on the CI host: the host pool and its job catalogue. A trigger is a thin adapter that submits a catalogue job through the pool's admission; it has no execution path, credential store or queue of its own. This plan has two adapters: GitHub Actions, through a self-hosted runner on the CI host, for a push to `main` and a manual run at `main`; and the command line that agents use for gates today. MCP and the `puni-user-platform` API are a direction and are not designed here. Assumed: staging images are built this way and pushed to Harbor by digest, and the same job commits the rendered staging manifests to a staging pins repository that nothing but staging reads (decision 9) | Argo Workflows, which he considered. Cost: an inbound webhook, CI inside the production cluster, and a second scheduler beside the pool. The provider's hosted runners. Cost: they cannot reach Harbor on the private network |
| R33 | **Decided** for staging. Asked on 2026-11-21 whether staging is automatic from `main`, holds the agents' tracker and promotes to production, the owner answered "ok for all three". **Staging** is deployed automatically from `main` (R20) and is the rehearsal of exactly what production will get; it holds the agents' live tracker, because today's WBS dev, which holds it, follows `main`. It replaces today's dev stacks: the `website-dev` namespace and the Compose dev stacks. Assumed, and the follow-up's to confirm (R34): **dev** is deployed on command from any ref, by an agent or the owner, to try a branch or a pull request; its data is disposable and it is never synced from `main` by itself. Promotion is staging to production only; dev promotes nowhere                                                                                                                                                                | The tracker on dev. Cost: it stops following `main`, or dev stops being disposable                                                                                                                                            |
| R32 | On the rebuilt cluster the WBS solver is bound per environment: a trusted namespace, a selector and a parameter ConfigMap for each, and each backend's caller name in the supervisor's closed list. A node runs one supervisor with one pod caller: production's on the production apps node, staging's on the non-production node. The staging caller's rule names no caller image, which the supervisor's decoder is changed to allow for that one name; the staging list of trusted backend images is rendered by the staging build into the pins repository, and production's stays outside Git (decision 1, slice 3.8). A second caller on the non-production node, dev's, waits for the follow-up (R34)                                                                                                                                                                                                                                        | Per-digest rules for staging as for production. Cost: every staging backend deploy waits for a person to run `solver.yml`, which is what R20 rules out                                                                        |
| R34 | The planning session's scoping, made on 2026-11-21 after the seventh review so that the plan converges; the owner may overrule it. This change delivers staging and only prepares dev: the non-production node is sized for both, the capability `nonproduction` and three dev namespaces exist from the start, and the platform-side containment of decision 3 binds every non-production namespace at admission, whatever a ref holds. Dev's Applications, project, account, build trigger and solver use are a follow-up change, proposed name `add-dev-environment` (decision 9)                                                                                                                                                                                                                                                                                                                                                                 | Dev delivered here, as the sixth draft had it. Cost: its isolation rested on rules in `gate`, which never see the ref a dev sync applies                                                                                      |
| R35 | Assumed, under the condition of R26 (no production users): the CI host is one trust zone. The gate user is root-equivalent there, so code that a gate runs can read the build credentials and change what a later build produces. What is accepted is the integrity of images built on that host, which staging runs at once and production runs after a promotion. The credentials themselves reach staging only: the push robot writes one Harbor project, and the GitHub App is installed on the staging pins repository alone. There they can commit any manifest that the `staging` project and admission allow, the list that admits a backend to the solver socket included (decision 9)                                                                                                                                                                                                                                                      | Rootless Docker for gates, or builds on a host of their own. Cost: a change to the gate role and a new calibration, or one more server                                                                                        |

## Decisions

### 1. Roles, capabilities and placement

| Role            | Host                                                | Capabilities                         | In the k3s cluster |
| --------------- | --------------------------------------------------- | ------------------------------------ | ------------------ |
| Platform        | h5plat                                              | `control-plane`, `platform-services` | server             |
| CI              | h8ci                                                | none: it is not a k3s node           | no                 |
| Observability   | h7obs                                               | `observability`                      | agent              |
| Production apps | h6apps                                              | `product`, `ingress`                 | agent              |
| Non-production  | h9stg                                               | `nonproduction`, `ingress`           | agent              |
| Database        | named here; defined by the change `host-postgres`   | `database`                           | agent              |
| Agents          | named here; defined by the change `add-agent-hosts` | none: it is not a k3s node           | no                 |
| Workstation     | named here; defined by the change `add-agent-hosts` | none: it is not a k3s node           | no                 |

- `platform-services` and `nonproduction` are new. Each is added to `CapabilitySchema`,
  `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`.
- The last three rows are here so that the list of roles is whole. The database role, its
  capability `database` and its taint `puni.dev/role=database:NoSchedule` are defined by the
  change `host-postgres`; the agents host and the workstation, both outside the cluster, by
  the change `add-agent-hosts`. Nothing in this change's stages needs any of the three.
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
  an object of the staging overlay, so the staging build renders it with the backend's
  digest into the same commit of the pins repository: the commit that deploys a backend
  also admits it. And the decoder allows a null caller image for
  `k8s_wbs-solver-staging_backend` and for no other pod caller; production's refusal and its
  proof stay. A staging backend deploy then needs no command; only a new solver image needs
  a run of `solver.yml`. What this gives up is stated plainly: on staging the supervisor
  checks the caller's name and not its image, so a commit in the pins repository is the only
  authority for which backend may reach the solver socket, and that repository is written
  with a credential that code in a gate can read (R35).
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

The change `host-postgres` adds its operator's limits to this node and recounts the margin.

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

**CI host.** A gate is measured at 6 cores, 9 GiB and 11 GiB of temporary space, and runs under
`min(13 GiB, pool budget − headroom)`. On 16 vCPUs and 32 GiB (R2) two such gates fit side by
side on paper, or one gate can run more tasks in parallel. Which one, and the pool budget and
headroom, are the pool owner's to set from the calibration (A10).

**Disk elsewhere.**

| Node            | What lands there                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots             |
| Production apps | Production SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB                 |
| Non-production  | The same three claims, with `wbs-data` assumed at 10 GiB because the dev database is 2.2 GB today |
| CI              | gate trees, caches, 11 GiB of temporary space per gate, release build layers                      |

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

| Project      | Holds                                        | Source                                                                                                                                                                                   | Sync                                            |
| ------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `root`       | the root Application alone                   | this repository, the root's one path                                                                                                                                                     | automatic: self-heal, no prune                  |
| `platform`   | every platform unit, the public-name issuers | this repository; one path of the fleet repository for the issuers                                                                                                                        | on command, by the operator                     |
| `staging`    | the staging copy of the three apps           | the staging pins repository, one rendered directory per app (decision 9); the fleet repository's staging overlays for the website and the request app until their owner adopts that path | automatic: prune, self-heal, retry with backoff |
| `production` | the three production apps                    | the fleet repository and the WBS deploy repository, production overlays                                                                                                                  | on command, by the owner                        |

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
- **Staging follows `main`** (R20). A merge to `main` that touches an app's paths starts the
  staging build on the CI host. The job builds the images, pushes them to Harbor, renders
  the app's staging overlay at that commit with the new digests, and commits the result to
  the app's directory in the staging pins repository. The staging Application's source is
  that directory, plain manifests at that repository's `main`: it applies a new commit
  within the reconciliation interval and reverts a manual edit in the cluster. So staging
  follows `main` for code and for manifests with no command, once slice 3.7 and A23 are in
  place (R31, decision 9). Until then nothing replaces the poller that makes the tracker
  follow `main` today, so A18's WBS part waits for A23's receipt or the owner's dated
  waiver. The `delivery` check reads the staging overlay in its source repository, which
  is what the build renders. What the pins repository holds is written with the build's
  credential and is bounded by the `staging` project and by admission, not by `gate`
  (R35).
- **Containment that does not depend on what a ref holds** (slice 2.10). The rules of slice
  2.4 run in `gate` and read `main`. That is enough for staging and production, which sync
  nothing else. A rule in `gate` cannot bind an object that is applied from another ref or by
  hand. So the `policy` unit, which only the operator syncs, carries what must hold whatever
  is applied, keyed on the namespace's environment label:
  - _Placement._ An admission policy denies a pod in a `staging` or `dev` namespace that
    does not select `nonproduction`, and one in a `production` namespace that does not
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

| Order | Unit                         | Project    | Needs                                                                                                          | First synced                         |
| ----: | ---------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
|     0 | `argocd`                     | platform   | none                                                                                                           | A4                                   |
|     1 | `namespaces`                 | platform   | none; the playbook applied them already                                                                        | A4                                   |
|     2 | `policy`, `storage`          | platform   | `namespaces`                                                                                                   | A4                                   |
|     3 | `cert-manager`               | platform   | `namespaces`                                                                                                   | A4                                   |
|     4 | `openbao`                    | platform   | `storage`; `cert-manager`, for its server certificate; the seal key and the server CA Secret from the playbook | A7                                   |
|     5 | `external-secrets`           | platform   | `policy`                                                                                                       | A7                                   |
|     6 | `secret-sync`                | platform   | `openbao`, `external-secrets`                                                                                  | A7                                   |
|     7 | `issuers`                    | platform   | `secret-sync`, for `registry-ca`; `cert-manager`                                                               | A7                                   |
|     8 | `otel-certificates`          | platform   | `secret-sync`, for `otel-server-ca`; `cert-manager`                                                            | A14                                  |
|     8 | `eck-operator`               | platform   | `policy`                                                                                                       | A14                                  |
|     8 | `prometheus-stack`           | platform   | `secret-sync`; `storage`                                                                                       | A14                                  |
|     9 | `elasticsearch`              | platform   | `eck-operator`; `storage`; `secret-sync`                                                                       | A14                                  |
|    10 | `kibana`, `elastic-settings` | platform   | `elasticsearch` and the Secrets ECK makes for it                                                               | A14                                  |
|    10 | `otel-collector`             | platform   | `elasticsearch`; `otel-certificates`                                                                           | A14                                  |
|    10 | `signals`                    | platform   | `elasticsearch`; `otel-certificates`; `prometheus-stack`                                                       | A14                                  |
|    11 | `alerts`, `probes`           | platform   | `prometheus-stack`                                                                                             | A14                                  |
|    12 | `velero`                     | platform   | `alerts`, as the Flux `backup` stage does; `secret-sync`                                                       | A14                                  |
|    12 | `elastic-snapshots`          | platform   | `alerts`; `elasticsearch`                                                                                      | A14                                  |
|    12 | `mlflow`                     | platform   | `alerts`; `secret-sync`; `storage`                                                                             | A15                                  |
|    12 | `sqlite-custody`             | platform   | `alerts`; `secret-sync`                                                                                        | A18                                  |
|    13 | `traefik`                    | platform   | `policy`; a node that carries `ingress`                                                                        | A17                                  |
|    14 | `harbor`                     | platform   | `secret-sync`; `storage`; `issuers`                                                                            | Harbor's change, before any WBS unit |
|    15 | `public-issuers`             | platform   | `traefik`; `cert-manager`                                                                                      | A18                                  |
|    16 | `website-staging`            | staging    | `policy`; `public-issuers`; `secret-sync`                                                                      | A18                                  |
|    16 | `wbs-staging`                | staging    | `policy`; `public-issuers`; `secret-sync`; `harbor`                                                            | A18                                  |
|    17 | `website`                    | production | `policy`; `public-issuers`; `secret-sync`                                                                      | A19                                  |
|    17 | `wbs`                        | production | `policy`; `public-issuers`; `secret-sync`; `harbor`                                                            | A20                                  |

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
finalizer and the root does not prune, so removing an Application file changes nothing in the
cluster. First the unit's source is reduced to one marker ConfigMap and the unit is synced with
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

The server has a ClusterIP Service, no Ingress and a NetworkPolicy; it is reached by
`kubectl port-forward` through the operator's tunnel. `policy.default` is `role:readonly`, and
the built-in `admin` account is disabled (R23).

**Data survives delivery mistakes.** Every PersistentVolumeClaim in the tree, and every
namespace that holds one, carries `Prune=false` and `Delete=false`, so removing a manifest
never deletes it. Claims that an operator creates from a custom resource are not in the tree.
The Elasticsearch, Prometheus and Alertmanager resources carry the same two options, and Elasticsearch keeps `volumeClaimDeletePolicy: DeleteOnScaledownOnly`, which the copied manifest
already sets. A custom resource deleted by hand is outside what delivery can protect. No
Application carries the resources finalizer, so deleting an Application leaves its resources.

### 4. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md). Slices 1.1 to 1.3, 2.1 to 2.6, 2.9 and
the first receipt of 2.7 are needed before the platform stage can start; 1.4, 1.5, 2.8, 3.2
and 3.6 before stage 3; 2.10, 3.1, 3.5, 3.7 and 3.8 before stage 4.
Slice 3.7 is due before A23, which A18's WBS part waits for.

| Gap                                                                                                                                                                                                                                                                       | Slice |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No capability for platform services                                                                                                                                                                                                                                       | 1.1   |
| Nothing refuses a server with `product` or `ingress`, a gate host that is a k3s node, or an untainted server                                                                                                                                                              | 1.2   |
| `validate-enrollment.yml` replaces CoreDNS's tolerations, and has never run on a cluster of one tainted node                                                                                                                                                              | 1.2   |
| One static inventory and one hard-coded cluster id in `placement.test.ts`                                                                                                                                                                                                 | 1.3   |
| The coexistence record and reservations describe h3mon with its Docker services                                                                                                                                                                                           | 1.4   |
| `observability-source.ts` hard-codes the inventory path, the two peers and the API endpoint                                                                                                                                                                               | 1.5   |
| No locked Argo CD install and no locked `argocd` CLI                                                                                                                                                                                                                      | 2.1   |
| Every chart is consumed through a Flux `HelmRelease`                                                                                                                                                                                                                      | 2.2   |
| The platform-stage manifests exist only under Flux-reconciled paths                                                                                                                                                                                                       | 2.3   |
| `validatePlatform` checks Flux units; nothing checks an Application graph, its environments, its isolation or its placement, or that a claim has a backup                                                                                                                 | 2.4   |
| `tool-fleet:check` is not a required check, so a merge can skip the `delivery` rules                                                                                                                                                                                      | 2.4   |
| `playbooks/platform.yml` installs Flux and needs the age key on the server; only it writes the cluster identity ConfigMap; nothing syncs a unit on command                                                                                                                | 2.5   |
| The controller image has no `sops`, and `fleet_ansible` mounts no fleet checkout                                                                                                                                                                                          | 2.5   |
| `tool-fleet:health` reports "no Flux objects" as a failure; the recovery manifest and drill assume Flux                                                                                                                                                                   | 2.6   |
| The lab's `platform` profile runs Flux; nothing rehearses the new tree, a one-node start or staged joins                                                                                                                                                                  | 2.7   |
| The observability, alert and backup manifests exist only under Flux-reconciled paths; the copied alert rules watch a CronJob and a cluster that do not exist yet                                                                                                          | 2.8   |
| The only build runbook is written for two adopted hosts                                                                                                                                                                                                                   | 2.9   |
| Retention and the freshness alert for `sqlite/<database>/` run on h1claw; both clusters would share the prefix                                                                                                                                                            | 3.1   |
| No probe of a node from outside itself                                                                                                                                                                                                                                    | 3.2   |
| The gate instructions name h2puni and h4claw                                                                                                                                                                                                                              | 3.3   |
| `desired.yaml` and the inventories still name the old cluster after retirement                                                                                                                                                                                            | 3.4   |
| The WBS `staging` and `prod` overlays both render the namespaces `wbs` and `wbs-solver`, select no node for three workloads, set no cluster prefix, expect SOPS Secrets, and nothing stops staging configuration from naming a production Service                         | 3.5   |
| The solver admission policy trusts one namespace, one selector and one parameter ConfigMap; the supervisor's caller list has no staging name and its decoder refuses a pod caller's rule without a caller image; the `solver` role asserts `product`                      | 3.8   |
| Nothing binds at admission: a pod in an app namespace may select any node, an Ingress, IngressRoute or Certificate may claim any host, a non-production namespace has no quota or default-deny of the platform's own, and cert-manager's solver pods carry no selector    | 2.10  |
| MLflow runs as a Compose service with no backup of its own                                                                                                                                                                                                                | 3.6   |
| Nothing turns a merge to `main` into a staging deployment: no job builds on a merge, renders the staging manifests or writes them where Argo CD reads; the one self-hosted runner serves a manual deploy workflow only, and its job-started hook admits that one workflow | 3.7   |

Six slices have no requirement in the delta spec, on purpose. Slices 1.4 and 1.5 turn two
hard-coded inputs into data, and the checks that already read those inputs are their test.
Slices 2.9, 3.3 and 3.4 are documents and the removal of the old cluster's entries, which
`AGENTS.md` exempts from a spec. Slice 2.6 had none in the ninth draft and has one now:
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

| Secret                                                                                | Namespace                     | New or carried | When                                   | Before the cluster exists           |
| ------------------------------------------------------------------------------------- | ----------------------------- | -------------- | -------------------------------------- | ----------------------------------- |
| Read keys for the fleet repository and the WBS deploy repository; host keys           | `argocd`                      | new            | A4, and its rerun before the first app | fleet repository, encrypted         |
| Read-only deploy key for the staging pins repository, which is private                | `argocd`                      | new            | A23, by a rerun of `argocd.yml`        | fleet repository, encrypted         |
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

| Secret                                                         | Consumer                 | New or carried                         | Written in | Source                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------ | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry CA key pair                                           | `issuers`                | carried                                | A7         | escrow                                                                                                                                                                                |
| `velero-credentials`, `velero-repo-credentials`                | `velero`                 | carried; generated                     | A14        | escrow; the repository password is escrowed before it is written                                                                                                                      |
| `elastic-s3-credentials`                                       | Elasticsearch snapshots  | carried                                | A14        | escrow                                                                                                                                                                                |
| `alertmanager-puni`                                            | Alertmanager             | new                                    | A14        | **decided:** alerts go to the Slack channel `#puni-alerts-dev`. Its incoming-webhook address exists and the owner holds it outside the repository; he writes it into the store in A14 |
| `otel-server-ca`, `otel-client-trust`, nine `signal-*` Secrets | observability            | new                                    | A14        | generated by the operator                                                                                                                                                             |
| MLflow backup credentials                                      | `mlflow`                 | carried                                | A15        | escrow                                                                                                                                                                                |
| Staging app Secrets: runtime, pull and backup credentials      | staging namespaces       | carried from dev                       | A18        | the fleet repository under the old key; the dev stacks' env files                                                                                                                     |
| Production app Secrets                                         | production namespaces    | carried; WBS as its overlay names them | A19, A20   | the fleet repository under the old key; escrow                                                                                                                                        |
| Harbor's Secrets and robot credentials                         | Harbor and its consumers | as the Harbor change states            | its steps  | generated                                                                                                                                                                             |

Not carried: the registry's `registry-auth` (Harbor's robots replace it). Kept outside any
cluster: the backup archive key, which only reads the old archive, and the old cluster's age
identity, which A18 and A19 use on the controller to read the website's present Secrets.

**While OpenBao is sealed or down.** The External Secrets Operator stops refreshing. Secrets
already written to the cluster stay, so running pods keep running and restart normally. A new
ExternalSecret gets no value, `secret-sync` is not Healthy, and the sync playbook refuses the
units that need it. A unit that does not need it can still be synced. A cold rebuild restores the store before any consumer is synced. Pull
request #935 owns the alerts for a sealed store and a failed sync.

### 6. Build order

| Stage | Role          | Needs                                                                                                                        | Receipt that ends the stage                                                                                                                                                                   |
| ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Decisions     | none                                                                                                                         | overrules recorded; the secrets of task 0.5 read back from escrow; the `main` rulesets read back; the slices decision 4 lists for stage 1 landed, except 1.3, whose first revision follows A1 |
| 1     | Platform      | stage 0; rehearsal receipts 2.7/A3 and 2.7/A7; pull request #935, for A7 only                                                | server Ready; orders 0 to 7 Synced and Healthy; a canary read from OpenBao through an ExternalSecret; one etcd restore on the empty cluster                                                   |
| 2     | CI            | nothing from the cluster                                                                                                     | a gate exits 0 on the new host and its calibration is recorded by the pool's owner                                                                                                            |
| 3     | Observability | the server; OpenBao serving; slices 2.8, 3.2 and 3.6                                                                         | orders 8 to 12 Healthy, `sqlite-custody` excepted, which lands in stage 4; memory and disk measured; a test alert raised; MLflow restored (A15)                                               |
| 4     | Apps          | the server; orders 11 and 12 Healthy; slices 2.10, 3.1, 3.5, 3.8; for WBS, Harbor, slice 3.7 and A23; the two servers of A16 | staging and then production answer on their names with their data checked against the final backup                                                                                            |
| 5     | Retirement    | stage 4's receipts; stage 2's receipt for the gate hosts                                                                     | old servers deleted; `desired.yaml` and the inventories name only the new cluster                                                                                                             |

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

The database stage and the two hosts outside the cluster are in the stacked changes. Nothing
in stages 0 to 5 waits for either.

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
- A project and robots for WBS images, staging and production, before A23.
- Its first slice can measure on h5plat once A3 is done.
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
  the `staging` project admits. It refuses a render that holds a Secret object, one that is
  empty, and one whose command failed or printed nothing for a file the overlay names, so a
  partial render never replaces a directory. The staging Applications leave `allowEmpty`
  off, so even a directory emptied by hand prunes nothing. The job replaces the directory
  whole, so a manifest removed from the overlay is pruned. Each commit names the source
  commit and the digests.
- **A stateful app's first render.** Guard 1 restores a store while its workload is at zero
  replicas. For WBS staging the first overlay merged is the zero-replica one with the backup
  job suspended; the build commits that render; and only then is the staging Application
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
  are the `staging` project's namespaces and kinds and the admission policies of slice
  2.10.
- **The website and the request app.** Their pins and overlays are in the private fleet
  repository and belong to the session that owns `release-pin.ts`. This plan designs no
  change to that tool. Their staging advances as their dev copy does today, when that
  owner's tooling moves a pin; whether they take the path above is that owner's to decide
  and is asked in task 0.4.
- **Under the owner's waiver.** If A23 cannot be done and the owner waives it in writing,
  a person renders and commits each staging change by a pull request in the pins
  repository. Staging then does not follow `main` by itself, and R20 does not hold for
  WBS until the runner exists.
- **Promotion.** A person's pull request copies digests from the staging manifests into
  the production overlay, in the repository that holds it. Before opening it the person
  checks three things: the pool's record of the build job names that digest and a commit
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
  detects a build that was altered on the CI host; that is R35.
- **Retired by this.** The WBS dev poller, with the dev stacks. A18's WBS part stops it
  only when A23's receipt or the owner's waiver exists.

**Credentials on the CI host, and what that host is trusted with (R35).** Three: the runner's
own credential from its one registration, the App's private key, and the Harbor push robot's
Docker config, which the Harbor change's reconciler writes. Each is a file owned by a build
user, `puni-build`, in a directory of mode 0700; none is a GitHub secret, and the runner user
has no login to another host. File modes do not put them out of a gate's reach, and the plan
does not claim so: the gate user is in the `docker` group, which the `gate_host` role itself
calls root-equivalent, so code that a gate runs can read any file on the host and can change
what a later build produces. The credentials reach staging only: the robot pushes to one
project, the App writes the staging pins repository, and the runner accepts one workflow at
`main`. Within staging the App's key is a wide authority. Whoever holds it can commit any
manifest the `staging` project and admission allow, with no check in between, and that
includes the parameter ConfigMap that admits a backend image to the staging solver socket
(decision 1). What is not bounded beyond staging is image integrity. An image built on this host may not be what
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
build user in the gate-host role and how that user submits to the pool; from the WBS deploy
tooling's owner, the build entrypoint and a staging overlay the job can render at a commit;
from the release bootstrap's owner, whether the website takes the same path; from the
Harbor change, the project and the push robot; from
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

**PostgreSQL hosting and the hosts for agents.** The changes `host-postgres` and
`add-agent-hosts`, stacked on this one. Each names its own follow-ups: the four ports of the
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
it on the CI host. The cutover plan lists the deploy repository and its read key as a
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

| Images                                                                     | Pulled from                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argo CD, cert-manager, the observability stack, MLflow                     | their upstream registries, by digest                                                                                                                                                                                                                                                                           |
| Harbor, OpenBao, the External Secrets Operator                             | upstream, by digest; never from Harbor                                                                                                                                                                                                                                                                         |
| Website and request app, both environments                                 | the registry the fleet's release pins name today, with the pull Secret from OpenBao (R11)                                                                                                                                                                                                                      |
| WBS, both environments                                                     | Harbor (R28), pushed there by the builds on the CI host (R31)                                                                                                                                                                                                                                                  |
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
| Task 0.1: the owner's overrules                   | stage 0's receipt; until then only the slices that task names may start         |
| Task 0.5: the escrow check                        | guard 2; it has to precede h1claw's deletion as well                            |
| Task 0.6: the rules on the `main` refs            | A2 writes to the fleet repository and A4 makes `main` here the cluster's source |
| A host for the rehearsal of slice 2.7             | see below                                                                       |
| A place to build the controller image             | see below                                                                       |
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

The controller image is built from `infra/controller/Containerfile`, which slice 2.5 extends.
The laptop cannot build it while its disk is full. Until it can, the image is built and the
controller run on h2puni, where the controller runs today. That has a price: A2's new age
identity and the admin key are then on a host where code in a gate is root-equivalent, as on
the CI host (R35), which decision 1 keeps the secret store away from. It is listed under
Risks. A workstation, as the change `add-agent-hosts` defines it, created first would remove
it: it can be the controller and build the image. At the size the owner chose for it, it
cannot host the rehearsal. That is the owner's choice.

Pull request #935 does not block A1 to A6. It blocks A7.

The rest can wait. The staging pins repository, its rulesets, its read key and its App are
due before A23, and A23 before A18's WBS part: without them the tracker's poller is not
retired, so they are on the path of stage 4, not of stage 1. This change has no open
question left.

## Decision records (become ADRs at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so the two texts stay here. Task 0.2 files them. The record for PostgreSQL hosting is in the
change `host-postgres`, and the one for the agents' hosts in `add-agent-hosts`.

> # Each fleet host has one node role, on a cluster rebuilt from source
>
> One host was the k3s server, the public edge, the product node, the registry host and a gate
> host. A gate reserves its whole host and Harbor did not fit beside it, and the secret store
> would have sat next to the internet-facing ingress. On 2026-11-21 the owner decided that each
> host is reserved for one kind of work (platform services, continuous integration,
> observability, or production apps) and that the cluster is recreated on new servers. Later
> that day he added a fifth kind, non-production, for staging and dev as two environments.
> Three more kinds, database, agents and workstation, are recorded by the changes that define
> them.
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
> `main` are the administrative boundary of the cluster. Staging follows `main` through a
> build that commits rendered manifests to a repository of its own; until that build runs,
> staging follows nothing by itself, and the poller that does it today is kept.

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
  promoted there; manifests changed by two merges between two syncs go out together. The
  promotion check refuses a base that staging has not run (decision 9); it is run by a
  person, not by `gate`.
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
- **On staging, a commit in the pins repository admits a backend to the solver socket**,
  and the supervisor there checks the caller's name, not its image (decision 1).
- **Staging follows `main` only once the build path exists** (slice 3.7, A23). The tracker's
  poller is not retired before that without the owner's written waiver, under which a
  person renders and commits each staging change.
- **The pins repository is unchecked.** What the build's App commits there reaches staging
  at once, and `gate` never reads it. The `staging` project and admission bound it; its
  key is readable by code in a gate (R35).
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
- **The controller may run where a gate is root-equivalent.** While the laptop cannot build
  the controller image, the controller and with it the new age identity and the admin key
  are on h2puni (decision 10). A workstation as the controller removes this.
- **A NetworkPolicy from the pins repository is not read by `gate`.** Its peers are bounded
  only by what the staging overlay on `main` holds and by R35 (decision 3).

## Open questions for the owner

None in this change. The four the ninth draft carried went with their subjects: when to
create the database server and whether Harbor uses the shared database are questions of
`host-postgres`; the agents host's region and OpenClaw's state, and the workstation's region
and size, are questions of `add-agent-hosts`.

Not questions, but his to overrule by id: R34, that dev is delivered by a follow-up change,
and R35, that the CI host is one trust zone while there are no production users. The planning
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
- That a ruleset which names a GitHub App as its only bypass actor lets that App push to
  `main` while a second ruleset without bypass still refuses a forced or deleting push
  (from memory; read back in A23).
- That cert-manager gives its HTTP-01 solver pod the issuer's `podTemplate` selector at run
  time. The field was read in the locked chart's CRD; nothing was run.
- Which source address a pod sees for traffic from host-network Traefik on its own node and
  on another, and so which `ipBlock` the solver allow needs (decision 3).
- That Pod Security at `restricted` admits every pod the staging overlays render today.
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
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
