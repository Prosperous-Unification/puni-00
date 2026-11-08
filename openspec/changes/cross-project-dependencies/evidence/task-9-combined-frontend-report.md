# Combined frontend failure correction

- Worktree `/tmp/puni-combined-failures`, detached at `bf472bbdc92453e6243cee2aa55b35509d9356c6`; no commit or integration.
- Exact final source hashes: `/tmp/puni-combined-failures-manifest.tsv` (3 files).

## Diagnosis and change

The numeric dependency-list path formerly cleared on Enter. After scoped discovery was added, it cleared only when all writes succeeded, so ambiguous transport and malformed responses left `010, 020` in the input even though either write might have landed. It now clears the captured local numeric draft at submission, guarded by the row and draft identity. The separate remote resolver and one-click selection paths still retain refused drafts. A new mounted test holds the first write and verifies that a newer `999` draft survives its completion.

The Cmd+Enter test pinned the old DOM option id `dep-option-w1`. Options now use a stable scoped endpoint identity, so the test checks that `aria-activedescendant` names the rendered 010 option and still verifies that Cmd+Enter adds no dependency.

## Fresh verification

- Red baseline: the two ambiguous local-list cases failed with received `010, 020`; the Cmd+Enter case failed on old option id. The new pending-write test failed before the production fix with received `010` in its first version and `010, 020` in its final version.
- Green affected configured View suites: `plan-read-and-write.test.tsx` 91/91; `plan-keyboard.test.tsx` 97/97; `dependency-autocomplete.test.tsx` 49/49.
- `BUN_TMPDIR=/tmp bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: passed.
- Changed-file ESLint and Prettier: passed. ESLint printed `No cached ProjectGraph is available; @nx/enforce-module-boundaries skipped`; this rule is therefore unverified in this local check. `git diff --check`: passed.
- Watched production negatives, then restored bytes: forcing the numeric clear guard false failed the pending-write test on input `010, 020`; disabling the chord consume guard failed the Cmd+Enter test because the 010 dependency appeared.

The full frontend View suite, browser tests, h2 gate and integrated feature branch were not run in this isolated packet. Root owns review and integration.
