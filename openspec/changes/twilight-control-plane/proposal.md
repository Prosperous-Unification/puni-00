## Why

Twilight needs a usable shared workflow for its own development and client
monorepos. Today planning, agent execution, approvals, and evidence have no
common user-facing authority or durable run identity.

## What Changes

The first increment provides a configurable FE/BE/MCP loop: submit a request,
inspect a versioned workflow and plan, approve the exact candidate, execute one
bounded ACP activity, recover from interruption, and inspect evidence and usage.
It introduces the versioned client-repository contract used by `puni-00` itself.

Later increments add the Backlog.md-backed WBS planning adapter after WBS
refactors, expanded reviews/hooks, automation, knowledge tools, cloud-browser
acceptance, and controlled release. Those increments have explicit entry/exit
criteria in `tasks.md`; they are not silently included in the first release.

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

- `twilight/control-plane`: Shared configuration, lifecycle, authority and evidence.
- `twilight/repository-planning`: Client template and versioned planning boundary.

### Modified Capabilities

None in this first increment. Future WBS storage migration receives its own delta.

## Domain Terms

Use the [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

[Requirements/wiki authority](../../../docs/adr/0014-openspec-contracts-and-linked-knowledge.md);
[proposed planning transaction boundary](../../../docs/adr/0015-planning-commits-are-the-transaction-boundary.md).

## Impact

Proposed new Twilight applications/libraries/tooling; shared repo template and
later WBS adapter. [Assumptions](../../../docs/twilight-structure/assumptions.md)
and [research](../../../docs/twilight-structure/research.md) explain the plan's bounds.
