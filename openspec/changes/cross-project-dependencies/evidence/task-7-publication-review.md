# Independent connected publication review — 2026-10-22

**APPROVE the scoped domain slice. No blocking correctness findings.** This approves the two frozen files and the planned domain barrel exports only. It does not approve connected optimization activation, runtime integration, durable publication, or completion of the feature.

Reviewed `/tmp/puni-cross-publication` at base `bc9ca9b0d` against the binding `architecture/connected-publication.md` and `/tmp/puni-connected-next-optimization-slice.md`. Source was read-only throughout this review; mutation experiments and extra tests used `/tmp/puni-connected-publication-review-sandbox`.

| Frozen file                                                | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/wbs/domain/domain/src/connected-publication.ts`      | `c8a449c5aba117e1f86b210219dcae5e3f69865fa7369b2e91947bdf9ec11d49` |
| `libs/wbs/domain/domain/src/connected-publication.test.ts` | `471afc29db18accb3d5afbf6c9e04211eb8cccc815825b23c700ae1997acec42` |

## Findings and contract assessment

No P0–P2 findings. No source change required for approval.

- `connected-publication.ts:68` canonicalizes and replays the complete captured component with actual `scheduleResolved`, requires exact full keys and exact captured starts/finishes, and wraps trusted baseline failures with their cause. Baseline lateness remains allowed. There is no duration equality reconstructed from `start + duration`.
- `connected-publication.ts:214` establishes baseline evidence before candidate handling. Both local maps require exact local keys and finite nonnegative values; movement origins are not replayed as hard bounds. The candidate receives a fresh complete pin map with local-only replacement.
- `connected-publication.ts:238` passes the original resolved graph, resources, people, floors, deadlines and bookings into the authoritative engine. Tests exercise real weighted FS/SS/FF, expanded pairs, resource/person contention and floors. There is no fake leveller, injected scheduling callback, or duplicate feasibility implementation.
- `connected-publication.ts:248` preserves exact foreign starts and finishes. Local pin reconciliation retains existing engine semantics; an independent extra probe accepted a local pin at `0.20000000000000004`, published replayed `0.2`, and retained exact foreign evidence.
- `connected-publication.ts:116` uses shared deadline helpers, local ownership, positive-leaf projection and individual all-zero points. Baseline and foreign deadlines are not new candidate conditions. A missing local slice fails trusted replay before deadline handling; the apparent local-ID skip is not an observed bypass through the real scheduler.
- `connected-publication.ts:166` computes local dense ranks and filters only the scoring view, preserving complete published schedules and sorted summation. `:271` uses strict `>` so ties choose optimized. An independent extra probe confirmed a deadline-valid candidate with worse local makespan selects the captured baseline even when that baseline is late, as required.

## Independent R5 audit

Reproduced 16 isolated mutations against a copied source tree. Fourteen caused semantic assertion failures, one caused only the explicitly claimed diagnostic failure, and one remained green as explicitly documented. Full summaries: `/tmp/puni-connected-publication-review-mutations.json`; individual logs and exact mutation runner: `/tmp/puni-connected-publication-review-sandbox/`.

Semantic failures reproduced for canonical validation, empty local stage, captured start equality, captured finish equality, candidate key validation, reference validation, authored graph forwarding, candidate pin forwarding, local deadline invocation, local scoring filter, local priority scope, strict comparison, finite score refusal, and removal of both foreign comparisons. The failures involved returned decisions, changed scores/choices, or rejection of valid scoped scoring, not import/build failures.

The foreign comparison evidence at `connected-publication.ts:250` and `:256` is honestly qualified. Removing only start comparison changed the sub-drift refusal to `foreign finish changed`; removing only finish comparison left all 43 original cases green; removing both allowed the candidate. This establishes the combined boundary and the recorded redundancy, not an independent semantic proof for the finish comparison. Retaining both comparisons is appropriate for the contract and future engine changes. No blanket claim about every possible Fast composite replaying exactly follows from these tests.

## Fresh verification

From `/tmp/puni-cross-publication`:

```sh
bun test libs/wbs/domain/domain/src/connected-publication.test.ts libs/wbs/domain/domain/src/schedule-connected.test.ts libs/wbs/domain/domain/src/schedule-typed-dependency.test.ts libs/wbs/domain/domain/src/schedule-resources.test.ts libs/wbs/domain/domain/src/schedule-resource-corpus.test.ts libs/wbs/domain/domain/src/schedule-elsewhere.test.ts libs/wbs/domain/domain/src/schedule-deadline-order.test.ts libs/wbs/domain/domain/src/publication-guard.test.ts libs/wbs/domain/domain/src/score-real.test.ts
```

Exit 0: **137 pass, 0 fail**, 15,565 assertions across nine files.

```sh
bun test libs/wbs/domain/domain/src/schedule-lateness.test.ts libs/wbs/domain/domain/src/on-time.test.ts libs/wbs/domain/domain/src/deadline-offsets.test.ts libs/wbs/domain/domain/src/schedule-shapes.test.ts
```

Exit 0: **63 pass, 0 fail**, 166 assertions across four files.

```sh
bun /tmp/puni-connected-publication-review-sandbox/mutation-audit.ts
bun test /tmp/puni-connected-publication-review-sandbox/src/connected-publication.test.ts
```

Mutation runner exit 0 after recording the expected failures and restoring copied production source. Final copied-suite run exit 0: **46 pass, 0 fail**, 119 assertions: all 43 original cases plus three independent boundary probes. Original frozen hashes and two-file untracked status were verified separately.

No review-run test was skipped. The worker's reported full domain result (1,374 pass, one preexisting skip), typecheck, lint and formatting were not rerun; this review independently ran the relevant 200 source tests instead. Full Nx/host gates, build, schema/Python, wire conversion, barrel consumers, OpenSpec validation, external solver, publication persistence and deployment were not run and are not established by this approval. Root retains integrated validation and export ownership.
