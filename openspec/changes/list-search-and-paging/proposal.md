## Why

WBS 170. `GET /api/projects` answers about 300 projects and `GET /api/projects/:id/work-items`
answers a whole tree with notes, schedule and slices; an MCP read of one came back as a
333 KB single line. A client without code execution cannot use either past the first
project. MCP tools derive from be-01's shapes, so the MCP inherits this REST change.

## What Changes

- `GET /api/projects` takes `q`, `updatedSince`, `limit` and `cursor`. Without any of them
  it answers exactly today's list in today's order; with any of them it answers a **page**,
  newest update first. Every entry gains `updatedAt`, the reply gains `nextCursor`.
- New `GET /api/projects/:id/work-item-rows`: a page of work items in tree order, the
  outline fields by default, filtered by `q`, `status`, `parentId`, `depth` and
  `updatedSince`, with further **field groups** only when named.
- New `GET /api/projects/:id/work-items/:workItemId`: one work item with every field and
  its own slices.
- `GET /api/projects/:id/work-items` is unchanged; its summary now steers clients to the
  two new reads. Two more MCP tools.

## Non-Goals

- Notes search (needs full-text indexing; its own item). Frontend paging (its own UI item).
- A SQL tool, MCP-only tools, any change to the command endpoint or any write path.
- A migration: `project.updated_at` and `work_item.updated_at` already exist and are
  stamped by `auditOnUpdate`; rows older than those columns stay `NULL`.

## Constraints

- Additive: every existing caller, fe-01, the e2e fixtures and current MCP clients, gets
  today's bodies. A new client reading an old be-01 mid-swap tolerates the missing fields.
- Access filtering happens before paging, so page sizes and cursors never reveal a row the
  caller cannot read (the organizations and spaces leak rule).
- Numbers and dates are re-derived on every read, so a cursor names a stable key, never an
  offset; derived fields are computed for the page answered.
- Malformed input is a typed 400, never ignored (R5).

## Capabilities

### New Capabilities

- `list-reads`: the query grammar, the page contract, the cursor, the field groups and the
  single work-item read.

### Modified Capabilities

none

## Domain Terms

Page, Cursor, Update instant, Field group (added to `CONTEXT.md`).

## Decisions Recorded

Fable's 2026-09-29 decisions are in `design.md`; none is hard to reverse, so no ADR.

## Impact

`@wbs/contracts`, `@wbs/core` (routes, services, two store ports), both store adapters,
be-01 tests, mcp-01 README count. fe-01 is untouched.
