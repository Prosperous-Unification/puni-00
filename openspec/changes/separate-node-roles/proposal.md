## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host, so Harbor does not fit beside it, and the secret store
would sit next to the public ingress. On 2026-11-21 the owner decided that each host
gets one node role, that the cluster is recreated from scratch and delivered by Argo CD, and
that the switch may be unsafe while there are no users. Later that day he added: OpenBao
comes first, `main` deploys to staging, production deploys on command, and dev and staging
are separate environments on a node of their own.

## What Changes

- A new cluster is built from this repository on new servers, one node role per host.
- The platform node is the tainted k3s server. It hosts Argo CD, then OpenBao and the
  External Secrets Operator, then Harbor.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app). A non-production node hosts staging, which replaces
  today's dev stacks, and is sized for dev.
- The observability node hosts Elasticsearch, Prometheus and MLflow.
- The CI host runs gates and builds as jobs of one host pool.
- Argo CD delivers the new cluster from a tree of its own, `infra/argocd`. Staging syncs from
  `main`; production and platform units change only when a person syncs them.
  The interface is private; its account syncs production only and cannot roll back.
- Workload Secrets come from OpenBao. Ansible applies only what Argo CD and OpenBao need.
- Each app is stopped, backed up once, restored and re-pointed. Data that cannot be
  regenerated is verified before its old host is deleted.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao, the WBS overlays or the apps' build
and pin tools. No delivery of dev: a follow-up change. Workers clusters and labs stay on
Flux. No SQLite replication, high availability or single sign-on. h1claw is outside the
plan. No host or cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. SQLite stays one writer
on a node-local `Retain` volume. The fleet model allows one server per cluster. No path that
the old cluster, a workers cluster or a lab reconciles is edited. Website registry routing,
the fleet's website pins and `release-pin.ts` are untouched. Gates never stop for other
sessions. Staging never receives production data.

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
bootstrap playbook and a sync playbook, `infra/versions/toolchain.json`, the `k3s_server` template,
`tools/tool-fleet` (contracts, a `delivery` check, health, recovery, the observability source,
a lab profile), the controller image, the solver supervisor's caller list, rule decoder and
role, admission policies for placement and names, the runner's job-started hook, the SQLite backup tooling and the infrastructure runbooks. Follow-ups in the Harbor change, the OpenBao design, the fleet repository, the gate
pool, the WBS overlays and the release tooling are listed, not made.
