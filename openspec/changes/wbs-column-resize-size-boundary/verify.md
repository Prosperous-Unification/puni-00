## Scope and source identity

Base: `4f098bfe2bf64343b8f503b5bdebd6e1a6fa34f4`; original hook blob `7860850d7a8b6cd1ff328a58d9e263ef336f085d`.

Fresh hosted proofs select recovery commit `ecf7b313c598bf16fbfadfc49e0e8df94532bc7a`, tree `28cc44baee7fd700d1df5a7ca5a3adec575eaa3d`. The hook is 792 physical lines, blob `9f2ad8d2372e6bda00acea788a5893863a9e0376`; column-resize.tsx is 183 lines, blob `6fd44eb76ab75b102fa18df43809de795bcdcaa9`. All original resize JSDoc blocks were checked verbatim against the base. The 913-line original estimate counted nonblank lines; installed F7 measures 957 physical lines in the base.

The extraction moves widthFromDrag, ColumnResize, ColumnResizeHandle and the existing column callback factory into the scoped module. Hook exports and state ownership remain stable. Callback creation still captures the current project, width map and setter on each render; drag functional updates, commit copy/storage order and cancellation storage reread are preserved. Gantt and plan export are unchanged.

## Fresh hosted production-path proofs

[Successful proof run 38861062582](https://github.com/Prosperous-Unification/puni-00/actions/runs/38861062582) executes proof branch commit `1c9559e4e2e33d4ace60ec8f91a55ef657b3666e` against the immutable recovery commit above. Every step, including installed identity checks, both gesture mutations, exact committed F7 comparisons, source restoration and artifact upload, completed successfully; no proof step was omitted.

Artifact `12029028440`, `wbs-column-resize-ecf7-proofs`, has GitHub digest `70b3d69c2c1bbc97bfb7586f88fcf753194392c520174a5888146fc71837edb2`. The selected receipts are preserved in [evidence/hosted-recovery](evidence/hosted-recovery); log copies have ANSI color controls and terminal blank lines removed for readability. The raw oversized-fault patch is preserved as base64 so its meaningful context whitespace survives staged whitespace checks; decoding restores the hosted bytes. Original bytes and the installed tarball remain in the hosted artifact. The downloaded tarball SHA256 was independently checked against its hosted receipt.

The mounted command is `TZ=UTC bunx vitest run src/components/wbs/column-resize.test.tsx --no-file-parallelism --maxWorkers=1`, from the frontend directory. The positive and restored runs each passed all 3 tests. The helper checks actual assertion messages and test counts, in addition to process exit status.

| Injected production-path fault                             | Watched observation                                                                                                         | Restored result                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Replace both pointer identity guards with null-only checks | Matching-release test failed: expected 2 drags, received 3; 1 failed / 2 passed                                             | 3 passed; clean source diff                                 |
| Remove matching pointerup commit                           | Matching-release and measured-Name tests failed: expected one commit, received zero; 2 failed / 1 passed                    | 3 passed; clean source diff                                 |
| Restore the exact base hook in a committed fault           | F7 returned the 957-line selected finding; selected-finding assertion failed with `selected oversized hook finding remains` | Immutable recovery commit selected again; clean source diff |

The oversized fault is commit `6995eba5d1201c9da7de194e71661898176a4a9d`, tree `88534c40c132f23ee781e3c025206d6e8ea64097`; its patch is retained. Adjacent gesture Proof comments name the same observed production-path faults. The F7 assertion and workflow are available at the [immutable proof branch commit](https://github.com/Prosperous-Unification/puni-00/tree/1c9559e4e2e33d4ace60ec8f91a55ef657b3666e/openspec/changes/wbs-column-resize-size-boundary/evidence/recovery-proof).

## Distinct recovery evaluator and policy

The original `/tmp` consumer and external policy were lost during reboot cleanup. The hosted reconstruction is a **new artifact**, not an exact recovery of the former `db3dcf…` toolkit / `3432df…` executable or `052a3a…` policy.

The new evaluator is built and packed from source `ac774f0c358db369c2048e537151e263cc29361e`, tree `2399780c9d4307f7efdb99855becad32b0fc69bd`, using Bun 1.4.2 and frozen dependencies, then installed in a separate consumer with lifecycle scripts disabled. Pins checked before F7:

| Identity                     | SHA256                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| New hosted toolkit           | `2417f876901efadcc817e7518a8f796985c9e62409ab6f68458b55ea21d2b69a` |
| New hosted executable        | `92ca1424826b325dad64a160090fb8c83521a5e581a48f6bed510a1d7d00ef4c` |
| Packed and installed tarball | `f287bc11f43f628b70ecd01e11eb6784c55fd4b2fb8cbb9e439dee8e685297fd` |
| Trusted dependency closure   | `efe812480b995ccef8634e9c17adf9a51d8f3e016c771232ec49ea71aaba94ac` |
| New external recovery policy | `8cb22ce3a98d97859a7d7d89124fef15199ee6dbe6f351f07b54186f9e41fc8c` |

The policy is `wbs.column-resize.recovery.f7.v1`, with all registered modes explicitly observe and the same F7 ceiling 800, six WBS/shared roots and no pinned exceptions as the committed diagnostic size declaration. It is deliberately distinct from the lost external policy. One installed evaluator and one byte-identical external policy evaluate base, recovery and fault, from the consumer cwd:

```text
twib check committed <candidate-checkout> <revision> <external-recovery-policy> --rule F7
```

| Committed selection       | F7 findings | Selected oversized hook | Unevaluated | Certifies |
| ------------------------- | ----------: | ----------------------- | ----------- | --------- |
| Exact public base         |          41 | 957 lines               | none        | false     |
| Exact recovery ecf7b313   |          40 | absent                  | none        | false     |
| Committed oversized fault |          41 | 957 lines               | none        | false     |

The positive assertion compares the entire finding arrays after removing only the selected base finding. Every unrelated F7 finding remains identical. Observe-mode exit 0 and allowed=true do not prove closure; the selected finding assertion is the proof used here.

## Failed hosted attempts retained

- [38860218758](https://github.com/Prosperous-Unification/puni-00/actions/runs/38860218758): mounted positives, both intended fault failures and restoration ran correctly, then the receipt parser failed on ANSI-colored Vitest summaries. Normalizing terminal controls fixed the parser against those actual receipts; production source did not change. F7 did not run.
- [38860460162](https://github.com/Prosperous-Unification/puni-00/actions/runs/38860460162): mounted proofs passed, but the historical evaluator identity guard correctly refused the new bundle hashes. Installation and source revision were correct; F7 did not run. Source, Bun and trusted dependency closure matched the historical records; new bundles contain hosted builder paths. This supports location-dependent generated bytes, but an exact comparison to lost old bundle bytes is unavailable. The PM reviewed the distinct new pins before the successful third run.

Both failed-attempt receipts are retained; the successful third run uses the new pins without silently relaxing identity checks.

## Hosted browser and static status

[PR CI run 38859192929](https://github.com/Prosperous-Unification/puni-00/actions/runs/38859192929) selects PR head ecf7b313 and its synthetic merge composition (base `5274046bdb0835727e22f98901a849afaad3b4a7`, merge `2b7b5ffdb801c68c4765e52e13240115efa06ff0`). All four pixels shards and the aggregate pixels check passed.

The shard-2 HTML report was independently parsed from artifact `12028699745` (GitHub digest `37f1252b186db31eea72e7a2d6e442f9d058c121db2f004646f5bc5ccd234c0d`). Each of these five layout cases has exactly one actual result, status `passed`, no errors: column drag/pins, persistence after reload, reset to resolved widths, measured Name drag, and other-column envelopes while Name holds an override. Their titles and test IDs are retained in selected-browser-cases.json. Shard 2 reports 158 expected, zero unexpected/flaky/skipped cases. Shard 1 reports one skip elsewhere; no selected resize case was skipped.

The hosted Format step passed. At the evidence snapshot, gate workspace (test/lint/typecheck/build) and gate twilight remained in progress. No completed static or whole-CI acceptance is inferred from an active job. The fresh isolated proof ran the 3 mounted gesture cases; it did not rerun the historical 138-test three-file selection separately.

## Recovery history and limits

Original temporary commits and raw receipts were lost: implementation `1ca905230`, evidence `322194ad6c3493eb6ab3ca0d1fb2f1cfc9c04613`, and original fault `62b9691469d7d426b9ee6c80abbf66dcebee6168`. Historical 138-test and earlier browser/static observations are not fresh evidence for recovery; the hosted receipts above replace the missing proofs only to their stated scope.

Fresh laptop work was limited to reconstruction, scoped formatting/diff/JSDoc checks, receipt downloads and static inspection. No heavy laptop tests, build, browser, Nx or Burokrat survey were run. h2puni and its active canonical #535 gate were untouched. No full-rule Burokrat survey or exact-head h2puni gate was run for this recovery. This proves one F7 finding and the selected gesture behavior; it does not certify the candidate or close WBS100. A follow-up evidence commit changes documentation only; its production-source identity with ecf7b313 must be checked explicitly. Do not merge without required review and final gates.
