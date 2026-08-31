# verify — `work-item-types`

**Implemented and merged.** This file said "Not yet implemented" until
2026-08-30, long after the code had landed — a stale record, corrected here
rather than left to be read as the truth about the tree. The repository, the
migration, the commands, the column and `e2e/types-cell.spec.ts` are all on
`main`; the eight `Proof:` comments below are quoted from the tests that carry
them. Task 6.1 — the whole gate — was the one box genuinely still open; it was run on
2026-08-31 and is green (259 passed, 0 failed, 1 skipped), so it is ticked.

**Ordered after `unified-reference-cell-ux`.**

## The width claim

| Figure                                                       | Before | After |
| ------------------------------------------------------------ | ------ | ----- |
| `foldedTableMinWidth([], DATED)` over the default column set | 1067   | 1067  |
| `foldedTableMinWidth(['step-dev','step-qa'], DATED)`         | 1259   | 1259  |

Equal, which is the claim: `type` is in `DEFAULT_HIDDEN_COLUMNS`, so the default
table is the table it was to the pixel and a reader who wants the dimension
turns it on in `Columns`. Pinned in `table-frame.test.ts`, `hides Teams and
Services by default, shows Tags, and the folded figures do not move`, and
watched on 2026-08-30: `type` struck from `DEFAULT_HIDDEN_COLUMNS` failed on
`expected 1187 to be 1067`.

Read the figures as of 2026-08-31. They went to 1107/1299 for the hours
`external-refs` sat on `main` with its 40px column unpaid for, and came back
when `number` and the Name floor gave 20 each — a movement that is not this
change's and that this change's claim (**equal before and after**) is
independent of.

## Commands

| Command                                                                  | Result                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `bin/h2puni-gate.sh`                                                     | **not run** — exits 127 on this macOS host                        |
| `bunx openspec validate --all`                                           | 33 passed, 0 failed (2026-08-31)                                  |
| migration lint (CI's own command, whole repo)                            | exit 0 (2026-08-31)                                               |
| `nx run-many -t test lint typecheck build` over the app and lib projects | green — fe-01 1992, be-01 1248, gw-01 105, mcp-01 59 (2026-08-31) |
| `CI=1 E2E_PORT_SHIFT=2600 playwright test …` (whole gate)                | **259 passed / 0 failed / 1 skipped in 6.7m, exit 0**             |
| `… e2e/types-cell.spec.ts` (2026-08-31, after the width rebalance)       | **5 passed**                                                      |

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
