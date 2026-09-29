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
      measures 444–484 ms. Fable's review: a wall-clock cold bound flakes on CI (coverage,
      two parallel tasks, four vCPUs), so the cold path is asserted by its work instead (one
      tree read per project cold, none warm, no gate table scan) and its time is printed only.
- [x] 3.5 The cache key carries the project revision (Fable's capacity review): a project
      settings change moves dates and totals without an event. Mounted negative: start date
      changed, revision left out → the cached old dates are answered.

## 4. In progress now

- [x] 4.1 Red: `inProgressLeavesOf` and `sortInProgress` examples; the resource (order across
      members, limit and `truncated`, hidden members, unavailable engines); the mounted route
      (`setStatus in_progress` listed for a viewer, limits `1001`, `0` and `x` refused).
- [x] 4.2 Green: `@wbs/domain` `in-progress-now.ts`; `SpaceResource.inProgress`, whose leaves
      are cached beside the roll-up from the same tree read; `GET /api/spaces/:id/in-progress`;
      MCP pin 64. The optional `step_progress` prefilter is not built: the shared cache already
      spares a repeated tree read.
- [x] 4.3 Negatives: status check replaced by a step check → a held and a blocked leaf listed;
      the cut removed → 1,001 items for a limit of 1,000; the readable filter removed → the
      hidden member is read (and throws); the limit maximum removed → `limit=1001` answers 200.

- [x] 4.4 Review fix (Fable, Important): the cache key carries the reader's access, since a
      scoped tree read renames assignees to the organization's own names. Negative: access left
      out → a scoped reader receives the legacy name `Root Kat`. Minors: project id is the last
      sort key (removed → tied items keep input order); `unavailable` omits a hidden member;
      `limit` accepts leading zeros (`010`); the cache counts entries, not leaves.

## 5. fe rows

- [x] 5.1 `/spaces` (All projects first, create, rename, delete), `/spaces/$spaceId` (rows,
      roll-ups in chunks of 20, move up and down, remove, add from the caller's projects),
      `Spaces` in the page nav, `/?project=<id>` for any link, the loading, empty, failure and
      `organization_required` states, refetch on focus, after own writes and every 60 s while
      visible. be-01 answers `writable` on the list and the space read so fe-01 draws no control
      a write would refuse.
- [x] 5.2 Negatives: handles drawn whatever `writable` says → the viewer's table holds the
      remove button; create form drawn whatever `writable` says → the viewer sees the new-space
      field; the read route answering `writable` without the role → the viewer's read says
      true; the broken-link branch removed → an unknown `?project=` opens the remembered project.
- [x] 5.3 Review fixes (Fable): a refresh keeps each row's figures until its chunk answers
      (reset → the wait for figures times out); a failed project list for the add picker is an
      alert (failure ignored → no alert); the roll-up cache TTL is 5 min, above the 60 s poll
      (design D4); polling listens to focus and `visibilitychange` and skips a read already in
      flight (check removed → two reads), in its own module; the keyboard returns to the moved
      button or the heading; choosing a project clears the page alert; the handle cell wraps a
      flex box instead of being one.
- Deviations: reorder is by move-up and move-down buttons, not drag (keyboard-reachable, and a
  drag would add a gesture library to a table of a few dozen rows); a project row links with a
  plain `href` to `/?project=<id>` rather than a typed router search param, since the plan page
  reads its link from the address; a broken link says so in a page alert, not a toast, because
  toasts are drawn by the table and a link that opens nothing leaves no table.

## 6. fe in progress now and Gantt

- [x] 6.1 On `/spaces/$spaceId`: a read-only timeline, one bar per project over its roll-up's
      dates and a blank saying why for every other project (no dates, loading, schedule
      unavailable, figures not loaded), and "In progress now" (project, number, name, step, end,
      lateness, people; the cut and the unavailable schedules said), read in the page's own
      refresh so a poll, a focus and every write refresh it with the rows.
- [x] 6.2 Negatives: the dated filter in `spaceGanttLanesOf` removed → the lanes crash with
      `not an ISO date: undefined` instead of drawing blanks; the in-progress read made
      mount-only → `refreshes in progress now after a remove` never sees the empty list.
