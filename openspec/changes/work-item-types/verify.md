# verify — `work-item-types`

**Implemented and merged.** This file said "Not yet implemented" until
2026-08-30, long after the code had landed — a stale record, corrected here
rather than left to be read as the truth about the tree. The repository, the
migration, the commands, the column and `e2e/types-cell.spec.ts` are all on
`main`; the eight `Proof:` comments below are quoted from the tests that carry
them. Task 6.1 — the whole gate — is the one box genuinely still open, and it
stays unticked until it is run.

**Ordered after `unified-reference-cell-ux`.**

## The width claim

| Figure                                            | Before  | After   |
| ------------------------------------------------- | ------- | ------- |
| `foldedTableMinWidth` over the default column set | pending | pending |

These must be equal. A difference means the column reached the default set.

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| migration lint                                                                    | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

All seven watched on 2026-08-30 and quoted from the `Proof:` comments in
`apps/be-01/src/repository/work-item-type.test.ts`, which is where the exact
wording lives. Read that file rather than this table if the two ever disagree.

| Check                                    | Fault injected                                                          | What the test saw                            | Test                                               |
| ---------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| type names are unique                    | the unique index weakened to a plain `CREATE INDEX`                     | the list came back with two of one name      | `a type name is unique in the directory`           |
| the write replaces wholesale             | the `tx.delete(workItemWorkItemType)` removed, so the write is additive | the removed type still on the row            | `types are replaced wholesale`                     |
| an absent field is not a clear           | `patch.typeIds === undefined` removed from the no-field condition       | this case and two others red                 | the `patchWorkItem` no-field case                  |
| types do not inherit                     | an `inheritedTypes` walk added to `listByProject`                       | an unset row showing its parent's types      | `an unset type shows nothing and inherits nothing` |
| removing a type bumps its rows           | `bumpWorkItems` removed from `removeWorkItemType`                       | the rows' versions unchanged                 | the removal case                                   |
| a duplicate name is refused              | `isDuplicateWorkItemTypeName` made to answer `false`                    | the duplicate stored                         | the refusal case                                   |
| a deleted work item takes its type links | `ON DELETE CASCADE` struck from `work_item_id`                          | `SQLiteError: FOREIGN KEY constraint failed` | the cascade case                                   |

The browser row the plan asked for — a row of types measured to one line — is
covered by `apps/fe-01/e2e/types-cell.spec.ts`, which task 5 ticks. Its own
negative is recorded there.

## Skipped or unavailable checks

None recorded yet.
