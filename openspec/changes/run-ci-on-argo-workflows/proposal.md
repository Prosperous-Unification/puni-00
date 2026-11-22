## Why

Gates and release builds are started by hand over SSH and admitted by a host pool this
repository maintains itself. Nothing on a host is started by a merge, so staging cannot follow
`main`. On 2026-11-22 the owner asked for a self-hosted tool that orchestrates CI "so that i
don't need to build one", that is multitenant and that the `puni-user-platform` can drive,
and chose Argo Workflows and Argo Events, with Dagger for what a job does.

This change is the fourth of four that together are the new setup plan, beside
[`separate-node-roles`](../separate-node-roles/proposal.md), which rebuilds the cluster,
[`host-postgres`](../host-postgres/proposal.md) and
[`add-agent-hosts`](../add-agent-hosts/proposal.md).

## What Changes

- The CI server runs a cluster of its own: one k3s node, of a new fleet purpose, that holds
  no credential for the platform cluster. The platform cluster's Argo CD delivers it, on
  command.
- Argo Workflows runs jobs there and admits them by their resource requests. Argo Events
  starts the nightly gate. The cluster has no public path: a merge starts a job on the
  provider's runner that joins the private access network. Workflows are submitted from templates
  that come from `main`, never from a pull request.
- Dagger defines what a new job does. The staging build is written for it; the gate keeps
  its script inside a workflow and is ported later.
- One tenant, PUNI, is built the way later tenants are added: a namespace, a quota, a
  store path, a cache and a build engine each.
- The new CI capacity is not enrolled in the host pool. The old gate hosts keep it until
  they are retired.
- The self-hosted GitHub Actions runner of the core change is not built.

## Non-Goals

No second tenant, no Kueue, no autoscaled or second-provider nodes, no limits adjusted from
measurements, no submission through the `puni-user-platform`: each is a seam and a
follow-up. No port of the gate to Dagger. No change to the pull-request checks on the
provider's hosted runners, to `dash-host-jobs` or to the release scripts; the gate
documents are rewritten with their owner only after a gate has passed here. No host or
cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. A pull request from
a fork never starts a job that holds a secret. A job is admitted only if it fits. Gates do
not stop for other sessions.

## Capabilities

### New Capabilities

- `ci-orchestration`: jobs triggered, admitted and run on a CI cluster by Argo Events,
  Argo Workflows and Dagger, one tenant at a time.

### Modified Capabilities

None. The `node-roles` capability of the core change names the CI role and leaves its
definition to this one.

## Decisions Recorded

One record, CI orchestration, stays in
[design.md](design.md#decision-record-becomes-an-adr-at-merge) until a number is free (task
CI-0.2).

## Impact

`tools/tool-fleet` (a cluster purpose `ci`, a capability, rules of the `delivery` check, a
render step, `promotion-check`), a bootstrap playbook for the CI cluster,
`infra/versions/toolchain.json`, a tree `infra/argocd/ci`, an AppProject and Applications in
the platform tree, two workflow templates, a Dagger module for the staging build, and a
runbook. Follow-ups in the OpenBao design, the Harbor change, `dash-host-jobs`, the gate
documents and the release tooling are listed, not made.
