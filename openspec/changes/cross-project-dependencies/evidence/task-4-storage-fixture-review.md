# Scoped review: typed history fixture followup

Reviewed `git show 7e1b083d5` (source commit `8d6083056`) and the surrounding compensating test, `/tmp/puni-external-storage-report.md` integration fixture typing fix 2, `/tmp/puni-storage-fix2-focused.log`, and `/tmp/puni-cross-storage-integrated-core-types-final.log`.

Verdict: approved for this mechanical test-only followup; no findings. Only `compensating.test.ts` changes. `as const` preserves fixture discriminants without altering the historical unscoped input. The separate expected dependency still asserts exact normalization of both endpoint project IDs. The nested remove expectation is now constructed from the known fixture rather than spreading the returned command union; this removes coupling to the subject under test and does not weaken equality. Touched identities, subject, malformed-history tests and all other assertions are unchanged.

Inspected recorded evidence: focused suite 38 pass, 0 fail, 127 assertions; integrated Nx wbs-core typecheck and module dependency successfully completed with cache skipped. I did not rerun tests or typechecks for this read-only diff review. No full gate, storage reapproval beyond this diff, feature completion or activation claim.
