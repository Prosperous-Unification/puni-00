## Why

Three schema elements outlived their meaning and are waiting to be retired, but
none can be dropped or renamed while an outgoing release still names them. Blue
and green share one SQLite file during a swap, so the only safe edits are
additive: leave the old spelling standing and stop being interested in it, then
drop or rename in a later release once nothing running reads it.

The three, each with its retirement argument already written in the change that
superseded it:

- **`service_team.size`** — retired by `capacity-per-project` (2026-08-13).
  Capacity became a per-project fact held in `project_team_capacity.size`; the
  global number is read by nothing and seeded nowhere after the switch. Its drop
  is that change's D4.
- **`work_item.service_id`** — superseded by `work_item_service` (2026-08-21)
  when a service became a set. This release still selects the scalar on every
  tree read for restore/undo compatibility. The patch path no longer writes it,
  but subtree duplicate/restore still inserts the selected value; the outgoing
  release also selects and writes it. Its drop is `service-split`'s D2 (amended)
  and D9.
- **`service_team` the name** — the table holds **teams**, not services; the
  directory's one entity was literally called `service_team` and the split added
  a table called `service` that means product area. For one release the two names
  read backwards. The rename to `team` is `service-split`'s D9, deferred to R2-6.

This change is the **non-destructive compatibility stage**: it records every
read, write, foreign key, migration, fixture, export and rollback path for the
three elements, states the version-overlap protocol that keeps a swap safe, and
lands the additive seam and the watched-red migration tests that guard against a
premature drop. It retires nothing yet.

## What changes

- An inventory (this change's `design.md`) of every path that touches the three
  legacy elements, plus the version-overlap protocol both releases obey during a
  swap.
- An additive compatibility seam: nothing in the schema is dropped, renamed, or
  re-keyed. The legacy columns stay in their tables; the surviving tables
  (`work_item_team`, `work_item_service`, `project_team_capacity`) stay the single
  source of truth for their dimensions.
- A watched-red migration test (`retired-schema-untouched.db.test.ts`) that asserts the
  three legacy elements survive forward migration, rollback and restart, and that
  `work_item_team` and the `work_item.service_team_id` dual-write stay intact — so
  the R2-6 drop, when it lands as its own later change, cannot arrive here by
  accident.

## What does not change

- `work_item_team` is not deleted. It is the settled single-team representation.
- `work_item.service_team_id` dual-write is not stopped. It is the settled
  single-team representation for the outgoing release's benefit.
- No column or table is dropped or renamed in this change; the retirement itself
  is a separate, later change once no running release reads the legacy spelling.
