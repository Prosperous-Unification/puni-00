## Why

Twilight needs a usable shared workflow for its own development and client
monorepos. Today planning, agent execution, approvals, and evidence have no
common user-facing authority or durable run identity. More concurrent sessions
alone do not establish faster accepted delivery. The objective is minimum elapsed
time to accepted, integrated outcomes within authorized spending and fixed quality.

## What Changes

The first increment provides a configurable FE/BE/MCP loop: submit a request under
a named delivery profile, inspect a versioned workflow and plan, approve the specified plan and execution envelope, pipeline isolated deliverables,
automatically compose and verify integration candidates, recover from interruption,
and inspect evidence, the run ledger and scaling measurements. It
introduces the versioned client-repository contract used by `puni-00` itself and
the execution profile that carries every lever a person tunes.

Later increments add the Backlog.md-backed WBS planning adapter after WBS
refactors, expanded reviews/hooks, automation, knowledge tools, cloud-browser
acceptance, and controlled release. Those increments have explicit entry/exit
criteria in `tasks.md` and their own deltas; the contracts they will adopt are
recorded in the design and the client-repository document, not in this delta.

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

### Modified Capabilities

None in this first increment. The WBS storage migration (M2) and the upgrade
rollback contract (M4) receive their own deltas.

## Domain Terms

Use the [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

The requirements/wiki authority split is recorded in
[knowledge maintenance](../../../docs/twilight-structure/knowledge.md);
the [proposed planning transaction boundary](../../../docs/adr/0015-planning-commits-are-the-transaction-boundary.md)
is an ADR because it is hard to reverse and had real alternatives.

## Impact

Proposed new Twilight applications/libraries/tooling; shared repo template and
later WBS adapter. [Assumptions](../../../docs/twilight-structure/assumptions.md)
and the [Twilight index](../../../docs/twilight-structure/README.md) explain the plan's bounds.
