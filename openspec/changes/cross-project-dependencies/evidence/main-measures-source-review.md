# Dependencies/measures merge — finite round 2

**APPROVED for source integration at the exact reviewed runtime checkpoint.** Both P2 findings in `/tmp/puni-dependencies-measures-source-review.md` are resolved. This is not hosted CI, host gate, native activation or deployment approval.

Identity: `/tmp/reconcile-runtime-final.json`, SHA256 `acdea776bcdce17bbed06ecca1fee8eb99e21c1bad3ec14e7e30dcd4b378e6f7`, 321 runtime/type/test/config files in `/tmp/puni-main-reconcile-e67`. Exact nine-path delta from the original review is `/tmp/reconcile-runtime-review-delta.json`. I verified all 321 hashes before testing and afterward in both author tree and independent `/tmp/puni-main-merge-review`; no mismatch. Receipt: `/tmp/puni-merge-review-round2-final-hashes.json`. The remaining original 312 files are unchanged; the ninth delta is the already-reviewed exact-main upgrade test.

## Repair assessment

Historical schemas: frozen10 factory explicitly replaces project with `documentProject.omit('budgetFactor')`. Navigator7/8/9/10 each replace project with the same historical shape before deep undeclared-key rejection. Existing abbreviation and legitimate fields remain. Current ordinary11/connected12 schemas are untouched. Actual strict-factory and awaited Navigator7/10 regressions pass; the original reviewer actual CLI failures demonstrated the missing restriction before repair. Navigator still refuses12.

Input10 integrity: five finite assertions enforce factor (0,1000], nullable/nonnegative finite facts, finite nonnegative ordered trios, paired nonempty currency/digest or both null, and finite nonnegative caps/nullable holds. They run through the real dependency-aware reader and `verifySavedPlanBodies`; owner/history validation remains in place. There are no live definition reads, invented historical scale/membership facts, or new persisted fields. The original main9 writer, ordinary stored reader/comparison dispatch, normalizer and saved bytes/hash contract are unchanged. Valid1..9 bodies still normalize into the dependency-aware local10 representation. That conversion now rejects malformed measure values in the new representation; preserving acceptance of impossible trusted values is not required. No original stored body is rewritten.

The three other fixture adjustments are bounded: async functions returning immediate values become explicit Promise.resolve with the same timing/values, and the strict historical factory regression is added. No runtime behavioral edit is hidden in them. Archival import continues to discard absent/arbitrary read-only history, while connected12 export evidence and saved-history integrity remain strict.

## Independent verification

Official `/home/df/.bun/bin/bun`1.4.4, isolated overlay only:

1. Four exact files — domain saved-version reader, core saved-body integrity, plan-document resource and Navigator plan-reference — **186 pass, 0 fail, 646 assertions**,8.47s. `/tmp/puni-merge-review-round2-focused-unsandboxed.log`. The first sandbox run had185pass/1fail due the original Navigator child stdout `writeFast` EPERM; its transcript `/tmp/puni-merge-review-round2-focused.log` is preserved. The exact local unprivileged replay was automatically approved outside the sandbox; no native helper, network, SSH or deployment operation occurred.
2. Fresh final contracts boot probe **2 pass,7 assertions**, **486MB < unchanged500MB**,5.25s. `/tmp/puni-merge-review-round2-memory.log`. This is a fresh bounded shape-load measurement, not a total-service RSS or future hosted capacity guarantee.
3. Independently removed each of the five actual semantic assertions in the reviewer overlay. Factor omission breaks both range cases; fact omission breaks negative fact; trio omission breaks negative/reversed order; basis omission breaks both half-basis cases; budget omission breaks negative cap/hold. Every run exits1 with explicit expected-integrity assertion failures, not compiler errors or timeouts. Exact script and receipts: `/tmp/puni-merge-review-round2-watches.py`, `/tmp/puni-merge-review-round2-watches.json`, `/tmp/puni-merge-review-round2-omit-{factor,fact,trio,basis,budget}.log`.
4. Restored source: all nine invalid cases plus a reviewer-created real integrity positive with zero fact/cap, fractional ordered trio/hold, complete USD/card basis and factor1000 pass **10 tests/10 assertions**,291ms. `/tmp/puni-merge-review-round2-restored.log`. The reviewer-only positive was then removed and every frozen file rehashed exactly.

The earlier review's independent exact-main late-migration608 assertions, combined capture/undo/budget cases, actual budget-return omission and lifetime controls remain applicable: their relevant production source is unchanged. The migration test bytes match their final manifest hash. No claim is made that the entire broad suite or configured types/lint were independently rerun in this round; parent/author own those reported checks.

## Integration conditions

The eventual clean merge commit must retain these321 hashes. Review any additional runtime changes; classify final documentation/receipt changes separately and complete required configured checks/normal hooks. Hosted split leaves, strict aggregate and measured capacity, exact host gate, refreshed native compiler/input pins, full provider/activation evidence and deployment remain outstanding parent-owned work. Recent native candidate-inert failure is not cleared by this source approval.
