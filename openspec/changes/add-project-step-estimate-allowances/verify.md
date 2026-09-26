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
- **Pending:** New/legacy import, export, whole-project copy, child hand-down, subtree duplicate, frozen snapshot and MCP contract round trips.
- **Pending R5 proof:** Bypass nonzero-allowance rollback refusal in the production rollback path; a mounted rollback test must fail, then restore and record output.
- **Pending R5 proof:** Remove percent validation; mounted invalid-input test must fail. Restore and add adjacent Proof: comment with observed failure.
- **Pending R5 proof:** Round before uplift or apply allowance twice to a parent; arithmetic goldens must fail. Restore and record output.
- **Pending R5 proof:** Accept stale undo or omit cache invalidation; the concurrent-edit or schedule test must fail. Restore and record output.
- **Pending R5 proof:** Drop allowance from export or let a live edit change a saved snapshot; round-trip or snapshot test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, migration lint/rollback and host gate. No application behavior has been verified at spec time.
