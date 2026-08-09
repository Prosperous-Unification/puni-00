<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The directory can only grow. People and service teams are created from pickers
and listed, but a typo in a name is permanent, memberships are set once at
creation and never editable, and nothing can be deleted. The directory page
(`directory-page`, next change) has no write surface to stand on. Reviewed
plan: `docs/plans/2026-08-09-directory-table-header-gantt.md`, section D1.

## What Changes

**Rename people and teams**

- From: names are write-once at creation.
- To: `PATCH /api/people/:id` and `PATCH /api/teams/:id` rename; collisions
  refuse with the existing `taken` vocabulary. Open projects that reference
  the renamed entity refetch via a new post-commit `directory_changed` event.
- Impact: non-breaking; new routes.

**Edit a person's memberships**

- From: `teamIds` accepted only at creation.
- To: `PATCH /api/people/:id` full-replaces memberships atomically with the
  rename, deduplicated; a dead team id refuses typed.
- Impact: non-breaking.

**Delete with informed cascade**

- From: no deletes exist.
- To: `DELETE` refuses by default carrying the directory usage — affected
  projects, work items and members by name, per Dany's call — and removes
  it on an explicit `cascade=true` call in one transaction, nulling
  `work_item.service_team_id` labels **before** the team row is deleted and
  dropping assignments. The label column carries a real FK to
  `service_team(id)` — verified 2026-08-09 by replaying every migration into
  a scratch DB and reading `PRAGMA foreign_key_list(work_item)`; the Drizzle
  model omits it and earlier drafts said "no FK exists", which was wrong.
  With `foreign_keys=ON` asserted per connection, a delete that has not
  nulled the labels first is rejected by SQLite, so the ordering inside the
  transaction is a contract, not a style choice, and the Drizzle column
  gains the matching `.references()` so the model stops lying.
- Impact: non-breaking API-wise; destructive by design once confirmed.

**Stale directory ids refuse instead of 500 or dangle**

- From: assigning a concurrently deleted person reaches the FK and rethrows;
  a deleted team id would be stored dangling.
- To: every write path that accepts a person or team id — assign, label,
  create-and-assign, undo/redo — validates in its own transaction and
  returns typed `unknown_person` / `unknown_team`.
- Impact: non-breaking; turns latent 500s into modeled 4xx.

## Non-Goals

- No UI — `directory-page` ships it.
- No admin or permission concept: every signed-in account may write, as with
  creation today.
- No directory socket or page-level live updates; only per-project events for
  projects the write touched. Renames of unreferenced entities emit nothing.
- No journaling of directory writes; undo never restores a deleted person,
  team, or membership.

## Constraints

- No schema migration: cascades and label-nulling live in service
  transactions, as `role-crud` did.
- Events record and publish post-commit per affected project — the
  `role-crud` timing; outbox rejected (Dany, 2026-08-09).
- Blue/green: old release keeps serving during a swap; nothing here may
  break the existing four directory routes.
- R5: every refusal path needs a production-path negative watched failing.

## Capabilities

- `wbs-domain`
