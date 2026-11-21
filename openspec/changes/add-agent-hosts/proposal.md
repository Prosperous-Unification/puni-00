## Why

Agent sessions run today where they should not stay. OpenClaw's unattended sessions run on
h1claw, which is retired. His own interactive sessions run on his laptop, whose
memory and disk they fill. On 2026-11-22 he asked for a host for OpenClaw and for a separate
host for his logged-in agent accounts, reached with `herdr`.

This change is the third of three that together are the new setup plan, beside
[`separate-node-roles`](../separate-node-roles/proposal.md), which rebuilds the cluster, and
[`host-postgres`](../host-postgres/proposal.md). Both hosts are in the minimal profile that
is built first, and h1claw's retirement is a step here.

## What Changes

- Two node roles outside the k3s cluster and outside the gate pool: `agents`, one server for
  OpenClaw, and `workstation`, one server that is an extension of the operator's laptop.
- Two inventory groups and one play that prepares such a host: the `base` role, password
  login off, and a firewall that admits SSH only.
- Rules that keep both out of the cluster, out of the gate pool and off each other, and
  that keep every automation's key off the workstation.
- The owner creates each server when he chooses. Nothing in the cluster rebuild waits for
  either.

## Non-Goals

No install or migration of OpenClaw: a follow-up, since its code is in a private
repository. No agent tooling, accounts or `herdr` setup on the workstation: the owner's. No
backup pull and no alert relay on the agents host; those duties end with h1claw. No host or
cluster changes.

## Constraints

The repository is public: no prices, provider ids or public addresses. Agent code never
runs on a node of the cluster or on the same server as another role. The agents host holds
no credential of the cluster. The workstation accepts no login from automation.

## Capabilities

### New Capabilities

- `agent-hosts`: hosts outside the cluster for unattended agents and for the operator's own
  agent sessions, and what each may hold.

### Modified Capabilities

None. The `node-roles` capability of the core change names both roles and leaves their
definition to this one.

## Decisions Recorded

One record, agent sessions on hosts of their own, stays in
[design.md](design.md#decision-record-becomes-an-adr-at-merge) until a number is free (task
AH-0.2).

## Impact

Two inventory groups, a play `playbooks/base-host.yml` with its SSH and firewall tasks, the
production placement check in `tools/tool-fleet`, and the Ansible tests. The follow-ups
`host-openclaw` and, if wanted, `set-up-operator-workstation` are listed, not made.
