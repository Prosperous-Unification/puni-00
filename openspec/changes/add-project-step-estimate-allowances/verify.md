# verify — add-project-step-estimate-allowances

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid. File-scoped bunx prettier --check exited 0 for all ten packet files.

## Planned commands — pending implementation

- `bun run test:unit`, focused step API/store/estimate/solver tests, and `bun run e2e` for settings and estimate presentation.
- Repository migration lint and paired migration rollback check, then `bunx @fission-ai/openspec@1.12.0 validate --all --json` and file-scoped `bunx prettier --check`.
- `bin/h2puni-gate.sh <sha>` at the committed implementation SHA on h2puni; record the printed running SHA.

## Planned checks — pending implementation

- **Pending:** Mounted step API and migration tests for default zero, two-decimal range, malformed values, overflow, additive apply and paired rollback.
- **Pending:** Fast and optimized goldens for pre-rounding allowance, parent sum without second uplift, null versus explicit zero, width conversion, cache invalidation and independent publication.
- **Pending:** Settings component, broadcast, one-command undo and stale undo after conflict or deletion.
- **Pending:** New/legacy import, export, whole-project copy, child hand-down, subtree duplicate, frozen saved-plan and MCP contract round trips.
- **Pending R5 proof:** Bypass nonzero-allowance rollback refusal in the production rollback path; a mounted rollback test must fail, then restore and record output.
- **Pending R5 proof:** Remove percent validation; mounted invalid-input test must fail. Restore and add adjacent Proof: comment with observed failure.
- **Pending R5 proof:** Round before uplift or apply allowance twice to a parent; arithmetic goldens must fail. Restore and record output.
- **Pending R5 proof:** Accept stale undo or omit cache invalidation; the concurrent-edit or schedule test must fail. Restore and record output.
- **Pending R5 proof:** Drop allowance from export or let a live edit change a saved plan; round-trip or saved-plan test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, migration lint/rollback and host gate. No application behavior has been verified at spec time.

- **Pending R5 proof:** Return pre-edit working-plan allowance to a later batch command; the mounted batch visibility test must fail. Restore and record observed output.

## Implementation results — 2026-09-27 (lane 010-4-5-allowances)

All commands were run in the lane worktree with `env -u CLAUDECODE`. Only focused suites were run, because the host is shared.

- `bun test` per project: wbs-domain 666/0 and wbs-contracts 397/0. wbs-core 651 passed, with 1 unhandled Playwright collection error from running `bun test` inside the library. wbs-store-sqlite 770 passed and 2 failed, both under host load: `saved-plan-busy` passed on rerun, and `source-conformance` Task 6.3 timed out at 5 s (known). wbs-store-memory 113/0, conformance 35/0, be-01 1118/0 after merging main, mcp-01 25/0 in `openapi-tools.test.ts`.
- solver-py: 214 OK in `.venv-solver`.
- fe-01 Vitest, file-scoped: 16 files, 763/0; then 7 files, 119/0 after the second review.
- Typecheck and lint:fast are green for wbs-domain, wbs-contracts, wbs-core, wbs-store-sqlite, wbs-store-memory, wbs-be-01, wbs-mcp-01 and wbs-fe-01. `prettier --check` passes on the touched files. Migration lint exits 0.
- `openspec validate --all --json`: 132/0.
- Not run: the full Nx gate, build, browser e2e/pixels and the h2puni host gate. Integration gating runs those.

### R5 proofs observed (fault → failing test)

- Decimal check removed → `refuses more than two decimal places` (Received 12.35).
- Round before uplift → `applies the allowance before rounding` (Expected 2, Received 3).
- Parent re-uplifted → `gives a parent the sum of its charged leaves, without a second allowance` (Expected 6, Received 8).
- Slice seam charged at 0 → `schedules charged effort, and the edit changes the canonical input` (Expected 3, Received 2).
- Journal `record` skipped → `undoes an allowance edit in one step` (the undo answered `nothing_to_undo`).
- Step-revision staleness comparison removed → `refuses an allowance undo after somebody else changed it` and `… and changed it back`.
- SQLite revision increment removed → `moves the step’s allowance revision on every write, even back to a value it held`.
- Memory-source revision commit removed → `undoes an allowance edit committed in an earlier unit of work`.
- Route add and patch refusals bypassed → the two step route tests got replies other than 422 `invalid_allowance`.
- Command normalizer bypassed → mounted `refuses an allowance over 1000%…` answered 500, not 400.
- Version-1 allowance refusal and version-2 missing-field refusal bypassed → each named classification test failed.
- Import range guard bypassed → `refuses a step allowance over 1000%…` prepared the document.
- Saved-plan capture read as 0 → `keeps the allowance it was saved with…` (Expected 30, Received 0).
- 1→2 upgrade made the identity → `reads a version-1 body’s steps at 0% allowance` (Received undefined).
- `step_updated` dropped from the optimizer trigger → the trigger tests failed.
- `down.sql` guard INSERT removed → `refuses to roll back while a step carries a nonzero allowance` (the rollback succeeded).
- `sameSteps` ignoring the allowance → `a changed allowance is a different step list`.
- fe-01: panel validation disabled → 30.001 was sent. Fake-API validation disabled → the refusal changed.
