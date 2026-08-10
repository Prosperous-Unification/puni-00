# Duplicate a work item and everything under it

## Why

Both UX reviews put this in their top eleven, and agy marked it MUST: "massive
time saver for copying phase templates". A planner builds one phase — survey,
strip, first fix, test, with its estimates and its assignees — and then needs
five more just like it. Today that is the whole branch typed again, per copy.

Codex's requirement, taken as given: the copy happens **on the server, in one
call**. A client replaying creates and patches publishes a half-built tree to
everyone watching, refetches once per row, and copies dependencies that still
point at the originals.

## What Changes

**A branch can be copied whole**

- `POST /api/work-items/:id/duplicate` answers `{ id }` — the copied root — and
  broadcasts the new tree once, when all of it is there.
- The copy carries names, notes, estimates, service-team labels, assignees and
  "start no earlier than" dates.
- **Dependencies are copied only when both ends are inside the branch**, and are
  remapped to the copies. An edge to a row outside is left behind: a copied
  phase inheriting the original's wiring would schedule against work it has
  nothing to do with. A template starts unwired.
- **Frozen numbers are never copied.** A frozen number is an identity that has
  left the tool — `work_item.frozenNumber`'s own words, and why `move` refuses a
  frozen row. Two rows answering one ticket is the exact failure freezing
  prevents. The original is untouched, so duplicating a frozen row is allowed;
  copying is not moving.
- The copy lands as the **next sibling of the original**. Its root's name gains
  ` (copy)`; children keep their names exactly, being already distinguished by
  the parent above them.
- Over **500 rows** it is refused as `too_large`. A duplicate of a duplicate
  doubles each time, and nothing else in the tool bounds it.

**A Duplicate button in the row actions column**, next to Delete and available
on frozen rows too. The caret lands on the copy's Name; a refusal is a toast.

## Non-Goals

- No copying into another project, or under a chosen parent. Next sibling only.
- No options — "without estimates", "without assignees" — until asked for.
- No multi-row selection, and no undo. Delete the copy.

## Constraints

- No migration. Every column this needs already exists.
- One SQLite file, shared by blue and green mid-swap, so the write is one
  transaction rather than a sequence a reader can land inside.

## Capabilities

### New Capabilities

- none

### Modified Capabilities

- `wbs-domain`: a work item and its descendants can be copied in one operation.

## Domain Terms

- Subtree
- Duplicate

## Decisions Recorded

none — the copy semantics are reversible and unsurprising; they are stated in
the spec, and the transaction's shape is in `design.md`.

## Impact

be-01 (`work-item.service.ts`, `work-item.controller.ts`, `repository/`),
fe-01 (`wbs-api.ts`, `wbs-table.tsx`). No schema change, no deploy change.
