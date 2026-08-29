# verify — `external-refs`

Not yet implemented.

## The width claim

| Figure                                            | Before  | After   | Expected    |
| ------------------------------------------------- | ------- | ------- | ----------- |
| `foldedTableMinWidth` over the default column set | pending | pending | exactly +40 |

## The marks, as shipped

Dany asked to see these rather than be told (design D3): dots were his
suggestion and the fill/hue split is this change's answer to colour alone being
unreadable. If the ring/fill distinction reads badly, the table below is the one
place to change.

| System     | Fill    | Shape  | Light   | Dark    |
| ---------- | ------- | ------ | ------- | ------- |
| Jira       | blue    | filled | pending | pending |
| Confluence | blue    | ring   | pending | pending |
| GitHub     | neutral | filled | pending | pending |
| Slack      | green   | filled | pending | pending |
| other      | muted   | ring   | pending | pending |

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| migration lint                                                                    | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                                | Fault injected                     | Test that saw it fail                                 | Watched |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------- | ------- |
| the write replaces wholesale         | replacement made additive          | `a work item holds several refs to one system`        | pending |
| the PR pattern is a path, not a host | pattern loosened to the host       | a GitHub issue URL typed as a PR                      | pending |
| the system is stored, not re-derived | the read path made to derive       | `a new rule does not re-type an existing ref`         | pending |
| undo restores the list               | undo restoring an empty list       | the `plan-history` undo case                          | pending |
| the column's width is pinned         | column widened to 48               | `the folded minimum grows by exactly the refs column` | pending |
| one mark per system, not per ref     | one mark per ref                   | `four refs to one system are one mark`                | pending |
| colour is not the only channel       | Jira and Confluence given one fill | `two marks of one hue are told apart by fill`         | pending |
| the card lists every ref             | list narrowed to visible marks     | `the card lists every ref and follows one`            | pending |
| a non-http URL is not a link         | scheme check deleted               | `a non-http URL is not a link`                        | pending |
| the marks are out of flow            | marks moved into normal flow       | the Chromium height measurement                       | pending |

## Skipped or unavailable checks

Nothing is fetched from any external system, so nothing about a ref's target is
verified — a ref to a deleted issue is a working link to a 404, by design.
