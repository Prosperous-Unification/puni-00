# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
     be-01 + libs (bun:test)   432 pass  0 fail   (was 424 before this change)
     fe-01 (vitest)            612 pass  0 fail   (25 files, untouched here)

$ bunx nx run-many -t test --parallel=2 --skip-nx-cache
NX   Successfully ran target test for 21 projects

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
40 items, 40 passed, 0 failed — role-crud valid

$ git ls-files -z | xargs -0 bun run tools/tool-git-hooks/src/hooks/plaintext-secrets.ts
exit 0

$ bun run tools/tool-git-hooks/src/hooks/doc-caps.ts
exit 0
```

**Not run, deliberately:** `bun run e2e`. This change is be-01 only — no fe-01
file is touched — and the worktree has no dev stack or chromium. The migration
lint is a no-op here: this change adds no `.sql`, which is the point of doing
the cascade in the service.

**lefthook is not installed in this worktree** (`Can't find lefthook in PATH` on
every commit). Nothing was skipped by it that the gate above does not run.

## The checks, and the faults that broke them

| Check                                                                 | Fault injected                                           | What the run reported                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A duplicate role name is a refusal, not a 500 (`repository/role.ts`)  | the `isDuplicateName` branch in `add` removed            | `refuses a name the project already holds…` threw `SQLITE_CONSTRAINT_UNIQUE`; restored, 7 pass                     |
| A role write moves the project's revision (`repository/role.ts`)      | `bumpProject` removed from `add`                         | `adds a role and moves the project’s revision` failed, expected 1 and read 0; restored, 7 pass                     |
| A rename of nothing is `not_found` (`repository/role.ts`)             | the empty-`returning` branch made to report `ok`         | `reports a role that is gone rather than pretending to rename it` failed, `ok: true` for a role that never existed |
| The estimates are deleted explicitly (`repository/role.ts`)           | `tx.delete(estimate)` removed from `remove`              | all three removal cases failed on `FOREIGN KEY constraint failed` — the 500 a bare role delete answers today       |
| The bump covers what was deleted (`repository/role.ts`)               | bump set narrowed to the assignments alone               | `deletes an estimate written between the count and the confirmed removal` failed, the late work item still at 0    |
| A flip is a change, not a mention (`service/assumed-assignee.ts`)     | every work item holding the role reported as flipping    | `leaves alone a work item that keeps its answer` failed — assumed by nobody before and after, reported as moved    |
| The removal refuses before it takes anything (`service/role.service`) | the `in_use` refusal made unreachable                    | `refuses a role that is used, counting what would go` failed — the first, unconfirmed call took the estimates      |
| A role is scoped to its project (`service/role.service`)              | the `projectId` comparison dropped from `gate`           | `refuses a role that belongs to another project` failed — one project's route renamed another's role               |
| The event is recorded after the write (`service/role.service`)        | `publish` moved ahead of the write in `add` and `remove` | `records the event after the write, never before it` failed — roles read inside the publish were still `Dev, QA`   |
| A write naming a gone role is refused (`service/work-item.service`)   | the three `holdsRole` calls removed                      | the estimate PUT and the assignee PUT answered **500**, and the undo answered **500**; restored, 14 pass           |

Every row was watched failing and then watched passing again on the same file,
2026-08-08.

## The concurrency claim, and its limit

The plan asks that an estimate written between the count and the confirmed
removal is "deleted by the transaction or refused by a revision check — never
silently orphaned, never a 500". It is the first branch: `RoleRepository.remove`
chooses what it deletes and what it bumps **inside** the transaction, so nothing
is carried over from the earlier count.

`deletes an estimate written between the count and the confirmed removal`
reproduces the interleave the API actually faces — `usageOf` (request one),
somebody else's estimate, `remove` (request two) — and fails under two real
faults, above.

**What it cannot observe** is a writer landing _inside_ the transaction:
`bun:sqlite` transactions are synchronous, so there is no in-process moment
between the reads and the deletes for a second writer to occupy. A second
connection would block on the write lock rather than interleave. This is
recorded rather than claimed away: the guarantee tested is "the transaction, not
the caller's earlier count, decides", and that is what the two faults break.

## A 500 this change had to fix to keep its own spec

The stale-undo scenario failed on the first run — **with the revision bumps in
place**. Clearing an estimate leaves the role holding no row for that work item,
so the removal legitimately bumped nothing, and the undo then tried to restore
the trio against a role that was gone: `FOREIGN KEY constraint failed`, a 500,
on a key somebody pressed to be safe.

The bumps are necessary and were not sufficient. The write boundary was missing
one check: neither `setEstimate`, nor `assign`, nor the compensating writes
behind undo ever asked whether the project holds the role. That hole predates
this change — `PUT /work-items/:id/estimates/anything` has always 500'd — but
removing a role is what makes it reachable by ordinary use. All three ask
`holdsRole` now: `unknown_role`, a 404 at the API, and a refused undo that
writes nothing.

## Three tests that were passing against behaviour production does not have

`service/estimate.test.ts`, `service/broadcast.test.ts` and
`service/review-findings.test.ts` created projects with **no roles** and then
estimated against literal ids (`role-dev`). The in-memory project store does not
enforce the foreign key, so they passed; against SQLite every one of those
writes is refused. They seed the roles they name now, and
`controller/work-item.controller.test.ts` uses the ids its project was actually
created with. This is the same fixture-laxer-than-production failure the repo
has recorded before, found by adding the check the fixture was missing.

## What is not verified here

- **Nothing ran against dev or prod.** No deploy, no real database beyond the
  temporary SQLite files the tests create.
- **No UI.** fe-01 already rereads roles and the tree together on every event, so
  no fe-01 file is touched; whether a role event visibly repaints columns is the
  phases-UI change's proof, not this one's.
- **Role order.** `listByProject` has no `ORDER BY`, matching the `rolesOf` it
  sits beside, and no test asserts where a new role lands among the others.
  `role.position` arrives with the schedule change that needs one.
- **The last role may be removed**, leaving a project that holds no roles and
  therefore no estimates until one is added. Deliberate — the counts and the
  cascade confirmation are what stand between somebody and that — but nobody has
  looked at the screen it produces.
