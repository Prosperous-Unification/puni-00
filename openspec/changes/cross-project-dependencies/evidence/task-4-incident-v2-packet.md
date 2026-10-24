# Incident lifecycle 4.4a/b corrected source packet — 2026-10-22

Worktree `/tmp/puni-cross-incident-lifecycle`, branch `feat/cross-project-incident-lifecycle`, base `81316a58bd670ed12ce397b9a7a9fc6be4dae751`. Ten changed files remain uncommitted and isolated. SHA-256 manifest: `/tmp/puni-incident-lifecycle-v2.sha256`. Root owns review, integration, WBS, PR and OpenSpec records.

## Correction after Astra review

The `applyDelete` referenced-dependency branch now assigns `incidents.dependencyIds` to a local value, throws on missing trusted IDs, and returns its exact ID detail from that narrowed branch. There is no non-null assertion, unchecked cast or fallback. This resolves the reviewed TS18048 error. The reviewer’s mounted two-link sorted-409 probe and both parent cascade/promote undo/redo exact-identity probes were ported into the owned real SQLite controller suite. Their focused run passed 5 tests / 73 assertions, including the two existing undo-create incident checks.

## Fresh verification on corrected source

- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.lib.json`: exit 0.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json`: exit 0.
- `bunx tsc --noEmit -p libs/wbs/domain/contracts/tsconfig.spec.json`: exit 0.
- Uncached configured `wbs-be-01:typecheck`, `wbs-core:typecheck` (including module checks) and `wbs-contracts:typecheck`: exit 0 each.
- Focused real SQLite suites: connected command admission, typed dependency lifecycle and external migration: **136 pass, 0 fail, 1,630 assertions** after the correction and reviewer probes.
- Uncached `lint:fast` targets for wbs-be-01, wbs-core, wbs-contracts and wbs-store-sqlite: exit 0 each. Nx could not create its plugin-worker socket and ran plugins in-process.
- Prettier check on all ten changed files: exit 0. `git diff --check`: exit 0.

The prior independent Astra review of the v1 source ran 1,586 runtime tests and four disposable production-path mutations; see `/tmp/puni-incident-lifecycle-review.md`. This v2 run did not repeat those full core/contracts/regression suites or mutations. The only production semantic change in v2 is the compile narrowing; the added controller probes are read-only tests of the existing behavior.

## Scope limits

This packet remains bounded to 4.4a/b. Project delete has persistence-level evidence only; no API operation exists. The initial SQL project-delete refusal also has ordinary child/step FK blockers and is not an isolated external project-FK proof. The source does not implement first-child incident remapping, compound receipts/replay, task 4.4c–e, or mounted positive external authoring. Production external authoring remains dormant. No full h2puni gate, strict OpenSpec validation, CI secrets/migration lint, or activation/deploy check ran here.
