# Verification Report

**Change**: `plan-command-registry`
**Scope**: Task 1.1 baseline only; Tasks 1.2–3.2 and the final change gate remain pending
**Verified at**: 2026-09-12 14:46 EEST
**Baseline**: `6a47a7220109484bae8f86fe03c35dc570fa1845`

## Current path map

| Design responsibility          | Current production path                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural command declaration | `libs/contracts/src/http/plan-command-shapes.ts` (`command`, `planCommandSchema`, `planCommandsBody`)                                                                                       |
| HTTP endpoint declaration      | `libs/contracts/src/http/work-item-shapes.ts` (`applyProjectCommands`, `applyDirectoryCommands`)                                                                                            |
| Backend binder                 | `libs/core/src/http/work-item.routes.ts` (`workItemRoutes` binds both command endpoint shapes); `apps/be-01/src/app.ts` mounts those bindings through `apps/be-01/src/http/elysia/mount.ts` |
| Semantic parser                | `libs/core/src/http/work-item.routes.ts` (`parseBatch` → `parseCommand` → `parseKind`)                                                                                                      |
| Normalized command vocabulary  | `libs/core/src/service/plan-command.ts` (`PlanCommand`, `PlanCommandKind`, `PLAN_COMMAND_KINDS`)                                                                                            |
| Route-to-runner use case       | `libs/core/src/use-cases/run-command-batch.ts`                                                                                                                                              |
| Runner and dispatch            | `libs/core/src/service/plan-commands.ts` (`PlanCommandRunner.execute` owns cap/transaction/publication; `applyAll` owns refs, scope admission and the command switch)                       |
| Historical be-01 paths         | `apps/be-01/src/controller/work-item.routes.ts`, `apps/be-01/src/service/plan-command.ts` and `apps/be-01/src/service/plan-commands.ts` are compatibility re-exports from core              |

## Baseline correction

The design was written against `339708fa` with 36 kinds. Commit `521ef54f` added the already-shipped `arrangeBySchedule` command on 2026-09-11. The current independent fixture therefore pins 37 literal kinds. It compares its handwritten set with the production structural descriptor and separately checks branch cardinality, so a missing arm and a duplicate arm cannot preserve a false green.

## Failure proofs

| Check                                                                                                               | Fault injected on production path                                                    | Observed RED                                                                                | Restored green                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Independent current command-kind set (`libs/contracts/src/commands/definitions.test.ts`)                            | Deleted the `clearMeasure` arm from `libs/contracts/src/http/plan-command-shapes.ts` | Set equality failed: expected contained `clearMeasure`; received omitted it                 | Targeted run: 12 pass, 0 fail across the fixture and mounted work-item tests |
| Mounted priority absent/null and assignee default characterization (`apps/be-01/src/http/elysia/work-item.test.ts`) | Changed `parseKind(createWorkItem)` to default absent priority to `null`             | `toHaveBeenCalledWith` failed because the first received create gained `"priority": null`   | Targeted run: 12 pass, 0 fail                                                |
| Mounted exactly-201 semantic-before-cap precedence (`apps/be-01/src/http/elysia/work-item.test.ts`)                 | Returned the cap refusal in the bound project handler before `parsedBatch`           | Expected `invalid_actual`; received `too_many_commands`, both at index 200/kind `setActual` | Targeted run: 12 pass, 0 fail                                                |

The pre-existing mounted malformed nested-extra and semantic-invalid-value controls remain in the same test file and passed in both the targeted run and the project baseline.

## Exact Task 1.1 baseline

Command:

```sh
bunx nx run-many -t test typecheck -p contracts core be-01 mcp-01
```

Final result on the formatted tree: exit 0; Nx reported all eight `test`/`typecheck` targets successful for `contracts`, `core`, `be-01` and `mcp-01`. Four targets were cache hits; both tests and typechecks for `contracts` and `be-01` executed, with `be-01:test` on the 1m20s critical path. An earlier run labelled `contracts:test` flaky because its first attempt in the dependency-less worktree could not find `node_modules/.bin/tsc`; after `bun install --frozen-lockfile` reported 1,565 installs checked and no lockfile changes, both exact reruns passed.

The first sandboxed invocation emitted only Nx Unix-socket permission warnings and no target results, so it is not counted as evidence. The successful command was run with Unix-socket permission.

## Pending change verification

- `openspec validate --all --json`, lint, format, the full h2puni gate, final tree cleanliness and push state belong to Task 3.2 and have not been claimed here.
- The optional OpenSpec telemetry flush could not reach `edge.openspec.dev`; status and apply instructions themselves completed successfully via the pinned CLI.
- The TDD skill references `writing-good-tests.md`, but that file is absent from the installed skill directory.
