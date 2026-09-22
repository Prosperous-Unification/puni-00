# Verification

## Slice 1

- `git rev-parse HEAD`: exit 0; `b3b3ab6a066783861955e491eccab42158a3b1b4`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 42 files passed and 614 tests passed (`slice1-step0-unit.log`).
- OpenSpec baseline: exit 0; 112 items passed and 0 failed (`slice1-step0-openspec.json`).
- `openspec new change adopt-frontend-lifetimes --schema sdd-lean`: exit 0; created the change with only `.openspec.yaml`, whose schema is `sdd-lean` (`slice1-openspec-new.log`).
- OpenSpec validation after creation: exit 0; 113 items passed and 0 failed, one more than the baseline; `adopt-frontend-lifetimes` was valid with no issues (`slice1-openspec-after.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`: exit 0; all matched files used Prettier code style (`slice1-prettier-check.log`).

## Slice 2

- `git rev-parse HEAD`: exit 0; `38fc228dcc1b41fb67874ee2bfe945bfadc67dd5`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 42 files passed and 614 tests passed (`slice2-step0-unit.log`).
- Runtime skeleton red: exit 1; 2 files failed and all 25 tests failed on `Error: the lifetime slot is not implemented` (`slice2-red.log`).
- Runtime suites after implementation: exit 0; 2 files passed and 25 tests passed (`slice2-green-runtime.log`).
- Sandbox unit tier after implementation: exit 0; 44 files passed and 639 tests passed, exactly F0 + 2 and T0 + 25 (`slice2-green-unit.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran the target (`slice2-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the target (`slice2-lint.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the five slice-owned paths: exit 0; every path was unchanged (`slice2-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the five slice-owned paths: exit 0; all matched files used Prettier code style (`slice2-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0 (`slice2-format-check.log`).

## Slice 3

- `git rev-parse HEAD`: exit 0; `a548b2dc173b3db707ad1939a8b0dc75c4b74f1a`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 44 files passed and 639 tests passed
  (`slice3-step0-unit.log`).
- Runtime baseline: exit 0; 2 files passed and 25 tests passed
  (`slice3-baseline-runtime.log`).

Each mutation below compiled (`wbs-fe-01:typecheck` exit 0), was restored from its passing
copy with `cmp` exit 0, and was followed by a green runtime run with 25 tests passed. The
patch, failing output, typecheck and restored-green evidence use the row id as their basename.

| Fault                                                                                     | Failing runtime observation                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — delete the serialization wait                                                        | 3 failed, 22 passed; the model reported `r3: 1 acquisitions, 0 close attempts, live=null` (`A1-failing.log`).                                           |
| A2 — make the post-disposal fence always throw with `ordinal !== newest \|\| newest >= 0` | 25 failed; the model reported `the latest request did not win: expected 'refused' not to be 'refused'` (`A2-failing.log`).                              |
| A3 — delete partial-acquisition release                                                   | 5 failed, 20 passed; the model reported `r1: 1 acquisitions, 0 close attempts, live=null` (`A3-failing.log`).                                           |
| A4 — delete the post-factory fence                                                        | 2 failed, 23 passed; the model reported `r2: 1 acquisitions, 0 close attempts, live=r3` (`A4-failing.log`).                                             |
| A5 — delete the post-disposal fence                                                       | 2 failed, 23 passed; both example tests reported `expected 1 to be +0` for a doomed factory call (`A5-failing.log`).                                    |
| A6 — notify subscribers synchronously                                                     | 2 failed, 23 passed; subscriber reentry reported `third accounting: expected +0 to be 1`, and the notification sequence also failed (`A6-failing.log`). |
| B1 — do not retain the terminal refusal                                                   | 3 failed, 22 passed; the named later-transition test resolved with `{ name: 'third' }` instead of rejecting (`B1-failing.log`).                         |
| B2 — omit the queued-request terminal check                                               | 3 failed, 22 passed; the named test received `['rejected', 'fulfilled']` instead of two rejections (`B2-failing.log`).                                  |
| B3 — drop the late cleanup promise                                                        | 4 failed, 21 passed; the named test received `null` instead of a `Promise` (`B3-failing.log`).                                                          |
| B4 — stop observing late cleanup                                                          | 3 failed, 22 passed; the named test received `pending` instead of `settled` (`B4-failing.log`).                                                         |
| B5 — default the retirement budget to 4,000 ms                                            | 1 failed, 24 passed; the named test received `[4000]` instead of `[5000]` (`B5-failing.log`).                                                           |
| B6 — omit synchronous withdrawal                                                          | 17 failed, 8 passed; the named withdrawal test failed and the model reported `r1: 1 acquisitions, 0 close attempts, live=r2` (`B6-failing.log`).        |
| B7 — omit the non-terminal fatal publication                                              | 4 failed, 21 passed; the named test received `constructing` instead of `fatal` (`B7-failing.log`).                                                      |
| B8 — swallow a partial release failure                                                    | 2 failed, 23 passed; the named test received the construction error instead of `DI_BAG_CLEANUP_FAILED` (`B8-failing.log`).                              |

- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/src/runtime/lifetime-slot.ts`:
  exit 0; unchanged (`slice3-prettier-write-source.log`).
- Runtime suites after the proof comments: exit 0; 2 files and 25 tests passed
  (`slice3-green-runtime.log`).
- Sandbox unit tier after the proof comments: exit 0; 44 files and 639 tests passed
  (`slice3-green-unit.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran the
  target (`slice3-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the target
  (`slice3-lint-final.log`). An earlier invocation finished without recording its wrapper status;
  a socket-directory retry then failed before lint because the socket path exceeded Unix length
  limits (`slice3-lint.log`, `slice3-lint-rerun.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the two slice-owned paths: exit 0
  (`slice3-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the two slice-owned paths: exit 0; all
  matched files used Prettier code style (`slice3-prettier-check-final.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0 (`slice3-format-check-final.log`).

## Slice 4

- `git rev-parse HEAD`: exit 0; `d27522ca3be14bdb5e8402d895c770e2cd64c9e3`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 44 files passed and 639 tests passed
  (`slice4-step0-unit.log`).
- OpenSpec baseline: exit 0; 113 items passed and 0 failed; `adopt-frontend-lifetimes`
  was valid with no issues (`slice4-step0-openspec.json`). This slice's V0 is 113.

The proofs in the following tables were observed in the seeded slice 3 attempt. They were
not rerun in slice 4.

### Model-test sabotages

| Fault                                           | Observed diagnostic                                                                                                                                                                                                | Attempt and evidence                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| A1 — delete the serialization wait              | 3 failed, 22 passed; the model reported `r3: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1`.                                                                                                    | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A1-failing.log` |
| A2 — make the post-disposal fence unconditional | 25 failed; the model reported `the latest request did not win: expected 'refused' not to be 'refused'`.                                                                                                            | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A2-failing.log` |
| A3 — delete partial-acquisition release         | 5 failed, 20 passed; the model reported `r1: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1`.                                                                                                    | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A3-failing.log` |
| A4 — delete the post-factory fence              | 2 failed, 23 passed; the model reported `r2: 1 acquisitions, 0 close attempts, live=r3: expected +0 to be 1`.                                                                                                      | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A4-failing.log` |
| A5 — delete the post-disposal fence             | 2 failed, 23 passed; `leaves exactly one runtime live when two replacements arrive together` and `does not build for a request that a newer one overtook during the disposal` each reported `expected 1 to be +0`. | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A5-failing.log` |
| A6 — notify subscribers synchronously           | 2 failed, 23 passed; subscriber reentry reported `third accounting: expected +0 to be 1`, and the notification sequence also failed.                                                                               | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `A6-failing.log` |

### Per-check mutations

| Fault                                          | Named test and observed diagnostic                                                                                                                                             | Attempt and evidence                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| B1 — do not retain the terminal refusal        | `refuses every later transition of a slot whose retirement failed`: `promise resolved "{ name: 'third' }" instead of rejecting`.                                               | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B1-failing.log` |
| B2 — omit the queued-request terminal check    | `refuses a request that was already queued when the disposal failed`: received `['rejected', 'fulfilled']` instead of `['rejected', 'rejected']`.                              | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B2-failing.log` |
| B3 — drop the late cleanup promise             | `fails the transition when the retirement outruns its budget, and keeps watching the disposal`: `expected null to be an instance of Promise`.                                  | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B3-failing.log` |
| B4 — stop observing late cleanup               | `observes a late disposal that finishes after the wait expired, without publishing anything`: `expected 'pending' to be 'settled'`.                                            | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B4-failing.log` |
| B5 — default the retirement budget to 4,000 ms | `gives the retirement the production budget when it is built with none`: `expected [ 4000 ] to deeply equal [ 5000 ]`.                                                         | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B5-failing.log` |
| B6 — omit synchronous withdrawal               | `withdraws publication synchronously, before the first await`: received `live` instead of `retiring`; the model also reported `r1: 1 acquisitions, 0 close attempts, live=r2`. | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B6-failing.log` |
| B7 — omit the non-terminal fatal publication   | `is fatal but not terminal when the replacement's construction throws`: `expected 'constructing' to be 'fatal'`.                                                               | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B7-failing.log` |
| B8 — swallow a partial release failure         | `is terminal when the half-finished construction cannot be released`: expected `DI_BAG_CLEANUP_FAILED` but received the construction error.                                    | `050-7-a-frontend-lifetimes-first.slice-3.20260922T004149Z`, `B8-failing.log` |

- OpenSpec validation after ticking task 1 and adding the proof tables: exit 0; 113 items
  passed and 0 failed, equal to V0; `adopt-frontend-lifetimes` was valid with no issues
  (`slice4-openspec-after.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on all nine packet-owned paths:
  exit 0; all matched files used Prettier code style (`slice4-prettier-check.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the target
  from its cache (`slice4-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran the
  target from its cache (`slice4-typecheck.log`).
- The same lint and typecheck targets with `--skip-nx-cache`: exit 0; Nx executed both
  targets afresh (`slice4-lint-uncached.log`, `slice4-typecheck-uncached.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0 (`slice4-format-check.log`).
- Cumulative scoped diff from slice 1's base `b3b3ab6a066783861955e491eccab42158a3b1b4`:
  exit 0; exactly the nine packet-owned paths (`slice4-cumulative-diff.log`).

## Slice 1

- `git rev-parse HEAD`: exit 0; `2786c893438449dcd295b992067fa94622ead964`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran the
  target (`slice1-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; 44 files passed and 639 tests passed
  (`slice1-step0-unit.log`). This slice changed only OpenSpec Markdown; the post-edit run
  was unchanged at F0 = 44 files and T0 = 639 tests (`slice1-unit-after.log`).
- OpenSpec baseline: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues (`slice1-step0-openspec.json`).
  This slice's V0 is 114.
- OpenSpec validation after adding the revocation requirement and correcting the non-goal:
  exit 0; 114 items passed and 0 failed, equal to V0;
  `adopt-frontend-lifetimes` was valid with no issues (`slice1-openspec-after.json`).
- `wc -w openspec/changes/adopt-frontend-lifetimes/proposal.md`: exit 0; 398 words,
  inside the 400-word intent limit.
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the proposal and delta spec:
  exit 0; both matched files used Prettier code style (`slice1-prettier-check.log`).

## Slice 2

- `git rev-parse HEAD`: exit 0; `94ef75d9ac2aba685a386e07f19735f3c52df9cc`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0; Nx
  successfully ran the target from its cache (`slice2-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 44 files passed and T0 = 639 tests passed
  (`slice2-step0-unit.log`).
- The module suite against the prescribed skeletons: exit 1; 1 test file failed,
  with 5 tests failed and 3 passed (`slice2-red.log`). The failures were the two
  factories refusing with `the preferences module is not built yet`, the graph
  omitting `frontend.preferences/preferencesStore`, the omitted-store case receiving
  the skeleton refusal instead of the labelled missing-dependency refusal, and the
  revoked store receiving no throw.
- The module suite after implementation: exit 0; 1 file passed and all 8 tests passed
  (`slice2-green.log`).
- Sandbox unit tier after implementation: exit 0; 45 files passed and 647 tests
  passed (`slice2-unit-after.log`), exactly F0 + 1 file and T0 + 8 tests.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` after edits: exit 0; Nx
  successfully ran the target uncached (`slice2-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the
  target uncached with no diagnostics (`slice2-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; 960 modules transformed and
  Nx successfully ran the build target (`slice2-build.log`).
- Strict OpenSpec validation: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice2-openspec-validation.nUk7G9.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the six slice-owned paths:
  exit 0; every path was already unchanged (`slice2-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the six slice-owned paths:
  exit 0; all matched files used Prettier code style (`slice2-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice2-format-check.log`).
- No `Proof:` comment was added in this slice; the packet assigns the injected-fault
  observations and adjacent comments to slice 6.
- The whole `wbs-fe-01:test:unit`, `wbs-fe-01:test`, and `tool-devsync:test` targets,
  the whole jsdom and zoned tiers, Chromium, and the host gate remain pending planner
  verification under the executor sandbox contract.

## Slice 4

- `git rev-parse HEAD`: exit 0; `8a48d86d2e974c5ccce971b2475f28931ba4f5c6`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0; Nx
  successfully ran the target (`slice4-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 46 files passed and T0 = 656 tests passed
  (`slice4-step0-unit.log`).
- The four bootstrap and fatal-page suites against the prescribed skeletons: exit 1;
  4 files failed and all 11 tests failed on
  `Error: the page's bootstrap is not written yet` (`slice4-red.log`).
- The same four suites after implementation: exit 0; 4 files passed and all 11 tests
  passed (`slice4-green.log`).
- `bunx vitest run src/main.test.tsx`: exit 0; 1 file and 1 test passed
  (`slice4-main-test.log`).
- Sandbox unit tier after implementation: exit 0; 46 files and 656 tests passed,
  unchanged from F0/T0 because every new suite is in the jsdom tier
  (`slice4-unit-after.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` after edits: exit 0; Nx
  successfully ran the target (`slice4-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the
  target with no diagnostics (`slice4-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build --skip-nx-cache`: exit 0; 991
  modules transformed and Nx successfully ran the build target (`slice4-build.log`).
- Strict OpenSpec validation: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice4-openspec-validation.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the nine slice-owned code paths:
  exit 0; every path was unchanged (`slice4-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on this verification record:
  exit 0; the path was unchanged (`slice4-prettier-write-verify.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on all ten slice-owned paths:
  exit 0; all matched files used Prettier code style (`slice4-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice4-format-check.log`).
- The Chromium probe and spec were written but not run in this sandbox. Planner
  verification is pending: the packet records the focused case at 1 passed in 8.6s,
  fault N12 at 1 failed, and the three existing smoke specs at 25 passed.
- The whole `wbs-fe-01:test:unit`, `wbs-fe-01:test`, and `tool-devsync:test` targets,
  the whole jsdom and zoned tiers, Chromium, and the host gate remain pending planner
  verification under the executor sandbox contract.

## Slice 3

- `git rev-parse HEAD`: exit 0; `372e7a64cf1e9f6b0d75122e380b5db6124312a2`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0; Nx
  successfully ran the target from its cache (`slice3-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 45 files passed and T0 = 647 tests passed
  (`slice3-step0-unit.log`).
- The runtime and module suites against the prescribed runtime skeleton: exit 1;
  1 file failed and 1 passed, with all 9 runtime tests failed and all 8 module tests
  passed (`slice3-red.log`). Five runtime cases reached
  `the page's runtime is not installed yet`; four expected a
  `PartialAcquisitionError` and received the skeleton error.
- The runtime and module suites after implementation: exit 0; 2 files passed and all
  17 tests passed (`slice3-green.log`).
- Sandbox unit tier after implementation: exit 0; 46 files passed and 656 tests
  passed (`slice3-unit-after.log`), exactly F0 + 1 file and T0 + 9 tests.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache` after edits:
  exit 0; Nx executed the target successfully (`slice3-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0; Nx executed
  the target successfully with no diagnostics (`slice3-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build --skip-nx-cache`: exit 0; 960 modules
  transformed and Nx executed the target successfully (`slice3-build.log`).
- Strict OpenSpec validation: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice3-openspec-validation.wICKz2.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the four slice-owned paths:
  exit 0; every path was unchanged (`slice3-prettier-write.log`). The final
  verification-record-only write was also unchanged
  (`slice3-prettier-write-verify-final.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the four slice-owned paths:
  exit 0; all matched files used Prettier code style (`slice3-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice3-format-check.log`).
- No `Proof:` comment was added in this slice; the packet assigns the
  injected-fault observations and adjacent comments to slice 6.
- The whole `wbs-fe-01:test:unit`, `wbs-fe-01:test`, and `tool-devsync:test` targets,
  the whole jsdom and zoned tiers, Chromium, and the host gate remain pending planner
  verification under the executor sandbox contract.
