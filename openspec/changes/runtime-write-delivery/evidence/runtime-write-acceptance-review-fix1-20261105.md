# Runtime acceptance publication — fix1 re-review

**PASS for the scoped P1/P2 repair. Both findings are addressed. No new Critical, Important or Minor findings. Review/source hold RELEASED.** Root may proceed with final checks and normal publication. This verdict does not establish the current full RunStore cohort, hosted/canonical release gates, full foundation or deployment acceptance.

Reviewed the final eight publication paths in `/home/df/.codex/worktrees/9a53/puni-00` atop `178d1a7bc90fe296b2e2e359e41f60c40f3a6896`. Final envelope: **50,415,452 bytes**, SHA-256 **`1cc0d7d32b46534d31d3977c676ea262e501436ad96baee6cadf451d62b8ad64`**. This is a new report because the initial review and omission inventory are themselves preserved in the published evidence; neither was edited.

## P1 addressed: complete the declared review dependency graph

Fresh independent read-only decoding verified both compressed/decoded packet identities and all **5,446 direct file** lengths/hashes. All 5,446 still-present local originals match the reconstructed bytes. The original 2,506-file gzip remains byte-identical to v1; the new supplement contains 2,940 files. I also checked that the archived v1 envelope still has its original `8a9a5849…` hash.

The eight original review reports named in P1 now resolve at their exact paths and hashes. All seven patch-binding diffs, the whole-runtime diff and manifest, twelve archive indexes, missing source correspondence inputs and named native/helper omissions are present. In particular, the identity preload `capture.ts`, committed-source audit, 015 command/terminal/before/after/streams, identity acceptance anchors and Task3 original lint-integrity record resolve. The initial omitted-file inventory remains unchanged as historical evidence.

I independently checked the new graph against the decoded originals, rather than relying only on its self-reported totals:

| Check                                       | Observed result                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Required exact-path dependencies            | All 3,040 resolve with matching length/hash                                                                                      |
| Prior-review matrix                         | All 470 archive entries resolve                                                                                                  |
| Full referenced archive indexes             | All twelve indexes and their 2,980 indexed members resolve                                                                       |
| Original-path aliases                       | All 586 match exact target bytes and the corresponding immutable index `source` entry                                            |
| Composition package                         | All 38 current images and 30 nonempty before-images resolve; eight new-path baselines explicitly reconstruct empty bytes         |
| Embedded identity/logical-recovery evidence | All 1,516 members reconstruct with matching length/hash; every graph member maps to its exact parent packet hash and member path |
| Original review references                  | All direct and embedded report entries in the prior-review matrix resolve                                                        |
| Existing Task1 evidence                     | All 81 original and 131 v2 manifest entries remain present and hash-correct, with both manifests retained                        |

This closes the concrete dependency omission. The graph explicitly retains unavailable historical edges; it does not redefine a complete finite retained archive as complete recovery of every earlier raw log or exact historical helper version.

## Native completeness and policy evidence

I decoded and verified all 26 files in the native-publication attachment, including capture-helper hashes, native stdout/stderr lengths/hashes, argv and exit/signal records. I read the retained completeness checker and classifier helper without executing either.

- `publication-task2-v2-old-v1-red-1793841044172` records native exit1/null signal. After reconstructing the actual retained v1 packet, the checker fails at the missing original Task2 review with expected hash `e6b93887…`; this is the specific P1 omission, not a parser/setup error.
- `publication-task2-v2-final-green-1793841050334` records native exit0/null signal for the repaired final envelope. Its original stdout binds the final envelope hash, all 5,446 file comparisons, 3,040 dependencies and the 1,516 embedded members. It records production scans of 2,940 decoded supplemental files and 1,516 decoded embedded members with no findings. I checked the original records and reconstruction independently; I did not rerun the scans.
- `publication-task2-v2-production-classify-regular-1793841164152` records actual production `classify-candidate` consumption of the exact final envelope in an owned one-file committed fixture. Both unchanged shipped policies classify it as ordinary `openspec` content with native exit0. This is a scoped exact-envelope observation, not whole-branch policy or release acceptance.
- The preceding pipe-write EPERM classifier attempt is retained and explicitly uncredited, including its historical helper-version limit. It is not counted as a safety proof or policy rejection.

The checker distinguishes graph completeness from successful selected-file reconstruction. Its v1 RED and repaired GREEN address the actual publication defect. No runtime mutation campaign was replayed, and no embedded evidence helper is executed by the decoding procedure.

## P2 addressed and acceptance boundaries preserved

The prose now correctly says source178 adds two cases and strengthens the existing pre-aborted case. C03 is accurately described as disabling the duplicate-election condition with `&& false`.

The 26 scenario mapping preserves original statuses except the previously reviewed supplemental S04/S10/S26 closures. The 468 historical observations, 200 checkpoint matches, sixteen strict same-case green associations and 373 legacy helper-binding limits remain separate. The old nine helper-limited Task1 runs remain historical; v2 remains the replacement proof. Source hashes are unchanged: production `5ee3644b21626826f2421d85a5fbc5ad3ff7747891618b12616728dbe563477b`, contract `aaec194cd1b0cb853802a90ed052402f39610306f0554881b3fbcbc2bdb75dab`.

The retained scoped worktree audit supports the stated nineteen selected merged refs, seven attached clean worktrees and twelve without attached worktrees; the text does not generalize that observation to unrelated owners or all worktrees. Task4 and parent completion boundaries remain open. Historical native-close uncertainty, configured skips, remaining adapters/provider/transfer/physical continuation, PostgreSQL adoption/conformance, full S0/S7a and production exclusions are unchanged.

## Read boundary

This re-review covered the P1/P2 repair, final publication claims, dependency resolution and native evidence. It did not repeat the earlier 187-path source review, 468-fault semantic census or Task1 runtime proofs. No product/source/index/Git changes, tests, gates, production scanners, classifiers, network calls or evidence-script executions were performed by this reviewer. Decoding was in memory; provenance paths were only read. One inspection-only inline command had a syntax error and was corrected; no result from that failed inspection was credited.

Root's final full-format/OpenSpec and current source-specific acceptance remain separately controlled. This report claims only the completed publication repair review and releases its hold.
