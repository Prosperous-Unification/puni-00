# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)   287 pass  0 fail  (was 275; 12 new)
      fe-01 (vitest)     223 pass  0 fail  (was 218;  5 new)
      libs/domain         22 pass  0 fail  (unchanged)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
22 items, 22 passed, 0 failed — clear-estimate valid
```

The 17 new tests: 2 in `repository/estimate.test.ts` (new file, real SQLite),
5 in `service/estimate.test.ts`, 5 in `controller/work-item.controller.test.ts`,
2 in `estimate-draft.test.ts` and 3 in `wbs-table.test.tsx`. The 275 baseline
was measured by stashing this change and re-running.

## The checks, and the faults that broke them

Every fault below was injected, run, and reverted; the counts are what the run
printed.

| Check                                                             | Fault injected                                                                          | What the run reported                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emptying **all three** boxes is what clears (`wbs-table.tsx`)     | Dropped `isTrioEmpty(next) &&` — the clear then fires on any emptied box                | 2 failed: `does not clear when only two of the three boxes are emptied` (`[['w1','role-dev'],…(1)]` where `[]` was expected) and, from the extra calls, `clears the stored trio when all three boxes are emptied`. Restored: 223 pass |
| The DELETE actually reaches the store (`work-item.service.ts`)    | Removed `await this.opts.estimates.remove(id, roleId)` — route, 200 and announce intact | 4 failed: the service clear, the controller's double-delete, the other-role survivor, and `drops the parent's rolled-up figure to what is left below it`. Restored: 287 pass                                                          |
| The delete is keyed on **both** halves (`repository/estimate.ts`) | Narrowed the `where` to `eq(estimate.roleId, roleId)`                                   | 1 failed: `removes one work item's role without touching the other role or the same role elsewhere` — the survivor on the other work item was gone too. Restored: 287 pass                                                            |
| Peers are told (`work-item.service.ts`)                           | Removed `await this.announceWorkItem(...)` from `clearEstimate`, store call intact      | 1 failed: `tells the project's subscribers, with the ancestors whose totals moved` — and nothing else, which is the point: the clear still worked, silently. Restored: 287 pass                                                       |
| The route exists at all (`work-item.controller.ts`)               | Deleted the whole `.delete('/work-items/:id/estimates/:roleId', …)` handler             | 5 failed — all of `clearing an estimate`, including the 404 one **after** it was fixed. See below: before the fix, only 4 failed.                                                                                                     |

The third row is the trap `directory.test.ts` already records for
`assign(…, null)`, reproduced deliberately: the repository test keeps a
survivor for **each** half of the composite key, because with one work item in
the database a delete narrowed to the role alone passes.

The fourth row is why the announce got its own test rather than being assumed
from the store call. A clear that writes correctly and says nothing leaves
every other browser showing a figure be-01 no longer holds, and no test that
only reads the tree back through the same process can see it.

## One of these tests could not fail, and the fault injection is what found it

`answers 404 for a work item that is not there` originally asserted the status
alone. It passed **with the entire DELETE route removed**: Elysia answers an
unmatched route with a 404 of its own, so the test was reading the router's
"no such route" as the handler's "no such work item" and could never tell them
apart. It was also the one new be-01 test that passed before the route was
written — 12 tests added, 11 red, which is what prompted the check.

It now reads the body as well: `{ error: 'not_found' }` can only have come
from the handler, and with the route deleted the test fails. Both runs are the
fifth row above. Renamed to `answers this route's own 404 for a work item that
is not there`, with the reason in the test.

Worth the orchestrator's attention: this is the same failure class as the
thirteen in `AGENTS.md`, but it never left this branch — it was caught by the
mandatory injection pass, not in review or on dev. The tally there counts
checks that got past the process, so it has been left at thirteen. If it is
meant to count appearances rather than escapes, this is the fourteenth and
both `AGENTS.md` and `LLM_README.md` need the number bumped; that is a
repo-wide claim, not this change's to make.

## Three decisions worth arguing with

1. **A missing work item is 404; a missing estimate is 200.** The two absences
   are different: `DELETE /work-items/:id/estimates/:roleId` addresses the
   estimate, so "it is already gone" is the outcome asked for, but a work item
   that is not there means the URL names nothing. This mirrors
   `removeDependency` exactly, which 404s through the same `contextFor` while
   being idempotent about the edge. The alternative — 200 for a vanished work
   item too — would mean a fe-01 pointed at a stale tree could clear estimates
   into the void and be told it worked.
2. **`clearEstimate` is not refused for a rolled-up work item, where
   `setEstimate` returns `rolled_up`.** A parent holds no stored estimate, so
   the call is already a no-op there, and the table's cells for it are
   read-only. Refusing it would make "clear what is not there" an error in
   exactly one place, which is the opposite of the idempotence the rest of the
   route promises. If the orchestrator would rather have symmetry with
   `setEstimate`, it is two lines — but then the fe must not send it, and the
   fe cannot know a row is rolled up at the moment the last box is emptied any
   better than be-01 can.
3. **The clear is a gesture, not a button.** Emptying the three boxes is the
   only thing that fires it. That reads as a hidden feature until somebody
   does it by accident — and by accident is exactly the case: select-all,
   Delete, Tab, three times, is how a person clears a row they are re-scoping,
   and it now means what it looks like it means. A button would be a second
   way to say the same thing, and the two would eventually disagree about what
   an empty box means. Reversible, but the veto tests around Backspace assume
   emptiness is readable from `row.estimates`, so a button would want its own.

## What is not watched here

- **The gesture in a browser.** jsdom fires `change` and `blur` on the three
  inputs and asserts what `ProjectApi` was asked for; nobody on this box has
  emptied three boxes with a keyboard. Standing browser gap.
- **Two peers, one project.** The announce is asserted against the recording
  broadcaster, not against a second socket. The live path from
  `announceWorkItem` through gw-01 to another table is unchanged by this
  change — it is the same call `setEstimate` makes — but it was not exercised.
- **Dev deploy.** Not deployed; `tasks.md` 3.2 is open. Work stops at the gate,
  per the standing prod-phase rule.

## Not changed, deliberately

The Backspace empty-row veto in `wbs-table.tsx` still reads
`Object.keys(row.estimates).length === 0` and the drafts prefix. A cleared
estimate leaves `row.estimates` without that role after the refetch, so the
veto lifts by itself; the 3 existing tests around it pass unchanged, which is
the whole of the evidence for that claim.
