## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host, so Harbor does not fit, and the secret store would sit
next to the public ingress. On 2026-11-21 the owner decided that each host
gets one node role, that the cluster is recreated from scratch and delivered by Argo CD, and
that the switch may be unsafe while there are no users. Later that day he added: OpenBao
comes first, `main` deploys to staging, production deploys on command, dev and staging are
separate environments on a node of their own, and PostgreSQL is hosted for every app.

## What Changes

- A new cluster is built on new servers, one node role per host.
- The platform node is the tainted k3s server: Argo CD, then OpenBao and the External
  Secrets Operator, then Harbor.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app). A non-production node hosts staging, which replaces
  today's dev stacks.
- The observability node hosts Elasticsearch, Prometheus and MLflow.
- The CI host runs gates and builds in one host pool.
- CloudNativePG hosts PostgreSQL: a production cluster on a database node and a
  non-production one beside staging, with backups and a proven restore.
- Argo CD delivers the cluster from its own tree, `infra/argocd`. Staging syncs from `main`;
  production and platform units change only when a person syncs them. Its private
  interface syncs production only.
- Workload Secrets come from OpenBao.
- Each app is stopped, backed up once, restored and re-pointed; irreplaceable data is
  verified before its old host is deleted.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao, the WBS overlays or the apps' build
and pin tools. No delivery of dev and no port to PostgreSQL: follow-up changes. Workers
clusters and labs stay on Flux. No SQLite replication, high availability or single sign-on.
h1claw is outside the plan. No host or cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. Until its port, an
app's SQLite stays one writer on a node-local `Retain` volume. The fleet model allows one
server per cluster. No path that the old cluster, a workers cluster or a lab reconciles is
edited. Website registry routing, the fleet's website pins and `release-pin.ts` are
untouched. Gates never stop. Staging never receives production data.

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
next number. Three records, node roles, delivery by Argo CD and PostgreSQL hosting, stay in
[design.md](design.md#decision-records-become-adrs-at-merge) until they can be filed (task
0.2).

## Impact

`infra/fleet/desired.yaml`, a new production inventory, a new tree `infra/argocd`, a new
bootstrap playbook and a sync playbook, `infra/versions/toolchain.json`, the `k3s_server` template,
`tools/tool-fleet` (contracts, a `delivery` check, health, recovery, the observability source,
a lab profile), the controller image, the solver supervisor's caller list, rule decoder and
role, admission policies for placement and names, the runner's job-started hook, the SQLite backup tooling, the `k3s_agent` template, units and checks for PostgreSQL, and the infrastructure runbooks. Follow-ups in the Harbor change, the OpenBao design, the fleet repository, the gate
pool, the WBS overlays and the release tooling are listed, not made.
