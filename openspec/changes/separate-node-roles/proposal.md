## Why

One host is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host, so Harbor does not fit, and the secret store would sit
next to the public ingress. On 2026-11-21 the owner decided that the cluster is recreated and
delivered by Argo CD, with OpenBao first, `main` deploying to staging, production on
command, and an unsafe switch while there are no users. On 2026-11-22 he asked
for the smallest setup that can grow, with every old server retired.

This is the first of four changes of the setup plan. The others are [`host-postgres`](../host-postgres/proposal.md) (PostgreSQL hosting),
[`add-agent-hosts`](../add-agent-hosts/proposal.md) (agent hosts)
and [`run-ci-on-argo-workflows`](../run-ci-on-argo-workflows/proposal.md) (CI).

## What Changes

- A new cluster is built on new servers. A host holds one trust class; workloads are
  placed by capability under two profiles, and the minimal one is built first.
- The platform node is the k3s server, with Argo CD, OpenBao, Harbor and Rancher, an
  interface that deploys nothing.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app).
- The observability node hosts Elasticsearch, Prometheus and MLflow, and at first
  staging, which replaces the dev stacks.
- The CI server carries its own cluster for gates and builds.
- Argo CD delivers the cluster from its own tree, `infra/argocd`. A merge to `main`
  reaches staging through a build that commits rendered manifests to a pins repository.
  Production and platform units change only when a person syncs them.
- Platform services are reached over Tailscale only, SSH through one bastion, and are
  built per tenant for the `puni-user-platform` to drive.
- Each app is stopped, backed up, restored and re-pointed; irreplaceable data is
  verified first.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao, the WBS overlays or build tools. No delivery of dev: a follow-up. No PostgreSQL, agents host or CI orchestration: the other
three changes. Workers clusters and labs stay on Flux. No SQLite replication, no high
availability. No tenant onboarding, no adapter. No host or cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. SQLite stays one
writer on a node-local `Retain` volume. No path the old cluster, a workers cluster or a
lab reconciles is edited. Website registry routing, the fleet's
website pins and `release-pin.ts` are untouched. Gates never stop. Staging never receives
production data nor shares a node with production.

## Capabilities

### New Capabilities

- `node-roles`: one trust class per fleet host, workloads placed by capability under two
  profiles, and the rebuilt cluster delivered by Argo CD.

### Modified Capabilities

None.

## Domain Terms

Node role: [glossary](../../../CONTEXT.md).

## Decisions Recorded

ADR 0079 is claimed by open pull requests #935 and #948, and the Harbor record waits for the
next number. Three records, node roles, delivery by Argo CD, and private access with
tenancy, stay in
[design.md](design.md#decision-records-become-adrs-at-merge) until they can be filed (task
0.2).

## Impact

`infra/fleet/desired.yaml`, a new production inventory, a new tree `infra/argocd`, a new
bootstrap playbook and a sync playbook, `infra/versions/toolchain.json`, the `k3s_server` template, the `base` and `network` roles, an access policy file, `tools/tool-fleet` (contracts, a `delivery` check, a promotion check, health, recovery, the observability source,
a lab profile), a Rancher unit and a bastion role, the controller image, the solver supervisor's caller list, rule decoder and
role, admission policies for placement and names, Pod Security labels, the ACME issuers' solvers, a render step for staging builds, the SQLite backup tooling, and the infrastructure runbooks. Follow-ups in the Harbor change, the OpenBao design, the fleet repository, the gate
pool, the WBS overlays and the release tooling are listed, not made.
