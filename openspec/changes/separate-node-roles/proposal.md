## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host and runs under a 13 GiB bound on that 15 GiB machine, so
Harbor does not fit beside it, and the secret store would sit next to the internet-facing
ingress. h2puni runs WBS production on Compose, the dev stacks and gates. On 2026-11-21 the
owner decided that each host gets one node role, and that the cluster may be recreated from
scratch: no host carries load that has to stay where it is.

## What Changes

- A new platform cluster is built from this repository on freshly created servers, beside the
  running one. Nothing is moved in place.
- Four node roles, one host each: platform services, continuous integration, observability,
  production apps.
- The platform node is the k3s server. It hosts Flux, cert-manager, Harbor, and OpenBao with the
  External Secrets Operator.
- The production apps node hosts Traefik, `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app; its namespaces and names do not change).
- The observability node hosts Elasticsearch and Prometheus. Its size is decided by measurement
  on the node.
- The CI host is a gate host outside the cluster.
- Roles are built in the order platform, CI, observability, production apps. Each old host is
  deleted only after its role has a receipt on the new side.
- State crosses by verified backup restore, never by file copy.
- A new node capability pins platform services. Flux and cert-manager gain a node selector.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao or the WBS cutover: each has its own
change. No continuous SQLite replication. No high availability. No change to h1claw, except that
its backup duty needs a named successor. No host, cluster or provider resource is changed by
this plan.

## Constraints

The repository is public: no prices, provider ids or new addresses appear here. SQLite stays one
writer on a node-local `Retain` volume. The fleet model allows exactly one server in a `single`
cluster. Every attended step names its receipt, stop condition and rollback. Website registry
routing, the fleet's website pins and `release-pin.ts` are not changed. The gate pool and the
OpenBao design belong to other owners and are not edited. Bun and Nx only.

## Capabilities

### New Capabilities

- `node-roles`: one role per fleet host, with workloads pinned to the role's capability.

### Modified Capabilities

None.

## Domain Terms

Node role: [glossary](../../../CONTEXT.md).

## Decisions Recorded

ADR 0079 is claimed by open pull requests #935 and #948, and the Harbor record waits for the
next number. The record stays in
[design.md](design.md#decision-record-becomes-an-adr-at-merge) until it can be filed (task 0.2).

## Impact

`infra/fleet/desired.yaml`, a new production inventory, `tools/tool-fleet/src/contracts.ts`, the
Flux, cert-manager and registry stage manifests, the observability coexistence record, the
SQLite backup tooling, the gate-host inventory and the infrastructure runbooks. Follow-ups in
the Harbor change, the OpenBao design, the gate pool and the WBS cutover plan are listed, not
made.
