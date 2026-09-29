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

## 3. Roll-ups

- [ ] 3.1 Red: `rollUpProject` examples; cache; chunk endpoint; `.db.test.ts` budget.
- [ ] 3.2 Green: implement.
- [ ] 3.3 Negatives: `seq` dropped from the key → a command then a read serves the old total;
      `foldStatuses` swapped for `agree` → an all-held project reads `unknown`; readable filter
      removed → a store hiding one project still lists it.

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
