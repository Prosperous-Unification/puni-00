# Task 8.1: downloaded current facts and late rollback, slice 4

2026-10-23. Base `0d6f52c8423e71e0ec85fac79ad2f4fe91df6d7c`, isolated worktree
`/tmp/puni-import-slice4`, branch `import-slice4-proofs`. This packet changes
only the composed database tests and this evidence record. Production external
imports remain inactive. Parent task 8.1 remains open.

## Exercised boundary

The tests obtain version-11 JSON from the mounted authenticated export endpoint,
classify that downloaded artifact, then change persisted facts before passing the
unchanged classified content to the existing opt-in, same-source synthetic import
service. This exercises the production transaction, endpoint, graph, persistence
and consequence-recording implementations without activating public authoring.

Five cases require an exact original indexed declaration path, a modeled refusal,
an identical complete-table snapshot and zero push calls:

| Current fact changed after download                           | Expected refusal                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| External row deleted after removing its current dependents    | `unknown_ref`, predecessor path                                         |
| Referenced step deleted after removing its current dependents | `unknown_ref`, predecessor path                                         |
| Node predecessor gains a child                                | `invalid_typed_dependency`, `node_on_parent`, predecessor path          |
| Descendant-step predecessor loses its last child              | `invalid_typed_dependency`, `descendant_step_on_leaf`, predecessor path |
| Persisted remote graph gains a reverse edge                   | `invalid_typed_dependency`, `cycle`, relationship path                  |

The missing-row fixture reparents the remote tail under the original parent so
that deleting the referenced leaf does not independently invalidate an earlier
descendant-step declaration. FK dependents are removed before endpoint deletion;
setup errors are not accepted as import refusals. Snapshots are taken **after**
each intentional mutation and **before** import.

The cycle case exports a single incoming `incoming-node-a` declaration and no
source internal typed/legacy relationship. After download it inserts the real
`late-cycle` FS whole relationship from the remote tail to its leaf. The existing
remote node SS leaf-to-tail relationship supplies the forward path. The unique
external declaration is refused at `typedDependencies[0]`. No copied outgoing
relationship is assumed or fabricated.

## Late durable-event failure

A scoped spy wraps `DrizzleEventLogStore.recordEventIn`, calls the original
implementation, and throws only after the first real `elsewhere_changed` insert.
The assertions use the **actual Drizzle transaction argument**, because the
harness inspection connection cannot see uncommitted writes.

Before throwing the sentinel error, the test proves visible staged project,
organization binding, three rows, all steps, abbreviation allocation, one internal
typed relationship, one legacy relationship and all five external relationships.
Each persisted predecessor revision has increased by the exact number of new
relationships naming it. The abbreviation counter differs from its prior snapshot;
the newly recorded event and incremented sequencer are present on the transaction.
No push has occurred. After rejection, the complete-table snapshot equals the
pre-import snapshot and pushes remain zero. The spy is restored in `finally`.

This is a failure **before the import commits**. It proves rollback of authored
writes and transactional durable publication together. A network delivery failure
after commit has a different durability contract and is not simulated or claimed
by this test. Existing successful import/export tests continue exercising committed
publication and production's mounted inactive-import refusal.

## Independently watched R5 faults

Each temporary fault was applied alone, its selected test was observed failing,
and its production file was restored before the next fault. No production changes
remain. Adjacent `Proof:` comments name these observations.

| Injected production fault                                                                    | Observed failure                                                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| First endpoint `if (defect !== null)` changed to `if (false)` in `imported-plan.resource.ts` | Both shape tests threw from graph resolution instead of returning the required indexed modeled refusal: 0 pass, 2 fail.           |
| Complete graph `if (cycle !== null)` changed to `if (false)` in that resource                | Unique current-cycle import returned `ok: true` instead of the refusal: 0 pass, 1 fail.                                           |
| Dependency-refusal decision changed to `commit: true` in `plan-import.feature.ts`            | Missing-step refusal left staged tables changed, failing complete-table equality: 0 pass, 1 fail.                                 |
| Catch-path `ROLLBACK` changed to `COMMIT` in `sqlite-unit-of-work.ts`                        | Late event error retained imported project/rows/links and predecessor revisions, failing complete-table equality: 0 pass, 1 fail. |

Commands used `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t '<pattern>'`
with patterns `current (node-on-parent|descendant-on-leaf)`, `current cycle`,
`current missing-step` and `first durable elsewhere`, respectively. Raw local logs:
`/tmp/import-slice4-fault-{shape,graph,commit,rollback}.log`.

## Observed open diagnostic defect

This packet does **not** establish correct diagnosis with multiple imported
relationships downstream of an already corrupt remote component. Minimal red
reproduction against this packet: in the cycle fixture, remove only the two
pre-download `DELETE FROM typed_dependency WHERE project_id=?` and
`DELETE FROM dependency WHERE project_id=?` statements. Keep the single incoming
external declaration, the existing `internal-node` relationship, the mounted
download and the same post-download `late-cycle` insert. Run the test with
`-t 'current cycle'`. The expected external declaration is index 0; the observed
refusal names the unrelated downstream internal declaration at index 1.
With the original five incoming declarations retained it names internal index 5.

Observed source mechanism: `libs/wbs/domain/domain/src/slice-edges.ts`,
`findStepNodeCycle`, collects every edge among Kahn residual nodes as `onCycle`;
that residue also contains downstream blocked nodes. In
`libs/wbs/application/core/src/module/plan-import/imported-plan.resource.ts`,
`writeDependencies`, the witness scan chooses the last imported relationship ID
present in that residue before trying the external-component diagnosis fallback.
No production correction or acceptance claim for that diagnostic is included;
a separate review/corrective slice is required. Logs from fixture reduction:
`/tmp/import-slice4-second.log` (index 1) and `/tmp/import-slice4-first.log` (index 5).

## Verification

Fresh verification:

- `NX_DAEMON=false bunx nx run wbs-be-01:test --skip-nx-cache --args='src/controller/cross-project-import.controller.db.test.ts src/controller/cross-project-export.controller.db.test.ts ../../../libs/wbs/adapters/store-sqlite/src/scoped-import-dependencies.db.test.ts --timeout=30000'`: **66 pass, 0 fail, 750 assertions**, 75.74 seconds. Log: `/tmp/import-slice4-focused-corrected.log`.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`: passed, including its module prerequisite. Log: `/tmp/import-slice4-typecheck-last.log`.
- Changed-file ESLint: passed. Log: `/tmp/import-slice4-file-lint-final.log`.
- `NX_DAEMON=false bunx nx format:check --files=apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts,openspec/changes/cross-project-dependencies/verify-import-slice4.md`: passed. Final prose receives the same check through the normal commit format hook.
- `git diff --check`: passed.

The first broad lint invocation exited nonzero without diagnostics. Scoped lint
then exposed and corrected test-only receiver/Bun matcher typings and the explicit
borrowed-Drizzle inspection exception. The initial typecheck exposed those test
typings before its passing rerun. An initial regression command used one excess
`../` segment for the store suite and ran only 27 tests in two files; the corrected
three-file command above proves all 66 tests were actually collected.

- Broad configured backend lint (`NX_DAEMON=false NODE_OPTIONS=--max-old-space-size=2048 bunx nx run wbs-be-01:lint --skip-nx-cache`): **blocked by Node heap OOM**, aborted after 3m20s; this is not a code verdict or passing lint evidence. Log: `/tmp/import-slice4-lint-final.log`. Shared-host frontend/typecheck/test work overlapped; memory was reported at 29/30 GiB and swap at 19/19 GiB. The parent will schedule a serialized rerun before integration approval.
- Normal `bunx lefthook run pre-commit`: passed in 38.17s, including staged lint, format, private nesting and plaintext-secret checks. Log: `/tmp/import-slice4-hooks.log`. Migration/doc-cap hooks had no matching files. Tool Wiki explicitly reported inactive because its external activation root is not provisioned; no certification is claimed. Commit hooks are not bypassed.

The existing dependency installation is reused through a `node_modules` symlink;
this is not fresh frozen-install evidence. Nx's denied worker socket was reported
and it ran its supported in-process fallback, rather than skipping the targets.

Unverified: full host gate, full backend suite/build, frontend/browser/E2E, MCP,
old-binary compatibility, deployed behavior and public external-import activation.
These bounded checks do not complete task 8.1 or prove rollout safety.
