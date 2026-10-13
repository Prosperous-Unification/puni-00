## 0. Intent and technical shape

- [x] 0.1 Record the status boundary, assumptions and ADR 0053; resolve “step blockage” in `CONTEXT.md`.
- [x] 0.2 Check migration, plan-document and saved-plan version allocation against the exact integration head before assigning constants.

## 1. Domain reading

- [ ] 1.1 Red: add tests for direct blockage, work-item hold precedence, `done` precedence, in-progress precedence, unknown, direct causes, transitive causes, cycles, and node endpoint precision (`A.dev` is not `A.qa`).
- [ ] 1.2 Extend canonical `nodeReadingsOf` and `nodeReadingOf` with direct blockage and precise roots over all graph edges; retain waiting/skipped, stop proxy at running attempts, and keep boundary nodes internal. Reuse existing `resolveDependencyGraph` without a second extraction. Keep `StepState`, `blockedByProxyOf` and `withoutHeldSubtrees` unchanged.
- [ ] 1.3 Add schedule-neutrality tests proving the canonical input and full Fast schedule are byte-identical when blockage facts and projections are present. Watch a mutation that filters blocked nodes fail this test.
- [ ] 1.4 Add production-path negatives for missing node progress/owner data and dependencies with absent typed/legacy endpoints, duplicate graph node identities and missing edge endpoints; disable each validation in turn and observe its test fail. Add adjacent `Proof:` comments.

## 2. Persistent blockage facts

- [ ] 2.1 Red: add migration walk, SQLite constraint, repository round-trip, and rollback save/remove/restore tests. Include absent table, unreadable DB, malformed owner/step, duplicate fact and fact remaining during `down.sql`.
- [ ] 2.2 Add the additive `step_blockage` table beside the step-progress repository, with project/work-item/step constraints and indexes needed by its project reads.
- [ ] 2.3 Add guarded `down.sql` and a rollback CLI that saves, removes and restores exact blockage facts; extend swap compatibility discovery to refuse an old image if blockage facts would be lost.
- [ ] 2.4 Watch the production rollback guard fail with a fact present and the swap check fail when the blockage inventory is omitted. Add adjacent `Proof:` comments naming the injected faults.

## 3. Command journal and structural edits

- [ ] 3.1 Red: test `setStepBlocked` ownership, unknown work item/step, parent refusal, done refusal, no-op behavior, event append, retained read, and command batch atomicity.
- [ ] 3.2 Implement `setStepBlocked` through the project command registry, write coordinator and command journal. Undo/redo must conditionally restore the prior fact and refuse stale state.
- [ ] 3.3 Red: test hand-down, moving another row beneath a leaf, delete/undo, duplicate, last-child hand-up agreement, and concurrent stale undo.
- [ ] 3.4 Implement structural fact handling alongside step progress at each existing mutation seam. Watch skipped hand-down and copied blockage faults fail their targeted tests; add `Proof:` comments.

## 4. Read and transfer contracts

- [ ] 4.1 Red: test work-item responses and retained snapshots expose direct and derived step readings plus root causes while preserving the existing work-item status.
- [ ] 4.2 Red: test new plan-document and saved-plan round trips, old-version upgrades to no facts, malformed/missing/duplicate/parent-owned fact refusals, diffs, and atomic refusal.
- [ ] 4.3 Add blockage fields to domain contracts, OpenAPI shapes, core reads, plan documents, saved-plan capture and comparison. Allocate versions only after task 0.2.
- [ ] 4.4 Add import production-path negatives for each ownership/reference validator; disable each guard and watch its specific test fail. Add adjacent `Proof:` comments.

## 5. Step-scoped user interface

- [ ] 5.1 Red: test the step cell and card action for direct block/clear, direct versus proxy wording, retained progress, blocker cause, keyboard access and accessible name/description. Add a browser test on the production preview path.
- [ ] 5.2 Implement the accessible step-scoped action and reading. Keep the row Status control unchanged and do not rely on color alone.
- [ ] 5.3 Watch removal of direct/proxy distinction and cause text fail the browser assertions; record the observed output in `verify.md`.

## 6. Full verification and release evidence

- [ ] 6.1 Run focused domain, adapter, command, import, saved-plan and browser tests; run touched-project lint/typecheck, Prettier, strict OpenSpec validation and `git diff --check`.
- [ ] 6.2 Review every introduced safety check against an observed production-path negative and document fault, test and output in `verify.md`.
- [ ] 6.3 Run `bin/h2puni-gate.sh <sha>` on the exact candidate when the shared gate checkout is clean; capture exact-SHA CI and migration-lint evidence before integration. Do not mark the WBS parent complete while unrelated gate dirt remains.
