# Tasks — retired-schema cleanup, compatibility stage

This stage retires nothing. It records, guards, and proves the version-overlap
protocol. The drop/rename itself is a separate later change (R2-6).

## 1. The inventory and the protocol

- [x] 1.1 `proposal.md` — the three elements, why each waits, what this change
      does and does not do.
- [x] 1.2 `design.md` — the per-element path inventory (read, write, FK,
      migration, fixture, export, rollback) and the five-rule version-overlap
      protocol.

## 2. The additive compatibility seam and its guards

- [x] 2.1 `retired-schema-untouched.db.test.ts` — a migration test that, against a
      temp SQLite file, runs the full migration chain forward, then asserts:
  - `service_team.size` is still a column after forward, rollback and restart;
  - `work_item.service_id` is still a column, `REFERENCES service(id)` with
    `ON DELETE SET NULL`;
  - the `service_team` table still exists (not renamed);
  - `work_item_team` and `work_item_service` still exist with both cascading
    FKs;
  - a row round-trips a `service_team_id` change through both storage locations
    (`work_item.service_team_id` and `work_item_team`) (pre/post row and
    relationship counts recorded).
- [x] 2.2 **Watched red** — the same suite fails when a column is dropped, the
      table is renamed, or a cascade is changed; prove it by reverting one guard
      locally and watching it fail. (The app-level dual-write is guarded separately
      by `work-item.db.test.ts:260-290`, which drives `repo.patch`; this migration test
      asserts schema presence and join-table integrity only.)
- [x] 2.3 Record pre/post row and relationship counts for forward, rollback,
      restart and watched-red runs.

## 3. Gate and close

- [ ] 3.1 Remote gate on h2puni: forward, rollback, restart and watched-red
      migration tests pass.
- [ ] 3.2 Peer + Gemini terminal review of the exact-head diff; every finding
      dispositioned.
- [ ] 3.3 PR, green CI, merge; a lane-r post-merge audit is filed only if this
      change touches a queue-engine/OpenClaw path (it does not — this is a wbs-tool
      schema change).

## 4. The later change (R2-6), not this one

- [ ] 4.1 Drop `service_team.size`, `work_item.service_id`, and rename
      `service_team` to `team` in a separate change, once no running release reads the
      legacy spelling.
- [ ] 4.2 Before dropping `work_item.service_id`, migrate `insertSubtree`
      (`work-item.ts:859-864`) and its duplicate/restore callers so they no longer insert
      the scalar.
