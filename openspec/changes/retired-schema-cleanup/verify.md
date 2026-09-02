# Verify — retired-schema cleanup, compatibility stage

## Static

- [ ] `design.md` names every path for the three elements and the preserved pair;
      no code, fixture, or migration outside that inventory reads or writes a legacy
      element in this release.
- [ ] `git diff --check` clean on the exact head.

## Migration behaviour (remote, h2puni)

- [ ] Forward: full chain migrates a fresh temp SQLite file; `service_team.size`
      and `work_item.service_id` are still columns, `service_team` still exists,
      `work_item_team` and `work_item_service` still exist with both cascading FKs.
- [ ] Rollback: down then up, a row survives the round trip; pre/post counts
      match.
- [ ] Restart: re-running the migration on a migrated file is a no-op (idempotent).
- [ ] Watched red: reverting a guard (drop a column, rename the table, change a
      cascade, stop the dual-write) fails the corresponding test.

## Preserved

- [ ] `work_item_team` still present and still the team-set source of truth.
- [ ] `work_item.service_team_id` still dual-written (a team patch writes both
      the join table and the scalar).

## Not done here (deferred, recorded)

- [ ] The drop of `service_team.size` and `work_item.service_id` and the rename
      of `service_team` to `team` — separate later change, R2-6.
