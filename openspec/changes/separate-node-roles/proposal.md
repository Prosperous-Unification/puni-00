## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host, so Harbor does not fit beside it, and the secret store
would sit next to the internet-facing ingress. h2puni runs WBS production on Compose, the dev
stacks and gates. On 2026-11-21 the owner decided that each host gets one node role, that the
cluster is recreated from scratch, that the new cluster is delivered by Argo CD, and that the
switch may be unsafe while there are no production users.

## What Changes

- A new platform cluster is built from this repository on freshly created servers.
- Four node roles, one host each: platform services, continuous integration, observability,
  production apps.
- The platform node is the k3s server. It hosts Argo CD, cert-manager, Harbor, and OpenBao with
  the External Secrets Operator, behind a taint.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app).
- The observability node hosts Elasticsearch and Prometheus, sized by measurement.
- The CI host runs branch code outside the cluster: gates, release builds, the dev stacks.
- Argo CD delivers the new cluster from a tree of its own, `infra/argocd`, following `main`.
  Git is the only write path; the interface is private and read-only.
- No decryption runs in the cluster: a few bootstrap Secrets come from Ansible, the rest from
  OpenBao.
- Each app is stopped, backed up once, restored on the new cluster and re-pointed. Downtime is
  accepted. Data that cannot be regenerated is verified before its old host is deleted.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao or the WBS cutover. No move of workers
clusters or labs off Flux. No continuous SQLite replication, high availability or single
sign-on. h1claw is neither rebuilt nor deleted; it gains a pull for the CI host. No host,
cluster or provider resource is changed by this plan.

## Constraints

The repository is public: no prices, provider ids or new addresses appear here. SQLite stays one
writer on a node-local `Retain` volume. The fleet model allows one server in a `single` cluster.
No path that the old cluster, a workers cluster or a lab reconciles is edited. Website registry
routing, the fleet's website pins and `release-pin.ts` are not changed. Gates never stop for
other sessions, and no store loses its scheduled backup while it moves.

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
bootstrap playbook, `infra/versions/toolchain.json`, the `k3s_server` template,
`tools/tool-fleet` (contracts, a `delivery` check, health, recovery, the observability source,
a lab profile), the SQLite backup tooling and the infrastructure runbooks. Follow-ups in the
Harbor change, the OpenBao design, the fleet repository, the gate pool, h1claw's backup sets
and the WBS cutover plan with its first-start coordinator are listed, not made.
