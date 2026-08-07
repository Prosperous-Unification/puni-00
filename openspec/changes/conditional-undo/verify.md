# Verification

## The gate, uncached

```
$ bunx nx format:write --all
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)          383 pass  0 fail   (328 before, +55 new)
      fe-01 (vitest)            444 pass  0 fail   (433 before, +11 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 34, "passed": 34, "failed": 0}
```

The 55 new be-01 tests are `service/undo.test.ts` (45) and
`controller/undo.controller.test.ts` (10). The 11 new fe-01 tests are eight in
`wbs-table.test.tsx` and three in `keyboard-cheat-sheet.test.tsx`.

## The checks, and the faults that broke them

Every row was watched failing on 2026-08-07 with the fault in place and passing
again with it removed.

| Check                                                             | Fault injected                                                                                    | What the run reported                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The precondition check (`work-item.service.ts`, `walkStack`)      | `const moved = null` in place of `await this.staleness(…)`                                        | **11 failed**: all nine `stale_undo` service cases, `refuses a redo whose row somebody else has changed`, and the controller's `answers 409 stale_undo naming what moved`                         |
| Preconditions are the **post**-command revisions (`record`)       | `expected` set to `revisionsIn(recording.before, …)` — the revisions the mutation found, not left | **26 failed** across the two batteries: every restore case, every redo case, both controller success bodies. An undo immediately after its own command reads as stale                             |
| A forward command clears the redo branch (`command-journal.ts`)   | the `delete … where undone = 1` dropped from `append`                                             | `loses the redo branch the moment the account edits forward again` failed; the other 44 still passed, so nothing else in the file could see it                                                    |
| A restore refuses an id that is in use (`applyRestore`)           | the collision check replaced by `undefined`                                                       | `refuses to undo a delete when the branch has been recreated at its ids` failed — and failed **loudly**, with `SQLiteError: UNIQUE constraint failed` out of the transaction instead of a refusal |
| A restore writes the **original** ids (`applyRestore`)            | the root given `this.newId()` instead of the id it had                                            | **4 failed**: the three whole-branch restores, three of them on `SQLiteError: FOREIGN KEY constraint failed`, plus `puts an outside dependency back with the branch`                              |
| The stack is carried past its own undo (`rebase`)                 | the `rebase` call deleted                                                                         | `walks back through an account's own consecutive edits to one row` failed on the second press, and `puts an assignee back, and takes an added one away` on its second undo                        |
| …and only where nobody wrote in between (`rebase`)                | the `their.expected[id] !== startedFrom[id]` condition dropped, re-stamping every neighbour       | `stops at the point somebody else wrote, rather than reaching past it` failed — the undo reached past a stranger's rename and put this account's older name back                                  |
| The chord is never handled in a text box (`keyboard-bindings.ts`) | the `isTypingInto(target)` guard removed from `undoChord`                                         | `leaves ctrl-z alone inside a name cell, where the browser owns it` failed                                                                                                                        |
| The buttons follow be-01's answer (`wbs-table.tsx`)               | `disabled={busy}` in place of `disabled={busy \|\| !stack.undoable}` on both                      | `greys the buttons out until be-01 says there is something in that half` failed                                                                                                                   |

**Two rows were watched failing for real rather than by injection.**

The migration lists: with `20260807180000_add_command_journal` on disk and the
arrays in `migrate.test.ts` and `migrate-down.test.ts` unchanged, six tests
across the two files failed — `readMigrationFolders` returned one folder more
than the expected list, and `rollbackTo(…, REVISIONS)` reversed the new
migration rather than answering `[]`.

The cheat sheet's cross-check: the two registry entries added with nothing
mapped to them failed with
`Anywhere: Ctrl/⌘ + Z names no behaviour test` and the same for the redo chord.
That is the mechanism `keyboard-cheat-sheet` built doing its job on the first
new bindings since it shipped.

**Row two is the one to read.** Every other row in this table would have passed
with the preconditions recorded from before the mutation instead of after —
because for a single command in isolation the two differ by exactly one, and
half the assertions here never look at a second command on the same row. Only
the tests that undo immediately after their own write tell the two apart, and
there are 26 of them.

**Row seven is the second one to read.** `rebase` is the difference between a
feature and a demo, and it is also the easiest place to be quietly wrong: the
unconditional version passes every test in this file except one. That one — a
stranger's edit sitting between two of this account's own — is the exact failure
both reviewers described, arriving through the machinery built to prevent it.

## The guards a revision cannot give, and why they exist

Two refusals in this change are **not** revision comparisons, and both have a
test that would pass if they were.

`refuses to undo a create once a second child sits under it, which no revision
would say` asserts, before it undoes anything, that the parent's revision has
**not** moved. Adding a second child writes a row of its own and touches nothing
on the parent — the first child moves it, through the estimate handoff, but the
second does not. `expectedSubtree` is the only thing that can catch it, and the
assertion in the middle of that test is what proves the case is real rather than
being caught by the precondition check next door.

`refuses a move whose old neighbour has been deleted, rather than throwing` is
the other. Every revision the entry recorded still holds — nothing about the
moved row changed — and `placeAfter` throws on a sibling that is not in the
group. Without the membership check this is a 500 for an ordinary state of a
shared plan.

## What is asserted against SQLite, and why it had to be

**Every undo test in this change runs against a real database.** The in-memory
stores in `src/testing/` model no revisions at all, deliberately — the bump is
arithmetic inside the statement that makes the change, and a Map has no
statements. A staleness assertion against them would compare 0 to 0 forever and
pass with the entire precondition check deleted, which is the exact shape of
failure R5 exists to stop. `revision.test.ts` made the same call; this file
inherits it, and it is why `controller/undo.controller.test.ts` builds its own
SQLite-backed `buildApp` rather than reusing the harness beside it.

`inMemoryCommandJournal` exists, and states its own limit on the symbol: it
keeps every rule its callers depend on — the per-pair `seq`, the redo branch
cleared on append, the depth prune, the order each half is read in — and it
cannot keep the one that matters most, that `seq` is chosen by the database
inside the insert. It reads the maximum and adds one, which is precisely the
implementation the real store refuses to have.

## What is not verified here

**No race is observed, and none can be.** `bun:sqlite` is synchronous and
in-process, so two requests cannot interleave inside one test. The check-then-
apply window in `walkStack` is reasoned about in `design.md` D4 rather than
demonstrated, and the `seq` subquery's atomicity is a property of the statement
rather than something any test here watches two writers exercise. Stating this
is the point — a failure mode that has never been observed is a claim.

**The journal-write failure path is not exercised.** `design.md` D1 says a
mutation that applies but cannot be journalled reports failure. There is no test
that makes `append` throw, because doing it honestly needs a store that fails on
demand and the assertion would be about the fixture rather than about be-01. It
is stated as a decision, not claimed as a tested one.

**Two tabs of one account are not tested.** They share a stack by design and the
consequence is documented; nothing here drives two clients.

**Not deployed.** No dev deploy, so the migration has run only against the
temporary files these tests create. It is additive with a `down.sql` and
`migrate-down.test.ts` covers the rollback ordering, but a blue/green swap
applying it has not been run.

**The pre-existing type-error baselines are unchanged**: `apps/be-01/tsconfig.spec.json`
and `apps/fe-01/tsconfig.spec.json` are still outside the gate, as
`teams-and-assignees/verify.md` recorded. The new test files were therefore not
type-checked by the gate; they were run.

## Decisions worth having in writing

Most of them are in `design.md`. Three are worth repeating where the results
are:

**A no-op write breaks the chain below it.** Setting an estimate to the trio it
already held bumps the revision — `work-item-revisions` made satellite bumps
unconditional, on purpose — so it invalidates every entry beneath it for that
row. `records nothing for a clear that had nothing to clear` asserts the
narrower half of this: the no-op is not itself journalled. The wider half is a
consequence of a rule this change did not make and would not change: the
conservative direction, and the alternative is the read-then-write the counter
exists to avoid.

**A restored row comes back at 0.** An older entry expecting one of those rows
at 4 now refuses. That is deliberate and it is the safe direction; `design.md`
D5 has the alternative and why it lost.

**The far ends of the edges that left a branch are not preconditions.** If they
were, "somebody renamed a neighbour" would refuse to restore a whole branch —
and the partial-restore path would be unreachable, which is a check that cannot
fail. `restores the branch without an edge whose other end has gone, and says
so` is that path, and it exists because the far end was left out.
