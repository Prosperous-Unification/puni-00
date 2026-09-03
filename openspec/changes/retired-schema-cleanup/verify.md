# Verify — retired-schema cleanup, compatibility stage

## Static

- [x] `design.md` names every path for the three elements and the preserved pair;
      no code, fixture, or migration outside that inventory reads or writes a legacy
      element in this release.
- [x] `git diff --check` clean on the exact head.

## Migration behaviour (remote, h2puni)

- [x] Forward: full chain migrates a fresh temp SQLite file; `service_team.size`
      and `work_item.service_id` are still columns, `service_team` still exists,
      `work_item_team` and `work_item_service` still exist with both cascading FKs.
- [x] Rollback: down then up, a row survives the round trip; pre/post counts
      match.
- [x] Restart: re-running the migration on a migrated file is a no-op (idempotent).
- [x] Watched red: a scratch `ALTER TABLE` inside the first case, immediately
      after its forward migration, drops the retired `size` column and fails the
      corresponding presence guard.

Exact h2puni evidence, 2026-09-03:

- Green: `bun test apps/be-01/src/repository/retired-schema-untouched.db.test.ts`
  reported 5 pass / 0 fail / 35 assertions at `bc740e98`.
- Watched red: inside the first case after its forward migration, a scratch
  `ALTER TABLE service_team DROP COLUMN size` made that case fail at
  `toContain('size')`; 4 pass / 1 fail / 34 assertions at `bc740e98`. That case
  deliberately uses an unseeded fresh database, so its row counts are
  `work_item=0`, `work_item_team=0`, `work_item_service=0` before and after; the
  non-zero preservation counts come from the seeded round-trip cases below.
- Team round-trip counts: before `work_item=1`, `work_item_team=1`; after
  `work_item=1`, `work_item_team=1`; scalar/set moved together from `t1` to `t2`.
- Rollback/re-apply counts: before `work_item=1`, `work_item_team=1`,
  `work_item_service=0`; after `1`, `1`, `0`. The deliberately lossy service down
  recreates `service_id` as null, now asserted explicitly. Restart leaves those
  counts and every guarded schema element unchanged.

## Preserved

- [x] `work_item_team` still present and still the team-set source of truth.
- [x] `work_item.service_team_id` remains dual-written; the app-level guard is
      `work-item.db.test.ts:260-290`. This migration test checks schema presence
      and join integrity, not patch behavior.

## Not done here (deferred, recorded)

- [ ] The drop of `service_team.size` and `work_item.service_id` and the rename
      of `service_team` to `team` — separate later change, R2-6.
