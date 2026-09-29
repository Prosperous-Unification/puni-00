## 0. Spec

- [x] 0.1 Intent, delta specs, design, ADR 0033 and CONTEXT terms (Space, Space membership,
      All projects, Project roll-up, In progress now). `openspec validate --all --json` green.

## 1. Storage and the store

- [x] 1.1 Red: `space.db.test.ts` for the tables (cross-organization insert both ways, empty
      name, name per organization, project delete cascades, space delete changes no project)
      and the rollback (refused over a space, allowed when empty, ledger kept).
- [x] 1.2 Red: `spaceStoreConformance` (create, rename, remove, list, members in order, ties by
      project id, add after, move, refusals `not_found`, `name_taken`, `already_in_space`,
      foreign project and foreign space) run against SQLite and memory.
- [x] 1.3 Red: `space-rollback.db.test.ts` (save, remove, rollback, migrate, restore; refuse a
      stale save; refuse a restore over a gone project; malformed file) and the CLI.
- [x] 1.4 Green: migration, guarded `down.sql`, schema, `SpaceStore`, `SpaceRepository`,
      `inMemorySpaces`, `space-rollback.ts`, `space-rollback-cli.ts`, runbook section.
- [x] 1.5 Negatives: composite reference dropped → the cross-organization insert succeeds;
      guard removed → down succeeds over rows; cascade removed → project delete fails;
      stale-save comparison weakened → remove deletes a changed space; ownership read skipped →
      a thrown constraint error instead of `not_found`.

## 2. Resource and routes

- [x] 2.1 Red: contracts, CRUD, membership, move, `virtual_space`, `organization_required`,
      viewer `403`, foreign `404`, MCP tools.
- [x] 2.2 Green: `SpaceResource` (`service/space.resource.ts`, its suffix declaring its kind;
      outside a DI module, as the join-request routes are), routes, boot wiring, contracts, MCP
      pin 54 → 62.
- [x] 2.3 Negatives: role check removed → the viewer's create answers 201 not 403; project
      read bypassed → a project the caller cannot open is added (service level: over SQLite the
      store's ownership read also refuses a foreign project, so the controller cannot see the
      bypass); organization condition removed → a foreign space reads 200 not 404; readable
      filter removed → a hidden member gets a row.
- [x] 2.4 Review fix (Fable, Important): gate the member and the `afterProjectId` anchor of
      add, move and remove through `readWithin`. Negatives: anchor gate removed on add → placed
      after a hidden member; member gate removed on move and remove → a hidden member moved or
      removed; anchor gate removed on move → moved after a hidden member.

## 3. Roll-ups

- [x] 3.0 Carried from the slice 2 review: `SpaceResource.list` reads every space's members in
      one `membersIn` read (no N+1), and `read` finds the space before it reads the project list.
- [x] 3.1 Red: `rollUpProject` examples; cache (sequence, TTL, unavailable never cached); the
      chunk endpoint (51 ids → 400, foreign id → 404, viewer reads); a `.db.test.ts` budget over
      30 projects of 300 rows.
- [x] 3.2 Green: `rollUpProject` and `ROLLUP_DTO_VERSION` in `@wbs/domain`; `RollUpCache` and
      `SpaceResource.rollUps` in `@wbs/core`; `GET /api/spaces/:id/roll-ups`; MCP pin 63.
- [x] 3.3 Negatives: `seq` dropped from the key → a command then a read serves the old total;
      `foldStatuses` swapped for an `agree` fold → an all-held project reads `in_progress`;
      readable filter removed → a hidden project's roll-up is answered; TTL expiry skipped → a
      stale total past 60 s; the 50-id limit removed → 404 instead of 400.
- [x] 3.4 The cold budget (Fable's profile): 4,607 of 4,961 ms was `findCrossReferences` in the
      access gate scanning `work_item` and `dependency`, not the tree (about 16 ms per 300
      rows). Fixed in #235 off main (both incoming arms now probe indexes, with an
      `EXPLAIN QUERY PLAN` proof), merged here. Chunks stay at 20; a cold chunk of 20 now
      measures 484 ms and is asserted ≤ 1,000 ms × slack.

## 4. In progress now

- [ ] 4.1 Red, 4.2 Green.
- [ ] 4.3 Negatives: hold check removed → a held leaf with an in-progress step is listed;
      `limit` removed → 1,001 items answered.

## 5. fe rows

- [ ] 5.1 `/spaces`, `/spaces/:id`, reorder, add and remove, deep link, states.
- [ ] 5.2 Negatives: role gate removed → a viewer sees handles; unknown deep-link id → empty
      state, not a crash.

## 6. fe in progress now and Gantt

- [ ] 6.1 Implement.
- [ ] 6.2 Negative: null-dates filter removed → a bar for an undated row.
