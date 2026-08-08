## 1. The store

- [ ] 1.1 `RoleRepository` — `listByProject`, `findById`, `add`, `rename`,
      `usageOf`, `remove` — against real SQLite in `repository/role.test.ts`:
      adding hands the role back and moves the project's revision, a duplicate
      name in the same project is refused while the same name in another
      project is accepted, renaming moves the revision, renaming onto a taken
      name is refused and leaves both names alone.
- [ ] 1.2 **Negative test, watched failing:** the UNIQUE translation in `add`
      removed, so `a name the project already holds is refused` sees the
      constraint thrown instead of a refusal. And the project bump removed from
      `add`, so `adding a role moves the project's revision` fails.

## 2. What a removal would cost

- [ ] 2.1 `assumedAssigneeFlips` — a pure function over the project's
      assignments — in `service/role.service.ts`, with tests: an assumption
      arrives, an assumption ends, a work item assigned for three roles keeps
      its answer, a work item with no assignment on the role is not named.
- [ ] 2.2 **Negative test, watched failing:** flips computed as "every work item
      holding an assignment on this role", and the three-role case fails.

## 3. The transaction

- [ ] 3.1 `RoleRepository.remove` deletes estimates, assignments and the role
      in one transaction, bumping the project and every affected work item.
      Tests: the other role's estimates and another project's role survive;
      the affected work items' revisions move and an untouched one's does not.
- [ ] 3.2 **Negative tests, both watched failing:** the explicit estimate delete
      removed, and `removes the role's estimates and leaves the other role's`
      fails on the foreign key — the 500 the bare delete answers today; and the
      affected ids read before the transaction rather than inside it, and
      `an estimate written between the count and the confirmed removal` fails
      on the third work item's revision.

## 4. The service and the routes

- [ ] 4.1 `RoleService`: add, rename, remove with the `cascade` flag, each
      gated by `canEdit`, each answering a typed refusal. Removal without a
      cascade answers the counts and the flips; a role nothing points at is
      removed without one.
- [ ] 4.2 `roleController` on `/api/projects/:id/roles`, over real SQLite:
      200 with the role, 401, 403 on a restricted project, 404 for a project or
      role that is not there, 409 `taken`, 422 `name_required`, 409 `in_use`
      carrying the counts, 204 on a cascade. Wired into `buildApp`, `services`
      and `boot`.

## 5. Events and replay

- [ ] 5.1 `role_added`, `role_renamed`, `role_removed` on `ProjectEvent`,
      published after the transaction. Test: three events, each naming the
      role; and the roles read from inside the publish already hold the change.
- [ ] 5.2 **Negative test, watched failing:** published before the write, and
      `records the event after the role is written` fails.
- [ ] 5.3 A reconnect replays a role event: `GatewayBroadcaster` +
      `ReplayOrchestrator` over the real event log, resuming from the sequence
      before it.

## 6. The rest of the rule

- [ ] 6.1 Role changes append nothing to the command journal, and an undo of an
      estimate whose role has gone refuses as stale rather than writing against
      a role that is not there — over real SQLite, through the routes.
- [ ] 6.2 `STARTING_ROLES` stays the seed: a new project holds `Dev` and `QA`,
      and a third role added afterwards takes estimates that the tree reports.
- [ ] 6.3 `CONTEXT.md` gains the terms this change resolved; `schema.ts`'s
      "no write path for a role" comments are corrected in the same change as
      the behaviour.

## 7. Gate

- [ ] 7.1 `bunx nx format:check --all`, `bunx nx run-many -t test lint typecheck
build --parallel=2`, `openspec validate --all --json` — recorded in
      `verify.md` with the failure-proof table. No e2e: this change is
      server-only and the worktree has no dev stack.
