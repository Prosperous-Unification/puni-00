# Verification Report

**Change**: `plan-command-registry`
**Scope**: Tasks 1.1–1.3; Tasks 2.1–3.2 and the final change gate remain pending
**Verified at**: 2026-09-12 15:22 EEST
**Baseline**: `6a47a7220109484bae8f86fe03c35dc570fa1845`

## Current path map

| Design responsibility          | Current production path                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural command declaration | `libs/contracts/src/commands/definitions.ts` (`commandDefinitions`); `libs/contracts/src/http/plan-command-shapes.ts` composes `planCommandSchema` and `planCommandsBody`                   |
| HTTP endpoint declaration      | `libs/contracts/src/http/work-item-shapes.ts` (`applyProjectCommands`, `applyDirectoryCommands`)                                                                                            |
| Backend binder                 | `libs/core/src/http/work-item.routes.ts` (`workItemRoutes` binds both command endpoint shapes); `apps/be-01/src/app.ts` mounts those bindings through `apps/be-01/src/http/elysia/mount.ts` |
| Semantic parser                | `libs/core/src/http/work-item.routes.ts` (`parseBatch` → `parseCommand` → `parseKind`)                                                                                                      |
| Normalized command vocabulary  | `libs/core/src/service/plan-command.ts` (`PlanCommand`, `PlanCommandKind`, `PLAN_COMMAND_KINDS`)                                                                                            |
| Route-to-runner use case       | `libs/core/src/use-cases/run-command-batch.ts`                                                                                                                                              |
| Runner and dispatch            | `libs/core/src/service/plan-commands.ts` (`PlanCommandRunner.execute` owns cap/transaction/publication; `applyAll` owns refs, scope admission and the command switch)                       |
| Historical be-01 paths         | `apps/be-01/src/controller/work-item.routes.ts`, `apps/be-01/src/service/plan-command.ts` and `apps/be-01/src/service/plan-commands.ts` are compatibility re-exports from core              |

## Baseline correction

The design was written against `339708fa` with 36 kinds. Commit `521ef54f` added the already-shipped `arrangeBySchedule` command on 2026-09-11. The current independent fixture therefore pins 37 literal kinds. It compares its handwritten set with the production structural descriptor and separately checks branch cardinality, so a missing arm and a duplicate arm cannot preserve a false green.

## Task 1.2 registry ownership

`libs/contracts/src/commands/definitions.ts` now owns the 37 unchanged ArkType structural arms, descriptions and project/directory scopes. `defineCommand` binds each declared key to its schema's literal discriminator. `PlanCommandWire`, `PlanCommandKind` and the readonly `PLAN_COMMAND_KINDS` derive from that object. The HTTP shape composes the same strict standalone and batch schemas from those definitions, and refusal context imports the derived kind as a type only. Semantic normalization and runner dispatch remain untouched for later slices.

## Failure proofs

| Check                                                                                                               | Fault injected on production path                                                                  | Observed RED                                                                                                    | Restored green                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Independent current command-kind set (`libs/contracts/src/commands/definitions.test.ts`)                            | Deleted the `clearMeasure` arm from `libs/contracts/src/http/plan-command-shapes.ts`               | Set equality failed: expected contained `clearMeasure`; received omitted it                                     | Targeted run: 12 pass, 0 fail across the fixture and mounted work-item tests |
| Mounted priority absent/null and assignee default characterization (`apps/be-01/src/http/elysia/work-item.test.ts`) | Changed `parseKind(createWorkItem)` to default absent priority to `null`                           | `toHaveBeenCalledWith` failed because the first received create gained `"priority": null`                       | Targeted run: 12 pass, 0 fail                                                |
| Mounted exactly-201 semantic-before-cap precedence (`apps/be-01/src/http/elysia/work-item.test.ts`)                 | Returned the cap refusal in the bound project handler before `parsedBatch`                         | Expected `invalid_actual`; received `too_many_commands`, both at index 200/kind `setActual`                     | Targeted run: 12 pass, 0 fail                                                |
| Definition key/discriminator agreement (`definitions.test.ts`)                                                      | Renamed the production `createWorkItem` registry key to `createWorkItemWrong`                      | Expected `createWorkItemWrong`; received schema discriminator `createWorkItem`                                  | Focused contracts run: 7 pass, 0 fail                                        |
| `defineCommand` compile correlation                                                                                 | Removed `MatchingKind` from the production helper parameter                                        | Contracts spec compile failed only with TS2578 at the `setMeasure`/`clearMeasure` fixture                       | `bunx tsc --noEmit -p libs/contracts/tsconfig.spec.json`: exit 0             |
| Generated MCP input owns the independent kind oracle                                                                | Removed the production `clearMeasure` definition                                                   | Generated commands tool set equality failed with `clearMeasure` omitted                                         | Focused generated-tool run: 1 pass, 0 fail                                   |
| Generated MCP kind multiplicity                                                                                     | Replaced `clearMeasure`'s production discriminator with `createTeam`, retaining 37 structural arms | Per-kind counts failed with `clearMeasure: 0` and `createTeam: 2`                                               | Focused generator run: 2 pass, 0 fail                                        |
| `createWorkItem` descriptor prose before and after MCP conversion                                                   | Emptied only the production `createWorkItem` description                                           | Direct descriptor expected the prior prose but received `""`; generated tool expected length >10 but received 0 | Direct shape: 5 pass; focused generator: 2 pass                              |

The pre-existing mounted malformed nested-extra and semantic-invalid-value controls remain in the same test file and passed in both the targeted run and the project baseline.

## Exact Task 1.1 baseline

Command:

```sh
bunx nx run-many -t test typecheck -p contracts core be-01 mcp-01
```

Final result on the formatted tree: exit 0; Nx reported all eight `test`/`typecheck` targets successful for `contracts`, `core`, `be-01` and `mcp-01`. Four targets were cache hits; both tests and typechecks for `contracts` and `be-01` executed, with `be-01:test` on the 1m20s critical path. An earlier run labelled `contracts:test` flaky because its first attempt in the dependency-less worktree could not find `node_modules/.bin/tsc`; after `bun install --frozen-lockfile` reported 1,565 installs checked and no lockfile changes, both exact reruns passed.

The first sandboxed invocation emitted only Nx Unix-socket permission warnings and no target results, so it is not counted as evidence. The successful command was run with Unix-socket permission.

## Task 1.2 verification

| Command                                                                                                                                                                                                                                                                       | Result                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bun test libs/contracts/src/commands/definitions.test.ts libs/contracts/src/http/plan-command-shapes.test.ts`                                                                                                                                                                | 7 pass, 0 fail, 114 expectations                                                                           |
| `bun test apps/mcp-01/src/openapi-tools.test.ts --test-name-pattern 'describes every command kind'`                                                                                                                                                                           | 1 pass, 0 fail, 76 expectations                                                                            |
| `bun test libs/contracts/src/commands/definitions.test.ts apps/be-01/src/http/elysia/work-item.test.ts`                                                                                                                                                                       | 13 pass, 0 fail, 109 expectations; mounted malformed/absent/null/semantic/201-precedence controls retained |
| `bunx nx run-many -t test lint typecheck -p contracts core be-01 mcp-01`                                                                                                                                                                                                      | all 12 targets successful; 3 cache hits, `be-01:test` executed on the 1m22s critical path                  |
| `bunx nx format:check --files=libs/contracts/src/commands/definitions.ts,libs/contracts/src/commands/definitions.test.ts,libs/contracts/src/http/plan-command-shapes.ts,libs/contracts/src/http/refusal.ts,libs/contracts/src/index.ts,apps/mcp-01/src/openapi-tools.test.ts` | exit 0                                                                                                     |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`                                                                                                                                                                                                  | 75 items, 75 passed, 0 failed                                                                              |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 instructions apply --change plan-command-registry --json`                                                                                                                                                               | state `ready`; 2 of 10 tasks complete after this checkbox update                                           |

The first broad Task 1.2 gate found import/export ordering in the new fixture and barrel (11 targets green, `contracts:lint` red). ESLint's sorter corrected those two files; the complete command above was then rerun and all 12 targets passed.

## Task 1.3 verification

`plan-command-shapes.test.ts` pins the existing inline nested structural fields and now pins `createWorkItem`'s exact description at the contracts boundary. `shape-document.test.ts` sends the production `httpShapes` through `documentFromShapes` and the real `toolsFromDocument` generator, then checks the same command branch retains its discriminator, optional structural fields, nullable priority descriptor, required list and prose. The generated-document vocabulary check counts every independently enumerated kind, so equal total cardinality cannot hide a missing/duplicate pair.

| Command                                                                                                                                                                            | Result                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun test libs/contracts/src/http/plan-command-shapes.test.ts`                                                                                                                     | 5 pass, 0 fail, 75 expectations                             |
| `bun test apps/mcp-01/src/shape-document.test.ts apps/mcp-01/src/openapi-tools.test.ts --test-name-pattern 'carries production command descriptors\|describes every command kind'` | 2 pass, 0 fail, 79 expectations                             |
| `bunx nx run-many -t test lint typecheck -p contracts mcp-01`                                                                                                                      | all 6 targets successful, 0 cache hits, 10.8s critical path |

## Pending change verification

- The full h2puni gate, fe-01 gate, final tree cleanliness and push state belong to Task 3.2 and have not been claimed here.
- The optional OpenSpec telemetry flush could not reach `edge.openspec.dev`; status and apply instructions themselves completed successfully via the pinned CLI.
- The TDD skill references `writing-good-tests.md`, but that file is absent from the installed skill directory.
