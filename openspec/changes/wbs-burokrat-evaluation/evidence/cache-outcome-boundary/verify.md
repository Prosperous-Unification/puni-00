# Cache outcome boundary verification

Base: main `87a2b7edbfaabae889d91daa823f16f520a51cec`. The original cache blob is `291c1771c76c0f8bf1a73700084ee8b43f6ff077`, identical at wave12 `72118c493671151131bbc80c0388c870ff32647e`. Work ran in isolated `/tmp/cache-outcome-sol` with dependencies shared through a `node_modules` symlink to the wave12 clone. No dependency files changed.

## Characterization and consuming checks

Before moving code, read cache callers, captured-read adapter, live optimization feature and owning tests. Run:

```sh
bun test libs/wbs/adapters/store-sqlite/src/optimized-cache.db.test.ts apps/wbs/be-01/src/service/optimized-plan-read.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/deadline-plan-read.test.ts --timeout=30000
```

Observed 154 pass, 0 fail, 710 assertions. This includes real SQLite pair-read, read-and-spawn, explicit retry, publication/write ownership and live plan-read behavior; the optimized-plan-read seam itself intentionally uses a stub reader.

Added characterization for missing certificate payload and missing failed reason, and three captured production-read cases covering each proof label and the returned schedule. The initial new floor fixture had solver stage values and was correctly rejected by the existing codec; corrected it to the existing floor representation (null stage values/bounds and unknown status). No production behavior changed.

Final serial focused run uses the four files above plus:

```sh
libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts
libs/wbs/adapters/store-sqlite/src/captured-optimization-reader.db.test.ts
```

Observed 181 pass, 0 fail, 803 assertions across six files, 14.24 seconds. Bun executes these files serially with no concurrent-test flag. No solver, Docker or browser was started.

## Watched independent negatives

Each fault was injected into extracted production code, run alone using `bun test <owning-file> --timeout=30000 --test-name-pattern '<case>'`, observed exiting 1 with the consuming test failing, then restored before the next fault. The full final run above is on restored code. Adjacent `Proof:` comments name these observations.

| Injected fault                       | Consuming assertion observed failing                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Remove the parsed-JSON success guard | `reads a truncated payload`: diagnostic becomes a codec complaint about undefined instead of the JSON defect   |
| Bypass `decodeOptimizedResult`       | `reads a wrong dtoVersion`: expected corrupt, received ok                                                      |
| Bypass `decodePlanInfeasible`        | `reads a malformed certificate item`: expected corrupt, received plan-infeasible                               |
| Report corruption as miss            | `spawns nothing across ten reads of a corrupt row, and one Retry asks once`: expected corrupt, received miss   |
| Include failed in automatic spawn    | `spawns nothing across ten reads by three collaborators against a failed key`: expected zero spawn calls       |
| Include corrupt in automatic spawn   | `spawns nothing across ten reads of a corrupt row, and one Retry asks once`: expected no automatic spawn calls |
| Replace floor proof by proven        | `preserves quantisation-floor proof through a stored captured plan read`: wrong proof label                    |
| Replace proven proof by incomplete   | `preserves proven proof through a stored captured plan read`: wrong proof label                                |
| Replace incomplete proof by proven   | `preserves incomplete proof through a stored captured plan read`: wrong proof label                            |
| Bypass missing-payload check         | Both `row with no payload` cases fail the required missing-payload diagnostic (2 failures)                     |
| Bypass missing-reason check          | `reads a failed row with no reason`: expected corrupt, received failed                                         |

Other fault runs each produced one failure. Unknown objective/status/failure-reason tests remain in the real SQLite owning suite and pass; `optimizer-rows.ts` is unchanged.

## Mechanical equivalence

A TypeScript AST/scanner comparison loaded the base file with `git show 87a2b7ed:<path>`, located each of the 33 named top-level declarations and both top-level variable statements (`MISS` and `MAX_LIVE_BUDGETS`) in either destination file, and compared scanner tokens with comments, whitespace and the export modifier excluded. The upgraded comparison reported all 35 unchanged. This covers every helper body, all retained SQL/read/write bodies, types and both constants. Collecting named exports and named reexports proved the original facade still exports exactly the same 25 names. The new module imports no cache facade.

Moved declarations: `CachedOutcome`, `OptimizedPair`, `optimizationVariantState`, `corrupt`, `parsePayload`, `decodePayload`, `outcomeOf`, `objectivesToAutoSpawn`, `objectivesToRetry`. Only `outcomeOf` gains an export inside the adjacent module for the cache reader; it is not reexported by the original facade/package index.

Formatted line counts: cache orchestration 776; outcome module 253. These are raw source counts, not a certified F7 evaluation.

## Scoped checks and limits

- `bunx tsc --noEmit --project libs/wbs/adapters/store-sqlite/tsconfig.lib.json`: exit 0, no diagnostics.
- `bunx tsc --noEmit --project libs/wbs/adapters/store-sqlite/tsconfig.spec.json`: exit 0, no diagnostics.
- `bunx eslint` over the four touched TypeScript files: exit 0. Nx module-boundary rule explicitly skipped because no cached ProjectGraph exists; its enforcement is unverified here.
- `bunx prettier --check` over the four TypeScript files and this evidence directory: exit 0 before commit.
- `git diff --check`: exit 0 before commit.
- Normal lefthook hooks installed using `bun run tools/tool-git-hooks/src/install.ts`; commit runs normal hooks, with no bypass.

Full local Nx gates, workspace builds, solver tests, Docker, browsers, h2puni gate, hosted evaluator, certified source membership, and OpenSpec CLI validation were not run in this laptop-bounded slice. The parent owns exact review and later hosted checks. WBS090 remains `blocked_by_proxy`; this extraction does not close it or assert an F7 count. Hook tool-wiki admission may report inactive when the external activation root is absent; such a report supplies no certified evaluation.
