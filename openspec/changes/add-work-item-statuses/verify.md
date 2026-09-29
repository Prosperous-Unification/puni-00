# verify — add-work-item-statuses

## Slice 0 — spec

### Constraints

- The REMOVED requirements in `specs/wbs-domain/spec.md` name headings that exist only in the
  unarchived changes `work-item-status-and-facts` and `status-from-the-menu`. Archive those two
  before this change, or its archive cannot find the requirements it removes.

Written on `batch-9/integration-25` (`ffbe37be`) while main was `262d006c`; retargeted to main at `f0feb5dd` (round 25, the same tree).

## Slice 1 — vocabulary and folds

Red before implementation: the five new or extended test files ran 0 pass, 5 fail, 5 errors
(`Cannot find module './blocked-by-proxy'`, `'./without-held-subtrees'`, `Export named
'foldStatuses' not found`). Green after: 36 example cases and 2 properties (2,000 runs each)
pass; the whole `libs/wbs/domain/domain` suite reported 819 pass, 0 fail.

## Slice 2 — swap guard

Red: `swap.test.ts`, `lib/docker.test.ts` and `lib/reconcile.test.ts` ran 15 pass, 2 fail
(`Export named 'holdKindsCommand' not found`). Green after: 165 pass, 0 fail.

## Commands

| Slice | Command                                                                     | Result                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                    | exit 0; 140 passed, 0 failed; this change valid, no issues                                                                                                                                                                                                                             |
| 1     | `bun test` in `libs/wbs/domain/domain`, `CLAUDECODE` unset                  | 819 pass, 0 fail                                                                                                                                                                                                                                                                       |
| 1     | `bunx nx affected -t typecheck test lint`, base `batch-9/integration-25`    | exit 1: 19 projects; failed `wbs-domain:lint` (4 `restrict-template-expressions` in a property test), `tool-devsync:test` (ADR numbers must be contiguous: 0033 renumbered 0032), `wbs-store-sqlite:test` (wall-clock `working-plan-performance` median, 141 s under the parallel run) |
| 1     | `bunx nx run-many -t lint test -p wbs-domain tool-devsync` after both fixes | exit 0; `Successfully ran targets lint, test for 2 projects`                                                                                                                                                                                                                           |

## Failure proofs

Each fault was injected into the production function, the named test run, and the file restored.

| Check                                      | Fault injected                                                | Test that observed it                                                                          | Observed                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| proxy spreads through proxies              | `queue.push(successorId)` commented out in `blockedByProxyOf` | `marks C behind a held A through B`, two more examples, the least-fixed-point property         | 6 pass, 4 fail; counterexample `l0 blocked → l2 draft → l5 ready`                                           |
| a fully held parent leaves the input       | `heldLeafIds.has(id)` in place of the every-leaf test         | `removes a parent whose every leaf is held, with its edges, floor and deadline`                | 6 pass, 1 fail; rows `Received + 1` (`p` kept)                                                              |
| proxy counts as stopped in the parent fold | `blocked_by_proxy` removed from `STOPPED_STATUSES`            | partition property; `is blocked by proxy when every child is stopped but not all the same way` | 19 pass, 2 fail; counterexample `["blocked_by_proxy"]`, `Expected: "blocked_by_proxy"`, `Received: "ready"` |
| a held id must be a leaf of the plan       | the `withoutHeldSubtrees` leaf check disabled                 | `refuses a held id that is not a leaf of this plan`                                            | `Received function did not throw`                                                                           |
| every leaf has a status                    | `continue` in place of the missing-status throw               | `refuses a leaf with no status`                                                                | `Received function did not throw`                                                                           |
| readiness guard                            | `isReadiness` reduced to `typeof value === 'string'`          | `admit exactly their own closed sets`                                                          | 19 pass, 1 fail; `Expected: false, Received: true`                                                          |
| hold guard                                 | `isHold` reduced to `typeof value === 'string'`               | `admit exactly their own closed sets`                                                          | 19 pass, 1 fail; `Expected: false, Received: true`                                                          |
| no status is given for a parent            | the non-leaf status check disabled                            | `refuses a status for anything but a leaf`                                                     | 9 pass, 1 fail; `Received function did not throw`                                                           |

### Slice 2 proofs

| Check                                                         | Fault injected                                            | Test that observed it                                                                      | Observed                    |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| the swap compares stored holds                                | `HOLD_KINDS_VOCABULARY` left out of `STORED_VOCABULARIES` | `refuses an image that reads no holds while holds are stored, and stops green`, three more | 62 pass, 4 fail             |
| only an absent hold CLI under a readable `src` means no holds | the directory check replaced by an unconditional `[]`     | `does not treat a missing source directory as an older release` (hold kind commands)       | `Expected: 74, Received: 0` |

## Slice 3 — storage and command

Migration stamp rechecked 2026-09-29: newest on main is `20260928030000`; the orgs stack adds
`20260928040000` (#191); this change takes `20260928200000`. Every migration-enumerating db test
in `store-sqlite` was extended with it (merging the orgs stack will need both names).

| Check                                        | Fault injected                                  | Test that observed it                                                             | Observed                               |
| -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| rollback refuses stored holds                | three guard statements removed from `down.sql`  | `refuses rollback over a hold and keeps the hold and the migration record`        | `Received function did not throw`      |
| a patch naming only readiness or hold writes | the two no-field guard lines removed            | `writes a readiness and a hold and reads them back…`                              | `[readiness, hold]` read back as nulls |
| hold save version                            | version check disabled                          | `refuses a malformed save`                                                        | `Received function did not throw`      |
| hold remove matches the table                | row comparison reduced to lengths               | `refuses to remove a save that no longer matches the table`                       | `Received function did not throw`      |
| hold restore only on leaves                  | leaf check disabled                             | `refuses the whole restore when a saved work item is gone or has become a parent` | `Received function did not throw`      |
| rollback CLI usage                           | usage guard bypassed                            | `saves, removes and restores holds through the rollback CLI`                      | `Expected: not 0` for `erase`          |
| no statement on a parent                     | parent check in `workItemStatusesOf` removed    | `refuses a readiness or hold stored on a parent`                                  | `Received function did not throw`      |
| `no_steps`                                   | refusal removed                                 | `refuses in progress and done with no_steps`                                      | 12 pass, 1 fail                        |
| `readiness_after_progress`                   | refusal removed                                 | `refuses readiness once a step has spoken, and writes nothing`                    | 12 pass, 1 fail                        |
| `cannot_hold_done`                           | refusal removed                                 | `refuses a hold on a leaf reading done`                                           | 12 pass, 1 fail                        |
| hold inverse                                 | `inverse.hold` line removed                     | `holds every leaf beneath a parent, and one undo restores each prior hold`        | 12 pass, 1 fail                        |
| settable vocabulary                          | `isSettableStatus` admitting `blocked_by_proxy` | `admits the seven statuses a row may be set to…`                                  | `Expected: false, Received: true`      |
| route guard                                  | `parseStatus` replaced by a cast                | be-01 `refuses a status nobody may set…`                                          | `invalid_body` without `at` and `kind` |
| hand-down                                    | parent patch skipped on create                  | `hands a leaf’s readiness and hold down to its first child…`                      | `parent … holds a readiness or a hold` |
| move under a leaf                            | parent patch skipped on move                    | `clears the readiness and hold of a leaf another row moves under…`                | `parent … holds a readiness or a hold` |
| last-child fold                              | parent patch skipped on delete                  | `gives a parent losing its last child the readiness and hold…`                    | `readiness: null` where `draft` owed   |
| copy never holds                             | `hold: null` removed from the copy              | `copies a readiness and never a hold`                                             | `hold: "on_hold"`                      |

## Astra review (2026-09-28)

No Critical. Important 1 (spec must require the least fixed point; the unknown scenario must
exclude every stopping predecessor): fixed in the spec with a typed-cycle scenario. Important 2
(which holds `in_progress` on a parent clears): left open for slice 3 in `design.md`; it is a
future contract, easily reversed, and raised for the Fable review. Minor 3 (typed cycle,
descendant-step endpoint, inherited floor and deadline, all-held plan): tests added. Minor 4
(vocabulary guard proofs): recorded above.

## Astra review of slices 2–3 (2026-09-29)

One Critical and six Important findings.

Fixed, each with a test watched failing when the fix is removed:

- **Important 2.** A last-child delete's hand-up parent is now among the undo preconditions. Removing it failed `guards the parent a last-child delete hands statements up to`: the parent's id was absent from the preconditions.
- **Important 5.** A parent's "already in progress" check reads the full status. Using the progress-only fold instead failed `starts a held branch whose progress fold reads in progress…`, and nothing was written.
- **Important 6.** Moving a last child away hands the agreed statements up. Skipping that failed `gives the parent a moved last child leaves the statements it agreed on`, with `readiness: null`.
- **Important 7.** Holding a branch takes the hold off its done leaves. Skipping done leaves failed `takes the hold off a done leaf when its branch is held`, with `hold: "on_hold"`.

The three open findings were decided by Fable on 2026-09-29; see `design.md`, "Decided after the slice 3 review".

### Fable review fixes (2026-09-29)

Each fault was injected into the production code, the named test run, and the file restored.

| Check                                              | Fault injected                                  | Test that observed it                                                                         | Observed                                                                         |
| -------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apply` refuses a statement on a row with children | check disabled                                  | `refuses an undo that would put a hold back on a row that has since gained a child`           | refused by the store's condition instead (`gained children as this was written`) |
| the store writes a statement only on a leaf        | `NOT EXISTS (child)` condition dropped          | `refuses a readiness or hold on a row that has children, in the write itself`                 | `ok: true` with the parent holding `hold: "on_hold"`                             |
| a move's inverse moves back first                  | statement inverses ordered before the move-back | `clears the readiness and hold of a leaf another row moves under, and one undo restores them` | `Expected: true, Received: false`: the undo was refused                          |

### Hand-down ordering (Fable review of #207, I1)

The new parent's statements are cleared before the child is inserted or the row moves in. A plan read injected right after the store's write proves it: with the clear moved back after the write, `no read sees a parent holding a statement while a first child is created` and `… while a row moves under a leaf` each failed on the injected read (`parent … holds a readiness or a hold`).

### Move undo ordering (Fable review, round 4)

Undoing a move orders its writes as: clear the parent the row left, move the row back, then restore the statements of the row it had moved under. Each patch therefore lands on a leaf. With the parent's clear after the move-back, `no read sees a parent holding a statement while a move that emptied it is undone` failed on the read injected after the store's move (`parent … holds a readiness or a hold`).

### Readiness swap guard (follow-up to #207)

| Check                              | Fault injected                              | Test that observed it                                                             | Observed                          |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| the swap compares stored readiness | `READINESS_VOCABULARY` left out of the list | `refuses an image that reads no readiness while readiness is stored`              | 1 pass, 1 fail                    |
| save version                       | version check disabled                      | `refuses a malformed save`                                                        | `Received function did not throw` |
| remove matches both columns        | comparison reduced to lengths               | `refuses to remove a save that no longer matches the table`                       | `Received function did not throw` |
| restore only on leaves             | leaf check disabled                         | `refuses the whole restore when a saved work item is gone or has become a parent` | `Received function did not throw` |
| CLI usage                          | guard bypassed                              | `saves, removes and restores readiness and holds through the rollback CLI`        | `Expected: not 0`                 |

## Slice 4 — engine reduction

| Check                                  | Fault injected                                  | Test that observed it                                                                | Observed                                                              |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| held work leaves the schedule input    | `withoutHeldSubtrees` handed an empty held set  | `lets a successor start at day zero, and reports the held row with no schedule`      | the held row came back scheduled over days 0 to 5                     |
| a held row reports no schedule         | placeholder kept in the projection              | same case                                                                            | a zero-length schedule where `null` was owed                          |
| the Gantt draws nothing for a held row | null-schedule return removed from `layOutGantt` | `draws no bracket for a parent with no schedule, and no arrow to or from a held row` | `TypeError: Cannot read properties of null (reading 'earliestStart')` |

## Slice 5 — saved plans (plan document v6 pending #183)

| Check                             | Fault injected                                   | Test that observed it                                                                   | Observed                                          |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| v3 bodies upgrade                 | `withNoStatusFacts` returning the body unchanged | `reads a version-3 body with nothing said about readiness or holds, and compares clean` | `schemaVersion: 3` and missing `readiness`/`hold` |
| a saved plan leaves out held work | the reduction handed an empty held set           | `schedules a saved plan without its on-hold work, and captures readiness and hold`      | `Expected: 0, Received: 3`                        |

### Slice 4 review fixes (Fable, 2026-09-29)

| Check                                    | Fault injected                            | Test that observed it                                                           | Observed                             |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| arrange by schedule skips held rows (C1) | full `rows` passed to `arrangeBySchedule` | `arranges a plan holding an on-hold leaf, and leaves the held row where it was` | `no scheduled start for work item …` |
| a held assignee frees its person (M2)    | reduction bypassed                        | `frees a held assignee for the rest of their queue`                             | the held row still scheduled         |

Held rows keep their stored position when the plan is arranged; an arranged sibling may take
the same position number, and ADR 0016's id tie-break orders the two.

### Slice 5b — plan document v6

| Check                                   | Fault injected                    | Test that observed it                                                                 | Observed                                                        |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| hold vocabulary                         | an unknown hold read as `on_hold` | `refuses a version-6 hold or readiness outside its vocabulary or on a parent…`        | `ok: true` where `invalid_body` at `workItems[1].hold` was owed |
| no statement on a parent                | parent check disabled             | same case                                                                             | `ok: true` where `workItems[0].hold` was owed                   |
| the import writes the file's statements | both written as null              | `round-trips a version-6 readiness and hold, and reads a version-5 file with neither` | the imported row held neither                                   |

### Plan document v6 review fixes (Fable review of #225)

The import no longer refuses a hold on done work: `setProgress` keeps a hold, so a leaf held and then marked done exported `hold: "on_hold"` and its own file was refused. With the refusal restored, `re-imports its own export of a leaf held and then marked done` failed on `Expected: true, Received: false` (the re-classification refused the export). `setProgress` is unchanged.

### Slice 6 — fe-01 table and row menu

Each fault was injected into production code, the named test run, and the file restored.

| Check                                            | Fault injected                          | Test that observed it                                                               | Observed                                               |
| ------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| a row is not offered the status it reads         | `status !== row.status` filter removed  | `offers no hold on done work, and In progress to reopen it`                         | `done` offered on a done row                           |
| a hold that changes nothing is not offered       | leaf hold comparison replaced by `true` | `offers a parent a hold while any unfinished leaf beneath does not already hold it` | `expected [ 'on_hold', … ] to not include 'on_hold'`   |
| Done and In progress ask before writing          | `chooseStatus` prompt branch removed    | `choosing Done opens the completion prompt…`, `asks for Started on alone…`          | no dialog `Set 010 to Done` / `Set 020 to In progress` |
| the three `setStatus` refusals are worded        | the three sentences struck              | `says why be-01 refused a status with <code>` ×3                                    | the fallback toast instead                             |
| each predecessor bordered in its status colour   | done-only strip                         | `borders each predecessor in its own status colour`                                 | `3px solid transparent`                                |
| an unknown status word never draws a blank glyph | contract `status` widened to `string`   | `rejects a status word it does not know…` (`wbs-api.test.ts`)                       | `promise resolved … instead of rejecting`              |
| the hold strip is painted in a browser           | the `on_hold` strip selector struck     | `holds a row from its menu, paints the hold on its strip…` (Chromium)               | only the row separator in `box-shadow`                 |

A rejected read renders the page's failed-read state with Retry and no Status cell
(`shows a plan read refused for a status word it does not know as a failed read`).
`e2e/status.spec.ts` ran locally with `E2E_PORT_SHIFT=2000`: 3 passed.

## Not run

- The h2puni host gate; the orchestrator runs it on the integration branch.
