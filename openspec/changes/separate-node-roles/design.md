## Context

Read at `origin/main` `b17861f83` on 2026-11-21. Live figures are read-only `kubectl` readings
of the same day unless a date says otherwise.

- `infra/fleet/desired.yaml` declares one platform cluster with `controlPlane: single`. h4claw
  carries `control-plane`, `product` and `ingress`; h3mon carries `observability`. The required
  floors are `product: 1`, `ingress: 1`, `observability: 1`.
- A capability is one of six names in `tools/tool-fleet/src/contracts.ts` (`CapabilitySchema`,
  `purposeCapabilities`). The k3s role templates render each as the node label
  `puni.dev/capability-<name>`.
- What selects what today:

  | Workload                                               | Selector                         | Runs on        |
  | ------------------------------------------------------ | -------------------------------- | -------------- |
  | Traefik (`infra/platform/networking/traefik.yaml`)     | `capability-ingress`             | h4claw         |
  | WBS backend, backup and verify jobs (`deploy/k8s/wbs`) | `capability-product`             | not deployed   |
  | Website `site`, `api`, `app` (live Deployments)        | `capability-product`             | h4claw         |
  | Elasticsearch, Kibana, Prometheus, collectors          | `capability-observability`       | not deployed   |
  | Flux controllers, cert-manager                         | `kubernetes.io/os: linux` only   | h4claw, by age |
  | Registry (`infra/platform/registry/production`)        | `kubernetes.io/hostname: h4claw` | h4claw         |
  | WBS dev pod (`deploy/k8s/wbs/overlays/dev`)            | `capability-forge`               | no node has it |

- h4claw is also a gate host, and h2puni is a gate host that is never a k3s node
  (`infra/ansible/inventory/production-existing-hosts.yml`). A gate reserves its whole host pool
  and runs under a 13 GiB bound on h4claw and 12 GiB on h2puni; the measured entry is 6 cores,
  9 GiB and 11 GiB of temporary space ([gate hosts](../../../docs/infra/gate-hosts.md)).
- h2puni also runs WBS production and dev on Compose, the dev poller, and is the Ansible
  controller of the enrollment runbook
  ([enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#placement)).
- Both cluster nodes report 8 CPUs and 15,602 MiB. h4claw uses 3,291 MiB in total; h3mon uses
  4,316 MiB and runs only CoreDNS as a pod.

## Goals / Non-Goals

**Goals**

- One node role per host, expressed in the fleet model and in workload selectors.
- A sized, grounded budget for each node.
- An ordered path from today's layout that never passes through an invalid fleet.

**Non-Goals**

- Designing Harbor, OpenBao or the WBS cutover. Their changes own that.
- Renaming WBS resources. `puni-user-platform` is the product name of the WBS app only.
- High availability, continuous SQLite replication, h1claw.

## Assumptions

The owner fixed the four roles and the three production apps. Everything below is assumed and
can be overruled by id.

| Id  | Assumption                                                                                                                                           | Alternative and its cost                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | The platform node has 8 vCPUs and 16 GiB, the same class as the two cluster nodes                                                                    | 4 vCPUs and 8 GiB. Cost: Flux's 4,096 MiB of limits plus Harbor's 2,112 MiB exceed its allocatable memory, and the control plane cannot move there                              |
| N2  | The node joins as a k3s agent and becomes the server only in phase 4. This differs from the first proposal to the owner, which joined it as a server | Join it as a second server. Cost: the fleet decoder refuses two servers in a `single` cluster, and a two-member etcd stops when either member stops                             |
| N3  | The control plane and etcd move to the platform node                                                                                                 | Keep them on h4claw. Cost: the datastore that holds every Kubernetes Secret stays on the internet-facing node and shares its disk with the SQLite volumes                       |
| N4  | The node id and host name are `h5plat`                                                                                                               | Any other name. Cost: none before task 1.2 lands                                                                                                                                |
| N5  | One new capability, `platform-services`, pins Harbor, OpenBao, the External Secrets Operator, Flux and cert-manager                                  | One label per service (`secret-store`, as pull request #935 proposes, and `registry`). Cost: several labels that always sit on the same node, each a schema entry               |
| N6  | Flux and cert-manager move before the control plane                                                                                                  | Move them with it. Cost: the cheapest, reversible step waits for the hardest one                                                                                                |
| N7  | The control plane moves by a planned snapshot restore on the platform node (decision 4)                                                              | Join a second server and remove the first. Cost: as N2, plus a model change for a two-server interim                                                                            |
| N8  | WBS dev and the dev website Compose stack stay on h2puni for now, so h2puni is "CI and dev" until a separate change moves them                       | Move WBS dev to the production apps node. Cost: its pod selects `capability-forge`, which no node carries, and the dev poller that needs `sudo` on h2puni has to be replaced    |
| N9  | The `website-dev` namespace stays on h4claw beside production                                                                                        | A separate dev node. Cost: one more host for 71 MiB of live use                                                                                                                 |
| N10 | h4claw leaves the gate pool before WBS production lands on it. Until h2puni is free of WBS production, one host gates at a time                      | Keep h4claw gating until then. Cost: a gate can take 13 GiB of the node that serves the website. Or add a fifth host for CI now. Cost: one more host                            |
| N11 | The disks of h2puni, h3mon and h4claw are grown to what their server type includes, in that order                                                    | Leave them. Cost: h2puni stays at 88% used. Growing is irreversible and blocks a later move to a smaller type; each growth needs the host powered off                           |
| N12 | h3mon's system memory reservation rises from 1,024 Mi to cover the services it runs outside Kubernetes                                               | Keep it. Cost: the kubelet offers 13,939 MiB to pods while the preserved Docker services are limited to 2,560 MiB in total and the host uses 4,316 MiB                          |
| N13 | Each node is probed from outside itself, and h3mon from the platform node. The alert destination is the one the Harbor change still waits for        | Rely on in-cluster monitoring. Cost: the node that hosts monitoring cannot report its own loss                                                                                  |
| N14 | The Ansible controller duty and its operator files leave h2puni before it becomes a gate-only host                                                   | Leave them. Cost: a host that runs branch code would hold the keys that administer every node. On h2puni a gate payload can already become root (gate hosts, enrollment step 0) |

## Decisions

### 1. Roles, capabilities and labels

| Role            | Host   | Capabilities after this change             | In the k3s cluster  |
| --------------- | ------ | ------------------------------------------ | ------------------- |
| Production apps | h4claw | `product`, `ingress`                       | agent after phase 4 |
| Platform        | h5plat | `platform-services`, later `control-plane` | agent, then server  |
| Observability   | h3mon  | `observability`                            | agent               |
| CI              | h2puni | none: it is not a k3s node                 | no                  |

- `product`, `ingress` and `observability` do not move.
- `control-plane` moves from h4claw to h5plat in phase 4, in the same revision of
  `desired.yaml` that records the restore.
- `platform-services` is new. It is added to `CapabilitySchema`, `fleetCapabilities`,
  `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`, with floor 1.
- `forge` stays unassigned (N8).
- Flux and cert-manager gain `puni.dev/capability-platform-services: 'true'` as a node
  selector. The Flux controllers come from the generated `infra/platform/flux/install.yaml`, so
  the selector is a kustomize patch beside it; cert-manager takes it as chart values.
- Traefik stays on the production apps node: it is the request path, and it binds host ports
  80 and 443 there.
- Production reconciles a pinned source revision
  ([platform](../../../docs/infra/platform.md#before-advancing-the-pinned-revision)). A selector
  change reaches production only when that pin advances or the fleet repository patches it.
  Which of the two is open question 6.

### 2. Budgets

Memory in MiB. Limits are used where they exist; "in use" is the live reading.

**Production apps node, h4claw.** Capacity 15,602; reservations 2,304 (system 1,536, kubelet
512, eviction 256); allocatable 13,299.

| Workload                                              |     Limit | Source                                        |
| ----------------------------------------------------- | --------: | --------------------------------------------- |
| Traefik                                               |       512 | sizing document; no limit set live, 47 in use |
| `puni-website` production `site`                      |       128 | live limit                                    |
| Website production log shipper                        |       128 | live limit                                    |
| `puni-request-app` production                         |       640 | assumed: not deployed yet                     |
| `website-dev` namespace                               |       768 | live limits, 71 in use                        |
| `puni-user-platform`: backend, gateway, MCP, frontend |     2,176 | `deploy/k8s/wbs/base`                         |
| `puni-user-platform`: hourly backup and daily verify  |     1,024 | `deploy/k8s/wbs/base`, both counted           |
| **Sum**                                               | **5,376** | margin 7,923                                  |

Not counted: the host-owned solver supervisor and solver pods that the cutover plan requires on
the product node, and the preserved OpenHands container, which lives inside the system
reservation. Until phase 4 the k3s server also runs here; the whole node uses 3,291 today.

**Platform node, h5plat.** Capacity assumed 15,602 (N1); reservations assumed 2,816 (system
1,024, kubelet with the k3s server and etcd 1,536, eviction 256).

| Workload                                  |     Limit | Source                                             |
| ----------------------------------------- | --------: | -------------------------------------------------- |
| Harbor                                    |     2,112 | Harbor change, decision 2: planned, to be measured |
| Harbor backup                             |       768 | Harbor change, decision 2                          |
| OpenBao and the External Secrets Operator |     1,024 | assumed: pull request #935 measures it             |
| Flux, four controllers                    |     4,096 | live limits, 510 in use                            |
| cert-manager, three pods                  |       384 | assumed: no limits set live, 115 in use            |
| CoreDNS                                   |       170 | live limit                                         |
| **Sum**                                   | **8,554** | with reservations 11,370; margin 4,232             |

**Observability node, h3mon.** Capacity 15,602; reservations 1,792
(`infra/platform/observability/base/coexistence.json`). That record gives 12,198 requested in
steady state and 17,830 during the migration overlap, a shortfall of 2,228, so the overlap is
not admitted. Those figures are requests, and the sizing document calls its larger sums
unmeasured. Nothing else is placed on this node. 4,316 in use, 11.0 GiB available.

**CI host, h2puni.** 15.24 GiB of memory, a 14 GiB pool budget, a 12 GiB gate bound, and a
measured gate of 6 cores, 9 GiB and 11 GiB of temporary space.

**Disk.**

| Host   | Capacity | Free                | What lands there                                                              |
| ------ | -------: | ------------------- | ----------------------------------------------------------------------------- |
| h4claw |  150 GiB | 78 GiB (2026-11-18) | SQLite claims: `website-data` 2 GiB, `wbs-data` 5 GiB, `wbs-mcp` 1 GiB        |
| h5plat | per type | all                 | Harbor's 40 GiB of bounded filesystems, OpenBao's store, etcd, snapshots      |
| h3mon  |  150 GiB | 118 GiB             | Elasticsearch and Prometheus claims; the sizing document has no measured need |
| h2puni |  150 GiB | 18 GiB, 88% used    | gate trees and caches                                                         |

### 3. SQLite on the production apps node

Nothing changes in how SQLite is stored. The WBS backend is one replica with strategy
`Recreate`, pinned to `capability-product`; its claim uses class `puni-retain`; a backup job
runs hourly and a verify job daily (`deploy/k8s/wbs/base`). Both live claims are on class
`puni-retain` with policy `Retain` and node affinity to h4claw's host name. Three consequences
bind this plan:

- h4claw keeps its node name in every phase, because the volumes are bound to it by host name.
- The production apps node is a single point: its loss is a restore, with up to one hour of
  writes lost ([recovery](../../../docs/infra/recovery.md#cold-restore-measured)).
- Continuous replication to object storage would shorten that. It is a later slice and is not
  designed here.

### 4. Moving the control plane

What the sources say:

- The fleet decoder requires exactly one non-retired `control-plane` node in a `single` cluster
  and at least three otherwise (`decodeFleet`). Retirement refuses the sole control plane
  ([fleet](../../../docs/infra/fleet.md#retirement-replacement-and-upgrade)).
- k3s states that etcd quorum is `(n/2)+1`, so two members tolerate no loss; that servers must
  agree on the cluster and service ranges, the `disable` list and `secrets-encryption`; and that
  a restore with `--cluster-reset --cluster-reset-restore-path` removes every other member and
  needs the original server token
  ([HA embedded etcd](https://docs.k3s.io/datastore/ha-embedded),
  [etcd-snapshot](https://docs.k3s.io/cli/etcd-snapshot),
  [backup and restore](https://docs.k3s.io/datastore/backup-restore), read 2026-11-21).
- The repository already has that restore: `tool-fleet:recover verify-cold-restore` and
  `infra/ansible/playbooks/restore.yml`, measured at 23 s on a systemd VM
  ([recovery](../../../docs/infra/recovery.md#etcd-and-cold-restore)).
- That restore demands fence evidence that every original server is powered off or deleted.
  Here the original server must stay up: it keeps the website and its volumes.
- k3s documents no in-place change of a server into an agent. Its uninstall page says a node
  that rejoins must first be deleted from the cluster so that its node password secret goes.

So the move is a planned restore with two pieces the repository lacks:

1. A fence kind for a server that is stopped and whose datastore is moved aside, but whose host
   stays up.
2. A play that turns that host into an agent under its old node name.

The sequence, to be proven in the lab before any attended step:

1. Take an etcd snapshot on h4claw and record a recovery manifest.
2. Stop and disable the k3s server on h4claw. The API is down from here. Whether running
   containers keep serving is what the rehearsal measures.
3. On h5plat, stop the agent, install the server configuration with h5plat's address in
   `tls-san`, and run the restore. etcd now has one member, h5plat.
4. Turn h4claw into an agent of the new server, node name unchanged. Point h3mon at it.
5. Flip `control-plane` in `desired.yaml` and the inventory in one revision.

What names the old endpoint and must change with it: `apiEndpoint` in `desired.yaml`;
`puni_registration_url`, `puni_registration_host` and `puni_tls_sans` in the inventory; the
`server:` line of each agent; the `<cluster-id>-kubeconfig` Secret every Flux stage reads and
the `kube-system/puni-cluster-<cluster-id>` ConfigMap that `platform.yml` creates; the etcd
snapshot configuration, which `backup.yml` installs on servers only; the discovery transport's
forward to the server's loopback; the deploy runner's `KUBECONFIG_B64`; and every operator
kubeconfig that tunnels to h4claw.

Rollback before step 3 completes: start the k3s server on h4claw again; its datastore was not
touched. After step 3: stop the server on h5plat, restore h4claw's datastore directory that was
moved aside, start it, and rejoin h5plat as an agent. After new writes have been accepted on
h5plat, rollback loses them.

This is larger than one phase. It needs new recovery source, a new play and a lab run on a host
with KVM, which the 2026-10-13 environment lacked. Tasks 1.6 and 1.7 stop at the rehearsal
receipts. If the rehearsal changes the sequence, the attended step A8 moves to its own change.

### 5. Order and dependencies

1. Create the node and join it as an agent (A1, A2). Nothing else moves yet.
2. Harbor's first slice measures memory on the node. The Harbor change must first be amended:
   - Placement: assumptions H1, H9 and H13 and decision 2 name h4claw.
   - Stop rule: task 1.3 computes 1,949 MiB from h4claw's memory under a gate. On h5plat the
     figure comes from that node's own reading, and no gate runs there.
   - Storage and endpoint: decisions 3 and 5 put the bounded filesystems and
     `registry.puni.internal` on h4claw's disk and private address.
   - Attended steps A1 and A2a, which read h4claw and re-enroll it in the host pool, fall away.

   This change edits none of those files. Task 0.3 adds a dated pointer after the owner's
   decisions.

3. Flux and cert-manager move (A4).
4. h4claw leaves the gate pool (A5). The pool belongs to the `dash-host-jobs` change.
5. The control plane moves (A8), after its rehearsal.
6. WBS production moves by the existing
   [cutover plan](../../../docs/infra/cutover-plan.md). Its "New cluster" and "Ingress address"
   inputs resolve to h4claw. It must not start while h4claw is a gate host.
7. h2puni becomes a gate host only (A10).

Kept untouched: website registry routing, the fleet's website pins and `release-pin.ts`, at the
request of the session that runs the retention-journal bootstrap. The OpenBao design in pull
request #935 belongs to its own session; this change tells it the placement and does not edit
it.

What this plan needs from the gate pool's owner:

- A way to withdraw an enrolled host from its pool and to remove it from `gate_hosts`. The gate
  host runbook documents adding and enrolling only.
- Confirmation that h2puni alone carries the gate while h4claw is out.
- The pool budget for h2puni once WBS and the dev stacks have left it.

## Decision record (becomes an ADR at merge)

ADR 0079 is claimed by two open pull requests and the Harbor record waits for the next number,
so this text stays here. Task 0.2 files it.

> # Each fleet host has one node role
>
> One host was the k3s server, the public edge, the product node, the registry host and a gate
> host. A gate reserves its whole host and Harbor did not fit beside it, and the secret store
> would have sat next to the internet-facing ingress. On 2026-11-21 the owner decided that each
> host is reserved for one kind of work: production apps, platform services, observability, or
> continuous integration.
>
> ## Considered options
>
> - Resize the one host: no new machine, but the secret store stays on the public edge and a
>   gate still competes with production.
> - Put platform services on the observability node: no new machine, but that node is reserved
>   for Elasticsearch and Prometheus.
> - One larger node for platform services and CI: branch code would run beside the secret store.
>
> ## Consequences
>
> There is one more host to patch. Platform services are pinned by a capability, where before
> they ran wherever they first started. The control plane has to move once, by a planned
> restore. The gate runs on one host at a time until WBS production has left h2puni. Each role
> is still one host: losing it stops that role until it is rebuilt.

## Risks / Trade-offs

- **One control-plane node.** Its loss is a cold restore. Running pods keep serving; nothing can
  be deployed or rescheduled until then.
- **One production apps node.** Its loss stops all three apps, and SQLite loses up to an hour.
- **Monitoring on one node.** h3mon cannot report its own loss; N13 covers only liveness.
- **Shared vCPUs for CI.** A gate saturates the host for over five hours. No measurement shows
  how a shared-vCPU host behaves under that for weeks.
- **One gate at a time in the interim**, at about 5 h 20 min each.
- **Registry and secret store share a node.** OpenBao's image must never be pulled from Harbor,
  or a cold start of the node deadlocks.
- **The move itself.** Between stopping the old server and the restored one answering, there is
  no API. A mistake in step 3 or 4 leaves the cluster without a control plane until rollback.
- **h2puni holds more than gates.** Until N8 and N14 are resolved it is not a clean CI host.

## Open questions for the owner

1. Is the platform node the 16 GiB class (N1), and is `h5plat` its name (N4)?
2. Does the control plane move (N3), or does it stay on h4claw?
3. Who creates the node: you in the provider console, or an agent with an API token?
4. Where do WBS dev and the dev website stack go when h2puni is gate-only (N8)?
5. Where does the Ansible controller duty go (N14): the operator laptop, or the platform node?
6. Does the production source pin advance to carry the new selectors, or does the fleet
   repository patch them?
7. Do the three disks grow now (N11)? h4claw's growth is a power-off of the control plane and
   the website.
8. Should a second CI host be added now, so two gates can run while h2puni still serves WBS?
9. Does Harbor land on the node while it is still an agent, or only after the control plane
   has moved?

## Not verified

- Nothing was run against a host or the cluster beyond read-only listings.
- The server-to-agent change on h4claw and the agent-to-server change on h5plat are not
  documented by k3s and have not been rehearsed.
- Whether containers on h4claw keep serving while its k3s server is stopped.
- The memory of the k3s server and etcd alone; 1,536 MiB is an assumption.
- The production figures for `puni-request-app`, OpenBao and cert-manager.
- The website manifests: they live in a private repository; only the live Deployments were read.
- What h3mon and h2puni run outside Kubernetes today beyond what the inventory and the
  coexistence record list.
