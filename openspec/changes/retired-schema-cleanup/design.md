# Retired-schema cleanup — inventory and version-overlap protocol

Three elements are named for retirement. This file records, for each, every path
that reads it, writes it, constrains it, migrates it, seeds it, exports it, or
reverses it — and then states the protocol that lets the current and outgoing
releases share one SQLite file across a blue/green swap.

## Element 1 — `service_team.size`

`integer('size')` on the `service_team` table (`schema.ts`, `serviceTeam.size`).

| path                 | location                                                          | detail                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| definition           | `apps/be-01/src/repository/schema.ts:886`                         | `size: integer('size')`, JSDoc: "retired by `capacity-per-project`, read by nothing"                                                                    |
| read (this release)  | —                                                                 | none — no query selects `serviceTeam.size`; only JSDoc/comment mentions                                                                                 |
| write (this release) | —                                                                 | none — capacity is a per-project fact now                                                                                                               |
| foreign key          | —                                                                 | none — scalar                                                                                                                                           |
| migration create     | `drizzle/20260806190000_add_teams_and_assignees/migration.sql`    | creates `service_team` with `size`                                                                                                                      |
| migration supersede  | `drizzle/20260813120000_add_project_team_capacity/migration.sql`  | adds `project_team_capacity.size`, per project; the global number was seeded per project and decides nothing after                                      |
| fixture              | `testing/capacity-fixture.ts:69`, `testing/directory-fixture.ts`  | `capacity-fixture.ts:69` seeds per-project `project_team_capacity` (`set(projectId, serviceTeamId, size, stamp)`); the retired global `size` is not set |
| export               | —                                                                 | none                                                                                                                                                    |
| rollback             | `drizzle/20260806190000_add_teams_and_assignees/down.sql`         | drops the table (lossy; recorded in `capacity-per-project/verify.md` "Deferred, and recorded rather than done")                                         |
| deferred drop        | `openspec/changes/capacity-per-project/verify.md` D4 + "Deferred" | drop once no running release selects it                                                                                                                 |

## Element 2 — `work_item.service_id`

`text('service_id') REFERENCES service(id) ON DELETE SET NULL` on the `work_item`
table (`schema.ts`, `workItem.serviceId`).

| path                          | location                                                     | detail                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| definition                    | `apps/be-01/src/repository/schema.ts:419`                    | `serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' })`                                                                                                                                                       |
| read (this release)           | `work-item.ts:108` (`WORK_ITEM_COLUMNS`)                     | read on every tree read — the column sits in `WORK_ITEM_COLUMNS` (`work-item.ts:96-111`), consumed by `work-item.ts:154`, `:240`, and `directory.ts:98`, and kept for restore/undo compatibility (`repository/index.ts:367-372`)             |
| write (this release)          | `work-item.ts:859-864` (`insertSubtree`)                     | patch no longer writes the scalar (`work-item.ts:373`), but duplicate (`work-item.service.ts:2038`) and restore (`:3589`) spread a selected `WorkItem`, including `serviceId`, into `insertSubtree`; the set write is `work-item.ts:675-685` |
| read/write (outgoing release) | every tree read and patch                                    | the outgoing release selects and writes the column for the whole swap window                                                                                                                                                                 |
| foreign key                   | `schema.ts:419`                                              | `REFERENCES service(id) ON DELETE SET NULL` — deleting a service must not delete work items                                                                                                                                                  |
| migration create              | `drizzle/20260821000000_add_service/migration.sql`           | adds the column (task 1.2)                                                                                                                                                                                                                   |
| migration supersede           | `drizzle/20260821080000_add_work_item_service/migration.sql` | creates `work_item_service` and seeds it `INSERT … SELECT id, service_id FROM work_item WHERE service_id IS NOT NULL`, leaving the column standing                                                                                           |
| fixture                       | `testing/work-item-fixture.ts:229`                           | `serviceId: existing.serviceId` carries the legacy scalar through a fixture round trip                                                                                                                                                       |
| export                        | —                                                            | none                                                                                                                                                                                                                                         |
| rollback                      | `drizzle/20260821000000_add_service/down.sql`                | drops the column and its values (lossy; the down script records that it loses the third label dimension)                                                                                                                                     |
| deferred drop                 | `openspec/changes/service-split/design.md` D2 (amended), D9  | drop in a later migration, not the one that adds the join table                                                                                                                                                                              |

## Element 3 — the `service_team` physical table name

The table holds **teams** (who does the work), yet its physical name is
`service_team`. The split added a `service` table that means **product area**, so
for one release the two names read backwards (`service-split/design.md` D9).

| path                        | location                                                                           | detail                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| definition                  | `apps/be-01/src/repository/schema.ts:860`                                          | `serviceTeam = sqliteTable('service_team', …)`                                                                                                                                          |
| reads referencing it        | `work-item.ts` tree reads, `directory.ts`, `directory-usage.ts`, `capacity.ts:124` | the outgoing release selects `service_team` on every tree read; `capacity.ts:124` reads it directly (`.from(serviceTeam)`)                                                              |
| writes referencing it       | `directory.ts:307`, `:434`, `:1126`                                                | `addTeam` (`.insert(serviceTeam)`), rename (`tx.update(serviceTeam)`), `.delete(serviceTeam)`                                                                                           |
| foreign keys referencing it | `schema.ts`                                                                        | `work_item.service_team_id`, `work_item_team.team_id`, `project_team_capacity.service_team_id`, `team_service.team_id`, `person_team.service_team_id` all `REFERENCES service_team(id)` |
| migration create            | `drizzle/20260806190000_add_teams_and_assignees/migration.sql`                     | creates the table                                                                                                                                                                       |
| fixture                     | `testing/directory-fixture.ts`, `testing/capacity-fixture.ts:69`                   | `directory-fixture.ts` seeds teams (and holds `capacityOf` maps); `capacity-fixture.ts:69` is the per-project capacity seeder                                                           |
| export                      | —                                                                                  | none                                                                                                                                                                                    |
| rollback                    | `drizzle/20260806190000_add_teams_and_assignees/down.sql`                          | drops the table (same lossy down as element 1)                                                                                                                                          |
| rename                      | deferred to R2-6                                                                   | `service-split` D9, `proposal.md` "`service_team` is not renamed to `team`"                                                                                                             |

## Preserved (the settled 2026-08-15 decision)

These are the single-team representation and must not change in this chain:

- **`work_item_team`** — the team set join table (`schema.ts:920`). Every read of
  a work item's teams goes through it; `work_item.service_team_id` is written
  beside it as the scalar the outgoing release can see.
- **`work_item.service_team_id` dual-write** — kept and kept written for one
  release (`schema.ts:376`, `work-item.ts:107` selects it, `work-item.ts:542`
  writes `normalizedTeams.at(0) ?? null`). No task in this chain stops that write.

## Version-overlap protocol

Two be-01 processes — one outgoing, one current — may serve the same SQLite file
at once during a swap. The protocol that keeps that safe, and that this change's
tests enforce:

1. **Additive-only migrations.** A migration may add a table, column, or index
   but never drop, rename, or re-key an existing one while an outgoing release can
   still see it. The R2-6 drop is its own later change, not this one.
2. **Team: dual-write.** The current release writes both `work_item_team` (its
   read source) and `work_item.service_team_id` (the outgoing release's read
   source), holding the single member of the set or null for the empty set.
3. **Service: seed-then-leave on patch; preserve restore.** The migration that
   added `work_item_service` seeded it from `work_item.service_id`, and the current
   release stopped writing the scalar on the patch path. It remains selected on
   every tree read and is still inserted by subtree duplicate/restore. That path
   must be migrated before a later release drops the scalar.
4. **Size: no fallback.** Capacity is per-project (`project_team_capacity.size`);
   there is deliberately no fallback to the retired global `service_team.size`, and
   nothing reads it.
5. **Name: keep it.** `service_team` keeps its name until R2-6; a mid-swap rename
   would break the outgoing release's `SELECT … FROM service_team`.

Each schema-shape rule (a premature drop, rename, or re-key) is asserted by
`retired-schema-untouched.db.test.ts` so it fails a test instead of a swap. The
rule-2 app-level dual-write is guarded separately by `work-item.db.test.ts`
(the `repo.patch` path, `work-item.db.test.ts:260-290`); this change's migration
test round-trips both storage locations itself, so it asserts schema presence and
join-table integrity, not the app-level write path.
