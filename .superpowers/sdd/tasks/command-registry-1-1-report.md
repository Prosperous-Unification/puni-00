# Command registry Task 1.1 report

## Status

Task 1.1 is complete on baseline `6a47a722`. No production behavior was changed. The characterization adds one independent structural-kind fixture, strengthens two mounted controls, corrects the stale 36-kind artifact count to the current 37, and records the baseline evidence in `openspec/changes/plan-command-registry/verify.md`.

**Commit**: `eeb62de0` (`test(commands): characterize current registry baseline`)

## Current implementation map

- Structural wire union: `libs/contracts/src/http/plan-command-shapes.ts`.
- Project/directory endpoint shapes: `libs/contracts/src/http/work-item-shapes.ts`.
- Binder and semantic parser: `libs/core/src/http/work-item.routes.ts`; `workItemRoutes` binds the shapes and `parseBatch` → `parseCommand` → `parseKind` normalizes them.
- Mounted adapter: `apps/be-01/src/app.ts` → `apps/be-01/src/http/elysia/mount.ts`.
- Route-to-runner boundary: `libs/core/src/use-cases/run-command-batch.ts`.
- Normalized union/kind list: `libs/core/src/service/plan-command.ts`.
- Runner: `libs/core/src/service/plan-commands.ts`; `execute` owns admission, unit of work, journal and publication, while `applyAll` owns ordered refs/scope/dispatch.
- The three old `apps/be-01/src/{controller,service}` command paths are compatibility re-exports from core after `core-lib-extraction`.

## Characterization delivered

- `libs/contracts/src/commands/definitions.test.ts` independently enumerates all 37 current kinds and compares them to the emitted production descriptor as a set plus cardinality.
- `apps/be-01/src/http/elysia/work-item.test.ts` now pins the measured semantic distinction: absent create priority stays absent, explicit null stays null, and absent assignee is intentionally normalized to null.
- The mounted cap-precedence case now sends exactly 201 commands, with invalid semantic data at index 200, and expects that semantic refusal before the cap.
- Existing mounted malformed nested-extra and semantic-invalid controls were preserved.

## Stale-count ruling

The approved artifacts were written against `339708fa`. Commit `521ef54f` subsequently added `arrangeBySchedule`, taking the production wire vocabulary from 36 to 37. The controller ruled that Task 1.1 must characterize the current independent set, so the proposal, design and Task 1.1 text now say 37 and name that commit. Registry implementation remains for later tasks.

## Evidence

- Command-kind fault: deleting the production `clearMeasure` schema arm made the independent set comparison fail because the received set omitted `clearMeasure`.
- Null/absence fault: defaulting absent create priority to null made the mounted runner-call assertion fail with an unexpected `priority: null`.
- Precedence fault: applying the 201-command cap in the mounted handler before parsing changed the expected `invalid_actual` into `too_many_commands` at index 200.
- Restored targeted run: 12 pass, 0 fail, 71 expectations.
- Exact required baseline: `bunx nx run-many -t test typecheck -p contracts core be-01 mcp-01` exited 0 with all eight targets successful.

## Concerns

- The exact baseline needed `bun install --frozen-lockfile` because this isolated worktree initially lacked `node_modules`; the install reported no lockfile changes. Nx records `contracts:test` as flaky because its earlier missing-compiler attempt failed before the successful rerun.
- The first sandboxed Nx run executed no visible targets after socket-denial warnings and is excluded from evidence.
- Final lint, format, OpenSpec validation and the h2puni gate are intentionally pending Task 3.2.
- OpenSpec’s optional telemetry flush was network-blocked, and the installed TDD skill’s linked `writing-good-tests.md` is missing.

## Task 1.2 continuation

Task 1.2 moves the unchanged structural ArkType arms and prose into `commandDefinitions`. `defineCommand` enforces its key/discriminator pair, while `PlanCommandWire`, `PlanCommandKind` and `PLAN_COMMAND_KINDS` derive from the registry. The HTTP adapter still applies the same strict request boundary and uncapped structural batch; refusal context consumes the derived kind through a type-only import. No normalizer, binding or runner work from Tasks 1.3–2.5 was started.

Observed negatives:

- Renaming the production `createWorkItem` registry key to `createWorkItemWrong` failed the agreement test with expected `createWorkItemWrong`, received `createWorkItem`.
- Removing `MatchingKind` from `defineCommand` failed the contracts spec compile only with TS2578 at the deliberately mismatched `setMeasure`/`clearMeasure` fixture.
- Removing the production `clearMeasure` definition and executing the real generated MCP input failed its independent set oracle with `clearMeasure` omitted.

Restored evidence: the contracts definition/shape run passed 7 tests; generated MCP coverage passed its focused test; definitions plus the complete mounted work-item controls passed 13 tests; the four-project Nx test/lint/typecheck gate passed all 12 targets; focused format check exited 0; OpenSpec validation passed all 75 items. The first broad gate exposed two import/export sorting errors, which were fixed before the complete gate reran green.

## Task 1.3 continuation

Task 1.3 keeps descriptor preservation visible at both boundaries. The contracts shape test pins `createWorkItem`'s existing prose alongside its pre-existing nested structural checks. The MCP shape-document test now runs the production `httpShapes` through `documentFromShapes` and the real `toolsFromDocument` generator, then verifies the emitted `createWorkItem` branch retains its discriminator, optional fields, nullable priority, required list and exact description. The generated-tool vocabulary oracle counts occurrences per independently listed kind rather than relying on total branches or a set alone.

Observed negatives:

- Replacing the production `clearMeasure` discriminator with `createTeam` retained 37 emitted alternatives and failed the generated-tool count oracle with `clearMeasure: 0` and `createTeam: 2`.
- Emptying only the production `createWorkItem` description failed its own generated branch at length 0. The direct contracts descriptor received `""` instead of the exact prior prose, and the production shape-document conversion showed the same empty field.

Restored evidence: the direct structural shape suite passed 5 tests; the focused production shape-document/generated-tool run passed 2 tests; the uncached contracts + mcp-01 Nx test/lint/typecheck gate passed all 6 targets. No semantic parser, runner or binding behavior changed.

## Task 2.1 continuation

Task 2.1 extracts all 37 pure semantic branches into the literal `commandNormalizers` record in `libs/core/src/service/command-normalizers.ts`. The normalized `PlanCommand` and `PlanCommandKind` now derive from those return types; the prior handwritten union is deleted, while `plan-command.ts` keeps compatibility exports and the temporary exhaustive kind list. The HTTP boundary delegates to `normalizeCommand`, translates its typed normalization error into the existing indexed refusal, and no longer carries the duplicate route-local command switch. Existing field parsers used by capacity and priority-band routes remain shared helpers.

The focused normalizer tests pin the three-state create priority and missing-assignee default. The required mounted negative configured a middle-band default of 47, changed the production normalizer to emit `null` for omitted priority, and failed on the persisted row with `Expected: 47`, `Received: null`; restored, the focused three cases passed. Adding the extracted production file to the existing core boundary inventory was separately proved by importing be-01's repository from it: the boundary test failed with `@nx/enforce-module-boundaries`, then the restored boundary plus mounted suite passed 15 tests.

Restored evidence: the uncached core + be-01 test/lint/typecheck gate passed all 6 targets in 1m23s; OpenSpec validation passed all 75 items; apply instructions reported `ready` with 4 of 10 tasks complete. The initial broad gate correctly failed on the dead route-local switch, strict inferred create fixtures, and lint inventory feedback; those root causes were removed or brought to the normalized boundary before the complete gate reran green.

### Task 2.1 review correction

Astra reproduced an externally visible refusal-order regression in the extracted record. The old parser eagerly validated `workItemId`, `workItemRef`, and `ref` before dispatch, while create and move parsed their base fields before placement refs. The extracted object-spread order had moved or omitted those reads. A mounted five-case aggregate test observed every reported mismatch before the fix: two creates chose `parentRef_must_be_an_id`, patch chose `expected_object`, move chose `parentRef_must_be_an_id`, and freezeProject fell through to bare `invalid_body`.

`normalizeCommand` now restores the common eager order for all 37 kinds, and create/move stage their values in the prior branch order. The restored mounted case passes with exact error/index/kind envelopes. A read-only differential loaded the real pre-extraction `parseKind` from `e8ccef3d^` and compared two successful variants per independently listed kind against the production normalizer: `NORMALIZED VALUES 74 matched; independent kinds 37; every returned discriminator matches`.

The final review-correction core + be-01 test/lint/typecheck gate passed all 6 targets uncached in 1m23s. Its first run had five successful targets and one test-only `no-unsafe-assignment` lint finding at the collected `Response.json()` boundary; typing that boundary as `unknown` made the focused lint and complete rerun green without production changes.

## Task 2.2 continuation

Task 2.2 makes structural-to-semantic completeness a compile-time property. `CommandNormalizerRecord` indexes a definitions object, gives each entry its own inferred structural wire input, and requires the returned discriminator to match that definition's key. The concrete 37-entry `commandNormalizers` literal satisfies the mapped record without narrowing its runtime `Record<string, unknown>` parameters, preserving semantic classification of structurally rejected mounted bodies and every existing field parser/refusal translation.

Observed negatives:

- The TDD fixture initially failed with TS2724 because the requested exhaustive type did not exist. With it implemented, removing the fixture's expected-error directive failed with TS2741 because `temporaryCommand` was absent from the normalizer record.
- Adding `temporaryCommand` to the real production structural definitions without a normalizer failed core typecheck with TS2741 at `command-normalizers.ts`'s production record. The existing structural scope map also failed, independently confirming the fault reached the real definition graph.
- Moving the 201-command cap into the mounted project handler before `parsedBatch` failed the existing production-path case with received `too_many_commands` instead of `invalid_actual`, both at index 200 and kind `setActual`. Only after observing that output was the production `Proof:` comment added.

Restored evidence: direct core build typecheck exited 0; the mounted cap case passed alone with six expectations; the complete normalizer plus mounted file run passed 15 tests and 78 expectations. The uncached contracts/core/be-01 test/lint/typecheck gate passed all nine targets in 1m27s. Its first run correctly found one fixture-only unused-name lint issue after eight targets passed; the repository's `_` convention fixed that issue and the entire uncached gate was rerun green.
