# Connected Fast/calendar round-one correction

Frozen worktree `/tmp/puni-cross-fast-calendar`, supplied HEAD `d9deee3e0`. Root owns commits and integration. No Git metadata, WBS, ports, source/boot, shared barrels, capture values, command authorization or admission logic was modified. The original `/tmp/puni-connected-fast-calendar-manifest.json` and `/tmp/puni-connected-fast-calendar-report.md` remain untouched; this is a separate round-one record.

## Review disposition addressed

- **P1**: `prepareScheduleParts` accepts exactly the five consumed project settings via `Pick<PlanInputReads["project"], "estimateMethod" | "pertWeights" | "estimateRounding" | "startDate" | "depReach">`. Live `Project` is structurally accepted without timezone fabrication or casting. The permanent regression also calls preparation with only those five fields.
- **P2**: The required live wrapper is now actually applied in the worktree. Its canonical body delegates to `prepareScheduleParts`; removed imports and import sorting have been corrected and linted on the actual resource file.
- **Ownership**: New `service/schedule-slices.ts` owns the existing `slicesOf` implementation and `NO_DEADLINES`. Shared preparation depends on that leaf module, which imports only domain runtime functions and an erased WorkItem type. The resource depends on preparation and preserves compatibility re-exports for `slicesOf`, `NO_DEADLINES`, and existing `poolsFor`. There is no preparation-to-resource backedge.
- **Documentation**: The canonical wrapper JSDoc now attaches to the wrapper itself. `ConnectedProjectGraph` receives only the requested JSDoc clarification that authored contexts are unreduced while placement contexts use held-reduced tree/slices.

Only the first five manifest entries changed from supplied HEAD; the remaining five freeze the unchanged foundation alongside the integrated correction.

## Red and green evidence

The previously supplied live patch was applied first. The reported failures were reproduced before correction:

| Command                                                                            | Actual observed result                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `git apply /tmp/puni-connected-fast-live-wrapper.patch`                            | Applied to supplied clean foundation                                                                                  |
| `bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.lib.json`                 | Exit 1, TS2741: live Project lacks CapturedProject timezone; `/tmp/puni-connected-fast-calendar-round1-red-types.log` |
| `bunx eslint libs/wbs/application/core/src/module/work-item/work-item.resource.ts` | Exit 1, import order and unused imports; `/tmp/puni-connected-fast-calendar-round1-red-lint.log`                      |

After narrowing, applying the shared ownership extraction and cleaning imports:

| Command                                                                                                                              | Actual observed result                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.lib.json`                                                                   | Exit 0; `/tmp/puni-connected-fast-calendar-round1-library-types.log`                                                                                                 |
| `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache`                                                                     | Exit 0; module typechecks including work-item plus core build typecheck all executed, cache explicitly skipped; `/tmp/puni-connected-fast-calendar-round1-types.log` |
| `bun test` on connected, saved-input, new preparation, work-item.resource, step-allowance, and plan-command resource-schedule suites | Exit 0; 220 pass, 0 fail, 1093 assertions across 6 files; `/tmp/puni-connected-fast-calendar-round1-live-saved.log`                                                  |
| Reviewer old-live/new-live/saved/display-facts/serialized-bytes comparison using corrected files                                     | Exit 0; 192 assertions across 32 combinations; `/tmp/puni-connected-fast-calendar-round1-equivalence.log`                                                            |
| TypeScript printer comparison of original and moved `slicesOf` function                                                              | Exit 0, identical function syntax excluding comments; `/tmp/puni-connected-fast-calendar-round1-slices-proof.log`                                                    |
| `NX_DAEMON=false bunx nx graph --file=/tmp/puni-connected-fast-calendar-round1-nx-graph.json`                                        | Exit 0; actual generated graph, boundary lint available; `/tmp/puni-connected-fast-calendar-round1-graph.log`                                                        |
| Named uncached `bunx eslint` on the five changed manifest entries                                                                    | Exit 0, no findings; `/tmp/puni-connected-fast-calendar-round1-lint.log`                                                                                             |
| Named `bunx prettier --check` on the five changed manifest entries                                                                   | Exit 0; `/tmp/puni-connected-fast-calendar-round1-format.log`                                                                                                        |
| `git diff --check`                                                                                                                   | Exit 0                                                                                                                                                               |

The 32 permanent cases use the real memory source, real live `scheduleInput`, and real saved-plan capture. They cover all four estimate methods, exact/ceil rounding, dated/undated anchors, held/unheld leaves, inherited team capacity/width, parent floors/deadlines and resource demands. Canonical bytes and display facts agree, while concrete effort, widths, held membership, capacity and calendar values are asserted independently. This is characterization coverage for the bounded extraction; no new production safety guard was introduced.

The reviewer probe lives only in `/tmp/puni-connected-fast-calendar-round1-equivalence`; its temporary export of the private wrapper and frozen old-live function are confined to that disposable comparison copy. No test-only production export or copied preparation implementation was added to the actual worktree. The original review copy was not overwritten. The original reviewer 192-comparison evidence is in `/tmp/puni-connected-fast-calendar-review.md`; the fresh round-one run repeats it against the corrected integrated code.

Exact focused command:

```sh
bun test libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts libs/wbs/application/core/src/module/work-item/step-allowance.test.ts libs/wbs/application/core/src/module/plan-commands/resource-schedule.test.ts libs/wbs/application/core/src/service/saved-plan-input.test.ts libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/schedule-parts.test.ts
```

Exact named lint/format file list (same five paths for each command):

```sh
bunx eslint libs/wbs/application/core/src/service/schedule-parts.ts libs/wbs/application/core/src/service/schedule-slices.ts libs/wbs/application/core/src/service/schedule-parts.test.ts libs/wbs/application/core/src/module/work-item/work-item.resource.ts libs/wbs/domain/domain/src/connected-step-node.ts
bunx prettier --check libs/wbs/application/core/src/service/schedule-parts.ts libs/wbs/application/core/src/service/schedule-slices.ts libs/wbs/application/core/src/service/schedule-parts.test.ts libs/wbs/application/core/src/module/work-item/work-item.resource.ts libs/wbs/domain/domain/src/connected-step-node.ts
```

Exact detached before/after probe command:

```sh
cd /tmp/puni-connected-fast-calendar-round1-equivalence
bun test libs/wbs/application/core/src/service/connected-preparation-review.test.ts
```

Exact unchanged-slicing comparison command:

```sh
bun /tmp/puni-connected-fast-calendar-round1-slices-proof.ts
```

Nx reported restricted Unix sockets and ran its plugins in the main process. No required check/tool was skipped or unavailable. The graph, actual module/library typechecks and lint all completed.

## R5 scope and limits

The 21 accepted foundation mutations were not repeated in this correction, per root instruction: no guarded scheduling arithmetic, namespace, calendar translation, required-engine branch or identity validation changed. Their independent reviewer replay with the live wrapper applied remains `/tmp/puni-connected-fast-review-mutations.json` and `/tmp/puni-connected-fast-review-mutations.log`, with the diagnostic-only caveats stated in the review. Existing adjacent proof comments moved with the unchanged slicing function; no new mutation claim was invented. Function-syntax equality, fresh before/after equivalence and real live/saved regressions check the changed delegation/ownership seam.

Full host gate, full build, runtime/snapshot capability wiring, installed connected live selector/readiness/admission, optimization/history/export activation and release/deployment were not run or completed by this round. The previous detached-slice report remains historical; its pending live-wrapper import-cycle/type/lint caveats are now resolved in the actual source, while runtime/live connected activation remains pending. No complete 6.1/6.2/runtime/release claim is made.

## Frozen files

SHA-256 manifest: `/tmp/puni-connected-fast-calendar-round1-manifest.json`.

| Path                                                                      | SHA-256                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/wbs/application/core/src/service/schedule-parts.ts`                 | `54ff0aad9388a937b6d5f56869d05919a20e49fbcca8ed9a6d4ccb456de74b06` |
| `libs/wbs/application/core/src/service/schedule-slices.ts`                | `28fa1088d4156c7c4f99f12211d3dbe038d8bee6f78340f31dc10d6ba8314e76` |
| `libs/wbs/application/core/src/service/schedule-parts.test.ts`            | `d1e5d73e1a07d688a5ccc5751b04f88c57493a539e161fb3a75db5352c02ecdd` |
| `libs/wbs/application/core/src/module/work-item/work-item.resource.ts`    | `c4ec869548e8192c28d32072b1010cc89c1db1f79bbcbf753058373c94d03245` |
| `libs/wbs/domain/domain/src/connected-step-node.ts`                       | `11d719fd2f0bc0f311fecaa100e3a21cdc9672e15f03dc54d84adec6219cbd58` |
| `libs/wbs/application/core/src/service/connected-plan.ts`                 | `0f656c8665e99dc6c4abd10c49e8eaac657a413433b3096fa85186223a4b11e9` |
| `libs/wbs/application/core/src/service/connected-plan-calendar.ts`        | `8f5fbb2c0aea703544ac6434b627541d0db269f80a70f597057e565ed536e815` |
| `libs/wbs/application/core/src/service/connected-plan-projection.ts`      | `bdc01c7075da44dc85cc86673f831289ac3ef778480c6f0ed48b70539fb66dd5` |
| `libs/wbs/application/core/src/service/connected-plan.test.ts`            | `513e8f4b7cdbbe793270485e15fa544d228def9ca5bff3ebd77ce35964b18584` |
| `libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts` | `6321e69dd98b1951d30bf842ae3e2390547652716fa3db31acee45f7a3593a00` |

## Durable artifacts

Referenced reports/proof outputs are retained in [task-6-fast-proofs](task-6-fast-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.
