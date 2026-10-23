# Mounted active authoring authorization packet — 2026-10-23

Base: `3cb4fb8a4`. This packet adds only
`apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts`
and this receipt. Task 4.2 remains open for complete matrix review. Production
composition remains inactive. No command-reference widening, production predicate
change, migration, deployment or activation is included.

The suite mounts `openFixture({ syntheticExternalCommands: true })`. That option
replaces only the application's `writes.batch` WorkItemService authoring policy;
`harness.publicWrites()` and `services.commands` retain their dormant policy. All
writes in this packet use HTTP `/api/projects/:projectId/commands`.

## Covered behavior

- A current member cannot edit another member's restricted predecessor, yet can
  create its external prerequisite into an editable successor. The relationship
  exists in `external_dependency`, publication increases after the admitted write,
  and no restricted-project recovery audit is created.
- Real foreign-organization and absent project, row and remote-step identities
  answer the same exact 404 `not_found` batch envelope. A preceding owner rename
  rolls back. Every table and the push URL list equal their pre-request snapshots.
- Add and update naming a second successor owner refuse before its row is read.
  A real repository row-read tripwire proves ordering. Earlier local writes,
  relationships, revisions, history, events and pushes remain unchanged.
- External→local update and external removal revalidate the old remote endpoint.
  Immutable live endpoint ownership prevents moving that root to another
  organization, so the tests inject a null scoped project read only after the
  corresponding real WorkItemService operation begins. Earlier local command and
  fan-out capture run normally. The genuine service and transaction then model
  the denied old endpoint as 404 and roll back every table and publication.
- Qualified address lookup succeeds for the exact principal and endpoint used by
  the later command. The test holds the real write coordinator, observes request
  resolution and actual writer enqueue, changes membership or revokes that exact
  browser credential through a separate SQLite connection, then releases the
  writer. Membership answers `not_a_member`; credential revocation answers
  `no_active_organization`. Complete tables and pushes are unchanged.

## Watched production mutations

Each mutation was applied alone, run against the named mounted test, and restored
in a `finally` block. No mutation remains in the commit. These are contract
failure proofs, not a claim that every bypass can persist an unsafe relationship:
several independent downstream guards still throw before storage.

| Injected production fault                                          | Selected test                   | Observed failure                                                               |
| ------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------ |
| Require predecessor edit authority in endpoint evidence            | `restricted readable`           | Admitted add changed 200→403                                                   |
| Remove add successor-owner entry guard                             | `second successor owner add`    | Protected row-read tripwire; 404→500                                           |
| Remove update successor-owner entry guard                          | `second successor owner update` | Protected row-read tripwire; 404→500                                           |
| Omit `from` from update endpoint evidence                          | `update rechecks old`           | Graph required-project unreadable throw; 404→500                               |
| Omit removed dependency from endpoint evidence                     | `remove rechecks old`           | Graph required-project unreadable throw; 404→500                               |
| Replace writer-time access resolution with captured request access | `lookup then queued`            | Revoked credential admitted 200; membership changed `not_a_member`→`forbidden` |
| Replace scoped project lookup with unqualified lookup              | `foreign-project`               | Graph required-project unreadable throw; 404→500                               |
| Remove exact endpoint row-project equality                         | `foreign-row`                   | Endpoint row absent from complete tree throw; 404→500                          |
| Remove endpoint step-ID equality                                   | `foreign-step`, `absent-step`   | Actual graph missing-step throw; 404→500                                       |
| Remove absent-project modeled refusal                              | `absent-project`                | Endpoint project null dereference; 404→500                                     |
| Remove absent-row modeled refusal                                  | `absent-row`                    | Endpoint row null dereference; 404→500                                         |

The negative logs identify endpoint/graph errors and the explicit row tripwire;
none of these proofs relies on a SQLite FK or uniqueness failure. Adjacent
`Proof:` comments in the new suite name the watched faults.

## Verification

- `bun test apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts --timeout=20000`: **13 pass, 0 fail, 200 assertions** after restoring every mutation and the final assertion edit.
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: **passed**, uncached.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: **passed**, including configured `typecheck:module`, uncached.
- Final new-file ESLint: **passed** after the assertion edit.
- `bun test apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts --timeout=20000`: **247 pass, 0 fail, 2,721 assertions**.
- Final two-file Prettier check and `git diff --check`: **passed**.

Nx reported that sandbox socket isolation was unavailable and used its
non-isolated fallback. Both configured targets completed successfully. A first
direct TypeScript run caught a union-method forwarding type error in the new test;
the final tests use separately typed update/remove forwarding spies, and the
configured typecheck above passed.

Normal commit hooks passed staged ESLint, Prettier, plaintext secrets and private
nesting checks. Tool Wiki reported its explicitly inactive, uncertified state
because no external activation root is provisioned. Migration hooks had no files
to inspect.

## Limits

This is a bounded mounted HTTP authorization packet. It does not complete all
endpoint scopes, relationship types, MCP parity, replay/history, copy/import,
activation or task 4.2. Existing bounded alias/node parity packets remain separate.
The old-endpoint negatives prove the modeled refusal occurs at endpoint evidence,
not that later graph checks are absent. No full host gate, build, full backend test
suite, full CI secrets scan, OpenSpec validation or migration lint was run for this test-only packet; the
isolated integrated candidate still requires the repository's host gate and CI.
