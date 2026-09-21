# Verification Report

**Change**: `derive-devsync-pins`
**Verified at**: `2026-09-21`
**Verifier**: planner rehearsal, then the dispatched executors

## Results

Each slice appends its own commands, exit statuses and decisive output lines here before handing
over. Evidence is referenced by basename relative to that attempt's evidence directory.

### Slice A — open the OpenSpec change

- `GSETTINGS_BACKEND=memory bunx prettier --write <four change Markdown files>` — exit 0; all four files reported `(unchanged)` (`prettier-write-a.out`).
- `GSETTINGS_BACKEND=memory bunx prettier --check <four change Markdown files>` — exit 0; `All matched files use Prettier code style!` (`prettier-check-a.out`).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate derive-devsync-pins --json` — exit 0; `passed: 1`, `failed: 0` (`openspec-change-a.json`).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict report-shape check — exit 0; `passed: 109`, `failed: 0` (`openspec-validation.Xdwlfl.json`; baseline was `passed: 108`, `failed: 0` in `openspec-validation.DjZ5jq.json`).

### Slice B — derive the legacy-occurrence context and refuse an unmerged index

- Step 0 status, unmerged-index and pin capture — exit 0; the index had no unmerged entries and the starting pin was digest `224f86cbd141955bf725bbc1e44bdcb9c31eae8b37e50d972cfbe3627e5781c3` at 257 occurrences (`status-before.txt`, `unmerged-before.txt`, `pins-before.txt`).
- Filtered namespacing baseline — exit 0; `13 pass`, `1 filtered out`, `0 fail` (`sweep-before.txt`).
- Inventory baseline — exit 0; `4 pass`, `0 fail` (`inventory-before.txt`).
- Strict all-change OpenSpec baseline — exit 0; `passed: 109`, `failed: 0` (`openspec-validation.xndsnW.json`).
- Before-state line-insertion experiment — exit 1 as required; inserting an unrelated comment above the Tool Dagger Dockerfile map changed only the digest from `224f86cb…` to `5f7014a5…`; restoration returned the named test and the 13-test filtered sweep to green (`digest-line-insertion-before.patch`, `digest-line-insertion-before.out`, `digest-line-insertion-before-restored.out`, `sweep-after-digest-line-insertion-before.txt`).
- No-op refusal stub test — exit 1 as required; `Received function did not throw`, `0 pass`, `1 fail` (`unmerged-stub-red.out`).
- Implemented refusal test — exit 0; `1 pass`, `0 fail`, and the filtered sweep rose to `14 pass`, `1 filtered out`, `0 fail` (`unmerged-implemented-green.out`, `sweep-after-unmerged-implementation.txt`).
- Production-path unmerged probe — exit 1 as required; the named legacy-occurrence test threw `cannot enumerate candidate source: index is unmerged:` followed by tracked paths; restoration returned the named test and `14 pass`, `1 filtered out`, `0 fail` sweep to green (`unmerged-probe.patch`, `unmerged-probe.out`, `unmerged-probe-restored-named.out`, `sweep-after-unmerged-probe.txt`).
- Derived-key re-pin run — exit 1 as required; only the digest changed, from `224f86cb…` to `2f0d2926…`, while occurrences stayed 257 (`digest-repin.out`).
- `GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — exit 0; the file reported `(unchanged)`.
- `GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — exit 0; `All matched files use Prettier code style!`.
- `NX_DAEMON=false bunx nx run tool-devsync:typecheck` — exit 0 (`typecheck-b.log`).
- `NX_DAEMON=false bunx nx run tool-devsync:lint` — exit 0 (`lint-b.log`).
- Post-re-key filtered sweep — exit 0; `14 pass`, `1 filtered out`, `0 fail` (`sweep-after-rekey.txt`).
- Strict all-change OpenSpec validation — exit 0; `passed: 109`, `failed: 0` (`openspec-validation-after-b.*.json`).
- After-state line-insertion experiment — exit 0 as required; the identical unrelated comment left the derived digest green at `1 pass`, `0 fail`; restoration returned the named test and `14 pass`, `1 filtered out`, `0 fail` sweep to green (`digest-line-insertion-after.patch`, `digest-line-insertion-after.out`, `digest-line-insertion-after-restored.out`, `sweep-after-digest-line-insertion-after.txt`).

### Slice C — prove the derived digest still refuses the recorded faults

- Step 0 status, unmerged-index and pin capture — exit 0; the working tree was clean, the index had no unmerged entries, and the starting pin was digest `2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d` at 257 occurrences (`status-before.txt`, `unmerged-before.txt`, `pins-before.txt`).
- Slice-C prerequisite and classifier-shape checks — exit 0; the derived `${match[0]}:${category}` context and exactly one `UNCLASSIFIED` branch were present.
- Filtered namespacing baseline — exit 0; `14 pass`, `1 filtered out`, `0 fail` (`sweep-before.txt`).
- Inventory baseline — exit 0; `4 pass`, `0 fail` (`inventory-before.txt`).
- Strict all-change OpenSpec baseline — exit 0; `passed: 109`, `failed: 0` (`openspec-validation.u4zrgI.json`).
- Five independent digest faults — each named test exited 1 with `0 pass`, `1 fail`; each mutation-only file was restored byte-identically with `cmp`, and each restoration returned the filtered sweep to `14 pass`, `1 filtered out`, `0 fail` (`digest-unclassified-root.*`, `digest-new-classified-root.*`, `digest-same-count-substitution.*`, `digest-class-exchange.*`, `digest-self-path.*`, `sweep-after-digest-*.txt`).
- Class-component isolation — with the class exchange applied and `${category}:` removed, and again with the exchange removed while the key still omitted `${category}:`, both runs received digest `681ef06d22b9d0eff7d378a2943005f1daca81573987b1aff9db8daa8475b2a2`; the full file was then restored byte-identically (`digest-class-exchange-without-category.*`, `digest-no-category-without-exchange.*`).
- `GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — exit 0; the file reported `(unchanged)` (`prettier-write-c.out`).
- `GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — exit 0; `All matched files use Prettier code style!` (`prettier-check-c.out`).
- `NX_DAEMON=false bunx nx run tool-devsync:typecheck` — exit 0 (`typecheck-c.log`).
- `NX_DAEMON=false bunx nx run tool-devsync:lint` — exit 0 (`lint-c.log`).
- `NX_DAEMON=false bunx nx run tool-devsync:build --skip-nx-cache` — exit 0; Nx reported the build and four dependencies successful with the cache skipped (`build-c-uncached.log`).
- Final filtered namespacing sweep — exit 0; `14 pass`, `1 filtered out`, `0 fail`, matching the empty baseline failure set (`sweep-final-c.txt`, `final-failures-c.txt`).
- Strict all-change OpenSpec validation before recording these results — exit 0; `passed: 109`, `failed: 0` (`openspec-validation-c-before-record.Tvlh0L.json`).
- Owned-file Prettier write and check after recording the slice — exit 0; only this report was reformatted, and the check printed `All matched files use Prettier code style!` (`prettier-write-owned-c.out`, `prettier-check-owned-c.out`).
- Post-record filtered namespacing sweep and unchanged-pin comparison — exit 0; `14 pass`, `1 filtered out`, `0 fail`, with the digest and occurrence lines byte-identical to step 0 (`sweep-after-record-c.txt`).
- Post-record strict all-change OpenSpec validation — exit 0; `passed: 109`, `failed: 0` (`openspec-validation-c-final.olCR6i.json`).
- `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all` — exit 0; the status-recording log ended `status=0` (`format-check-c-final.log`).

## Failure proofs

| Fault injected                                                                                              | Test that observed it                                               | Result                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changed the production unmerged-index probe from `git ls-files --unmerged -z` to `git ls-files --cached -z` | `every legacy source occurrence and relevant text family is pinned` | Failed by throwing `cannot enumerate candidate source: index is unmerged:` followed by tracked paths; restored byte-identically and reran green (`unmerged-probe.patch`, `unmerged-probe.out`).                                                       |
| Deleted `wbs/` from solver-orphan-fixture.Dockerfile's only COPY source                                     | `every legacy source occurrence and relevant text family is pinned` | Failed with occurrences 257 → 258, category `UNCLASSIFIED: 1`, and the whole COPY-line context carrying no line number; restored byte-identically and reran green (`digest-unclassified-root.patch`, `digest-unclassified-root.out`).                 |
| Injected `const roundOneFault = 'apps/be-01/src'` above Tool Dagger's Dockerfile map                        | `every legacy source occurrence and relevant text family is pinned` | Failed with production-transition contexts 18 → 19 and occurrences 257 → 258; restored byte-identically and reran green (`digest-new-classified-root.patch`, `digest-new-classified-root.out`).                                                       |
| Moved the Tool Dagger backend root from its proof comment into the `be` map value                           | `every legacy source occurrence and relevant text family is pinned` | Failed on the digest alone, `2f0d2926…` → `0dc79639…`; occurrences, categories, and unclassified stayed unchanged; restored byte-identically and reran green (`digest-same-count-substitution.patch`, `digest-same-count-substitution.out`).          |
| Exchanged the classes assigned to lefthook.yml and sync.test.ts                                             | `every legacy source occurrence and relevant text family is pinned` | Failed on the digest alone, `2f0d2926…` → `7bae8ae1…`; removing `${category}:` made exchanged and unexchanged trees both hash to `681ef06d…`; restored byte-identically and reran green (`digest-class-exchange.patch`, `digest-class-exchange.out`). |
| Replaced derived `SELF` with `tools/tool-devsync/src/not-this-file.ts`                                      | `every legacy source occurrence and relevant text family is pinned` | Failed with test-fixture contexts 106 → 126, recursive selectors 31 → 33, occurrences 257 → 279, and unclassified still empty; restored byte-identically and reran green (`digest-self-path.patch`, `digest-self-path.out`).                          |
