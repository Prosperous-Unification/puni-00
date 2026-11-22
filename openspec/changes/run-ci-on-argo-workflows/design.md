## Context

This is the fourth part of the new setup plan. The core change,
[`separate-node-roles`](../separate-node-roles/design.md), rebuilds the cluster and creates
the CI server; ids without a prefix (R…, A…, slices, "core decision n") are its ids. Ids with
the prefix CI are this change's.

Read in source on 2026-11-22, at `origin/main` `b17861f83`:

- The host gate and the release builds are started by hand over SSH through `run_heavy_job`,
  which admits each as a job of the Dash host pool from `infra/jobs/catalogue.json`. The
  `gate` entry is calibrated on three runs: an envelope of 6 cores, 9 GiB and 11 GiB of
  temporary space, a 95th percentile of 6.88 cores and 10.01 GiB, and a heuristic bound of
  13 GiB. `release-build` and `solver-image-publish` are one Bun process driving the Dagger
  SDK, with the build in an engine container bounded at 8 GiB and 6 cores.
- The gate needs more than a shell. `bin/h2puni-gate-steps.sh` runs a step under `bwrap
--unshare-all`, and its last step, the solver smoke, drives a Docker daemon with `buildx`.
- The repository already builds with Dagger: `tools/tool-dagger` is a TypeScript module, and
  `package.json` asks for `@dagger.io/dagger` `^0.21.9`.
- The fleet model has two cluster purposes. A `platform` node may not carry `execution`. A
  `workers` node may not carry `control-plane` and `execution` together
  (`tools/tool-fleet/src/contracts.ts`). Neither admits one node that is server and
  workload at once.
- Nothing on a host is started by GitHub, and nothing reports a host job back to it.
- The `puni-user-platform` backend has routes for a compute provider's capacity report
  (`/api/compute-providers/:providerId/resources/:resourceId/capacity-report`), a resource
  authority's admissions (`/api/resource-authorities/:authorityId/admissions`) and host job
  runs (`/host-job-runs`).

## Goals / Non-Goals

**Goals**

- A merge to `main` starts a build without a person, and a gate is started by one command.
- Jobs are triggered, queued, bounded and recorded by existing software.
- One tenant is built so that a second needs no redesign.
- Every later phase has a seam that phase 1 keeps open.

**Non-Goals**

- Phases 2 to 5 (decision 7).
- Porting the gate to Dagger.
- Replacing the pull-request checks on the provider's hosted runners.
- Editing `dash-host-jobs`, the gate documents, the release scripts or pull request #935.

## Assumptions

Numbered so that the owner can overrule by id. "Decided" marks his own words.

| Id   | Assumption or decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Alternative and its cost                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CI1  | **Decided.** The owner on 2026-11-22: "i want a self-hosted tool that will help orchestrate the CI so that i don't need to build one"; then, after "let's keep in mind that all this has to be multitenant", "ok let's replan for argo workflows and argo events". Argo Workflows runs jobs, Argo Events triggers them, and Dagger defines what a new job does ("ok let's plan for dagger + …")                                                                                                                                                                                                                               | See the decision record                                                                                                            |
| CI2  | **Decided.** Asked whether the orchestrator alone admits jobs or the Dash host pool stays underneath, he chose the orchestrator ("ok let's go for the woodpecker", said of the tool then planned, and carried over when he replanned). The new CI capacity is not enrolled in the pool and is not calibrated by it. The old gate hosts keep the pool until they are retired                                                                                                                                                                                                                                                   | The pool under the orchestrator. Cost: two schedulers, and a calibration of three five-hour gates per host                         |
| CI3  | **Decided.** His principle: "i want to reuse as much software as possible, however it all has to be dynamic/configurable and be orchestrated with the puni user platform (wbs is core of it now)", and "all that must be orchestratable by the puni user platform, must be multitenant". He agreed to the layering: the `puni-user-platform` decides, the orchestrator triggers and runs, Dagger defines a job, Kubernetes enforces limits, Prometheus measures, and a small adapter, what is left of Dash, connects the platform and the orchestrator                                                                        | none weighed                                                                                                                       |
| CI4  | This change builds phase 1 only: static limits written by hand, one tenant. Phases 2 to 5 are seams and follow-ups (decision 7). He asked about autoscaling and a second provider ("maybe we can connect the AWS to provide additional scale?") and did not ask to start there                                                                                                                                                                                                                                                                                                                                                | Start elastic. Cost: a provider with an API and hourly billing is then a precondition of CI at all                                 |
| CI5  | CI runs on a cluster of its own: a single-node k3s on the CI server, of a new fleet purpose `ci`. It is not the production cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A node of the platform cluster. Cost: branch code under the control plane that holds the secret store, and a gate's load beside it |
| CI6  | The platform cluster's Argo CD delivers the CI cluster as a second destination, in a project of its own, synced on command. The CI cluster holds no credential for the platform cluster                                                                                                                                                                                                                                                                                                                                                                                                                                       | An Argo CD on the CI cluster. Cost: about 1.5 GiB on a node that a gate fills, and a delivery tool that branch code can reach      |
| CI7  | The pull-request checks of the public repository stay on the provider's hosted runners. The owner did not object when this was stated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Move them. Cost: outside pull requests would need a way onto the CI cluster                                                        |
| CI8  | Host maintenance sweeps stay systemd timers installed by Ansible. They are not workflows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Workflows. Cost: a job with host access that stops when the orchestrator does                                                      |
| CI9  | The gate keeps its script and runs it inside a workflow pod with a Docker daemon beside it. Its port to Dagger is a follow-up. The staging build is a Dagger module from the start, beside `tools/tool-dagger`                                                                                                                                                                                                                                                                                                                                                                                                                | Port the gate first. Cost: stage 2 waits for a rewrite of the gate                                                                 |
| CI10 | One tenant, `puni`, is built, in the shape decision 4 gives every tenant. On one node its privileged pods make the node one trust zone; a second tenant needs nodes of its own first                                                                                                                                                                                                                                                                                                                                                                                                                                          | A shared engine for all tenants. Cost: one tenant's build reads another's cache and can take the node                              |
| CI11 | No public path. Assumed for the owner on 2026-11-22 while he was away, on the planning session's earlier recommendation, which he had not answered; it follows his words "i want to use tailscale to safely access the services that run the platform without exposing them to the internet" (core R47, R51). A push to `main` starts a small job on the provider's hosted runner, which joins the private access network for the length of the job and submits the Workflow through the CI cluster's API server proxy. The Argo Workflows server, the cluster's API and SSH are reached over that network (core decision 12) | A signed webhook on one public path. Cost: one public endpoint, with an ingress and a certificate issuer on the CI cluster         |
| CI12 | Assumed for the owner on 2026-11-22: a result is written to GitHub in phase 1, as a commit status by a GitHub App that may write statuses and nothing else, under a context no required check uses                                                                                                                                                                                                                                                                                                                                                                                                                            | No status. Cost: a failed nightly gate is seen only in the interface and the alert channel                                         |
| CI13 | Assumed for the owner on 2026-11-22 (core R50): the CI server is 12 vCPUs and 24 GiB. He had said "CI let's start at" the 8 vCPU and 16 GiB class; on the sizes of decision 5, most of them assumed, one gate does not fit that class beside the cluster's own pods                                                                                                                                                                                                                                                                                                                                                           | 8 vCPUs and 16 GiB with a lower limit for the gate. Cost: the limit would be under the gate's measured use                         |
| CI14 | Workflow history is kept in the cluster for a bounded time and logs in object storage. No database is added for an archive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The workflow archive. Cost: a PostgreSQL the CI cluster does not have; it is the step once `platform-db` exists                    |

## Decisions

### 1. A CI cluster, and how it is delivered

**Why its own cluster.** A gate runs whatever a branch holds, as root in effect (decision
3), and holds a node's memory for hours. On the platform cluster that code would sit under
the control plane that carries OpenBao and the production apps. The earlier plan kept CI on
a host outside the cluster for the same reason; a cluster of its own keeps that boundary and
gains a scheduler.

**Fleet model.** A third cluster purpose, `ci`, with one capability of its own, `ci`. A `ci`
cluster's nodes may carry `control-plane` and `ci`, on the same node: the rule that keeps a
workers server free of execution exists so that one server and one agent cannot pass for an
execution floor of two, and a CI cluster declares no such floor. A `ci` cluster may not
require or carry a platform capability or `execution`, and no other purpose may carry `ci`.
The cluster id is `ci-production`, with `controlPlane: single`. The server is `h8ci`, the one
the core change creates in A9.

**Bootstrap.** The existing server bootstrap runs with the new cluster id; the bundled
Traefik, load balancer and metrics server stay off, as on every cluster here, and no
ingress controller or certificate issuer is installed: the cluster serves nothing public. A new play,
`ci-cluster.yml`, then creates on the CI cluster a ServiceAccount for delivery with the
cluster role Argo CD's own `cluster add` gives, and writes its token and the cluster's CA
into a cluster Secret in the platform cluster's `argocd` namespace. That is the one
credential between the two clusters, and it points from the platform to the CI cluster. In
the other direction there is none: the CI cluster's pods read OpenBao through a JWT mount
that trusts this cluster's service-account issuer by a pinned key, the arrangement pull
request #935 designs for workers clusters, so no token for the platform side is stored on
the CI side.

**Delivery.** A tree `infra/argocd/ci`, beside the platform tree and under the same rules
(R21). An AppProject `ci` whose only destination is the CI cluster and whose sources are
that tree and the locked chart archives. Its Applications have automated sync off and are
synced on command by the core change's sync playbook, in the order below, each on its
declared needs. Two rules join the `delivery` check family: an Application of any other
project names the in-cluster destination only, and an Application of project `ci` names the
CI cluster only. So a merge cannot point a staging or platform unit at the CI cluster, nor
a CI unit at the platform.

| Order | Unit                    | Needs                                                  | Holds                                                                                                                                                                                       |
| ----- | ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0    | `ci-namespaces`         | none; the play applied them                            | every namespace of this cluster with its Pod Security level                                                                                                                                 |
| C1    | `ci-policy`             | `ci-namespaces`                                        | default-deny NetworkPolicies, quotas and limit ranges, the admission rules of decision 3                                                                                                    |
| C2    | `ci-tailscale-operator` | `ci-namespaces`; its OAuth client Secret from the play | the Tailscale operator, the API server proxy in `auth` mode, and the Argo Workflows server's tailnet name (decision 2; core decision 12)                                                    |
| C4    | `ci-external-secrets`   | `ci-policy`                                            | the operator; one SecretStore per tenant namespace                                                                                                                                          |
| C6    | `argo-workflows`        | `ci-policy`                                            | controller, server, CRDs, the controller ConfigMap                                                                                                                                          |
| C7    | `argo-events`           | `ci-policy`                                            | controller and CRDs                                                                                                                                                                         |
| C8    | `ci-puni`               | C2, C4, C6, C7                                         | the tenant: its build engine and cache claim, EventBus, a calendar EventSource and its Sensor, WorkflowTemplates, limits, ServiceAccounts, and the Role its trigger identities are bound to |

Argo Workflows is installed from its release manifest, which since 4.0 carries full CRDs
that must be applied server-side, and Argo Events from its release manifest; the engine from
Dagger's chart. Each is vendored and locked in `infra/versions/toolchain.json` like the
other charts. The CRDs of both carry the protection the core change's rule (j) gives
operator CRDs.

**Node.** One node, so no taint: nothing else can be scheduled anywhere. Every pod template
selects `ci`. Storage is node-local with the `Retain` class for the engine's cache and the
default class for scratch.

### 2. Triggers, with no public path

**From a merge.** A workflow file in each repository the tenant builds, on the provider's
hosted runner, started by `push` to `main` and by nothing else. Its one job joins the
private access network with the vendor's GitHub Action as an ephemeral device tagged
`tag:ci-trigger`, creates one Workflow object through the CI cluster's API server proxy,
and leaves; the coordination service removes an ephemeral device when it logs out. The
policy grants that tag the proxy and nothing else (core decision 12). The proxy runs in
`auth` mode: it impersonates the caller as its device name with its tags as Kubernetes
groups, so the group `tag:ci-trigger` is bound to a Role in the tenant's namespace that may
create Workflows and read them. No Kubernetes token and no kubeconfig secret is stored with
the provider.

**What the job holds, and what it reaches if it leaks.** The vendor recommends a federated
identity for this Action, with no stored secret. Under Tailnet Lock a device joins only
with a signed key, and a key minted per job cannot be signed beforehand, so the job uses a
tagged, reusable, ephemeral auth key that the owner signs once and stores as a secret of
the repository; it expires after at most 90 days and CI-A3 renews it. Whether federation
works under Tailnet Lock was not found in the documentation. Whoever holds that key can
join the tailnet as `tag:ci-trigger` and do what the Role allows: start the tenant's
templates with chosen parameters, and read its Workflows. They cannot read a Secret, reach
a server, the platform cluster or any other Service, nor change a template. A workflow file
in a pull request from a fork gets no secret; one from a branch of the repository could
read it, which is why the `build` template refuses a `sha` that is not on `main` and the
gate holds no secret (decision 3).

**What an event may start.** The job submits a Workflow that references a WorkflowTemplate
and passes the commit and the changed app as parameters. The workflow file has no trigger
for `pull_request`, `pull_request_target`, `issue_comment` or any other event; a lint in
`gate` refuses one, and the Role would still confine it. Release builds on a tag are a
trigger their owner adds.

**By hand and by agents.** `kubectl create` of a Workflow that references a template, or
`argo submit --from workflowtemplate/<name> -p sha=<sha>` with the same kubeconfig, through
the API server proxy: the owner as himself, a session on the operator host as
`tag:operator-host`, each bound to the same Role. This replaces "log in and start the
launcher". The Argo Workflows server is reached under a tailnet name, in `server` auth mode
with a ServiceAccount that may only read, so the interface shows runs and starts nothing;
single sign-on with its own RBAC is a later step.

**On a schedule, by Argo Events.** The tenant has an EventBus, one EventSource of type
`calendar` and one Sensor, which submits the gate on `main` nightly from its template. That
is all Argo Events does in phase 1. It is installed so that the path from an event to a
Workflow is built and proven, because that is the path events from the `puni-user-platform`
take later (decision 7); it has no event source of a type that listens on a network.

**Templates come from `main`.** WorkflowTemplates are files of the tenant's unit, delivered
by Argo CD from `main` on command. The controller runs with `workflowRestrictions:
templateReferencing: Strict`: a submitted Workflow must reference a WorkflowTemplate and may
set only the fields Argo Workflows lists as allowed, arguments among them and
`serviceAccountName`, `podSpecPatch`, `volumes` and `securityContext` not. So what a
submission can change is which template and which parameters. `Secure`, which also fails a
running Workflow when its template changes, is the step once a sync during a gate has been
watched.

**The alternative kept on file.** A GitHub event source behind one path of an ingress on the
CI cluster, with a webhook secret and no API token, which this change's earlier draft
designed. It needs Traefik, cert-manager and an issuer on the CI cluster and one public
endpoint. It is what CI11 would become if the owner overrules it.

**What a job can change.** The parameter `sha` selects code, and the code a job runs is the
repository's: the gate script and the Dagger module at that commit. A job at a commit of
`main` runs reviewed code. A gate at a branch's commit, started by an agent, runs that
branch's code with what the gate pod holds, which is why the gate pod holds no secret
(decision 3).

**Result to GitHub.** Every template has an exit handler, which runs whatever the outcome.
It posts a commit status for the commit, with a context under `argo/`, through a GitHub App
that may write commit statuses and nothing else. A status could stand in for a required
check of the same name only if the rule accepted any source: in CI-A3 the owner pins the
required checks `gate` and `pixels` to GitHub Actions as their source before the status
App's key is written, and that is read back there. Failures of the nightly gate also raise an alert.

### 3. Trust

**Who is root-equivalent.** The gate needs a Docker daemon and unshared namespaces, and a
Dagger build needs its engine, which runs privileged. So two kinds of pod are privileged:
the tenant's engine, and the Docker daemon beside a gate. Code that reaches either can take
the node. On a single node that makes the whole CI cluster one trust zone: R35 of the core
change, "the CI host is one trust zone", holds for the cluster as it did for the host, and
this change does not claim more. What changes is what that zone holds.

**Where privilege is allowed.** Namespaces carry Pod Security levels. `argo`,
`argo-events`, `external-secrets` and the Tailscale operator's namespace are `restricted`,
except that the operator's proxy pods need the capability the vendor's chart states, which
its namespace alone is allowed. A tenant has two
namespaces: `ci-<tenant>` for events, templates and ordinary job pods, at `baseline`, and
`ci-<tenant>-build` at `privileged`, which holds the engine and the gate pod and nothing
else. An admission rule refuses a privileged container, a host path or the host network in
any namespace but a `-build` one, and in a `-build` namespace refuses a pod that mounts a
Secret other than the registry pull configuration.

**What the zone holds.** Three credentials, each in the tenant's `ci-<tenant>` namespace as
a Secret made by the External Secrets Operator from the tenant's path in OpenBao:

- the Harbor push robot of the Harbor change, which writes one project;
- the private key of the GitHub App that writes the staging pins repository and nothing
  else (core decision 9);
- the key of the status App (decision 2).

None is mounted into a gate pod. The build workflow's
steps that push and commit mount the first two.

**Their blast radius.** The same as the core change states for the CI host, with one more
item. Code in a privileged pod can read every Secret on the node, so a gate at a branch's
commit can read all three, and the Tailscale operator's OAuth client, which can create
devices with the operator's own tag and no other. With them it can push any image to the
staging project, commit any manifest the `staging` AppProject and admission allow, and
forge a status under `argo/`. It cannot reach the platform cluster: the CI cluster holds no credential for it, and
the store's JWT mount gives a CI service account its tenant's paths only. Image integrity
stays the accepted risk: an image built here may not be what its commit says. A build node
that gates never run on would shrink it (decision 7, phase 4).

**Outside contributors.** Nothing from a fork runs here. Their pull requests are checked on
the provider's hosted runners as today (CI7).

### 4. Tenancy

One tenant is built. Every tenant-scoped object is in this table, with the interface through
which the `puni-user-platform` would drive it. "Git" is a manifest in the tenant's unit,
delivered by Argo CD; "Kubernetes" is an object created through the CI cluster's API;
"REST" is a call to the Argo Workflows server or to OpenBao.

| Object                                           | Scope and isolation                                                                                              | Interface                             | Phase 1                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------- |
| Namespaces `ci-<tenant>` and `ci-<tenant>-build` | all of a tenant's objects; RBAC and default-deny NetworkPolicy per namespace                                     | Git                                   | built for `puni`                |
| ResourceQuota and LimitRange                     | the tenant's share of CPU, memory, pods and claims                                                               | Git; later Kubernetes, by the adapter | built, sized to the node        |
| ServiceAccounts and Roles                        | one to submit, one to read, one for job pods with the executor's minimum                                         | Git                                   | built                           |
| Store path and SecretStore                       | `ci/<tenant>/…` in OpenBao, read through the cluster's JWT mount by that tenant's service account only           | REST to OpenBao for values; Git       | built; the mount waits for #935 |
| EventBus, EventSource, Sensors                   | the tenant's schedules now; its events from the platform later                                                   | Git                                   | built: one calendar source      |
| Trigger identities                               | the tags and groups bound to the tenant's submit Role, and the trigger workflow file in each of its repositories | Git; the access policy file           | built for `puni`                |
| WorkflowTemplates                                | namespaced, so one tenant cannot reference another's; no ClusterWorkflowTemplate holds tenant logic              | Git                                   | built: `gate`, `staging-build`  |
| Workflows                                        | a run; created only from a template                                                                              | REST or Kubernetes                    | built: CLI and Sensor           |
| Limits file                                      | one data file per tenant that the templates read (decision 5)                                                    | Git; later Kubernetes, by the adapter | built, by hand                  |
| Build engine and its cache claim                 | one engine per tenant, in its `-build` namespace; a cache is never shared                                        | Git                                   | built                           |
| Artifact and log prefix                          | a prefix per tenant in the CI bucket, with the tenant's own key                                                  | Git                                   | built for logs                  |
| Semaphore ConfigMap                              | how many of a template run at once                                                                               | Git; later Kubernetes                 | built: one gate                 |
| Metrics label                                    | namespace, and a `tenant` label on every Workflow from the template's `workflowMetadata`                         | Prometheus query                      | built                           |
| Kueue LocalQueue and ClusterQueue                | fair share between tenants                                                                                       | Git                                   | later (phase 4)                 |
| Node pool                                        | nodes that run one tenant's privileged pods                                                                      | Git, in the fleet model               | later (phase 4)                 |

What phase 1 does so that a second tenant is an added directory and not a redesign: no
object above is shared between tenants; no template names a tenant except through its
namespace; the admission rules and the two destination rules are written per pattern
`ci-*`; and the tenant's unit is one kustomize directory whose only inputs are the tenant's
name, repositories and limits file.

What a second tenant needs that phase 1 does not give: isolation between tenants' privileged
pods. On one node there is none (CI10), so the second tenant waits for a node pool of its
own, selected and tainted per tenant.

### 5. Admission, limits and what fits

**Admission.** The scheduler admits a job by its requests: a pod that does not fit waits
Pending and starts when room appears. The limit is enforced by the kernel. A semaphore of
one, in the tenant's semaphore ConfigMap, keeps a second gate from starting beside the
first; it is a local lock, which needs no database. A build has no semaphore of its own
beyond the engine's.

**The limits file.** One data file per tenant, `limits.yaml`, rendered into a ConfigMap. Each
template takes its requests and limits as parameters read from that ConfigMap and applies
them through `podSpecPatch`, which Argo Workflows provides for fields that are not strings.
No template holds a number. This is the seam of phase 2.

| Job             | CPU request | Memory request | Memory limit | Basis                                                                                                       |
| --------------- | ----------: | -------------: | -----------: | ----------------------------------------------------------------------------------------------------------- |
| `gate`          |     6 cores |      10,240 Mi |    13,312 Mi | catalogue: envelope 6 cores and 9 GiB, 95th percentile 10.01 GiB, bound 13 GiB; the Docker sidecar included |
| `staging-build` |      1 core |       2,048 Mi |     2,048 Mi | catalogue `release-build`, host side; read, not measured                                                    |
| Build engine    |     2 cores |       4,096 Mi |     8,192 Mi | catalogue `release-build`, containers bound; read, not measured                                             |

The gate keeps `--parallel=1` and the Node heap pin, which are in its script.

**What the pool guaranteed, and where each lands.**

| Guarantee of `run_heavy_job`, the heavy lock and the launcher | Here                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| One heavy job at a time                                       | the semaphore, and the scheduler for everything else                                                    |
| A memory bound on the job                                     | the pod's limit. It kills where the pool's `MemoryHigh` throttled; CI-A4 watches for a kill             |
| A clean tree at the commit; exit 65 for a dirty one           | moot: every run clones the commit into an empty volume. The template fails a clone that is not at `sha` |
| The printed `running on <sha>`                                | kept: the gate script prints it, and the Workflow carries `sha` as a label                              |
| Exit codes                                                    | the main container's exit code is the Workflow's result; 66's repair mode has no tree to repair         |
| A record of the run                                           | the Workflow object while it lives, its log in object storage, its metrics                              |
| The launcher's hourly refresh                                 | none needed: templates are synced on command, and the script comes from the commit                      |

**Does one gate fit 16 GiB? No, on paper; the server is 24 GiB (CI13).** A 16 GiB server reads 15,602 MiB (core decision
2). Reservations as on the platform node, 2,816 (system 1,024, kubelet with the k3s server
and etcd 1,536, eviction 256), leave 12,786.

| Beside a job                                            | Limit, MiB | Basis                                             |
| ------------------------------------------------------- | ---------: | ------------------------------------------------- |
| Argo Workflows controller and server                    |        768 | assumed; measured in CI-A2                        |
| Argo Events controller, event bus, event source, sensor |        896 | assumed: 256, three bus replicas at 128, 128, 128 |
| External Secrets Operator                               |        384 | assumed                                           |
| Tailscale operator and its proxy                        |        256 | assumed                                           |
| CoreDNS                                                 |        170 | live limit                                        |
| Node exporter and OTel collector                        |        512 | assumed                                           |
| **Sum**                                                 |  **2,986** | leaves 9,800 on 16 GiB                            |

The gate's 95th percentile is 10,250 MiB and its bound 13,312. On 16 GiB its measured use
does not fit what is left, before the engine. On 24 GiB (23,400 read in proportion) 17,598
are left. By requests, which is what the scheduler admits on, a gate (10,240), a
`staging-build` step (2,048) and the engine (4,096) fit together, with 1,214 to spare. By
limits they do not: a gate at its limit and a build with its engine at theirs exceed what
is left by 5,954. So a build runs beside a gate only while both stay near their measured
use, and the tenant's quota is set so that the kernel's choice, if memory runs out, falls
on the build and not on the gate: the build's pods carry the lower priority. Lowering the
gate's limit to fit 16 GiB would put it under its measured use, where the kernel kills it.
Every figure in the table but one is assumed, and CI-A2 measures them before the gate
runs.

**Disk.** The core change's floor for CI is 150 GiB. Here: 40 for the engine's cache claim,
20 for the gate's Docker daemon, 11 for the gate's temporary space, 30 for the system and
images, with a fifth kept free: (40 + 20 + 11 + 30) / 0.8 = 127 GiB. The floor holds.

### 6. Workflows of phase 1

**`gate`.** Parameters: `sha`. One pod in the tenant's `-build` namespace: an init step that
clones the repository at `sha` into an empty volume and fails unless `HEAD` is that commit;
the main container, from an image that carries the gate's locked tools, which runs the gate
steps the script runs today; and a Docker daemon as a sidecar, privileged, with its data on
node-local scratch that is removed with the pod. It mounts no Secret. Its exit handler
posts the status. It runs on demand and nightly, the nightly run started by the calendar
Sensor. Whether the gate passes inside a pod, with
`bwrap` and the solver smoke against a sidecar daemon, has not been tried: CI-S5 rehearses
it and CI-A4 stops on it.

**`staging-build`.** Parameters: `sha`, `app`. Its first step fails unless `sha` is the tip
of `main` or an ancestor of it. Steps after that, each a call of a Dagger function in a
new module beside `tools/tool-dagger`: build the app's images at `sha` and push them to
Harbor by digest; render the app's staging overlay at `sha` with those digests, with the
locked `kustomize`, no cluster and no secret; check the render and commit it to the app's
directory in the staging pins repository as the App. The checks, the commit message, the
zero-replica first render and the promotion check are those of core decision 9, unchanged.
The Dagger CLI in a step reaches the tenant's engine over TCP inside the cluster; the engine
is one StatefulSet with a `Retain` cache claim, which Dagger's chart offers beside the
DaemonSet form. Dagger's TypeScript SDK supports Bun as experimental; `tools/tool-dagger`
already runs that way.

**Release builds.** Their owner's script, `bin/publish-release.sh`, becomes a template that
owner writes; this change gives it the namespace, the engine and the credentials path, and
lists it under dependencies.

**How the pins commit is authorised.** As core decision 9 has it: a GitHub App installed on
the staging pins repository alone, with contents write only, named as the pull-request
ruleset's only bypass actor. Its key is now a Secret in the tenant's namespace instead of a
file on the host. The self-hosted runner, its group, its hook and the workflow lint are not
built: nothing on the CI cluster takes jobs from GitHub Actions.

**Records.** A finished Workflow stays for seven days, then its object is removed by its
`ttlStrategy`; its logs go to the tenant's prefix in a CI bucket as the artifact
repository's archived logs. The workflow archive needs a PostgreSQL, MySQL or MariaDB
database and is not enabled (CI14).

### 7. Seams for the later phases

Each phase is a follow-up change. Each seam is a requirement phase 1 must not break.

| Phase                | Seam kept by phase 1                                                                                                                                                      | Follow-up, and what it needs                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Self-adjusting    | Limits live in one data file per tenant and nowhere else. Every Workflow carries `tenant` and `template` labels, so its duration and each pod's peak memory are queryable | An adapter that reads the measurements and rewrites the file. Needs the CI cluster's metrics in the platform's Prometheus                                                                                                                                                                                                                                  |
| 3. Platform-driven   | A run is started only by submitting from a template, through the server's API or the Kubernetes API. Nothing starts a job another way                                     | The adapter asks the `puni-user-platform` for admission and reports capacity and outcomes to it. The backend has routes for capacity reports, admissions and host job runs today; whether they fit a CI cluster is that change's to decide                                                                                                                 |
| 4. More nodes, Kueue | Every pod template selects a capability and none names a node. Quotas are per tenant namespace                                                                            | Agent nodes; a node pool per tenant for privileged pods; a build node gates never run on. Kueue manages Argo Workflows through its plain-pod integration only: each pod is admitted alone, and a multi-step Workflow can wait for quota part-way                                                                                                           |
| 5. Elastic           | No job assumes a warm cache or a particular machine. Providers would be a list in configuration                                                                           | The cluster autoscaler, which has providers for the current host and for the one the owner named. A second provider needs an API and hourly billing, a private link to Harbor and the pins repository, and it charges for data that leaves it. A node created on demand starts with an empty engine cache; a claim that survives the node is what keeps it |

Dynamic environments per pull request belong to the dev follow-up, `add-dev-environment`.

### 8. What changes in the other three changes

- **Core change.** Stage 2 becomes the CI cluster: A9 creates the server, at 12 vCPUs and
  24 GiB (R50), and bootstraps its k3s, A10 is replaced by this change's steps, A11 stays the release owner's. The stage ends
  when a full gate exits 0 through a workflow. Enrollment and three calibrations on the new
  capacity are gone. R12, R31 and R35 are restated; slice 3.7 loses the workflow, hook and
  lint and keeps the render step and `promotion-check`; A23 loses the runner and keeps the
  pins repository, its App and Argo CD's read key. The CI budget and disk point here. The
  open question about an orchestrator is closed.
- **`host-postgres`.** Nothing changes. The workflow archive is a named later consumer of
  `platform-db`.
- **`add-agent-hosts`.** Nothing changes. A session on the operator host starts a gate with
  the command of decision 2, as `tag:operator-host`.

### 9. Dependencies on other owners

- **Gate pool (`dash-host-jobs`).** Needed: a statement of which pool facts to carry as
  hand-written limits beyond the catalogue entries read above, and, before the old gate
  hosts are deleted, the withdrawal the core change already asks for. Nothing on the new
  capacity.
- **Gate documents and `AGENTS.md`.** Their gate sections describe the pool and the
  launcher. Rewriting them for the command of decision 2 is CI-S8, written with their
  owner after CI-A4.
- **Release tooling.** A template for `bin/publish-release.sh`, and whether the website
  takes the staging build path.
- **OpenBao design (pull request #935).** A JWT mount for the CI cluster and a policy for
  `ci/<tenant>/…`. It is a precondition of CI-A3.
- **Harbor change.** The staging project and its push robot, as before, delivered to the
  store instead of a host file.
- **Core change.** The CI cluster as a telemetry source (its slice 1.5); the private access
  network, its tags and its policy file (decision 12, slice 1.8, task 0.7); and the
  tenancy contract this change's table is a row of (decision 13).

## Decision record (becomes an ADR at merge)

> # CI is orchestrated by Argo Workflows and Argo Events on a cluster of its own
>
> ## Status
>
> Proposed, 2026-11-22.
>
> ## Context
>
> Heavy jobs are started by hand and admitted by a host pool this repository maintains. The
> owner wants a self-hosted orchestrator he does not have to build, that is multitenant,
> configurable and drivable by the `puni-user-platform`.
>
> ## Decision
>
> Argo Workflows runs jobs and Argo Events triggers them, on a single-node k3s cluster of a
> new fleet purpose, delivered by the platform cluster's Argo CD. Dagger defines what a new
> job does. The scheduler admits by requests; the host pool is not used on the new capacity.
>
> ## Alternatives
>
> - The Dash host pool behind a self-hosted GitHub Actions runner, which the planning
>   session recommended first. It reuses a pool that is built and calibrated and learns job
>   sizes from runs. It keeps an orchestrator in this repository and has no tenants.
> - Woodpecker CI with Dagger, which the owner chose first on 2026-11-22. It is small and
>   has triggers, history and status. It has no quotas, fair share or metering per tenant.
> - A self-hosted CircleCI server. It is licensed and needs several large nodes.
> - The provider's hosted runners for everything. They are free for a public repository and
>   metered for a private one, and cannot reach Harbor on the private network.
> - The planning session had argued against Argo Workflows on 2026-11-21 for four reasons.
>   Three stopped applying: a trigger from outside is needed by any self-hosted
>   orchestrator, and here it needs no public endpoint; CI
>   gets a cluster of its own, so branch code is not in the production cluster; and the
>   pool is dropped, so there is no second scheduler. The fourth remains: the gate has to
>   be expressed as a workflow, with a Docker daemon beside it.
>
> ## Consequences
>
> A second cluster to bootstrap, back up nothing of, and patch. A third place where CI is
> defined, beside the hosted pull-request checks. No public endpoint, at the price of a
> trigger job on the provider's runner and a private access vendor. The pool's
> measured envelopes are carried by hand until phase 2. Privileged build pods make the CI
> cluster one trust zone until tenants have nodes of their own.

## Risks / Trade-offs

- **The CI cluster is one trust zone.** A gate at a branch's commit can read the tenant's
  three credentials (decision 3). They reach staging and a status context; image integrity
  is the accepted risk, as in R35.
- **The gate in a pod is untried.** It needs unshared namespaces and a Docker daemon. If it
  cannot pass, the old gate hosts are not retired and the owner decides.
- **A hard memory limit kills where the pool throttled.** A gate that the pool slowed is
  killed here; the limit is the pool's bound, and CI-A4 reads the kill counter.
- **One node.** No gate and no staging build while it is down. Staging then does not follow
  `main`; the old gate hosts cover gates until they are retired.
- **A build beside a gate rests on measured use, not on limits.** When memory runs short the
  build is the one killed, and it is started again; until CI-A2 measures, that is a guess.
- **The trigger depends on three outside services:** the provider's hosted runner, the
  private access vendor's coordination service and its relays. When any is down a merge
  starts no build; a person starts it by hand, and the alert for a stale staging pin
  shows it.
- **The trigger key is a stored secret that expires.** It can start the tenant's templates
  and nothing else; unrenewed, builds stop being triggered, which the same alert shows.
- **The status App can write a status on a public repository.** A required check is safe
  from it only while its source is pinned.
- **Run history is short.** Seven days of Workflow objects, and logs in object storage.
- **A second cluster.** Its etcd holds nothing that Git and the store do not, so it is not
  backed up: it is rebuilt by its bootstrap and a sync.
- **Three places define CI:** the hosted workflow, the templates here, and the Dagger
  modules.

## Open questions for the owner

None. The two this change carried are settled by assumption, for him to overrule: the CI
server's size (CI13) and whether a result is written to GitHub (CI12). The third decision
made for him is that there is no public path (CI11).

What can wait until a step: the list of repositories the tenant builds, at CI-A3; and
whether `Secure` template referencing replaces `Strict`, after CI-A4.

## Not verified

- Nothing was run: no cluster, no Argo Workflows, Argo Events or Dagger engine.
- That the gate passes inside a pod with a Docker sidecar.
- Memory use of every controller in decision 5.
- That a JetStream event bus accepts fewer than three replicas; three are planned.
- That a ruleset can pin a required check to one source (from memory).
- That the engine's StatefulSet form serves the Dagger CLI over TCP from another pod with the
  chart's own values; the TCP scheme is documented for a custom runner.
- How Argo CD's `cluster add` role is best narrowed for a cluster that holds only CI.
- That the CI cluster's metrics reach the platform's Prometheus by the core change's source
  packet.
- Kueue, the cluster autoscaler and a second provider were read about, not designed or run.
- That the vendor's GitHub Action joins a tailnet under Tailnet Lock with a signed, reusable,
  ephemeral key; and whether its federated identity can be used there instead.
- That the API server proxy's group for a tagged device is the tag's literal name, as a
  RoleBinding subject needs it.
- That a `calendar` event source needs no Service and opens no port.
- Memory use of the Tailscale operator and its proxy, and the Pod Security level its proxy
  pods need.
