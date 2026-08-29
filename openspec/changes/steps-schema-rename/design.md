# design — `steps-schema-rename`

One decision, and the alternative written down because a future reader will
need it the moment prod exists.

## D1 — a plain rename, gated on prod not existing

The migration is:

```sql
ALTER TABLE role RENAME TO step;
ALTER TABLE estimate RENAME COLUMN role_id TO step_id;
-- … and so on, per table
```

and `down.sql` is the exact reverse, statement for statement.

This is **not** an additive migration and it is not backward-compatible. It is
allowed here only because there is nothing to be compatible with: no prod
release exists (`LLM_README.md`, open findings — both are prod-phase, recorded
by Dany on 2026-08-06 as "work stops at dev"). Dev runs one container from a
bind-mounted checkout with no swap at all.

**The gate is a check, not a sentence in this file.** `bin/` gains
`assert-no-prod-release.sh`, run by the migration lint's allowlist for this
migration and by the deploy path. It reads the recorded release state and:

- names a colour → **fail**, print the expand/contract path in D2;
- says nothing is deployed → pass;
- is missing or unreadable → **fail**. Never "nothing deployed". This is the
  precise fault `swap.js`'s `readRecordedColor` shipped with, tallied in
  `AGENTS.md` under R5, and repeating it here would make the whole change's
  safety argument unfalsifiable.

Its negative: the state file made unreadable (`chmod 000`), watched failing
with the unreadable-state message rather than passing as never-deployed.

## D2 — what this would have to be after the first prod deploy

Recorded so it is not re-derived under pressure. Two releases:

**Expand.** `ALTER TABLE role RENAME TO step`, then
`CREATE VIEW role AS SELECT id, project_id, name, position FROM step` with
`INSTEAD OF INSERT/UPDATE/DELETE` triggers writing through to `step`. The
outgoing colour's reads and writes go through the view; the incoming colour's go
to the table; there is one source of truth. Per column-renamed table the same
shape: rename, then a view exposing the old column name.

**Contract.** A later release drops the views and triggers, once no colour reads
them.

The cost is seven views and twenty-one triggers alive for one release, each a
place a write can be silently dropped, each needing a negative test that watches
a write through the old name land in the new table. That is a change several
times this one's size, which is why the precondition in D1 is worth checking
rather than skipping.

## D3 — the down migration is reversible only until somebody edits it

`AGENTS.md`: editing a migration after it has been applied is refused at
rollback time. This migration's `down.sql` is a pure inverse — no data is
created, dropped or defaulted — so the rollback is total, and
`migrate-down.test.ts` gains the round trip: apply, roll back, and assert the
schema and every row count match what was there before.

The round trip's negative: one `RENAME COLUMN` omitted from `down.sql`, watched
failing on the schema comparison rather than on a row count — a missing column
rename leaves a schema that still reads rows fine, so a count-only assertion
could not see it.

## D4 — `role_progress` becomes `step_progress`, and that is a table rename too

Easy to miss in a column-rename list: the table's own name carries the word.
Renaming its column and not the table would leave `step_progress.step_id` half
done and the schema's story half told. It is in the same migration.
