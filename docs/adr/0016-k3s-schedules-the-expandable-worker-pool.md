# K3s schedules the expandable worker pool

**Status:** accepted, 2026-09-06.

Twilight uses K3s to place isolated activity attempts across an expandable set of
client-owned worker hosts. M1 proves a real cluster with one dedicated server that
schedules no attempt Pods and at least two agent nodes, using direct Kubernetes
Jobs behind Twilight's worker-provisioner boundary. Nodes are joined and drained
manually in M1; automatic VPS provisioning remains a later Terragrunt scope.

K3s supplies placement, node lifecycle observations, resource limits and a path to
standard isolation runtimes without taking ownership of Twilight's admission,
authority, budget, effect, evidence or deployment rules. Kubernetes may start the
same Job program twice, so an observed Pod or successful exit is never Twilight's
effect or completion ledger.

## Considered options

Docker Swarm was the smaller fixed-host alternative, but its simpler job model has
fewer extension points for the stronger isolation, interactive sandbox and later
cloud-node paths Twilight expects. Nomad was excluded from the open-source-only
shortlist because current releases use the Business Source License. A custom
multi-host scheduler would duplicate established cluster machinery. OpenSandbox is
not a scheduler replacement: its documented multi-host backend is Kubernetes, and
it remains an optional execution API if direct Jobs prove insufficient.

## Consequences

The worker cluster is disposable execution infrastructure rather than an authority
store. Twilight keeps its durable state outside it, creates Jobs through a narrowly
scoped provisioner identity, and grants workers no Kubernetes API, Docker socket,
control-plane secret or production credential. M1 must prove duplicate start,
node loss, drain, cancellation, resource exhaustion, telemetry loss, cluster
rebootstrap and capacity reconciliation on the real topology before claiming an
expandable pool.
