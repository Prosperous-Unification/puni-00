# Task 9.2 persisted remote predecessor scope editing

Bounded frontend slice based on `0d6f52c84`, isolated worktree `/tmp/puni-remote-predecessor`, branch `remote-predecessor-editor`. No backend, contract, capability or activation changes. Parent task 9.2 remains open.

## Behavior

Successor-owned captured relationships offer an explicit **Edit predecessor scope** action on desktop and phone. Opening it performs a bounded address-candidate observation bound to the captured stable predecessor project. Existing inspection and fixed-predecessor type/successor editing perform no new lookup. The relationship/type/successor draft stays mounted when predecessor editing begins.

Only complete observations for that stable work-item ID supply Whole, node and descendant-step choices. Initial selection matches the complete persisted project/work-item/scope/step coordinate. Missing exact scope stays visibly unavailable with Save disabled; a same-code step with another UUID never silently replaces it. Users may explicitly choose a current scope. Partial pages require **More scopes** before Save; refused/failed/stale/cancelled/empty observations show an unavailable state with deliberate retry. The existing lookup owns project/revision/cancellation fencing. Foreign-owned links remain read-only through existing caller ownership predicates.

Save uses the existing update command and unchanged relationship ID, with explicit remote project, row and selected step identity. Local successor serialization retains its existing contract. Pending Save disables the predecessor selector; the existing retirement fence protects reopened gestures. API spies prove outgoing payloads, not accepted backend persistence.

## Test-first and watched negatives

The initial [red run](evidence/predecessor-scope/remote-predecessor-red.log.txt) had two mounted failures because **Edit predecessor scope** did not exist. The [focused green run](evidence/predecessor-scope/remote-predecessor-green.log.txt) passed all fourteen new desktop/phone cases: six exact scope payloads, six incomplete/wrong-row/refusal cases, and two retained-draft/pending cases. Existing native Vite configuration warnings remain visible.

Nine independent production mutations were run serially, each source restored in a `finally` block; each exited 1 with actual failing assertions, not failed collection. Commands are retained in [mutations.json](evidence/predecessor-scope/mutations.json), with adjacent named logs.

| Fault                                                                  | Observed failure                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Bypass complete-page requirement                                       | Both paged cases enable Save before More scopes.                            |
| Remove stable work-item filter                                         | Both wrong-row cases expose another row’s Whole option.                     |
| Remove unavailable-source Save disabling                               | All six scope payload cases enable Save before explicit fresh selection.    |
| Enable pending predecessor selector                                    | Both pending-control cases leave the selector editable.                     |
| Prefer first observed choice over exact captured coordinate            | All six scope cases silently initialize to Whole and enable Save.           |
| Force persisted predecessor serialization on desktop                   | All three selected-scope payload assertions receive the old endpoint.       |
| Enable the scope-opening action while a fixed-endpoint Save is pending | Both existing mounted pending captured-edit cases expose an enabled action. |
| Start scope lookup eagerly                                             | Delayed mounted no-search assertion fails before explicit scope editing.    |
| Force persisted predecessor serialization on phone                     | Same three payload failures on phone.                                       |

Adjacent `Proof:` comments name those observed faults. Initial exploratory fixture/runner attempts included failed collection and mismatching step evidence; those attempts are excluded from the proof receipts. Identical endpoint coordinates are deduplicated by the existing lookup and are not treated as ambiguity. This slice uses exact stable coordinates and offers no new code-based automatic matching.

## Verification and limits

Configured frontend tests, lint, typecheck and repository formatting were requested; final receipts are appended below. No host gate, frontend build, browser/e2e, backend/database acceptance, deployment, push, merge or external authoring activation is claimed. Independent review and the integrated host gate remain parent responsibilities.

## Final receipts

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test` exited **130** after 59.6 seconds in `test:unit`, without Vitest assertion output; the full `test` target did not run. The streamed rerun (`NX_TUI=false`, `--outputStyle=stream`) also exited **130**, after 66 seconds in the same prerequisite, again without a test verdict. Both remain **unverified**, with shared host memory/swap pressure reported by the coordinating agent; resource pressure is context, not a proved cause. [First attempt](evidence/predecessor-scope/remote-predecessor-full-test.log.txt), [streamed rerun](evidence/predecessor-scope/remote-predecessor-full-test-rerun.log.txt). No further broad frontend restart was made under the coordinator's serialization instruction.
- Frontend-cwd `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/remote-dependency-editor.test.tsx src/components/wbs/scoped-dependency-editor.test.tsx src/components/wbs/typed-dependency-editor.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: **4 suites / 123 tests passed**, 37 seconds; [receipt](evidence/predecessor-scope/remote-predecessor-focused-final.log.txt). This includes all 96 persisted-remote cases and all existing fixed-endpoint/foreign-owner/409/reopen/keyboard cases in that suite.
- Configured `wbs-fe-01:lint`: exit **0**, 4m11s; [receipt](evidence/predecessor-scope/remote-predecessor-final-lint.log.txt). The later changed-file lint and normal hooks check the final small candidate type-narrowing adjustment and proof comments.
- Configured `wbs-fe-01:typecheck`, including `typecheck:module`, streamed rerun: exit **0**, 61 seconds; [receipt](evidence/predecessor-scope/remote-predecessor-final-types-rerun.log.txt). An earlier run diagnosed the existing nested candidate union's inability to narrow optional step metadata; the final code names the validated lookup boundary adjacent to the narrow name projection.
- `bunx nx format:check --all`: exit **0** (silent success). New packet files and the final changed sources receive explicit Prettier checking in the normal hooks.
- `./node_modules/.bin/openspec validate --all --json`: exit **0** on the initial packet state; final validation is repeated before commit.
- Dependency installation reused the feature checkout's locked `node_modules` via a symlink. No package or lockfile changes. Existing shared Git hooks are present and the commit uses them normally.

## Later browser persistence acceptance

[The bounded real browser/HTTP/SQLite packet](verify-9-2-predecessor-scope-browser.md) adds desktop node-to-whole and phone whole-to-node accepted-save/reload evidence using the explicit test-only writer seam. Its receipts supersede this implementation packet’s browser/database verification limit only for those two cases. Production authoring activation and parent task 9.2 remain open.
