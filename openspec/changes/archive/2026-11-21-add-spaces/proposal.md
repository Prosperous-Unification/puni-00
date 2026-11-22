## Why

A planner running several projects can open them only one at a time. WBS 010.4.15 asks for one
place reading many together: which are in the set, how each is doing, what is in progress now,
and a timeline.

## What Changes

- An organization gains **spaces**: named, ordered sets of its projects. A project may sit in
  many spaces; removing it from a space, or deleting the space, changes no project.
- Every organization has the virtual space **All projects**, addressed as `all`, with no row.
- Spaces and their membership are routes, not plan commands: no journal, no undo.
- A space read lists only projects the caller can open, through the project routes' own
  predicate; anything else is omitted entirely, never counted or named.
- Each row gets a **project roll-up** (dates, total days, status fold, counts), read in chunks
  from the tree the project page reads, behind a sequence-keyed process cache.
- **In progress now** lists the leaves across a space whose folded status is in progress.
- fe-01 gains `/spaces`, `/spaces/:spaceId` (rows, in progress now, a read-only Gantt) and a
  project deep link `/?project=<id>`.
- One additive migration with a guarded `down.sql` and a rollback CLI; ten MCP tools.

## Non-Goals

- Cross-project dependencies, capacity across projects (010.4.16), cost (no rate exists).
- Socket subscriptions to many projects; cursors (WBS 170 adds them to the envelopes).
- Editing a project from a space; per-step totals across projects.

## Constraints

- Blue/green shares SQLite: the outgoing colour never reads or writes the new tables, and a
  project deleted by it cascades out of every space.
- Cross-tenant membership must be impossible in the database, not only in the service.
- The migration stamp sorts after every migration on main and in the integration queue.
- A named space needs an owning organization; legacy access uses the legacy organization.

## Capabilities

### New Capabilities

- `space-membership`: spaces, membership, order, storage, rollback.
- `space-read`: space list, space rows, project roll-ups, freshness and budget.
- `in-progress-now`: the in-progress list across a space.
- `space-authorization`: owner resolution, roles, and the leak rule.

### Modified Capabilities

none

## Domain Terms

Space, Space membership, All projects, Project roll-up, In progress now.

## Decisions Recorded

[ADR 0033: A space is a lens](../../../docs/adr/0033-a-space-is-a-lens.md).

## Impact

be-01, `@wbs/core`, both store adapters, `@wbs/conformance`, `@wbs/domain`, contracts, mcp-01,
fe-01.
