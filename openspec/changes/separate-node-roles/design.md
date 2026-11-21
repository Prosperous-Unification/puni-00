## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise. An earlier draft of this change planned an
in-place migration; [verify.md](verify.md#replaced-draft) records what it was and why it went.

What runs today:

- `infra/fleet/desired.yaml` declares one platform cluster, fleet id `platform`, with
  `controlPlane: single`. h4claw carries `control-plane`, `product` and `ingress`; h3mon carries
  `observability`. The live cluster's identity is `platform-production`.
- h4claw is also a gate host. h2puni is a gate host, never a k3s node, and runs WBS production
  and dev on Compose, the dev poller, and the release builds
  ([enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#placement)).
- Live Flux stages: `target`, `controllers`, `storage`, `policy`, `secrets` and `platform` are
  Ready; `observability`, `alerts` and `backup` are not. Elasticsearch and Prometheus have never
  run in this cluster. h3mon runs CoreDNS as its only pod, plus Victoria, Grafana and MLflow
  under Docker.
- h1claw pulls hourly snapshots of the Compose databases on h2puni and a daily one of MLflow,
  prunes the SQLite prefixes in the bucket, and sends the freshness alert
  ([recovery](../../../docs/infra/recovery.md)).

What the repository can already do from an empty host:

| Need                             | Source                                                                             | Proven where                                    |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| First server with embedded etcd  | `playbooks/bootstrap.yml`: `base`, `network`, `storage`, `k3s_server` with init    | h4claw, 2026-09-27; QEMU lab                    |
| Agents                           | `playbooks/join.yml`, then `playbooks/validate-enrollment.yml`                     | h3mon; QEMU lab                                 |
| Flux and the ordered stage graph | `playbooks/platform.yml` for one of four fixed cluster ids                         | h4claw; k3d lab for the whole graph             |
| etcd snapshots to object storage | `playbooks/backup.yml`; refuses until the server token's fingerprint is escrowed   | k3d lab                                         |
| Cold restore                     | `tool-fleet:recover`, `playbooks/restore.yml`                                      | k3d lab; QEMU lab, 23 s                         |
| Gate host                        | `playbooks/gate-host.yml`; [gate hosts](../../../docs/infra/gate-hosts.md) runbook | h4claw, h2puni                                  |
| Solver supervisor                | `playbooks/solver.yml` on product nodes                                            | QEMU lab                                        |
| Servers from the provider        | Terragrunt through `tool-fleet`                                                    | never run against the provider (operator guide) |
| WBS from Compose to k3s          | [cutover plan](../../../docs/infra/cutover-plan.md)                                | k3d rehearsal; prepared, not authorized         |

So a cluster can be built from zero with the playbooks that built the current one. The gaps
are listed in decision 3.

## Goals / Non-Goals

**Goals**

- One node role per host, in the fleet model and in workload selectors.
- A build order in which every stage has a receipt and the old side keeps serving until then.
- A sized, grounded budget for each node.
- A list of what crosses to the new cluster, how, and what is left behind.

**Non-Goals**

- Designing Harbor, OpenBao or the WBS cutover. Their changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- High availability, continuous SQLite replication, a new home for what h1claw runs.

## Assumptions

The owner fixed the four roles, the three production apps, Elasticsearch and Prometheus as the
observability stack, SQLite, and that the cluster is recreated. Everything below is assumed and
can be overruled by id.

| Id  | Assumption                                                                                                                                                                            | Alternative and its cost                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The new cluster is built on newly created servers beside the old one. An old host is deleted only after its role has its receipt                                                      | Reinstall the existing servers. Cost: each role is down while its host is rebuilt, and there is nothing to roll back to                                                 |
| R2  | Four servers of 8 vCPUs and 16 GiB, each with the disk its type includes                                                                                                              | A smaller platform node. Cost: the limits in decision 2 leave it no margin. The observability node's final size comes from A11                                          |
| R3  | Node ids and host names are `h5plat`, `h6apps`, `h7obs` and `h8ci`                                                                                                                    | Any other names. Cost: none before task 1.4 lands                                                                                                                       |
| R4  | The owner creates each server in the provider console; it is enrolled by static inventory, the path that built h4claw and h3mon                                                       | Terragrunt provisioning. Cost: it has never run against the provider and needs a remote state backend first                                                             |
| R5  | The new cluster takes the Flux cluster id `platform-production`. In `desired.yaml` it is a second platform cluster, fleet id `platform-2`, until the old one is removed               | A fifth cluster id. Cost: the id list is closed in `platform.yml`, the `backup` role, `platform.ts` and `recover.ts`, and the overlay path is derived from the id       |
| R6  | New for the new cluster: k3s credentials, the SOPS age identity, the Flux deploy keys. Carried from escrow: the registry CA, the object storage credentials, the backup archive key   | Reuse every secret. Cost: the old cluster cannot be cut off by itself, and its snapshots would restore into the new one                                                 |
| R7  | Build order: platform, CI, observability, production apps, then retirement (decision 4)                                                                                               | Apps before observability. Cost: production writes arrive before the alert and backup stages are Ready                                                                  |
| R8  | One new capability, `platform-services`, pins Flux, cert-manager, Harbor, OpenBao and the External Secrets Operator                                                                   | One label per service, as pull request #935 proposes for the secret store. Cost: several labels that always sit on one node                                             |
| R9  | Storage stays node-local with policy `Retain` (`storage/production-existing-hosts`)                                                                                                   | Provider volumes. Cost: the provider's storage driver has never run here, and SQLite on a network volume is what the owner ruled out                                    |
| R10 | Harbor is the only registry the new cluster ever runs. Until Harbor's production overlay lands, its `platform` stage carries the registry namespace and issuer and serves nothing     | Install Distribution first. Cost: a registry that is replaced before its first consumer. Or hold the stage. Cost: `observability`, `alerts` and `backup` wait behind it |
| R11 | The website runs on the new cluster from the same pins and the same source registry as today. Routing it to Harbor is a later decision of the session that owns the release bootstrap | Route it to Harbor during the build. Cost: it changes exactly what that session asked to keep untouched                                                                 |
| R12 | `website-dev` stays a namespace beside production. WBS dev, the dev website Compose stack and the dev poller move to the CI host as they run on h2puni today                          | Dev in the cluster. Cost: the WBS dev pod selects `forge`, which no node carries. Or drop them. Cost: the dev WBS database is the agents' work record                   |
| R13 | Retention and the freshness alert for the k3s SQLite prefixes move into the cluster (task 1.7). Until its receipt exists, h1claw keeps that duty and is not deleted                   | Leave it on h1claw. Cost: production backups depend on a host outside this plan                                                                                         |
| R14 | After each cut-over the old side stays stopped and intact for 14 days                                                                                                                 | Delete at once. Cost: no fallback data if a restore proves incomplete                                                                                                   |
| R15 | The MLflow store is restored on the observability host as the Compose service it is today. Victoria and Grafana are not rebuilt                                                       | Drop MLflow. Cost: its history. Keeping Victoria. Cost: a second stack on the node reserved for the first                                                               |
| R16 | Each node is probed from another node; the observability node from the platform node                                                                                                  | In-cluster monitoring only. Cost: the node that hosts monitoring cannot report its own loss                                                                             |
| R17 | The Ansible controller and its operator files live on the operator workstation, never on the CI host                                                                                  | The CI host, as h2puni is today. Cost: a host that runs branch code would hold the keys to every node                                                                   |
| R18 | Public certificates cross as encrypted Secrets, so a DNS switch needs no issuance; cert-manager renews them afterwards                                                                | Issue after the switch. Cost: the name serves an invalid certificate until issuance completes                                                                           |

## Decisions

### 1. Roles, capabilities and labels

| Role            | Host   | Capabilities                         | In the k3s cluster |
| --------------- | ------ | ------------------------------------ | ------------------ |
| Platform        | h5plat | `control-plane`, `platform-services` | server             |
| CI              | h8ci   | none: it is not a k3s node           | no                 |
| Observability   | h7obs  | `observability`                      | agent              |
| Production apps | h6apps | `product`, `ingress`                 | agent              |

- `platform-services` is new. It is added to `CapabilitySchema`, `fleetCapabilities`,
  `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`.
- The server never carries `product` or `ingress`, and no gate host is a k3s node. Task 1.2
  turns both into checks.
- Flux and cert-manager select no node today (`kubernetes.io/os: linux` only). They gain
  `puni.dev/capability-platform-services: 'true'`: a kustomize patch beside the generated
  `infra/platform/flux/install.yaml`, and chart values for cert-manager.
- Traefik stays pinned to `capability-ingress`, so it lands on the production apps node. It
  binds host ports 80 and 443 there.
- The capability floors of a cluster apply as soon as it has one node (`decodeFleet`). The new
  cluster entry therefore starts with the floor `platform-services: 1` and gains
  `observability: 1`, then `product: 1` and `ingress: 1`, in the revision that adds each node.
- Because the new cluster starts from a current reviewed commit, no selector waits behind an
  old pin. The cost is the other side of that: everything in
  [before advancing the pinned revision](../../../docs/infra/platform.md#before-advancing-the-pinned-revision)
  is a prerequisite from the first reconcile of the `observability` stage.

### 2. Budgets

Memory in MiB. Limits are used where they exist. Capacity is assumed to be 15,602, the reading
of both current 16 GiB nodes.

**Platform node.** Reservations assumed 2,816 (system 1,024, kubelet with the k3s server and
etcd 1,536, eviction 256).

| Workload                                         |      Limit | Source                                             |
| ------------------------------------------------ | ---------: | -------------------------------------------------- |
| Harbor                                           |      2,112 | Harbor change, decision 2: planned, to be measured |
| Harbor backup                                    |        768 | Harbor change, decision 2                          |
| OpenBao and the External Secrets Operator        |      1,024 | assumed: pull request #935 measures it             |
| Flux, four controllers                           |      4,096 | live limits; 510 in use                            |
| cert-manager, three pods                         |      1,536 | sizing document; no limits set live, 115 in use    |
| CoreDNS                                          |        170 | live limit                                         |
| Node exporter, OTel collector, Velero node agent |      1,408 | sizing document: 1,920 per node less Traefik's 512 |
| **Sum**                                          | **11,114** | with reservations 13,930; margin 1,672             |

The margin is against limits. Measured use of the same controllers today is under 700.

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
its figures unmeasured. A11 measures on the node and the owner then keeps or changes its size.

**CI host.** A gate is measured at 6 cores, 9 GiB and 11 GiB of temporary space, and runs under
`min(13 GiB, pool budget − 2 GiB)`. On a host that runs nothing else the bound is 13 GiB. The
dev stacks of R12 are not measured; h2puni's pool budget of 14 GiB reflects them today.

**Disk.** Each new server has the disk its type includes; the three current Helsinki hosts
report about 150 GiB.

| Node            | What lands there                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Platform        | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd and its local snapshots              |
| Production apps | SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB                             |
| Observability   | Elasticsearch and Prometheus claims; the sizing document has no measured need. Measured in A11     |
| CI              | gate trees, caches and 11 GiB of temporary space per gate; h2puni holds 127 GiB in this role today |

### 3. What is missing in source

Each row is an agent slice in [tasks.md](tasks.md).

| Gap                                                                                                                                                               | Slice |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No capability for platform services                                                                                                                               | 1.1   |
| Nothing refuses a server that also carries `product` or `ingress`, or a gate host that is a k3s node                                                              | 1.2   |
| Flux and cert-manager have no node selector; cert-manager has no memory limit                                                                                     | 1.3   |
| One static inventory and one hard-coded cluster id: `placement.test.ts` binds `production-existing-hosts.yml` to fleet id `platform`                              | 1.4   |
| The `platform` stage path `registry/production` installs Distribution                                                                                             | 1.5   |
| The coexistence record and the inventory reservations describe h3mon with its Docker services                                                                     | 1.6   |
| Retention and the freshness alert for the `sqlite/<database>/` prefixes run on h1claw, from a private repository                                                  | 1.7   |
| No probe of a node from outside itself                                                                                                                            | 1.8   |
| Unproven: validation of a one-node cluster (the runbook's validation ran with both nodes), a Traefik DaemonSet with no ingress node, floors raised stage by stage | 1.9   |
| The only build runbook is written for two adopted hosts with preserved services and a controller on h2puni                                                        | 1.10  |
| Certificates crossing as Secrets (R18) is unproven                                                                                                                | 1.11  |
| The gate instructions in `AGENTS.md` and the gate-host runbook name h2puni and h4claw                                                                             | 1.12  |

Not gaps: bootstrap, join, Flux, etcd backup, cold restore, the gate-host role and the solver
supervisor exist and have run. The existing-host path should also fit new servers, with empty
preserved-listener and container lists; task 1.9 proves it.

### 4. Build order

| Stage | Role            | Needs from earlier stages                                                                              | Receipt that ends the stage                                                                                        |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0     | Decisions       | none                                                                                                   | overrules recorded; carried secrets found in escrow; slices 1.1 to 1.3, 1.5 and 1.10 merged                        |
| 1     | Platform        | stage 0                                                                                                | server Ready; stages `target` to `platform` Ready; an etcd snapshot restored once on the empty cluster (A6)        |
| 2     | CI              | none from the cluster; the controller of R17                                                           | a gate exits 0 on the new host and its pool calibration is recorded by the pool's owner (A8)                       |
| 3     | Observability   | the server to join; `platform` and `certificates` Ready, because the `observability` stage waits there | `observability`, `alerts` and `backup` Ready; memory measured; a test alert delivered (A11)                        |
| 4     | Production apps | the server; `alerts` and `backup` Ready, so production data never lands unwatched or without a backup  | each app answers on its public name from the new node, with its data verified against the backup report (A14, A15) |
| 5     | Retirement      | stage 4, the 14 days of R14, task 1.7's receipt for h1claw's duty                                      | old servers deleted; `desired.yaml` and the inventories name only the new cluster (A17, A18)                       |

Why this order:

- **Platform first.** Every other cluster node joins this server, and Flux runs here.
- **CI second.** It depends on nothing in the cluster, and it has the longest lead: three
  calibrations of 5 h 16 min to 5 h 27 min each. The old gate hosts keep gating until the new
  one is calibrated, so gates never stop. It may run in parallel with stages 1 and 3.
- **Observability third.** The stage graph orders it after `platform` and before `alerts` and
  `backup`.
- **Production apps last.** They are the only stage with user data and public names.

Harbor and OpenBao land on the platform node by their own changes. Neither blocks stage 3 or 4:
the website keeps its current image source (R11), and the WBS cutover promotes digests that its
own plan names.

### 5. What crosses, how, and what is left

| What                               | How it crosses                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WBS production database            | The cutover plan: fence writes, export with a report SHA-256, restore Job into `wbs-data`, read the known row and migration set                                                                        |
| WBS dev database and Compose state | The newest h1claw set from the bucket, verified as the weekly drill does, onto the CI host (R12)                                                                                                       |
| Website data                       | The website's own backup and verify jobs, restored into a new claim. Its manifests are private; only the live objects were read                                                                        |
| MLflow store                       | The newest h1claw set, verified, onto the observability host (R15)                                                                                                                                     |
| DNS records                        | One reviewed plan per name with its rollback (`platform-dns.ts plan`); TTL lowered one old TTL before the switch; applied by hand at the registrar                                                     |
| Public certificates                | As Secrets encrypted to the new recipient (R18), after task 1.11 proves that cert-manager keeps a valid existing Secret                                                                                |
| Registry CA key pair               | From escrow, so `registry.puni.internal` keeps the chain that nodes and build tools trust. The name is written per host by the `registry_client` role, so each cluster resolves it to its own endpoint |
| Object storage credentials         | From escrow. The new cluster's etcd snapshots go to their own bucket, because the snapshot folder is the cluster id and both clusters carry `platform-production`                                      |
| Backup archive key                 | Read back from escrow on a second machine before stage 1. It decrypts every set the dev and MLflow restores above depend on                                                                            |
| Fleet repository                   | A directory and Flux units for the new cluster, encrypted to the new recipient. The old directory is removed in stage 5. Nothing private is quoted here                                                |

New, not carried: k3s server and agent credentials, the SOPS age identity, the Flux deploy keys,
registry push credentials (Harbor's robots replace them).

Left behind: the old registry's content (one activation proof image), Victoria and Grafana data,
stopped containers, the old cluster's etcd, and the preserved OpenHands container on h4claw
unless the owner names it (open question 8).

### 6. Cut-over and rollback

- Until a stage has its receipt, the old host keeps its role. Rollback of a stage is to stop
  using the new host and delete it.
- For the three apps the only switch is DNS. Before it, the new side is tested against the
  ingress address directly, with the public name supplied by the client.
- The point of no return for an app is its first production write on the new cluster. What
  protects it: writes are fenced on the old side before the last export; the restore is checked
  against the export's report; the new side has completed one backup and one verify before the
  switch; the record TTL is lowered beforehand; and the old side stays stopped and intact for
  14 days (R14).
- After that write, a failure is handled on the new cluster by restore from its own backups.
  Going back to the old side would lose the new writes. The cutover plan states the same
  boundary for WBS and this plan does not change it.
- `website-dev` crosses first, production website and the request app next, WBS production last
  and under its own authorization.

### 7. Dependencies on other owners

**Harbor change (`adopt-harbor-registry`).** This change edits none of its files; task 0.3 adds
a dated pointer. The amendments it needs:

- Placement: assumptions H1, H9 and H13 and decision 2 name h4claw. The node is h5plat.
- Stop rule: task 1.3 computes 1,949 MiB from h4claw's memory under a gate. On h5plat the figure
  comes from that node's own reading and decision 2 here, and no gate runs there.
- Storage and endpoint: decisions 3 and 5 put the bounded filesystems and
  `registry.puni.internal` on h4claw's disk and private address.
- No Distribution on the new cluster: H11 (copy the proof image), migration steps 10 and 12 and
  attended steps A9 and A11 fall away, and so does the `:5000` endpoint.
- Flux layout: decision 4 keeps Harbor out of `registry/production` because production follows
  a pin that predates it. The new cluster starts from a current commit, so that reason is gone
  (task 1.5).
- Attended steps A1 and A2a, which read h4claw and re-enroll it in the host pool, fall away.
- Its first slice can measure on h5plat itself once A3 is done.

**OpenBao design (pull request #935).** Owned by another session and not edited. It needs to
know: the node (h5plat), the label (R8), that its memory joins the budget of decision 2, and
that OpenBao's image must never be pulled from Harbor, or a cold start of the node deadlocks.

**Gate pool (`dash-host-jobs`).** Needed from its owner:

- Enrollment of h8ci in a host pool and its calibration.
- The pool budget for a host that runs the dev stacks of R12 beside the gate.
- Confirmation that deleting h4claw and h2puni needs no withdrawal step. Each host has its own
  pool, and the runbook documents adding and enrolling only.
- Cleanup of the capacity resources those two hosts report into WBS.

**Release bootstrap.** Website registry routing, the fleet's website pins and `release-pin.ts`
stay untouched. A second cluster that serves the website needs the same pins in its own fleet
directory. Whether the pin tool writes them for two clusters, or stage 4 waits until the
bootstrap is finished, is that session's decision (open question 5).

**WBS cutover plan.** Its "New cluster" and "Ingress address" inputs resolve to the new cluster
and h6apps. Its prerequisites are its own; this plan satisfies only the first cluster one.

## Decision record (becomes an ADR at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so this text stays here. Task 0.2 files it.

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
> - Move roles in place: no second set of servers, but the control plane has to change hosts by
>   a snapshot restore that k3s does not document for a host that stays up, and every step is
>   taken on the cluster that serves.
> - Resize the one host: the secret store stays on the public edge and a gate still competes
>   with production.
> - Platform services on the observability node: that node is reserved for Elasticsearch and
>   Prometheus.
> - One larger node for platform services and CI: branch code would run beside the secret store.
>
> ## Consequences
>
> For the length of the build there are two clusters and two sets of servers. Every production
> store crosses by a verified restore, which is also the first full test of those restores. The
> control plane never moves: it starts on the platform node. Platform services are pinned by a
> capability, where before they ran wherever they first started. Each role is still one host:
> losing it stops that role until it is rebuilt.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving; nothing can
  be deployed or rescheduled until then.
- **One production apps node.** Its loss stops all three apps, and SQLite loses up to an hour.
- **Monitoring on one node.** It cannot report its own loss; R16 covers only liveness.
- **Shared vCPUs for CI.** A gate saturates the host for over five hours. No measurement shows
  how a shared-vCPU host behaves under that for weeks.
- **One gate host at the end.** Two hosts gate in parallel today. After retirement one does,
  at about 5 h 20 min a gate, unless a second CI host is added (open question 6).
- **Two clusters with one identity.** Both carry `platform-production` during the overlap. An
  operator kubeconfig aimed at the wrong one passes the `target` stage's identity check. New
  credentials (R6), a separate snapshot bucket and distinct context names are the guards.
- **Restores are the migration.** A store whose backup has never been restored in production
  fails at cut-over, not before. Stage 4 restores each one before its switch for that reason.
- **Registry and secret store share a node.** See the OpenBao dependency above.
- **The CI host is not clean.** With R12 it holds the dev stacks, and the dev poller needs
  `sudo` for the gate account, as on h2puni. A gate payload can then become root there.
- **The observability stage has never been Ready in production.** Its prerequisites include
  nine operator-made Secrets that nothing in the repository creates.

## Open questions for the owner

1. Are all four servers the 16 GiB class (R2), and are the names right (R3)?
2. Do you create the servers in the console (R4), and all four at once or one per stage?
3. Where do WBS dev, the dev website stack and the dev poller live (R12)?
4. Is MLflow kept (R15)? Dropping Victoria also removes the sink that h1claw's tunnel feeds.
5. Does the website cross before the release bootstrap finishes, with pins written for two
   clusters, or after it?
6. Is one CI host enough once h4claw and h2puni are gone?
7. Who takes over h1claw's backup duty if task 1.7 is not wanted (R13)?
8. Is anything on the old hosts worth keeping beyond decision 5's list: the OpenHands container
   on h4claw, Grafana dashboards on h3mon?
9. Is 14 days the right time to keep each stopped old side (R14)?
10. Where does the alert go? The Harbor change waits on the same answer.

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings.
- A build of the whole graph on real servers from an empty start. The lab ran each piece; no
  run joined them on the provider's network.
- Whether `validate-enrollment.yml` passes on a cluster of one node.
- Whether the `controllers` stage reports Ready while no node carries `ingress`.
- Whether cert-manager keeps an imported certificate Secret without issuing again.
- Whether the old cluster writes etcd snapshots to object storage today.
- How the public certificates are solved (HTTP or DNS challenge), and how the fleet repository's
  Flux units were first applied: both live in the private repository.
- The memory of the k3s server and etcd alone; 1,536 MiB is an assumption.
- The production figures for `puni-request-app`, OpenBao, and the dev stacks on a CI host.
- That the backup archive key and the registry CA exist in escrow outside the hosts that use
  them.
