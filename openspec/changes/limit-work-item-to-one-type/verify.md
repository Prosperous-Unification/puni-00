# verify — limit-work-item-to-one-type

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No migration is part of this change.

## Implementation commands (branch `batch-9/010-4-10-one-type`, 2026-09-27)

All Bun runs under `env -u CLAUDECODE`. The host was heavily loaded, so only focused targets ran.

- `bunx nx run-many -t typecheck -p wbs-contracts,wbs-core,wbs-be-01,wbs-fe-01,wbs-mcp-01,wbs-store-sqlite,wbs-store-memory --parallel=1`: successful for 7 projects.
- `bunx nx run-many -t lint:fast` over the same 7 projects: successful.
- `bunx nx run-many -t test -p wbs-contracts,wbs-core,wbs-mcp-01 --parallel=1`: successful.
- `bun test libs/wbs/adapters/store-memory` 113 pass; `libs/wbs/adapters/store-sqlite` 764 pass; `libs/wbs/application/conformance` 35 pass.
- be-01 focused: `work-item.controller`, `undo.db`, `plan-commands.db`, `import.controller`, `capacity-body.db`, `undo.controller.db`, `src/openapi`, `src/http/elysia`: 342 pass, 0 fail.
- fe-01 focused Vitest (`reference-set-field`, `plan-read-and-write`, `plan-keyboard`, `plan-cells`, `lib/refusal`, `lib/wbs-api`): 6 files, 413 tests passed.

## Failure-proof table

| Check                        | Fault injected                                         | Test that failed                                                                                                    | Result                                          |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Command boundary limit       | `MOST_TYPES_ON_ONE_ITEM` restored to 10                | mounted `refuses two types at the parser, before any command in the batch applies`                                  | Failed: name read `Renamed`; refs `unknown_ref` |
| Transactional invariant      | Service check in `WorkItemService.patch` disabled      | mounted batch-binding refusal (200), `plan-commands.db` atomic batch (ok), `undo.db` authored two-type refusal (ok) | Failed, 3 tests                                 |
| Restoration not authored     | Undo `apply` routed through the authored `patch`       | `undo.db` `puts a type conflict back, whole, after one type is kept`                                                | Failed: `refused: stale_undo`                   |
| Conflict read                | store-sqlite read truncated with `.slice(0, 1)`        | `undo.db` `reads a stored type conflict whole through the plan read, choosing neither`                              | Failed                                          |
| Restore drops a removed type | store-sqlite type-existence filter disabled            | `undo.db` `restores a deleted row without a type the directory has since removed`                                   | Failed: FOREIGN KEY constraint                  |
| Copy carries a conflict      | store-sqlite `insertSubtree` type join insert disabled | `undo.db` `duplicates a type conflict unchanged rather than resolving it`                                           | Failed: received `[]`                           |
| Import rows                  | `multiTypeRowsRefusal` result ignored                  | `prepare-import` `refuses rows carrying several types, naming every such row`; module test for no write             | Failed: `ok: true`, both                        |
| MCP contract                 | patchWorkItem description reverted; both 400 arms gone | mcp-01 `tells a model a work item takes one type, and declares the refusal it gets otherwise`                       | Failed, each fault                              |
| Single-select cell           | choose appends `[...current, id]`                      | fe-01 `replaces the current type with the chosen one`                                                               | Failed                                          |
| Create selects alone         | create handed the current set                          | fe-01 `creates a new type and selects it alone`                                                                     | Failed                                          |
| Conflict flag                | conflict predicate forced false                        | fe-01 `flags a type conflict, shows every type, and keeps the one picked`                                           | Failed                                          |

## Decisions recorded during implementation

- Duplication and restore did not copy types at all before this change (only teams). The spec requires copies to carry types exactly, so `insertSubtree` now writes the type join rows in both stores; an undone delete now also restores its types.
- Plan documents have one version (1); the import check runs on the prepared document, so it is version-independent. No whole-project copy exists besides export/import, and import refuses conflicts, so the plan-import delta now says so rather than claiming a copy path.
- A restored subtree drops a type the directory removed after the delete (Astra review): the removal's cascade already took that type off every live row, and the alternative was a raw foreign-key 500 on undo.
- A repeated id names one type, so `[id, id]` is accepted; the command delta now says "distinct".
- The retired `typeIds_must_be_at_most_10`/`typeRefs_must_be_at_most_10` codes stay in the contract for mid-swap readers; the new code is additive in the batch 400 union, the parser union and the import refusal union.
- The Type column keeps its `Types` header and `Types for NNN` labels to avoid churn in tests and pixel baselines; its placeholder reads `change` once a type is set.

## Pending checks

- **Pending:** the h2puni host gate (run by the orchestrator on the integration branch), CI, full-project suites and pixels.
