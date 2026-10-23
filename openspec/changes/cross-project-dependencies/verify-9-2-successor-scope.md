# Task 9.2 persisted local successor scope editing

Bounded frontend packet based exactly on `7ec0e703542e57e18078e8c57d50ffab3700f90c`, in isolated clone `/tmp/puni-successor-92` on `pop-os`. Parent task 9.2 remains unchecked. No primary-worktree edits, push or merge.

## Behavior

Successor-owned persisted remote relationships offer current local Whole, node and descendant-step successor choices on desktop and phone. Initial selection matches the complete persisted coordinate. The remote predecessor remains captured and fixed. Save updates the existing relationship ID using the existing command: persisted predecessor serialization and current selected local successor serialization. Foreign-owned links remain details-only, including colliding work-item IDs. No address candidate/revision is invented; no backend, lookup, runtime authority or API contract changes.

The editor keys choices by project, work item, scope and step. A node draft cannot silently become descendant-step when its row gains a child. An unavailable exact coordinate is visibly unavailable and disables Save until an explicit current choice. Inactive-authority HTTP409 retains both relationship and successor drafts. Pending Save disables repeat submission and scope changes; reopening retains a fresh gesture protected from the old completion. Existing navigation, keyboard dismissal, removal and stale-relationship behavior are retained.

The stale persisted-node fixture retains the previously read node alongside current child nodes, isolating scope selection from the separate trusted-node read-integrity check. Without that retained evidence, the existing reader correctly throws before the editor mounts. This packet does not weaken that check or claim the backend returns a node scope on a parent. The manual draft stale case uses the ordinary refreshed tree.

## Commands and outcomes

- Reused the existing locked dependency installation via a `node_modules` symlink to the feature worktree. No new install or dependency changes. Bare `openspec` was absent from PATH; the required repository CLI was available at `./node_modules/.bin/openspec`.
- OpenSpec `status` and `instructions apply --change cross-project-dependencies --json`: ready, schema `sdd-lean`; implementation constrained to this bounded task 9.2 packet.
- Test-first frontend-cwd run with `--testNamePattern='edits persisted local successor scope'`: 4 failed / 69 skipped, missing `This work item` control; [red log](evidence/successor-scope/red.log.txt). After implementation: 4 passed / 69 skipped; [initial green](evidence/successor-scope/initial-green.log.txt).
- Final frontend-cwd command: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/typed-dependency-editor.test.tsx src/components/wbs/scoped-dependency-editor.test.tsx src/components/wbs/remote-dependency-editor.test.tsx src/components/wbs/dependency-autocomplete.test.tsx src/components/wbs/depends-card.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: **6 suites, 171 tests passed**, 81.28 seconds; [log](evidence/successor-scope/final-tests.log.txt). All 82 persisted-remote cases passed, including 13 added cases. Existing Vite native-config `__dirname` warning remains visible.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: exit 0, no diagnostics.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project wbs-fe-01 --json`: exit 0; project graph available for module-boundary lint.
- Initial changed-file ESLint found import ordering and shorthand void callback style; autofix corrected those mechanical findings. Final changed-file lint and formatting receipts are recorded below.
- `./node_modules/.bin/openspec validate --all --json`: exit 0, **271/271** (253 changes, 18 specs).
- Initial root-cwd Vitest attempts failed collection or selected no tests; all passing and mutation receipts above use the configured frontend cwd. Intermediate stale fixture failures exposed the existing node-read integrity checks and were corrected by retaining endpoint evidence in that fixture.

## Watched production-path negatives

All ten runs independently restored source in a `finally` block before the next fault. Every run exited 1 with selected assertion failures, never a collection failure. Exact outputs and selection patterns are retained in [faults.json](evidence/successor-scope/faults.json) and adjacent named logs. New checks have adjacent `Proof:` comments.

| Fault                                                                    | Observed failure                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full coordinate keys replaced by step-only keys                          | Both persisted and manual node selections silently became descendant-step after hierarchy refresh; all four stale-scope cases failed.                    |
| Initial exact coordinate forced to Whole                                 | Mounted node and descendant-step initialization cases failed on both surfaces.                                                                           |
| Missing persisted local step guard bypassed                              | The production helper returned a writable coordinate rather than throwing. This is the one direct-helper negative; all other faults mount production UI. |
| Unavailable Save enabled                                                 | Four stale-scope disabled-Save assertions failed.                                                                                                        |
| Retired completion fence removed                                         | Both reopened editors disappeared after the prior pending completion.                                                                                    |
| Pending successor selector enabled                                       | Both mounted pending-selector assertions failed.                                                                                                         |
| Desktop selected successor serialization replaced by persisted successor | Both Whole/node transition payload assertions failed.                                                                                                    |
| Phone selected successor serialization replaced by persisted successor   | Both Whole/node transition payload assertions failed.                                                                                                    |
| Desktop owner predicate bypassed                                         | Foreign owner with colliding work-item ID exposed editable successor controls.                                                                           |
| Phone owner predicate bypassed                                           | Same owner leak on phone.                                                                                                                                |

## Limits

No host gate, raw full Nx gate, full frontend suite, frontend bundle build, browser/e2e, backend/database, deployed activation or accepted backend persistence check was run. Existing API spies prove exact update payloads and no Add/discovery/search/resolve calls; the HTTP409 case uses the real HTTP wrapper. The packet does not close remote predecessor scope editing, backend activation, authorization, history or parent task 9.2.

## Final static checks

After mechanical lint fixes, changed-file ESLint exited 0 with no diagnostics (`/tmp/successor-lint-final.log`); the frontend TypeScript project build exited 0 again (`/tmp/successor-typecheck-final.log`). OpenSpec validation again passed 271/271 (`/tmp/successor-openspec-final.json`). `git diff --check` against the clean working tree exited 0; this did not check the committed patch. `git diff --check 7ec0e703542e57e18078e8c57d50ffab3700f90c HEAD` exited 2 because 13 raw `.log.txt` receipts end with a blank line. Those receipts are preserved unchanged. Lefthook was installed in this isolated clone with `bunx lefthook install`; the normal commit runs its configured checks without bypass flags.
