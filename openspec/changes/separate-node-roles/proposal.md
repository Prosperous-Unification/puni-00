## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host, so Harbor does not fit, and the secret store would sit
next to the public ingress. On 2026-11-21 the owner decided that each host gets one node
role, that the cluster is recreated and delivered by Argo CD, and that the switch may be
unsafe while there are no users. He then added: OpenBao first, `main` deploys to staging,
production on command, and dev and staging as separate environments on their own node.

This change is the first of three that together are the new setup plan. The other two are
stacked on it: `host-postgres` (PostgreSQL hosting) and `add-agent-hosts` (a host for
OpenClaw and a remote workstation).

## What Changes

- A new cluster is built on new servers, one role each.
- The platform node is the k3s server: Argo CD, OpenBao, Harbor.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app). A non-production node hosts staging, which replaces
  the dev stacks.
- The observability node hosts Elasticsearch, Prometheus and MLflow.
- The CI host runs gates and builds in one host pool.
- Argo CD delivers the cluster from its own tree, `infra/argocd`. A merge to `main`
  reaches staging through a build that commits rendered manifests to a pins repository;
  until it runs, today's poller stays. Production and platform units change only when a
  person syncs them.
- Each app is stopped, backed up, restored and re-pointed; irreplaceable data is
  verified before its old host is deleted.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao, the WBS overlays or the apps'
build tools. No delivery of dev: a follow-up change. No PostgreSQL and no host for agents:
the two stacked changes. Workers clusters and labs stay on Flux. No SQLite replication or
high availability. h1claw is outside the plan. No host or cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. An app's SQLite
stays one writer on a node-local `Retain` volume. No path that the old cluster,
a workers cluster or a lab reconciles is edited. Website registry routing, the fleet's
website pins and `release-pin.ts` are untouched. Gates never stop. Staging never receives
production data.

## Capabilities

### New Capabilities

- `node-roles`: one role per fleet host, workloads pinned to the role's capability, and the
  rebuilt cluster delivered by Argo CD.

### Modified Capabilities

None.

## Domain Terms

Node role: [glossary](../../../CONTEXT.md).

## Decisions Recorded

ADR 0079 is claimed by open pull requests #935 and #948, and the Harbor record waits for the
next number. Two records, node roles and delivery by Argo CD, stay in
[design.md](design.md#decision-records-become-adrs-at-merge) until they can be filed (task
0.2).

## Impact

`infra/fleet/desired.yaml`, a new production inventory, a new tree `infra/argocd`, a new
bootstrap playbook and a sync playbook, `infra/versions/toolchain.json`, the `k3s_server` template, `tools/tool-fleet` (contracts, a `delivery` check, a promotion check, health, recovery, the observability source,
a lab profile), the controller image, the solver supervisor's caller list, rule decoder and
role, admission policies for placement and names, Pod Security labels, the ACME issuers' solvers, the runner's job-started hook and a render step for staging builds, the SQLite backup tooling, and the infrastructure runbooks. Follow-ups in the Harbor change, the OpenBao design, the fleet repository, the gate
pool, the WBS overlays and the release tooling are listed, not made.
