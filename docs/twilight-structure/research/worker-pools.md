# Expandable worker pools

Inspected 2026-09-06 against upstream documentation and license files. These are
candidate capabilities and integration proposals, not an architecture selection.

## Recommendation

Use K3s as the first candidate for the expandable machine pool. Start with direct
Kubernetes Jobs behind a Twilight-owned provisioner port. Evaluate OpenSandbox as
a second layer only if its interactive workspace API removes enough Twilight code
to justify another service and controller. Keep both behind the provisioner and
execution ports: neither scheduler owns admission, authority, budgets, workflow
state, effect identity, evidence, or deployment credentials.

Docker Swarm is the smaller alternative when the need remains limited to running
disposable container jobs on a few fixed machines. It becomes less attractive if
Twilight adopts OpenSandbox, stronger pod isolation, richer scheduling, or later
cloud node autoscaling. Do not select Nomad for an open-source-only foundation
without a separate license decision.

## K3s and Kubernetes Jobs

K3s is Apache-2.0 licensed and packages Kubernetes as server nodes, which own the
control plane and datastore, and agent nodes, which run workloads. A single server
can use embedded SQLite; documented high availability needs multiple server nodes
and etcd or an external datastore. This permits one initial worker machine and
additional agent machines later without changing Twilight's interface.
[Architecture](https://docs.k3s.io/architecture),
[requirements](https://docs.k3s.io/installation/requirements),
[license](https://raw.githubusercontent.com/k3s-io/k3s/main/LICENSE).

Kubernetes Jobs run Pods to completion and support resource requests and limits,
deadlines, bounded retry, node selection, and cleanup. Kubernetes explicitly warns
that even a Job with one completion and parallelism of one may start the same
program twice. Twilight must therefore retain its persisted intent, attempt fence,
idempotency, and reconciliation rules rather than treating Job completion as its
effect ledger.
[Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/),
[resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/).

K3s schedules work onto registered machines; it does not itself purchase VPSs.
Kubernetes node autoscalers call provider APIs through provider-specific
integrations. That belongs to the later cloud-infrastructure scope; the first pool
can add and drain machines explicitly.
[Node autoscaling](https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/).

**Assessment:** the best general foundation when portability, isolation options,
and future elastic infrastructure matter. The cost is operating a Kubernetes
control plane and defining Pod security, networking, image distribution, storage,
telemetry, upgrades, and cleanup. A compatibility spike must prove Bun, browser,
build-cache, workspace, cancellation, node-loss, and duplicate-start behavior.

## OpenSandbox

OpenSandbox is Apache-2.0 licensed. Its former `alibaba/OpenSandbox` repository
now redirects to `opensandbox-group/OpenSandbox`.
[License](https://raw.githubusercontent.com/opensandbox-group/OpenSandbox/main/LICENSE),
[repository](https://github.com/alibaba/OpenSandbox).

The documented Docker backend manages a single host; the Kubernetes backend is
the route to a pool spanning machines. It supports OpenSandbox's `BatchSandbox`
controller and the separate `kubernetes-sigs/agent-sandbox` provider. The API
offers sandbox creation, expiry renewal, deletion, commands with streamed output,
file operations, PTYs, resource limits, and service endpoints. Its SDKs include
Python and TypeScript. This gives Twilight a reusable remote execution interface;
it does not supply the SDLC policy.
[Architecture](https://raw.githubusercontent.com/opensandbox-group/OpenSandbox/main/docs/architecture/index.md).

`Pool` maintains prewarmed sandbox capacity with minimum/maximum buffers and
capacity limits. Its demand scaling concerns sandbox resources in a Kubernetes
cluster; these docs do not establish provisioning additional VPS machines.
[Kubernetes controller](https://raw.githubusercontent.com/opensandbox-group/OpenSandbox/main/docs/kubernetes/index.md).

Persistence has specific limits: Kubernetes rootfs pause/resume recreates the
sandbox from an OCI image and preserves its ID, but does not restore processes
or memory in the ordinary rootfs mode. Mounted storage depends on volume type;
credentials held in the egress vault require reinjection. Pause currently requires
one replica. Snapshot images need registry retention outside sandbox deletion.
The optional QEMU mode is a separate capability, not assumed here.
[Pause/resume guide](https://raw.githubusercontent.com/opensandbox-group/OpenSandbox/main/docs/guides/pause-resume.md).

Default `runc` containers are the baseline isolation. Administrators can configure
gVisor or Kata; adopting OpenSandbox alone does not establish VM isolation. Host
support and build/browser compatibility still need testing.
[Runtime guide](https://raw.githubusercontent.com/opensandbox-group/OpenSandbox/main/docs/guides/secure-container.md).

**Assessment:** a strong candidate above Kubernetes when Twilight needs a stable
workspace across many command/file calls. Twilight could create one sandbox per
approved execution attempt, run an ACP-capable agent process inside it, and keep
LangGraph state, spending authority, acceptance and deployment credentials outside
the sandbox. That is an integration proposal; neither ACP transport nor this
authority boundary was tested.

## Docker Swarm

SwarmKit is Apache-2.0 licensed and built into Docker Engine's swarm mode. Managers
maintain cluster state and place tasks; worker nodes execute containers. Adding a
worker adds capacity. A single manager is documented as acceptable for testing,
but losing it leaves services running while requiring cluster recovery; an
odd-numbered manager set is the documented fault-tolerant topology.
[Nodes](https://docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/),
[license](https://raw.githubusercontent.com/moby/swarmkit/master/LICENSE).

Swarm supports `replicated-job` workloads, concurrency caps, placement constraints,
and CPU/memory reservations and limits. Completed job tasks do not restart. It does
not provide OpenSandbox's command/file/PTY/workspace API, and ordinary Docker
containers remain the isolation boundary.
[Jobs and constraints](https://docs.docker.com/reference/cli/docker/service/create/).

**Assessment:** a credible low-complexity option for a small, manually expanded pool
of disposable container jobs. It fits poorly as the base for OpenSandbox's current
multi-host path, which is Kubernetes-based, and offers fewer standard extension
points for later cloud scheduling and isolation runtimes.

## Nomad

Nomad Community Edition versions from 1.7 use the Business Source License rather
than an open-source license. Its additional use grant restricts paid hosted or
embedded competitive offerings and explicitly includes paid support when defining
a competitive offering. That wording may or may not cover the eventual Twilight
offering; this note makes no legal conclusion.
[License](https://raw.githubusercontent.com/hashicorp/nomad/main/LICENSE),
[community-edition policy](https://developer.hashicorp.com/nomad/docs/ce-license-support).

**Assessment:** technically relevant, but exclude it from the open-source-only
shortlist unless product counsel or a deliberate licensing review clears the exact
distribution and maintenance model.

## Daytona

**Current maintenance status changes the recommendation.** The official repository
says core development moved to a private codebase in June 2026 and the public
repository receives no further updates, fixes or releases. Its notice links the
historical `v0.190.0` AGPL-3.0 license. Cached search summaries still describe a
maintained open-source stack; use the current notice instead.
[Maintenance notice](https://raw.githubusercontent.com/daytonaio/daytona/main/README.md),
[historical license](https://raw.githubusercontent.com/daytonaio/daytona/v0.190.0/LICENSE).

The historical release documents a self-operated Compose stack, remote runners,
snapshot management, execution/file APIs and client SDKs. Its Compose deployment
includes PostgreSQL, Redis and object storage, so it is a platform to operate,
with more services than just an execution daemon.
[Release README](https://raw.githubusercontent.com/daytonaio/daytona/v0.190.0/README.md),
[Compose definition](https://raw.githubusercontent.com/daytonaio/daytona/v0.190.0/docker/docker-compose.yaml).

Current product docs describe runner scheduling and sandbox operations, but they
cannot prove those capabilities or security guarantees exist in the frozen
open-source release. Detailed historical restart, termination and persistence
contracts were not established in this inspection.
[Current architecture](https://www.daytona.io/docs/en/architecture/).

**Assessment:** do not recommend the unmaintained release as Twilight's new
open-source foundation. Its execution API illustrates the same possible boundary
as OpenSandbox, but a maintained fork would require its own evaluation; current
Daytona service capabilities should be evaluated as a separate product choice.

## Evidence limits

No packages installed, hosts inspected, sandbox executions attempted, or runtime
tests run. Throughput, isolation against hostile code, worker-loss recovery,
process cancellation, credential leakage and interoperability with Twilight's
agent adapters remain unverified. License names were checked against source
files; this note does not assess a proposed distribution's legal obligations.
