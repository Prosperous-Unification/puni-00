## Why

One host, h4claw, is the k3s server, the public edge, the product node, the registry host and a
gate host. A gate holds the whole host pool and runs under a 13 GiB bound on that 15 GiB host,
so Harbor does not fit beside it, and the secret store would sit next to the internet-facing
ingress. h2puni runs WBS production on Compose and gates. On 2026-11-21 the owner decided that
each host gets one node role.

## What Changes

- Four node roles: production apps on h4claw, platform services on a new node, observability on
  h3mon, continuous integration on h2puni.
- The production apps node keeps Traefik and hosts `puni-website`, `puni-request-app` and
  `puni-user-platform` (the WBS app; its namespaces and names do not change).
- The new platform node hosts Harbor, OpenBao with the External Secrets Operator, Flux and
  cert-manager, and later the k3s control plane with etcd.
- h3mon stays reserved for Elasticsearch and Prometheus, the main observability stack.
- h4claw leaves the gate pool. h2puni becomes a gate host only, once WBS production has moved.
- A new node capability pins platform services. Flux and cert-manager, which select no node
  today, gain a selector.
- The control plane moves by a planned snapshot restore, rehearsed in the lab first.

## Non-Goals

No rename of WBS resources. No design of Harbor, OpenBao or the WBS cutover: each has its own
change. No continuous SQLite replication: a later slice. No high availability. No change to
h1claw. No host, cluster or provider resource is changed by this plan.

## Constraints

The fleet model allows exactly one server in a `single` cluster, so the platform node joins as
an agent and no two-server state exists. The repository is public: no prices, provider ids or
new addresses appear here. SQLite stays one writer on a node-local `Retain` volume. Every
production step is attended and has a rollback. Bun and Nx only. The gate pool, the OpenBao
design and the website release routing belong to other owners and are not edited.

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

`infra/fleet/desired.yaml`, the production inventory, `tools/tool-fleet/src/contracts.ts`, the
Flux and cert-manager manifests, the recovery tooling, the gate-host inventory, and the
infrastructure runbooks. Follow-ups in the Harbor change, the OpenBao design and the WBS
cutover plan are listed, not made.
