## Why

Twilight needs a usable shared workflow for its own development and client
monorepos. Today planning, agent execution, approvals, and evidence have no
common user-facing authority or durable run identity. More concurrent sessions
alone do not establish faster accepted delivery. The objective is minimum elapsed
time to accepted, integrated outcomes within authorized spending and fixed quality.

## What Changes

The personal phase provides a configurable FE/BE/MCP loop behind an always-available
OpenClaw secretary: submit a request, inspect and approve its plan and execution
envelope, delegate isolated work, compose the result with current main, and inspect
searchable sessions, evidence, cost and scaling measurements. K3s places activity
attempts across a manually expandable multi-host worker pool.

Frequent commits reach branch devs. Final automated and manual cloud-browser tests
run on an immutable artifact in production-like staging before the exact candidate
merges. Dev-main follows main; a separate human command promotes the same artifact
to production. Later personal increments move planning to Backlog-backed WBS,
mature knowledge/automation, and prove clean installation and upgrades. Customer
work waits for a named design partner and problem.

## Non-Goals

Replacing WBS now, promising Backlog native feature parity, public multi-tenant
hosting in the first release, a general agent marketplace, or automatic production
promotion. This request produces a plan; no product implementation is performed.

## Constraints

Nx/Bun and the existing TypeScript stack; LangGraph/LangChain and ACP-first agent
access. Per-client source, knowledge, plans, credentials, and authority remain
isolated. Backlog.md is the chosen target WBS planning backend. Four OpenSpec
artifact classes remain; one authoritative work plan. Missing capabilities and
measurements are explicit. Production needs an explicit human command.

## Capabilities

### New Capabilities

- `twilight/control-plane`: Shared configuration, lifecycle, authority, levers,
  ledger and evidence.
- `twilight/repository-planning`: Client template, versioned planning boundary and
  resource units.
- `twilight/assistant-interaction`: Secretary delegation, worker/session identity,
  searchable history and the work projection.
- `twilight/delivery-environments`: Branch dev, dev-main, staging acceptance,
  main publication and production promotion.

### Modified Capabilities

None in this first increment. The WBS storage migration (M2) and the upgrade
rollback contract (M4) receive their own deltas.

## Domain Terms

Use the [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

The requirements/wiki authority split is recorded in
[knowledge maintenance](../../../docs/twilight-structure/knowledge.md);
the [proposed planning transaction boundary](../../../docs/adr/0015-planning-commits-are-the-transaction-boundary.md)
and the [accepted K3s worker-pool boundary](../../../docs/adr/0016-k3s-schedules-the-expandable-worker-pool.md)
are ADRs because they are hard to reverse and had real alternatives.

## Impact

Proposed new Twilight applications/libraries/tooling; shared repo template and
later WBS adapter. [Assumptions](../../../docs/twilight-structure/assumptions.md)
and the [Twilight index](../../../docs/twilight-structure/README.md) explain the plan's bounds.
