# Design — list-search-and-paging

Decisions D1–D3 were made by Fable on 2026-09-29 as design authority; their full reasoning
is in the lane record (`puni-plan/batch-9/lanes/170-list-paging.md`, "Design decisions").
This file keeps the technical shape and the reasons a reviewer needs.

## D1. Old replies stay the same; new defaults live on a new path

Notes (Dany, 2026-09-22) wanted the outline and `limit` 25 by default and fe-01 on
`full=true`. That breaks a swap both ways: be-01's mount answers 400 to any query string on
a shape that declares no query (`apps/wbs/be-01/src/http/elysia/mount.ts`), so a new fe-01
sending `full=true` cannot load a plan from the outgoing be-01, and every old caller would
get a page it cannot read. So the whole-tree read keeps its shape and bytes, and the notes'
defaults become the defaults of `work-item-rows`. The motivating MCP client is reached by
the shape's `document.summary`, which mcp-01 joins into the tool description: the old tool
says it is the whole tree and names the two new ones.

## D2. A new path for work items, one path for projects

A single path answering two 200 shapes would make every typed caller of `getWorkItems`
narrow a union, and `workItemTree` is embedded unchanged in plan documents. So
`GET /api/projects/:id/work-item-rows` and `GET /api/projects/:id/work-items/:workItemId`
are new shapes. "rows": a flat list in tree order, against the old path's nested document;
a static segment under `/work-items/` would shadow a work item of that id.

Projects keep one path: the paged reply is the parameterless reply's shape, so there is no
union. `updatedAt` and `nextCursor` are declared optional on the wire so a new client
reading an old be-01 mid-swap still parses, as `getWorkItems` does for its address
fields; every be-01 carrying this change sends both. The two modes order differently on
purpose: open-recency is per-caller navigation (the picker); a cursor needs a total order
over a stable key.

## D3. The update instant is read, not added

`project.updated_at` and `work_item.updated_at` exist since
`20260901120000_add_audit_columns` and every store write spreads `auditOnUpdate`.
Satellite writes stamp the owning work item (`bumpWorkItems`); step and settings writes
stamp the project (`bumpProject`). Nothing stamps the project for a work-item command,
and a deleted leaf with no siblings stamps nothing, so the project's instant also takes
the newest `plan_event.created_at`, written in the same transaction as every journalled
command. Age pruning of `plan_event` cannot matter: a pruned event is not the newest.
Rows older than the columns are `NULL`; nothing coalesces them with `created_at`, which
would invent an instant the migration refused to invent.

The in-memory project fixture records no instants (its writes ignore their stamps), so it
answers `updatedAt: null` for every project; the instant's rules are proved against
SQLite. The in-memory work-item fixture refuses the work-item instant read outright, since
only the new route calls it and it is proved against SQLite.

## Where paging happens

In the application core, in memory, after the access-scoped reads. The tree read already
loads and schedules the whole project (numbers and dates are derived per read), and the
project list is a few hundred rows; SQL paging would split the cursor's meaning across
two layers for no gain. One store change each: the project list query adds the instant
column; the work-item store gains `listUpdateInstants(projectId)`.

## Cursors

Base64url of JSON `{ v: 1, … }`, no padding. Opaque by contract, not by encryption: it
carries only sort keys the caller has already been answered, so decoding one reveals
nothing, and forging one can only position a walk among rows the caller may read.

- Projects: `{ v: 1, k: [updatedAt | null, id] }`. Keyset resumption; a stored key rather
  than "after id" keeps page 2 from restarting near the top when the boundary project
  itself was edited (it moved to the top and is not answered again). The honest costs,
  stated in the spec: a project edited before it is reached is missed for that walk, and
  a pruned plan event can lower an instant so a served project is served again.
- Follow-up, not in this change: a covering index `work_item(project_id, updated_at)`
  (Fable measured the list at 7-11 ms, 0.6 ms with it, for 300 projects of 200 items).
  It is an additive migration with `down.sql`, but every new migration name is pinned in
  about 24 store test files and would race the queued capacity migrations
  (`20260929210000` latest), so it lands on its own with a stamp after them.
- Work-item rows: `{ v: 1, after: id }`. Tree order is re-derived per read and positions
  are respaced on insert, so a stored position would mis-resume where an id does not.
  An id no longer in the tree is `409 stale_cursor` (precedent: `stale_address_revision`):
  the cursor is well formed and was valid, so it is not a 400.

## Field groups

The outline plus six groups partition `numberedWorkItem`'s fields; a unit test asserts the
partition against the tree schema's keys, so a field added to the tree later fails the
test instead of becoming unreachable through a page. `revision` and `updatedAt` are in
the outline: a caller's next call is usually a command needing the precondition, and it
must see the instant `updatedSince` filtered on.

## Refusals

`invalid_query` is the existing 400 for a query the shape refuses. The arktype `query`
schema expresses digit patterns and lengths; the route checks caps, names, repeated keys
and cursor decoding, answering the same body. New codes: `409 stale_cursor` and
`404 unknown_parent`, both on `work-item-rows` only.

## Rollback

A new mcp-01 or client sending `limit` to a rolled-back be-01 gets 400 `invalid_query`
from the mount rule, a typed refusal of the same class every new query parameter has had.
