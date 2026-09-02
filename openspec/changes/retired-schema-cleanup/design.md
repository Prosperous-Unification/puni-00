# Retired-schema cleanup — inventory and version-overlap protocol

Three elements are named for retirement. This file records, for each, every path
that reads it, writes it, constrains it, migrates it, seeds it, exports it, or
reverses it — and then states the protocol that lets the current and outgoing
releases share one SQLite file across a blue/green swap.

## Element 1 — `service_team.size`

`integer('size')` on the `service_team` table (`schema.ts`, `serviceTeam.size`).

| path                 | location                                                          | detail                                                                                                             |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| definition           | `apps/be-01/src/repository/schema.ts:750`                         | `size: integer('size')`, JSDoc: "retired by `capacity-per-project`, read by nothing"                               |
| read (this release)  | —                                                                 | none — no query selects `serviceTeam.size`; only JSDoc/comment mentions                                            |
| write (this release) | —                                                                 | none — capacity is a per-project fact now                                                                          |
| foreign key          | —                                                                 | none — scalar                                                                                                      |
| migration create     | `drizzle/20260806190000_add_teams_and_assignees/migration.sql`    | creates `service_team` with `size`                                                                                 |
| migration supersede  | `drizzle/20260813120000_add_project_team_capacity/migration.sql`  | adds `project_team_capacity.size`, per project; the global number was seeded per project and decides nothing after |
| fixture              | `testing/project-fixture.ts`, `testing/directory-fixture.ts`      | seed `project_team_capacity`; do not set the retired global `size`                                                 |
| export               | —                                                                 | none                                                                                                               |
| rollback             | `drizzle/20260806190000_add_teams_and_assignees/down.sql`         | drops the table (lossy; recorded in `capacity-per-project/verify.md` "Deferred, and recorded rather than done")    |
| deferred drop        | `openspec/changes/capacity-per-project/verify.md` D4 + "Deferred" | drop once no running release selects it                                                                            |

## Element 2 — `work_item.service_id`

`text('service_id') REFERENCES service(id) ON DELETE SET NULL` on the `work_item`
table (`schema.ts`, `workItem.serviceId`).

| path                          | location                                                     | detail                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| definition                    | `apps/be-01/src/repository/schema.ts:324`                    | `serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' })`                                                                 |
| read (this release)           | —                                                            | none — tree reads go through `work_item_service` (`work-item.ts:133-154`, `serviceIds`)                                                                |
| write (this release)          | —                                                            | none — the scalar write came off the patch line when the set landed (`work-item.ts:259-265`); only `work_item_service` is written (`work-item.ts:434`) |
| read/write (outgoing release) | every tree read and patch                                    | the outgoing release selects and writes the column for the whole swap window                                                                           |
| foreign key                   | `schema.ts:324`                                              | `REFERENCES service(id) ON DELETE SET NULL` — deleting a service must not delete work items                                                            |
| migration create              | `drizzle/20260821000000_add_service/migration.sql`           | adds the column (task 1.2)                                                                                                                             |
| migration supersede           | `drizzle/20260821080000_add_work_item_service/migration.sql` | creates `work_item_service` and seeds it `INSERT … SELECT id, service_id FROM work_item WHERE service_id IS NOT NULL`, leaving the column standing     |
| fixture                       | `testing/work-item-fixture.ts:153`                           | `serviceId: existing.serviceId` carries the legacy scalar through a fixture round trip                                                                 |
| export                        | —                                                            | none                                                                                                                                                   |
| rollback                      | `drizzle/20260821000000_add_service/down.sql`                | drops the column                                                                                                                                       |
| deferred drop                 | `openspec/changes/service-split/design.md` D2 (amended), D9  | drop in a later migration, not the one that adds the join table                                                                                        |

## Element 3 — the `service_team` physical table name

The table holds **teams** (who does the work), yet its physical name is
`service_team`. The split added a `service` table that means **product area**, so
for one release the two names read backwards (`service-split/design.md` D9).

| path                        | location                                                        | detail                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| definition                  | `apps/be-01/src/repository/schema.ts:723-724`                   | `serviceTeam = sqliteTable('service_team', …)`                                                                                                                                          |
| reads referencing it        | `work-item.ts` tree reads, `directory.ts`, `directory-usage.ts` | the outgoing release selects `service_team` on every tree read                                                                                                                          |
| foreign keys referencing it | `schema.ts`                                                     | `work_item.service_team_id`, `work_item_team.team_id`, `project_team_capacity.service_team_id`, `team_service.team_id`, `person_team.service_team_id` all `REFERENCES service_team(id)` |
| migration create            | `drizzle/20260806190000_add_teams_and_assignees/migration.sql`  | creates the table                                                                                                                                                                       |
| rename                      | deferred to R2-6                                                | `service-split` D9, `proposal.md` "`service_team` is not renamed to `team`"                                                                                                             |

## Preserved (the settled 2026-08-15 decision)

These are the single-team representation and must not change in this chain:

- **`work_item_team`** — the team set join table (`schema.ts:782`). Every read of
  a work item's teams goes through it; `work_item.service_team_id` is written
  beside it as the scalar the outgoing release can see.
- **`work_item.service_team_id` dual-write** — kept and kept written for one
  release (`schema.ts:281`, `work-item.ts:107` selects it, `work-item.ts:542`
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
3. **Service: seed-then-leave.** The migration that added `work_item_service`
   seeded it from `work_item.service_id` and then the current release stopped
   reading and writing the scalar; it is left standing for the outgoing release's
   reads and writes.
4. **Size: no fallback.** Capacity is per-project (`project_team_capacity.size`);
   there is deliberately no fallback to the retired global `service_team.size`, and
   nothing reads it.
5. **Name: keep it.** `service_team` keeps its name until R2-6; a mid-swap rename
   would break the outgoing release's `SELECT … FROM service_team`.

Each rule is asserted by `retired-schema-untouched.db.test.ts` so that a premature
drop, rename, re-key, or stopped dual-write fails a test instead of a swap.
