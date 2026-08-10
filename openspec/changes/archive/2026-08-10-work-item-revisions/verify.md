# Verification

## The gate, uncached

```
$ bunx nx format:write --all
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)          328 pass  0 fail   (303 before, +25 new)
      fe-01 (vitest)            433 pass  0 fail   (20 files)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 33, "passed": 33, "failed": 0}
```

## The checks, and the faults that broke them

Every row was watched failing on 2026-08-07 with the fault in place and passing
again with it removed. `revision.test.ts` holds 25 cases; the counts below are
that file alone.

| Check                                                              | Fault injected                                                                            | What the run reported                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An edge moves both of its endpoints (`dependency.ts`)              | `bumpWorkItems(tx, [toAdd.predecessorId, toAdd.successorId])` narrowed to the successor   | `moves both endpoints and no third row` failed (predecessor 0, wanted 1) and `moves both endpoints again when the edge is removed` failed; restored, 25 pass |
| The bump is arithmetic in SQL (`estimate.ts`)                      | `set({ revision: 1 })` — a value this process worked out — in place of `revision + 1`     | `leaves the counter at 2 after two writes through two connections` failed (1, wanted 2), while every single-write assertion still passed; restored, 25 pass  |
| Opening a project is not a change (`project.ts`)                   | `bumpProject(this.db, projectId)` added to `recordOpen`                                   | `does not move the project when somebody opens it` failed (1, wanted 0); restored, 25 pass                                                                   |
| A copy starts fresh (`work-item.service.ts`)                       | `revision: source.revision` on the copies instead of `revision: 0`                        | `copies a branch at 0 and leaves the original where it was` failed (copy at 1); restored, 25 pass                                                            |
| A copy does not change the original (`work-item.service.ts`)       | a `patch` of the original's own name added to `duplicate`                                 | the same test failed on the other half (original at 2, wanted 1); restored, 25 pass                                                                          |
| A promotion moves the children, not the respacing (`work-item.ts`) | `bumpedWorkItemOnReparent(child.parentId)` replaced by the unconditional `bumpedWorkItem` | `moves the children a deletion promoted` failed — the surviving former sibling read 1; restored, 25 pass                                                     |
| Respacing moves nothing (`work-item.ts`)                           | `revision: bumpedWorkItem` added to the respacing loops in `insert` and `move`            | `leaves a respaced sibling where it was` and `leaves the siblings an insertion respaced where they were` both failed; restored, 25 pass                      |

**The migration list needed no injected fault** — it was watched failing for
real. With the new folder on disk and the lists in `migrate.test.ts` and
`migrate-down.test.ts` unchanged, six tests across the two files failed: the
rollback returned one migration more than the expected array, and
`rollbackTo(…, TEAMS)` reversed `20260807090000_add_revisions` rather than
answering `[]`. That is the check doing its job before it was updated.

**Row two is the one to read.** The single-write assertions — "an estimate moves
this work item to 1" — pass with the bump written as the literal `1`. Only a
second write through a second connection tells the two implementations apart.
A check that cannot distinguish "counted" from "set to one" is not a check on a
counter, and every other row in this table would have passed with that fault in
place.

## The concurrency claim, and its honest limit

`revision.test.ts` asserts that two `EstimateRepository` instances on two
connections to one file leave the counter at 2. **It does not observe a lost
update, and no test in this repo does.** `bun:sqlite` is synchronous and
in-process: `db.transaction` runs to completion before control returns, so two
writers cannot be interleaved here without threads, and a read-then-write
implementation run sequentially would reach 2 as well.

What the test does observe is the property that makes a lost update impossible
rather than merely unobserved: the new value is computed by SQLite from the
row as it stands, so a writer that has never read the row still leaves the
count correct. The fault that breaks it is the counter written as a number the
process chose, which is the shape every real lost-update bug takes. Stating
this rather than claiming a race was proven is the point — a check whose
failure mode has never been observed is a claim, not a gate.

## Decisions worth having in writing

**A revision covers an entity's own stored fields and its satellites, never its
derived number.** `position` is storage detail and the number a reader sees is
computed from the whole tree, so one insertion changes the number of rows
nobody wrote to. Following it would make every work item's revision move on
every structural edit anywhere in the project — a project-wide counter with a
work item's name on it, on which no precondition could ever pass. Two spec
scenarios and two tests hold the line.

**The promotion list needed a conditional bump.** `WorkItemStore.remove` is
handed one `promoted` array holding two different things: children being
reparented out of the deleted row, and their former siblings, respaced around
them and keeping the parent they had. Bumping the array bumps both.
`bumpedWorkItemOnReparent` decides in SQL —
`revision + (parent_id IS NOT :new)` — because SQLite evaluates a statement's
`SET` expressions against the row as it was, so the comparison never passes
through this process and the write stays one statement. `IS NOT` rather than
`<>`: a root's parent is NULL, `NULL <> NULL` is NULL, and adding NULL would
wipe the counter rather than leave it.

**Satellite bumps are unconditional.** Setting an estimate that was already
that estimate, or adding an edge that already existed, still moves the counter.
Making it conditional means reading what the write did, which is the read-then-
write this column exists to avoid — and the two mistakes are not symmetric: a
bump nobody needed costs a conditional write one retry, a bump that did not
happen loses an edit silently.

**A created work item is 0, and a first child is 1.** The estimate handoff — a
parent that gains its first child passes its estimates down — is a real second
write to a row that then holds figures it did not hold a statement earlier.
Reporting 0 there would mean the handoff had happened invisibly, which is the
missed bump the whole change exists to prevent. Asserted explicitly rather than
left as a surprise.

**Roles are named as a project satellite, and are not exercised.** There is no
write path for a role today beyond creating the project that owns them, so the
rule is stated on the column and in the spec and nothing tests it. Whoever adds
role editing bumps the project; that is the honest state of it.

## What the in-memory fixtures do not do

The stores in `src/testing/` model **no revisions at all**. They carry the field
through because it is on the row, and they never move it.

That is deliberate, and it is the same call `subtree-fixture.ts` already makes
about atomicity: the bump's whole content is that it is arithmetic inside the
statement that makes the change, and a Map has no statements. A fixture that
incremented a number in JavaScript would be a second implementation of the rule,
passing tests against behaviour the database does not have. Every revision
assertion in this repo therefore runs against SQLite, through the real
repositories, in `service/revision.test.ts`.

The cost is real and worth naming: a service test using the fixtures cannot
assert anything about revisions, and if one ever tries it will read 0 and
should be moved to the battery instead.

## What is not verified here

**Nothing enforces a precondition.** No route reads a revision, nothing is
refused for a stale one, and no screen shows one. That is the change's whole
non-goal — conditional undo and write preconditions are the consumers, and
until one of them exists this column is a fact nobody checks. It is therefore
also true that a bump missed on some future write path would go unnoticed until
that consumer ships; the battery is the guard, and every new mutation belongs
in it.

**Not deployed.** No dev deploy, so nothing here is observed against the real
database beyond the temporary files the tests create. The migration is additive
with a `down.sql` and the rollback path is exercised by `migrate-down.test.ts`,
but a blue/green swap applying it has not been run.

**Not race-tested.** See the limit above.

**Two pre-existing type-error baselines are unchanged**: 16 errors in
`apps/be-01/tsconfig.spec.json` and 6 in `apps/fe-01/tsconfig.spec.json`, none
of them in this change's code and none added by it. The test projects are still
outside the gate, as `teams-and-assignees/verify.md` recorded.
