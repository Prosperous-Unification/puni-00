## Why

Every app keeps its data in SQLite: one writer on a volume bound to one node, so a deployment
stops the backend and nothing fails over. On 2026-11-21 the owner asked for PostgreSQL hosting
in the new setup plan and said that every app uses it once it is in place.

This change is the second of three that together are the new setup plan, beside
[`separate-node-roles`](../separate-node-roles/proposal.md), which rebuilds the cluster and
delivers it by Argo CD, and [`add-agent-hosts`](../add-agent-hosts/proposal.md). On
2026-11-22 he asked for the minimal setup that can grow.

## What Changes

- A database capability. In the minimal profile, built first, the platform node carries
  it and the production database runs there on a bounded filesystem. A server that carries
  nothing else, tainted for it, is the step it grows into by a replica and a switchover.
- CloudNativePG, with its Barman Cloud plugin, runs on the platform node and is synced on
  command like every platform unit.
- A production cluster, `platform-db`, and a non-production cluster, `nonproduction-db`,
  beside staging, each with one instance, one database and one role per
  app, and a backup key of its own.
- Continuous WAL archiving, nightly base backups and nightly dumps per database; a weekly
  restore drill, off the control plane's disk, whose volume is reclaimed; a runbook for rolling one database back; alerts.
- No app is ported. Each port is its own follow-up change.

## Non-Goals

No port of WBS, the website, the request app or MLflow. No client databases, replica or
offsite copy. No change to Harbor's own database. No change to the cluster rebuild's
stages, none of which waits for this change. No host or cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. Staging data and
production data never share an instance, a disk or a backup key. No production data is
written before one restore and one single-database rollback have a receipt. Until its port
lands, an app keeps its SQLite store and everything the core change says about it.

## Capabilities

### New Capabilities

- `postgres-hosting`: PostgreSQL clusters on the rebuilt cluster, with their node role,
  isolation per app, backups, and a proven restore.

### Modified Capabilities

None. The `node-roles` capability of the core change names the database role and leaves
its definition to this one.

## Decisions Recorded

One record, PostgreSQL hosting, stays in
[design.md](design.md#decision-record-becomes-an-adr-at-merge) until a number is free (task
PG-0.2).

## Impact

`tools/tool-fleet` (the `database` and `restore-drill` capabilities, a placement rule, rule
(o) of the `delivery` check), the `k3s_agent` template, the `registry_storage` role, `infra/versions/toolchain.json`, four units under
`infra/argocd`, the `namespaces`, `policy` and `secret-sync` units, the retention planner,
and a recovery runbook. Follow-ups in the OpenBao design, the Harbor change and the four
port changes are listed, not made.
