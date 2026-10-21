# Resolved scheduler foundation 6.1a — independent review

Decision: **approve this bounded pure-domain slice**. No blocking correctness or architecture findings. This approval does not close task 6.1 or authorize release/activation.

Reviewed the frozen worktree `/tmp/puni-cross-resolved-schedule`, supplied HEAD `2f70f34f5` against base `3980e0bb5`, the five-path manifest, the binding `/tmp/puni-connected-schedule-architecture.md`, repository orientation/rules, relevant callers/tests, and the implementation handoff. No tracked source or Git metadata was changed.

## Findings

- **P3 — correct the recorded assertion count.** `/tmp/puni-resolved-schedule-report.md`, verification item 4, says 52,088 assertions. The actual `/tmp/puni-resolved-regressions.log` ends with **285 pass, 0 fail, 52,082 expect() calls, 18 files**. Preserve the observed count in the integration verify record. This is an evidence transcription discrepancy, not a failing regression.
- **P3 — retain an empty connected regression.** `libs/wbs/domain/domain/src/schedule-connected.test.ts` covers singleton ownership/rank and stepless nodes, but has no explicit empty connected component case. The inherited local empty test reaches the shared implementation; an external review probe additionally confirms connected order with all required maps present and empty produces empty schedules and zero waiting counts. A small durable connected test would protect that contract during subsequent preparation integration. No implementation change is needed for the observed case.

## Contract assessment

- `resolved-schedule-input.ts:14` has exactly the approved field shape and local/connected order discriminant. Its adapter retains original tree indexing, grouping, leaf expansion, reach, and typed dependency resolution. Optional historical `resourceCapacities`/`elsewhere` become empty maps only at the old optional-field adapter; the resolved seam introduces no fallback for absent ownership or rank facts. Canonical serialization is untouched.
- `schedule.ts:3398–3423` delegates the existing public API to one shared implementation. The diff retains the actual CP, capacity/resource leveller, backwards pass, and projection. It neither introduces a second placement loop nor reconstructs graph edges under a common reach.
- `resolved-schedule-input.ts:64–102` checks the exact actual grouped node set, step/boundary meaning, uniqueness of position, and every supplied positional endpoint. The graph remains authoritative for edges; authored completeness belongs to upstream preparation. Supplied graph node order does not change actual slice order.
- `schedule.ts:3618–3633,3685–3693` validates connected ownership/rank even when a singleton never invokes a comparator, then prepends rank and project ID inside eligible ordering. Incoming dependency accounting still controls heap admission. Within-project comparison is unchanged. Pinned replay retains its independent chronological/topological ordering at `schedule.ts:3738–3748`.
- Weighted FS/SS/FF arithmetic, including negative FF weights, remains unchanged. `real-boundaries.ts:22–64` shares strict actual real-number validation between the old local adapter and the supplied resolved graph. It does not substitute reconstructed local edges. The publication caller still invokes the old API, and fresh targeted publication tests pass.

## Mutation evidence audit

Read the harness, summary, and all thirteen individual `/tmp/puni-resolved-proof-*.log` files. Each actually selects one test, reports 22 filtered out, 0 pass / 1 fail, and has an assertion failure attributable to its named mutation rather than an import/setup failure.

- Node identity, extra, duplicate, and missing-node mutations admit the malformed graph and fail its refusal assertion.
- Endpoint mutation changes the error to a dependency-cycle refusal. It is **diagnostic-only**, as the adjacent comment and handoff say; it does not prove unsafe acceptance without that guard. The source independently checks endpoint integrality and actual group bounds, and fresh review probes exercise negative, fractional, infinite, and NaN positions.
- Ownership mutation corrupts the lookup dependency by replacing absent ownership with project A; it then admits the singleton. This supports the stated dependency-fault proof. It is not a claim that deleting the ownership throw alone defeats the redundant missing-rank refusal.
- Missing rank and nonfinite rank mutations separately admit the singleton. Rank and ID comparator mutations separately place the wrong project first. The final rank fixture reverses project ID order relative to rank, so the ID tie-break cannot conceal removal of rank comparison.
- FS, SS, and FF strict-boundary mutations separately make the corresponding actual resolved validator accept the corrupted materialized slice.

## Verification and limits

Fresh review command:

```sh
bun test /tmp/puni-resolved-review-probe.test.ts libs/wbs/domain/domain/src/publication-guard.test.ts
```

Observed **15 pass, 0 fail, 39 assertions, 2 files**. The six external probe cases cover empty connected maps, four invalid endpoint positions, and relabeling a real step as a boundary. The nine existing publication tests cover fractional FS/SS/FF refusal and local publication/baseline behavior. The external probe is available at `/tmp/puni-resolved-review-probe.test.ts` and was not added to tracked source.

Inspected saved evidence for the 285-test focused regression run, 23-test connected run, named Nx typecheck/lint executions, and five-file formatting. The dedicated library/spec typecheck logs are empty successful-command logs; their exit status is reported by the worker handoff, not independently recoverable from the empty files. No broad suite was repeated. No new mutations were applied to frozen tracked files.

Skipped/unverified here: full workspace checks, build, host gates, runtime capability/lifetime, core component preparation, calendar translation, capture, readiness/admission, optimization, live integration, and final activation. Those remain integration/delivery work; no result here establishes their correctness. Existing golden/hash/pinned regression evidence is the worker's saved run, supported by the narrow diff and fresh publication probes, not a second full run by this reviewer.

## Verified file SHA-256

All five hashes match the handoff manifest:

| Path under `libs/wbs/domain/domain/src/` | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `resolved-schedule-input.ts`             | `b836296bd8fe596aa393dbfea0e6cccaceffc46034b27d0e0df8c3c44ad0b9f7` |
| `schedule-connected.test.ts`             | `7f443bfbc548e00e19ef5881b7e1eaf141c43b6a1990d51d06ae6874cfdf713a` |
| `schedule.ts`                            | `f8c8a33e421d8f87f3925c760fea93c1388a9af866d9d2fef617dc553e984dd2` |
| `real-boundaries.ts`                     | `c7614af40cdd7b576c6cf3c4292cec03b85b147a901490a2f5524bdbe72c0c96` |
| `index.ts`                               | `1b89c0516b782fe38d658abee0a2d2a684bbdb5a5253802db09b69035915e36f` |

## P3 closure at `a905e98d8`

**Both P3 notes are resolved; bounded approval stands.** Inspected `2f70f34f5..a905e98d8`: exactly one test file changes, adding 16 lines at `schedule-connected.test.ts:206`. The durable empty-connected case supplies empty ownership/rank maps alongside the adapter's required empty maps, calls production `scheduleResolved`, and asserts empty slice/work-item projections and zero person/capacity waiting counts. No production code changed.

The handoff's primary regression count now correctly states **52,082**, and its explicit historical correction remains present. Read the follow-up logs: the connected suite includes the new case and reports **24 pass, 0 fail, 30 assertions**; the format log reports all matched files formatted. Spec typecheck and file-scoped ESLint logs are empty, with exit 0 recorded in the handoff; their process exit statuses cannot independently be recovered from those empty files. The handoff also records clean diff checking.

Fresh file hashing confirms the updated test SHA-256 is `e3154cf609b4b228b52da4e1961d8dc92eecaf549dc2027003ab0a4f9080cd75`, matching the follow-up manifest. This supersedes only the test hash in the original table. This closure inspected the narrow diff and saved evidence only: no test reruns, production edits, or Git metadata changes. All original integration/release limitations remain in force.
