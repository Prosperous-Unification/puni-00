# Verification

be-01 only. Branch `change/directory-crud`, off `75d01a8`.

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
     be-01 + libs (bun:test)   547 pass  0 fail  (51 files; 535 before this change)
     fe-01 (vitest)            854 pass  0 fail  (41 files, untouched here)

$ bunx openspec validate --all --json
50 items, 50 passed, 0 failed — directory-crud valid

$ bun run tools/tool-git-hooks/src/hooks/plaintext-secrets.ts
exit 0

$ bun run tools/tool-git-hooks/src/hooks/doc-caps.ts
exit 0
```

lefthook ran on every commit here (`plaintext-secrets`, `format`, `lint`, all
green). The migration lint skipped with "no files for inspection", which is the
point: this change adds no `.sql`. The cascades and the label-nulling live in
service transactions, as the proposal's constraint says.

**Not run, deliberately:** `bun run e2e`. No fe-01 file is touched and the
worktree has no dev stack or chromium. **Task 5.2 — deploy to dev, Dany looks —
is unchecked and is Dany's.** Nothing here has been seen running against dev.

## The checks, and the faults that broke them

Every row was watched failing with the fault in place and watched passing again
with it removed, on 2026-08-09.

| Check                                                                        | Fault injected                                                                                 | What the run reported                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A duplicate team name is a refusal, not a 500 (`repository/directory.ts`)    | the `isDuplicateTeamName` branch removed from `renameTeam`                                     | `refuses a name another team holds, naming the survivor` threw `SQLiteError: UNIQUE constraint failed: service_team.name`                                                                                 |
| A rename of nothing is `not_found` (`repository/directory.ts`)               | the empty-`returning` branch made to report `ok`                                               | `refuses a team that is not there` answered `ok` about a row nothing holds                                                                                                                                |
| A duplicate person name is a refusal, not a 500 (`repository/directory.ts`)  | the `isDuplicatePersonName` branch removed from `patchPerson`                                  | `refuses a name another person holds, naming the survivor` threw `SQLiteError: UNIQUE constraint failed: person.name`                                                                                     |
| A patch of a person who is gone is `not_found` (`repository/directory.ts`)   | the present-person guard removed from `patchPerson`                                            | `refuses a name of whitespace alone, and a person that is not there` answered `ok` for an id nothing holds                                                                                                |
| A refused patch writes **nothing** (`repository/directory.ts`)               | the team validation moved **below** the name update in the same transaction                    | `refuses the whole patch for a team that is not there, rename included` failed — `Katrin` survived a patch that answered `unknown_team`, because returning from a drizzle transaction callback commits it |
| The person removal's own transaction counts (`repository/directory.ts`)      | `removePerson`'s in-transaction count made unreachable, leaving only the caller's earlier read | `refuses a removal when an assignment lands after the count` deleted the person **and** the assignment the caller was never shown                                                                         |
| A person cascade moves what lost a row (`repository/directory.ts`)           | `bumpWorkItems` removed from `removePerson`                                                    | `removes a person on the second, explicit call, and moves what lost a row` failed on the work item's revision                                                                                             |
| A team cascade nulls every label (`repository/directory.ts`)                 | the `serviceTeamId: null` update removed from `removeTeam`                                     | `a cascade nulls every label and moves those work items' revisions` failed on the dangling id read back off the work item — there is no foreign key, so nothing else would ever have reported it          |
| The team removal's own transaction counts (`repository/directory.ts`)        | `removeTeam`'s in-transaction count made unreachable                                           | `refuses a team removal when a membership or a label lands after the count` took both with it                                                                                                             |
| A work item is numbered by **its own** tree (`service/directory-usage.ts`)   | the per-project grouping removed, every project's rows handed to `deriveNumbers` at once       | `names both projects a team is labelled in` named the second project's only work item `020` — a number no screen shows                                                                                    |
| A label names a team the directory holds (`repository/work-item.ts`)         | the `unknown_team` read removed from `patch`'s transaction                                     | `refuses a label naming a team that has been removed` failed: the work item came back carrying the dead id, silently                                                                                      |
| An assignment names a person the directory holds (`repository/directory.ts`) | the `unknown_person` read removed from `assign`'s transaction                                  | `refuses an assignment naming a person who has been removed` threw `SQLiteError: FOREIGN KEY constraint failed` — the 500                                                                                 |
| A create into teams is one act (`repository/directory.ts`)                   | the `unknown_team` read removed from `addPerson`'s transaction                                 | `refuses the whole create when a teamId names a team that has been removed` failed on a **500 whose body is not even JSON**                                                                               |
| A redo never resurrects a person (`service/work-item.service.ts`)            | `apply`'s `assign` branch made to ignore what the guarded store answered                       | `refuses a redo whose person has since been removed, and writes nothing` failed                                                                                                                           |
| An undo never puts back a dead label (`service/work-item.service.ts`)        | `apply`'s `patch` branch made to treat `unknown_team` as applied                               | `refuses an undo that would put back a label whose team has gone` failed, and the work item carried the dead id                                                                                           |
| The event follows the write (`service/directory.service.ts`)                 | `announce` moved ahead of `patchPerson`'s write                                                | `records the event after the write, never before it` failed — the directory read from inside `publish` still held `Kat`                                                                                   |
| The event follows the delete (`service/directory.service.ts`)                | `announce` moved ahead of `removePerson`'s delete                                              | the same test failed on the second publish: `["Katrin"]` where the directory should already have been empty                                                                                               |

### What the negatives could **not** be

A writer landing **inside** one of these transactions is not observable here.
`bun:sqlite` transactions are synchronous, so the interleave the API actually
faces — count, somebody else's write, confirm — is reproduced across two calls
rather than inside one, exactly as `role-crud` recorded.

The event test is likewise **not** a nested-transaction test. What post-commit
timing buys is that nothing a listener reads is uncommitted, and
`Broadcaster.publish` is the only boundary that can say so — which is why the
fake reads the directory from inside `publish` rather than asserting an order
of calls.

## Two fixture defects this change surfaced

Both were laxer than the schema they stand for, which is the failure `AGENTS.md`
names: a test passing against behaviour that does not exist.

1. `work-item.controller.test.ts`'s harness built **two** in-memory directories
   — one for `directoryController`, one for `WorkItemService`. A person created
   through `POST /api/people` was invisible to the assignment naming them. It
   was harmless only while `assign` wrote without reading, and it broke the
   moment the write began reading the person. One directory now.
2. `inMemoryDirectory` and `inMemoryWorkItems` accepted any person or team id at
   all. Both now refuse an unknown one, as production does;
   `inMemoryWorkItems` takes the directory it checks against, and says in its
   JSDoc that without one it cannot answer `unknown_team` and no test may assert
   that refusal through it.

## Behaviour deliberately changed, beyond the additions

`WorkItemStore.patch` and `DirectoryStore.assign` no longer answer a bare row
and `void`; they answer typed outcomes, and `addPerson` answers one too.
`role.service.test.ts`'s `still throws a foreign key that is not about the role`
asserted the **500** this change exists to remove, and is now
`names the person, not the phase, when it is the person who has gone` — the same
claim about `writeNamingRole` not lying about which id was wrong, against the
modeled refusal rather than the raw constraint.

## Where the tests live, against tasks.md

`tasks.md` 3.1 names `work-item.service.test.ts` for the stale-id negatives. The
service-level refusals are asserted there. **The negatives themselves are in
`repository/directory.test.ts`**, because the requirement is explicitly about
the check living inside the repository's write transaction, and only real SQLite
can show the FK 500 and the silent dangle those faults produce. The in-memory
fixtures cannot raise a foreign key.

## Not covered

- `directory_changed` has no fe-01 consumer yet. Nothing reads it; the event is
  recorded and pushed, and `directory-page` is where a client acts on it.
- No performance claim about `usageRowsIn`, which reads every work item of every
  affected project. Correct for the numbering, unmeasured at scale.
