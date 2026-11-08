# Incident replay completion review — 2026-10-22

**APPROVE the narrow regression/proof-comment commit `5c71abd5be`, based on `4644ed62e`. Do not use this approval to close OpenSpec 4.4 or claim every replay graph/access check has an independent unsafe-success proof.**

Reviewed the full two-file diff, the semantic SQLite harness, external-create history setup, endpoint evidence reader, typedRefusal/apply/walkStack callers, the production PlanCommandRunner replay boundary, current-authority test setup, and the cross-project-dependencies spec/task 4.4. No implementation behavior changes occur in this commit. Shared feature files were not edited; independent mutations ran in `/tmp/puni-incident-completion-review-copy` created from the commit.

## Fresh verification

- Five added tests: 5 pass, 0 fail, 89 assertions.
- Entire connected-command-admission controller DB suite: 104 pass, 0 fail, 1487 assertions; `/tmp/puni-incident-completion-review-full.log`.
- ESLint on both changed files: exit 0.
- Prettier check on both changed files: exit 0.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.lib.json`: exit 0; `/tmp/puni-incident-completion-review-types.log`.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json`: exit 0; `/tmp/puni-incident-completion-review-spec-types.log`.

These are local targeted checks. No h2puni/h4claw gate, full workspace lint/typecheck/build, or OpenSpec CLI validation was run for this review. Integration still needs its own verification and required gate.

## Independently reproduced mutations

Runner: `/tmp/puni-incident-completion-review-mutations.ts`. Individual output: `/tmp/puni-incident-completion-review-mutation-<name>.log`.

| Mutation                                                                               | Fresh outcome                                                              | What it establishes                                                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typed-only`: bypass typedRefusal connected graph call                                 | Test fails: still stale_undo, but detail changes to final graph refusal    | The exact first guard is reached; this alone does not admit an unsafe cycle.                                                                       |
| `final-only`: bypass walkStack final graph call                                        | New cycle test passes                                                      | This fixture does not independently prove the final graph consumer.                                                                                |
| `both-cycles`: bypass both calls                                                       | Test fails: ok:true                                                        | Real newly formed remote cycle can be admitted if both protections are lost.                                                                       |
| `project-read`: replace scoped project lookup with findById                            | Test fails: not_found becomes required dependency project unreadable Error | Scoped endpoint lookup controls modeled refusal/ordering; downstream graph still fails closed.                                                     |
| `row-owner`: remove exact row project check                                            | Test fails: not_found becomes ok:true                                      | Actual unsafe acceptance of foreign-project endpoint delivery.                                                                                     |
| `row-identity`: remove exact row identity check                                        | Test fails: expected Error becomes ok:true                                 | Actual unsafe acceptance of wrongly identified endpoint delivery.                                                                                  |
| `writer-access`: replace replay transaction resolveAccess with captured request access | New membership test passes                                                 | Revocation before the HTTP request is caught upstream; this fixture does not prove current authority is re-resolved inside the writer transaction. |

The cycle fixture genuinely constructs A→B→X→Y→A through real graph calls while asserting A/B guarded revisions remain unchanged after X→Y is added. Its refusal therefore cannot be credited merely to revision conflict. Each semantic rejection follows a successful patch, and the unmutated test compares every non-SQLite-internal table, covering persisted journals, revisions, events and authored state. The semantic helper uses real SQLite/unit-of-work/stores and real service/context consumers, but manually composes an active-authoring WorkItemService; it is not the mounted HTTP command runner. Its rollback and authority coverage must not be described as full mounted-runner coverage.

## Proof comments and integration limits

**No newly added adjacent Proof comment needs correction before integration.** The three comments in dependency-endpoint-evidence.ts sit beside the relevant scoped read, identity guard and owner guard. Their claims precisely match fresh observations: the scoped-read mutation produces a later throw, and the two row mutations admit replay. They do not claim the scoped-read mutation admits unsafe success.

The cycle test's own Proof comment also accurately distinguishes first-check bypass from compound bypass. It is attached to the test, not to either production cycle consumer. Do not treat it as an adjacent independent proof for the final walkStack guard. The green final-only mutation does not invalidate that carefully worded comment. Existing production graph/access comments cite other tests and were not added by this commit; those older proofs are not invalidated by the new fixture's limitations, and were not re-certified here.

The mounted membership test adds no Proof comment. Its title says it checks revoked membership before opening the graph, but it directly asserts only the 403/not_a_member response and unchanged tables; it has no graph-open spy/fault. That title should not be promoted into evidence of writer-time reauthorization or observed absence of graph opening. The existing current-authority suite uses an afterResolve hook for queued revocation; equivalent external-history coverage or separately verified existing coverage is needed for 4.4's stronger claim.

Task 4.4 explicitly requires independent replay graph/access negatives and mounted unsafe-success/atomic-refusal proofs. This patch is useful incremental evidence and its wording is honest, but final-graph-only and writer-access-only mutations remain green in its new fixtures. Keep 4.4 open until the combined integration evidence meets that requirement; do not relabel detail-only failures as independent safety failures. Persist the accepted logs/script and this review beside the OpenSpec verification artifacts when integrating, rather than leaving the only evidence in ephemeral `/tmp` files.
