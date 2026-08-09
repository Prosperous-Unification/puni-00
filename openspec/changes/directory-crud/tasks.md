<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Rename and memberships

- [x] 1.1 `DirectoryService.renameTeam` + `PATCH /api/teams/:id` — trims,
      refuses whitespace-only 422, refuses collision 409 `taken` naming the
      survivor, refuses missing team 404 — test:
      `directory.service.test.ts` rename cases + controller round-trip in
      `directory.controller.test.ts`
- [x] 1.2 `DirectoryService.patchPerson` + `PATCH /api/people/:id` — name
      and/or `teamIds` in one transaction, full-replace deduplicated
      memberships, empty patch 422, dead team id refuses whole patch
      `unknown_team` (rename beside it not applied — negative: assert the
      old name survives the refused patch; watched failing with the
      validation moved after the name write) — test:
      `directory.service.test.ts` patch cases

## 2. Directory usage and informed delete

- [x] 2.1 `directoryUsageOfPerson` / `directoryUsageOfTeam` queries, built in
      the spec's wire shape — `projects[]` of `{ id, name, workItems }` whose
      work items are `{ id, number, name, effects }`, beside `members[]` of
      `{ id, name }`, both halves always present — with
      `assignment_dropped`, `label_nulled` and
      `assumed_assignee_changed` (`assumedNow` / `assumedAfter`, `null`
      meaning unassigned; the lone-assignment derivation `role-crud` already
      counts) — test: `directory.service.test.ts` usage fixtures incl. a team
      labeled in two projects with both named, a work item whose sole
      assignee's removal flips it to `null`, and a team held by memberships
      alone whose `members` names both people
- [x] 2.2 `DELETE /api/people/:id` — refuse-by-default carrying the usage;
      `cascade=true` drops assignments, memberships, the person, and moves
      the revision of every work item that lost an assignment, one
      transaction; unused person removed without confirmation — test:
      service delete cases; concurrent negative: an assignment inserted
      **after the fast usage read and before the unconfirmed
      `remove(…, false)`** is refused as `in_use` naming it, and the person
      and the assignment both survive (watched failing with the
      in-transaction count replaced by the earlier read, which refuses
      nothing and deletes a person the caller was never shown). A confirmed
      cascade deleting a late assignment is correct and is asserted as such,
      not as the fault
- [x] 2.3 `DELETE /api/teams/:id` — same split; cascade nulls
      `work_item.service_team_id` on every carrier across projects (no FK
      exists — negative: with the nulling deleted, the dangling id is
      observed by the test, watched, then restored), moves those work items'
      revisions, drops memberships — test: service delete cases; the same
      concurrency negative as 2.2 for both of a team's holds: a membership
      and a label each written after the fast usage read and before the
      unconfirmed remove are refused as `in_use` naming them, watched failing
      with the in-transaction count replaced by the earlier read

## 3. Stale directory ids refuse on every write path

- [ ] 3.1 Assign-person and team-label writes validate ids **inside the
      repository write transaction** — the id is read in the same transaction
      as the `UPDATE` (`WorkItemRepository.patch` is the one to change) and a
      typed `unknown_person` / `unknown_team` outcome is returned in place of
      the row, never a service-level precheck in front of today's unchecked
      update — test: `work-item.service.test.ts` writes against deleted ids;
      negative per path: validation deleted → the FK 500 (person) and the
      silent dangle (team) are observed, watched, then restored; `Proof:`
      comments name both
- [ ] 3.2 The three remaining stale-id paths, each with its own negative and
      its own `Proof:` comment, each asserting **both** the typed refusal and
      that storage is unchanged:
      (a) `POST /api/people` into teams — a `teamIds` entry naming a deleted
      team refuses the whole atomic create; fault: the validation removed →
      either a dangling `person_team` row or a raw constraint error reaches
      the caller, watched, then restored;
      (b) redo of a person creation or assignment whose person has since been
      removed refuses typed, and no row is written; fault: the replay routed
      around the guarded repository path, watched;
      (c) undo/redo restoring a work item's team label whose team has since
      been removed refuses typed, and the label stays as it is; fault: the
      same, watched
      — test: `work-item.service.test.ts` and journal replay in
      `command-journal` / service tests

## 4. Events

- [ ] 4.1 `directory_changed` `ProjectEvent` variant; renames and cascade
      deletes collect affected project ids in-transaction, record + publish
      per project post-commit (`role-crud` timing); unreferenced writes
      emit nothing — test: broadcaster spy asserting the exact project set,
      the silent case asserted as zero events; negative: the broadcaster fake
      **reads the directory when it is invoked** and asserts the committed
      rename or removal is already visible to it — fault run publishes before
      the mutation and that assertion is watched failing, then restored. Not
      a nested-transaction test: `bun:sqlite` transactions are synchronous,
      so an `await` inside one cannot be written to fail; what post-commit
      timing actually buys is that nothing a listener reads is uncommitted,
      and `Broadcaster.publish` is the boundary that can say so

## 5. Gate

- [ ] 5.1 `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` green; verify.md records commands,
      results, and the failure-proof table for every negative above
- [ ] 5.2 Deploy to dev and Dany looks
