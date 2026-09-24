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

## Slice 6

- `git rev-parse HEAD`: exit 0; `4f321dcd27d4a258f2267dcf98b91eabd2ad673c`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0
  (`slice6-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 46 files passed and T0 = 656 tests passed
  (`slice6-step0-unit.log`).
- The focused node prerequisite: exit 0; 4 files and 42 tests passed
  (`slice6-node-green-before.log`). The focused jsdom prerequisite: exit 0; 5 files
  and 12 tests passed (`slice6-jsdom-green-before.log`).
- Every mutation below passed `wbs-fe-01:typecheck`, failed its named test, was
  restored byte-for-byte with `cmp`, and had its applicable focused suite rerun green.

| Fault | Observed failure                                                                                                                                        | Evidence                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| N1    | 4 node failures and 1 jsdom failure; the host-close case received no throw, and the slot model reported `r2: revoked=false, graphClosed=true, live=r3`. | `N1.patch`, `N1-typecheck.log`, `N1-node-red.log`, `N1-jsdom-red.log`, `N1-restore-cmp.log`, `N1-node-green.log`, `N1-jsdom-green.log`        |
| N2    | 5 node failures and 1 jsdom failure; the direct revoked-store case received no throw, distinguishing this from N1.                                      | `N2.patch`, `N2-typecheck.log`, `N2-node-red.log`, `N2-jsdom-red.log`, `N2-restore-cmp.log`, `N2-node-green.log`, `N2-jsdom-green.log`        |
| N3    | 4 node failures; `keeps its owned store out of a host graph` received no throw.                                                                         | `N3.patch`, `N3-typecheck.log`, `N3-node-red.log`, `N3-restore-cmp.log`, `N3-node-green.log`                                                  |
| N4    | 2 node failures; the graph omitted `frontend.preferences/preferencesStore`.                                                                             | `N4.patch`, `N4-typecheck.log`, `N4-node-red.log`, `N4-restore-cmp.log`, `N4-node-green.log`                                                  |
| N14   | 8 node failures and 5 jsdom failures on `DI_BAG_CYCLE`; by design this graph-shape fault earns no source comment.                                       | `N14.patch`, `N14-typecheck.log`, `N14-node-red.log`, `N14-jsdom-red.log`, `N14-restore-cmp.log`, `N14-node-green.log`, `N14-jsdom-green.log` |
| N5    | 4 node failures; the half-finished read returned a plain `Error`, not `PartialAcquisitionError`.                                                        | `N5.patch`, `N5-typecheck.log`, `N5-node-red.log`, `N5-restore-cmp.log`, `N5-node-green.log`                                                  |
| N7b   | 1 node failure; the disposal record stayed `[]` instead of `['first']`.                                                                                 | `N7b.patch`, `N7b-typecheck.log`, `N7b-node-red.log`, `N7b-restore-cmp.log`, `N7b-node-green.log`                                             |
| N6    | 1 node failure; the published surface enumerated `['preferences', 'remembered', 'bag']`.                                                                | `N6.patch`, `N6-typecheck.log`, `N6-node-red.log`, `N6-restore-cmp.log`, `N6-node-green.log`                                                  |
| N6b   | 1 node failure; the no-resolver assertion received false.                                                                                               | `N6b.patch`, `N6b-typecheck.log`, `N6b-node-red.log`, `N6b-restore-cmp.log`, `N6b-node-green.log`                                             |
| N7    | 3 node failures and 1 jsdom failure; the runtime-owned store remained readable after close.                                                             | `N7.patch`, `N7-typecheck.log`, `N7-node-red.log`, `N7-jsdom-red.log`, `N7-restore-cmp.log`, `N7-node-green.log`, `N7-jsdom-green.log`        |
| N16   | 1 jsdom failure; the model drew the app while the slot was `retiring`.                                                                                  | `N16.patch`, `N16-typecheck.log`, `N16-jsdom-red.log`, `N16-restore-cmp.log`, `N16-jsdom-green.log`                                           |
| N11   | 5 jsdom failures; the eager root mounted while the slot was `empty`.                                                                                    | `N11.patch`, `N11-typecheck.log`, `N11-jsdom-red.log`, `N11-restore-cmp.log`, `N11-jsdom-green.log`                                           |
| N18   | 1 jsdom failure; Strict Mode acquired 3 runtimes instead of 1.                                                                                          | `N18.patch`, `N18-typecheck.log`, `N18-jsdom-red.log`, `N18-restore-cmp.log`, `N18-jsdom-green.log`                                           |
| N8    | 2 jsdom failures; the refused-start case rendered 0 trees instead of 1.                                                                                 | `N8.patch`, `N8-typecheck.log`, `N8-jsdom-red.log`, `N8-restore-cmp.log`, `N8-jsdom-green.log`                                                |
| N9    | 1 jsdom failure; a console line carried the caught value instead of disclosed strings.                                                                  | `N9.patch`, `N9-typecheck.log`, `N9-jsdom-red.log`, `N9-restore-cmp.log`, `N9-jsdom-green.log`                                                |
| N12   | 1 jsdom failure; the rendered fault props contained `alice@example.com`.                                                                                | `N12.patch`, `N12-typecheck.log`, `N12-jsdom-red.log`, `N12-restore-cmp.log`, `N12-jsdom-green.log`                                           |
| N15   | 2 jsdom failures; one refusal was rendered and logged twice.                                                                                            | `N15.patch`, `N15-typecheck.log`, `N15-jsdom-red.log`, `N15-restore-cmp.log`, `N15-jsdom-green.log`                                           |
| N10   | 1 jsdom failure; a failed retirement left 1 rendered tree instead of 2.                                                                                 | `N10.patch`, `N10-typecheck.log`, `N10-jsdom-red.log`, `N10-restore-cmp.log`, `N10-jsdom-green.log`                                           |
| N13   | 1 jsdom failure; the fatal page disclosed no occurrence reference.                                                                                      | `N13.patch`, `N13-typecheck.log`, `N13-jsdom-red.log`, `N13-restore-cmp.log`, `N13-jsdom-green.log`                                           |
| N19   | 1 jsdom failure; startup-only wording omitted `Anything already saved is on the server`.                                                                | `N19.patch`, `N19-typecheck.log`, `N19-jsdom-red.log`, `N19-restore-cmp.log`, `N19-jsdom-green.log`                                           |
| N20   | 2 jsdom failures; the losing bootstrap rejected with `the slot is empty` instead of resolving without drawing.                                          | `N20.patch`, `N20-typecheck.log`, `N20-jsdom-red.log`, `N20-restore-cmp.log`, `N20-jsdom-green.log`                                           |
| N21   | 1 jsdom failure; mount statuses were `['live', 'fatal']` instead of `['live']`.                                                                         | `N21.patch`, `N21-typecheck.log`, `N21-jsdom-red.log`, `N21-restore-cmp.log`, `N21-jsdom-green.log`                                           |

- After the comments, the focused node command passed 4 files and 42 tests and the
  focused jsdom command passed 5 files and 12 tests
  (`slice6-node-green-after-comments.log`, `slice6-jsdom-green-after-comments.log`).
- Sandbox unit after the comments: exit 0; 46 files and 656 tests passed, unchanged
  from F0/T0 (`slice6-unit-after.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0
  (`slice6-typecheck-final.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0 with no diagnostics
  (`slice6-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; 991 modules transformed
  (`slice6-build.log`).
- Prettier write on the six slice-owned paths: exit 0; only this verification record
  changed. Prettier check on the same paths: exit 0
  (`slice6-prettier-write.log`, `slice6-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice6-format-check-rerun.log`).
- Strict OpenSpec validation: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice6-openspec-validation.*.json`).
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

## Slice 5

- `git rev-parse HEAD`: exit 0; `f3db94c72fcb8a3d4bbb6e084552fe7c762b5b1f`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0; Nx
  successfully ran the target from its cache (`slice5-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 46 files passed and T0 = 656 tests passed
  (`slice5-step0-unit.log`).
- The lifetime-slot model with the production application graph in its generated
  interleavings: exit 0; 1 file and 1 test passed at seed 20260923 with 300 runs
  (`slice5-slot-model.log`).
- The staged-composition agreement case: exit 0; 1 file and 1 test passed
  (`slice5-composition-agreement.log`).
- Sandbox unit tier after the model extension and agreement case: exit 0; 46 files and
  656 tests passed, unchanged from F0/T0 because the model suite was already listed and
  the agreement case is in the jsdom tier (`slice5-unit-after.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` after edits: exit 0; Nx executed
  the target successfully (`slice5-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx executed the target
  successfully with no diagnostics (`slice5-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; 991 modules transformed and
  Nx executed the target successfully (`slice5-build.log`).
- Strict OpenSpec validation: exit 0; 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice5-openspec-validation.GqfMkO.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the four code and module-document
  paths: exit 0; every path was unchanged (`slice5-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on this verification record:
  exit 0 (`slice5-prettier-write-verify-final.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on all five slice-owned paths:
  exit 0; all matched files used Prettier code style (`slice5-prettier-check-final.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice5-format-check-final.log`).
- No negative proof was run and no `Proof:` comment was added in this slice; the packet
  assigns the installed-graph fault N1 and every adjacent proof comment to slice 6.
- The whole `wbs-fe-01:test:unit`, `wbs-fe-01:test`, and `tool-devsync:test` targets,
  the whole jsdom and zoned tiers, Chromium, and the host gate remain pending planner
  verification under the executor sandbox contract.

## Slice 7

- `git rev-parse HEAD`: exit 0; `eba4de1c59d5ac7dd74db7119570d24b11bebea9`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` before edits: exit 0; Nx
  successfully ran the target (`slice7-step0-typecheck.log`).
- Sandbox unit baseline: exit 0; F0 = 46 files passed and T0 = 656 tests passed
  (`slice7-step0-unit.log`).
- OpenSpec baseline: exit 0; V0 = 114 items passed and 0 failed;
  `adopt-frontend-lifetimes` was valid with no issues
  (`slice7-step0-openspec.json`).
- Task 2 is complete. Task 3 remains open because delivery does not yet read preferences
  from the one graph and the module index has not landed. Task 4 remains open because the
  application context does not yet publish the feature facade; its bootstrap-ordering and
  fatal-page clauses are already implemented.
- No fault was injected or replayed in this slice. The observations below are the seeded
  evidence produced by the earlier attempts.

### Seeded negative-proof observations

| Fault | Earlier observed diagnostic                                                                                                                             | Attempt-relative evidence                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1    | 4 node failures and 1 jsdom failure; the host-close case received no throw, and the slot model reported `r2: revoked=false, graphClosed=true, live=r3`. | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N1-node-red.log`; `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N1-jsdom-red.log`   |
| N2    | 5 node failures and 1 jsdom failure; the direct revoked-store case received no throw.                                                                   | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N2-node-red.log`; `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N2-jsdom-red.log`   |
| N3    | 4 node failures; `keeps its owned store out of a host graph` received no throw.                                                                         | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N3-node-red.log`                                                                                        |
| N4    | 2 node failures; the graph omitted `frontend.preferences/preferencesStore`.                                                                             | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N4-node-red.log`                                                                                        |
| N14   | 8 node failures and 5 jsdom failures on `DI_BAG_CYCLE`; this graph-shape fault earns no source comment.                                                 | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N14-node-red.log`; `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N14-jsdom-red.log` |
| N5    | 4 node failures; the half-finished read returned a plain `Error`, not `PartialAcquisitionError`.                                                        | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N5-node-red.log`                                                                                        |
| N7b   | 1 node failure; the disposal record stayed `[]` instead of `['first']`.                                                                                 | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N7b-node-red.log`                                                                                       |
| N6    | 1 node failure; the published surface enumerated `['preferences', 'remembered', 'bag']`.                                                                | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N6-node-red.log`                                                                                        |
| N6b   | 1 node failure; the no-resolver assertion received false.                                                                                               | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N6b-node-red.log`                                                                                       |
| N7    | 3 node failures and 1 jsdom failure; the runtime-owned store remained readable after close.                                                             | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N7-node-red.log`; `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N7-jsdom-red.log`   |
| N16   | 1 jsdom failure; the model drew the app while the slot was `retiring`.                                                                                  | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N16-jsdom-red.log`                                                                                      |
| N11   | 5 jsdom failures; the eager root mounted while the slot was `empty`.                                                                                    | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N11-jsdom-red.log`                                                                                      |
| N18   | 1 jsdom failure; Strict Mode acquired 3 runtimes instead of 1.                                                                                          | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N18-jsdom-red.log`                                                                                      |
| N8    | 2 jsdom failures; the refused-start case rendered 0 trees instead of 1.                                                                                 | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N8-jsdom-red.log`                                                                                       |
| N9    | 1 jsdom failure; a console line carried the caught value instead of disclosed strings.                                                                  | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N9-jsdom-red.log`                                                                                       |
| N12   | 1 jsdom failure; the rendered fault props contained `alice@example.com`.                                                                                | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N12-jsdom-red.log`                                                                                      |
| N15   | 2 jsdom failures; one refusal was rendered and logged twice.                                                                                            | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N15-jsdom-red.log`                                                                                      |
| N10   | 1 jsdom failure; a failed retirement left 1 rendered tree instead of 2.                                                                                 | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N10-jsdom-red.log`                                                                                      |
| N13   | 1 jsdom failure; the fatal page disclosed no occurrence reference.                                                                                      | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N13-jsdom-red.log`                                                                                      |
| N19   | 1 jsdom failure; startup-only wording omitted `Anything already saved is on the server`.                                                                | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N19-jsdom-red.log`                                                                                      |
| N20   | 2 jsdom failures; the losing bootstrap rejected with `the slot is empty` instead of resolving without drawing.                                          | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N20-jsdom-red.log`                                                                                      |
| N21   | 1 jsdom failure; mount statuses were `['live', 'fatal']` instead of `['live']`.                                                                         | `050-7-b-application-runtime-preferences.slice-6.20260922T071941Z/N21-jsdom-red.log`                                                                                      |

### Planner-only verification rows

These rows were not run in slice 7. Values explicitly supplied by the planner are recorded as
observed; the other final-tree checks remain pending planner verification.

| Planner-only check                                         | Status                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole UTC jsdom tier                                       | Pending planner verification for this hand-over; the packet rehearsal recorded 130 files and 2,950 tests passed.                               |
| Pacific/Auckland zoned tier                                | Pending planner verification; the packet rehearsal recorded 2 files and 3 tests passed.                                                        |
| `wbs-fe-01:build`                                          | Pending final planner verification; slice 6's executor build passed with 991 modules transformed.                                              |
| Whole `tool-devsync:test` target with owned paths staged   | Pending planner verification because it requires Git writes and tracked files; the packet rehearsal recorded 366 passing tests and 0 failures. |
| Focused Chromium fatal-page case                           | Planner-only, observed after slice 4: 1 passed with `E2E_PORT_SHIFT=3000`.                                                                     |
| Chromium fatal-page case with N12                          | Pending planner replay; the packet rehearsal recorded the page exposing the injected address and the case failing.                             |
| Existing Chromium dark-mode, chart-detail and header specs | Pending planner verification; the packet rehearsal recorded 25 passing tests.                                                                  |
| `twilight-burokrat:test`                                   | Not run: this packet adds no Burokrat source or rule.                                                                                          |
| Commits with hooks enabled                                 | Planner-only: the six earlier slices are committed; this slice is ready for planner review and commit.                                         |
| `bin/h2puni-gate.sh <sha>`                                 | Not run in the executor environment; pending planner verification on the host.                                                                 |

- OpenSpec validation after ticking task 2 and adding this hand-over: exit 0; 114
  items passed and 0 failed, equal to V0; `adopt-frontend-lifetimes` was valid with
  no issues (`slice7-openspec-validation.HDil5W.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on `tasks.md` and this verification
  record: exit 0 (`slice7-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on all 24 packet-owned paths:
  exit 0; all matched files used Prettier code style
  (`slice7-prettier-check.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran
  the target (`slice7-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the
  target (`slice7-lint.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0
  (`slice7-format-check.log`).
- Cumulative scoped diff from slice 1's base
  `2786c893438449dcd295b992067fa94622ead964`: exit 0; exactly the 24
  packet-owned paths (`slice7-cumulative-diff.log`).
- The whole `wbs-fe-01:test:unit`, `wbs-fe-01:test`, and `tool-devsync:test` targets,
  the whole jsdom and zoned tiers, the remaining Chromium checks, and the host gate
  remain pending planner verification under the executor sandbox contract.

## Packet 050.7c, slice 1 — application services context

- Attempt `050-7-c-application-context.1.20260922T131854Z` started at
  `cb5d44453bf5242bc34808330854c756dca6fd3a`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 656 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 12 files
  and 68 tests passed.
- The compiling skeleton failed as prescribed: exit 1, 2 tests passed and 10
  failed. After implementing only the selector, exit 1, 3 passed and 9 hook
  tests failed on `Error: not implemented`. After implementing the hook, exit 0,
  12 tests passed.
- Final focused context suite: exit 0, 1 file and 12 tests passed. Final owned
  runtime/preferences paths: exit 0, 13 files and 80 tests passed, the required
  +1 file/+12 tests delta. Final sandbox unit comparison: exit 0, unchanged at
  46 files and 656 tests.
- Forced TypeScript build: exit 0. `wbs-fe-01:lint --skip-nx-cache`: exit 0;
  Nx successfully ran the target. `wbs-fe-01:build`: exit 0; 991 modules were
  transformed and Nx successfully ran the target. Repository format check:
  exit 0.
- Strict OpenSpec validation: exit 0; the strict `jq` predicate accepted one
  object with 114 items passed and 0 failed.

### Negative-proof observations

Each mutation compiled, its patch and failing output are stored under this
attempt's `evidence/` directory, and the source was restored byte-for-byte with
`cmp` before the 12-test suite was rerun green.

| Fault                                                     | Observed failure                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permanently cache the initial hook snapshot               | Exit 1, 4 failed and 8 passed. The pending-disposal and failed-retirement cases received `live` instead of `withdrawn`; the generated property received `true` where slot truth was `false`. The packet rehearsal had reported five failures, but the named facts failed in this attempt. |
| Make the selector retain its last live state              | Exit 1, 6 failed and 6 passed. The selector's retirement case and the generated property failed; the property received `true` where slot truth was `false`.                                                                                                                               |
| Re-serve the cached live state while retiring             | Exit 1, 2 failed and 10 passed. Only the pending-disposal example and generated property failed; the property received `true` where slot truth was `false`.                                                                                                                               |
| Replace the missing-provider throw with `applicationSlot` | Exit 1, 1 failed and 11 passed. `throws when read below no provider` received `null` instead of the required message. The adjacent production `Proof:` comment records this observation with the actual date, 2026-09-22.                                                                 |

- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets, the whole jsdom and zoned tiers, Chromium, and the host gate remain
  pending planner verification under the executor sandbox contract.

## Packet 050.7c, slice 2 — bootstrap context wiring

- Attempt `050-7-c-application-context.2.20260922T134900Z` started at
  `18a6a4d43bbea2a7431c59cc827a758f5f7c9fa7`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 656 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 13 files
  and 80 tests passed.
- Adding only the required `app` dependency and production default made the
  forced TypeScript build exit 2 with eight `TS2741` diagnostics in the four
  prescribed caller files. Adding `app` at those eight call sites and drawing
  `dependencies.app` restored the build to exit 0; the three bootstrap suites
  remained at 3 files and 7 tests passed.
- The production-path probe then failed before the provider existed: exit 1,
  1 failed and 5 passed, with
  `useApplicationServicesState must be read below ApplicationServicesProvider`.
  Wrapping the drawn tree in `ApplicationServicesProvider` over the injected
  slot made the three bootstrap suites pass: 3 files and 8 tests.
- Final focused bootstrap suites: exit 0, 3 files and 8 tests passed. Final
  owned runtime/preferences paths: exit 0, 13 files and 81 tests passed, the
  required +0 file/+1 test delta. Final sandbox unit comparison: exit 0,
  unchanged at 46 files and 656 tests.
- Forced TypeScript build: exit 0. `wbs-fe-01:lint --skip-nx-cache`: exit 0;
  Nx successfully ran the target. `wbs-fe-01:build`: exit 0; Nx accepted the
  cached build output, which records 992 transformed modules.
- Owned-path Prettier writes: exit 0. Repository format check: exit 0.
- Strict OpenSpec validation: exit 0; the strict `jq` predicate accepted one
  object with 114 items passed and 0 failed.

### Negative-proof observations

Each mutation compiled, its patch and failing output are stored under this
attempt's `evidence/` directory, and the source was restored byte-for-byte with
`cmp` before the six-test file was rerun green.

| Fault                                                                   | Observed failure                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove `ApplicationServicesProvider` and draw the substituted tree bare | Exit 1, 1 failed and 5 passed. The production-path probe threw `useApplicationServicesState must be read below ApplicationServicesProvider`.                                       |
| Pass `applicationSlot` instead of the injected slot                     | Exit 1, 1 failed and 5 passed. The production-path probe threw `probe never saw a live state`, because it observed the untouched singleton rather than the bootstrap's local slot. |

- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets, the whole jsdom and zoned tiers, Chromium, and the host gate remain
  pending planner verification under the executor sandbox contract.

## Packet 050.7c, slice 3 — task 4 hand-over

- Attempt `050-7-c-application-context.3.20260922T142656Z` started at
  `d31085fc8bbac989bf3b405a02eade53a5b7c416`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 656 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 13 files
  and 81 tests passed.
- Task 4 is complete. Task 3 remains open: the five delivery call sites still
  read from `modules/preferences/composition.ts`, and the preferences module's
  wiki index remains task 12's work.
- This slice changes no code path and adds no negative proof. The context and
  bootstrap proof observations are recorded in packet 050.7c's slice 1 and
  slice 2 sections above.

### Residual limits handed to 050-7-d

These are required outcomes, not a mandated design. The packet's section 4
records two attempted mechanisms as withdrawn failures.

| Limit                                                                                                               | Observed behavior                                                                                                                                                                                                                                                | Required outcome                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A mounted consumer lags the slot until React processes the slot's notification.                                     | Before retirement the hook was `live`; immediately after unflushed retirement the slot was `retiring` while the hook remained `live`; after the notification, with disposal still held open, the hook was `withdrawn`; after settlement it remained `withdrawn`. | None: this is React's notification contract, and the context proves convergence independently of disposal.                                    |
| Before that notification is processed, a facade already captured by the mounted consumer can still reach its store. | `read` and `readAndDrop` returned `"light"` while the slot was already `retiring`; `readAndDrop` left the accepted bytes unchanged.                                                                                                                              | 050-7-d must make reads and writes through a withdrawn runtime's facade refuse once withdrawal has been accepted. The mechanism remains open. |
| A validator retires the runtime from inside `isValid` and accepts the claimed value.                                | `read` and `readAndDrop` returned `"light"` while the slot was `retiring`, and the accepted bytes remained `{"wbs.theme":"\"light\""}`.                                                                                                                          | 050-7-d must ensure that such a validator cannot still have its return value trusted. The mechanism remains open.                             |

### Slice verification

- Prettier write on `tasks.md` and this verification record: exit 0; `tasks.md`
  was unchanged and Prettier formatted this record (`slice3-prettier-write.log`).
- Strict OpenSpec validation: exit 0; the strict `jq` predicate accepted one
  object with 114 items passed and 0 failed; `adopt-frontend-lifetimes` was valid
  with no issues (`openspec-validation.*.json`).
- Forced TypeScript build: exit 0 with no diagnostics (`slice3-tsc.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0; Nx
  executed the target in 43.0 seconds with no diagnostics (`slice3-lint.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx accepted the cached
  build output (`slice3-build.log`).
- `NX_DAEMON=false bunx nx format:check --all`: exit 0
  (`slice3-format.log`).
- Ending owned runtime/preferences paths: exit 0, 13 files and 81 tests passed,
  unchanged from the slice's baseline (`slice3-owned-final.log`).
- Final inventory and scoped diff audit: exit 0; only `tasks.md` and this
  verification record were modified, and `git diff --check` reported no errors.
- The whole `tool-devsync:test`, the whole UTC jsdom tier,
  `wbs-fe-01:test:unit`, `wbs-fe-01:test`, the zoned tier, Chromium, and the host
  gate remain pending planner verification under the executor sandbox contract.

## Packet 050.7d, slice 1 — withdrawal design record

- Attempt `050-7-d-withdrawal-and-page-lifecycle.1.20260922T180759Z` started at
  `57de05bf0c4b5714b7ac73b2d66c38e9ebb50d87`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 656 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 13 files
  and 81 tests passed.
- Strict OpenSpec baseline and post-edit validation: exit 0 each; the strict
  `jq` predicate accepted one object with 114 items passed and 0 failed in both
  runs.
- The withdrawal-design appendix was appended verbatim to
  `050-7-lifetime-slot-design.md`; this slice changes no production or test code.
- `git diff --stat` for `lifetime-slot.ts` and `lifetime-slot.model.test.ts` was
  empty: exit 0.
- Prettier write and check on the design record and this verification record:
  exit 0.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- This documentation-only slice adds no safety check and requires no negative
  proof.

## Packet 050.7d, slice 2 — withdrawal refusal

- Attempt `050-7-d-withdrawal-and-page-lifecycle.2.20260922T182029Z` started at
  `f5026059bb9f408ad4243c943ae27ebd40345c7b`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 656 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 13 files
  and 81 tests passed. Strict OpenSpec baseline: exit 0; the strict `jq`
  predicate accepted one object with 114 items passed and 0 failed.
- All four test/fixture edits were applied before production code. Against the
  unchanged production tree the combined run exited 1: resource 12 failed and
  10 passed, application runtime 4 failed and 10 passed, the model 2 failed and
  0 passed, and the module fixture 8 passed; combined 18 failed and 28 passed.
- After the four production edits, the owned paths passed 13 files and 99
  tests; the sandbox node tier passed 46 files and 674 tests; the forced
  TypeScript build and lint target exited 0. Lint required no autofix in this
  attempt.

### Negative-proof observations

Every fault below typechecked with exit 0, was saved as a patch and failing log
under this attempt's `evidence/` directory, then was restored byte-for-byte with
`cmp` before its focused test was rerun green.

| Fault                                           | Observed failure                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invert `ensureLive`                             | 27 failed and 17 passed across the resource, module and runtime files.                                                                                                                    |
| Consult `isLive` without throwing               | Resource 12/22 and runtime 4/14 failed; module stayed 8/8 green.                                                                                                                          |
| Remove the shared write pre-check               | Only `a write refuses, and never reaches the store` failed; 21 passed.                                                                                                                    |
| Remove the shared forget pre-check              | Only `a forget refuses, and never reaches the store` failed; 21 passed.                                                                                                                   |
| Remove the JSON read pre-check                  | Both JSON pre-check examples failed; 20 passed.                                                                                                                                           |
| Remove the JSON refusal post-check              | The JSON refusal example and property failed; counterexample `["refuse","read",true]`; 20 passed.                                                                                         |
| Remove the JSON acceptance post-check           | The JSON acceptance example and property failed; counterexample `["accept","read",true]`; 20 passed.                                                                                      |
| Remove the post-serialization check             | Only `a value whose toJSON withdraws the runtime is never written` failed; 21 passed.                                                                                                     |
| Remove the bare-text read pre-check             | Only the bare-text pre-check example failed; 21 passed.                                                                                                                                   |
| Remove the bare-text refusal post-check         | Only the bare-text refusal example failed; 21 passed.                                                                                                                                     |
| Remove the bare-text acceptance post-check      | Only the bare-text acceptance example failed; 21 passed.                                                                                                                                  |
| Remove the unchecked read pre-check             | Only the unchecked-read pre-check example failed; 21 passed.                                                                                                                              |
| Move the JSON pre-check after `read`            | Both JSON recording assertions failed: received `['wbs.demo', 'wbs.demo']` and `['wbs.demo']` instead of `[]`; 20 passed.                                                                 |
| Move the bare-text pre-check after `read`       | The recording assertion received `['wbs.demo.section']` instead of `[]`; 21 passed.                                                                                                       |
| Move the unchecked pre-check after `read`       | The recording assertion received `['wbs.demo.id']` instead of `[]`; 21 passed.                                                                                                            |
| Resolve `isLive` before `preferencesStore`      | The module's missing-store example received missing dependency `isLive` instead of the labelled missing browser store; 1 failed and 7 passed.                                             |
| Disable enforcement against the real-slot model | The property failed after 27 runs because `r2` was not live but its read did not throw; the deterministic example received `REVOKED` instead of `WITHDRAWN`; 2 failed.                    |
| Make the production predicate always true       | The named singleton example received `localStorage is not defined` in the node tier and no exception in the DOM-bearing configuration; each run executed one failing test and skipped 13. |

All seventeen distinct mutation sites produced the eighteen observations above;
the disabled-enforcement site is the one exercised twice, once against the
resource/runtime examples and once against the real-slot model.

### Slice verification

- Final owned runtime/preferences run: exit 0, 13 files and 99 tests passed,
  eighteen more tests than the slice's own baseline and no files added.
- Final sandbox node run: exit 0, 46 files and 674 tests passed, eighteen more
  tests than the slice's own baseline and no files added. Its first final run
  caught a literal browser-global name in a newly added proof comment: the tier
  partition reported 2 failed and 672 passed. Replacing that prose with the
  packet's global-free wording restored 46/46 files and 674/674 tests.
- `preferences.resource.test.ts`: exit 0, 22 tests passed.
- Forced TypeScript build: exit 0 with no diagnostics.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0;
  Nx successfully ran the lint target with no diagnostics.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx successfully ran
  the build target.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- Strict OpenSpec validation: exit 0; the strict `jq` predicate accepted one
  object with 114 items passed and 0 failed, unchanged from step 0.
- `git diff --stat apps/wbs/fe-01/src/runtime/lifetime-slot.ts` was empty, and
  `git diff --check` reported no errors.
- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets, the whole zoned tier, Chromium, and the host gate remain pending
  planner verification under the executor sandbox contract.

## Packet 050.7d, slice 3 — hand-over

- Attempt `050-7-d-withdrawal-and-page-lifecycle.3.20260922T190652Z` started at
  `8e6b6495f8de442fc957a3a1196bfacc833b46ca`; its recorded starting inventory
  was empty.
- Step-0 sandbox unit baseline: exit 0, 46 files and 674 tests passed. Forced
  TypeScript build: exit 0. Owned runtime/preferences baseline: exit 0, 13 files
  and 99 tests passed. Strict OpenSpec baseline: exit 0; the strict `jq`
  predicate accepted one object with 114 items passed and 0 failed.
- Task 4's follow-up note now records that 050-7-d part 1 closed the two required
  withdrawal outcomes through `preferences.resource.ts`'s `ensureLive`, fed by
  the existing lifetime slot's synchronous snapshot. The page-lifecycle trigger
  remains task 5 and packet 050-7-e's work.
- This documentation-only slice adds no safety check and requires no new
  negative proof. Its evidence is the already-committed slice 1 design record
  and slice 2 implementation, tests, and eighteen negative-proof observations
  above.

### Slice verification

- Prettier write on `tasks.md` and this verification record: exit 0; both files
  were already formatted.
- Strict OpenSpec validation: exit 0; the strict `jq` predicate accepted one
  object with 114 items passed and 0 failed, unchanged from step 0.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0; Nx
  successfully ran the uncached lint target with no diagnostics.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx accepted the local
  cache entry and reported the build target successful.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets and the host gate remain pending planner verification under the
  executor sandbox contract.

## Packet 050.7e, slice 1 — page-lifecycle production wiring and examples

- Attempt `050-7-e-page-lifecycle.1.20260923T055822Z` started at
  `c9384a8cd21e2370126f1e9e8cdd3535b1d36ade`; its recorded starting inventory
  was empty.
- Pre-edit owned runtime/preferences baseline: exit 0, 13 files and 99 tests
  passed. The sandbox node subset passed 46 files and 674 tests. Strict OpenSpec
  validation passed its exact predicate with one report, 114 items passed and 0
  failed.
- Tests and caller compatibility fields landed before production code. Against
  the unchanged bootstrap, `application-bootstrap.test.tsx` exited 1 with 11
  failed and 6 passed; the first failure expected the slot to be `empty` after
  `pagehide` but received `live`.
- After production wiring, the four focused files passed 20 tests. The owned
  runtime/preferences path passed 13 files and 110 tests, exactly 11 more than
  the slice baseline. The sandbox subset remained 46 files and 674 tests. The
  forced TypeScript build and uncached lint target exited 0.

### Negative-proof observations

Every fault below typechecked with exit 0, was saved as a patch and failing log
under this attempt's `evidence/` directory, then was restored byte-for-byte with
`cmp` before its named test was rerun green.

| Fault                                                              | Observed failure                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Drop root invalidation from `pagehide`                             | The named assertion received 0 unmounts instead of 1; additional root-invalidation cases failed too.                   |
| Drop retirement initiation from `pagehide`                         | The named assertion received slot status `live` instead of `empty`; 11 tests failed and 6 passed.                      |
| Treat every `pageshow` as persisted                                | `a non-persisted pageshow does not rebuild` failed; 1 failed and 16 passed.                                            |
| Drop controlled supersession handling                              | `draws nothing at all when a newer request wins the slot` failed because the slot was `empty`; 1 failed and 16 passed. |
| Drop the slot subscription                                         | `shows the fatal page when a retirement fails, without republishing anything` failed; 1 failed and 16 passed.          |
| Drop console-report deduplication                                  | `says nothing raw about a refused start` received 2 reports instead of 1; 5 failed and 12 passed.                      |
| Drop fatal-draw deduplication                                      | The first-runtime refusal rendered 2 trees instead of 1; 3 failed and 14 passed.                                       |
| Keep `drawnFault` across root invalidation                         | The already-fatal hide/restore case rendered 2 trees instead of 3; 1 failed and 16 passed.                             |
| Collapse reported and drawn fault state                            | The already-fatal hide/restore case reported the same fault twice; 1 failed and 16 passed.                             |
| Mount a root on every draw                                         | The retirement-failure case mounted at `live` and `fatal` instead of only `live`; 1 failed and 16 passed.              |
| Mount the root eagerly                                             | The first root was mounted while the slot was `empty` instead of `live`; 7 failed and 10 passed.                       |
| Swallow an unexpected non-fatal retirement refusal                 | The retained refusal test observed 0 surfaced rejections instead of 1.                                                 |
| Replace DI Bag close with a same-type rejection that skips cleanup | `the other owned disposer never ran` received false instead of true.                                                   |

### Slice verification

- Strict OpenSpec validation after implementation: exit 0; one report, 114
  items passed and 0 failed, unchanged from the slice baseline.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx successfully ran
  the build target.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0; Nx
  successfully ran the uncached lint target without an autofix round.
- Prettier write over the six slice-owned files: exit 0; five source/test files
  were already formatted and this verification record was formatted.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` and its model test remain
  unchanged.
- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets and the host gate remain pending planner verification under the
  executor sandbox contract.

## Packet 050.7e, slice 2 — generated page-lifecycle interleavings

- Attempt `050-7-e-page-lifecycle.2.20260923T063548Z` started at
  `3719f864`; its recorded starting inventory was empty.
- Pre-edit owned runtime/preferences baseline: exit 0, 13 files and 110 tests
  passed. The sandbox node subset passed 46 files and 674 tests. Strict
  OpenSpec validation passed its exact predicate with one report, 114 items
  passed and 0 failed.
- `application-bootstrap.model.test.tsx` now generates `pagehide`, persisted
  and non-persisted `pageshow`, and settling, rejecting, and never-settling
  disposal outcomes over 300 pinned runs. Its four coverage counters were all
  greater than zero; the focused property passed.
- The model plus the production example file passed 18 tests. The owned
  runtime/preferences path remained 13 files and 110 tests, and the sandbox
  subset remained 46 files and 674 tests, both exactly matching this slice's
  own baselines. The forced TypeScript build and uncached lint target exited
  0; lint required no autofix round.

### Negative-proof observations

Every fault below typechecked with exit 0, was saved as a patch and failing log
under this attempt's `evidence/` directory, then was restored byte-for-byte
with `cmp` before its focused model test reran green.

| Fault                                      | Observed failure                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop the post-`replace` live-status fence  | The property failed after 5 tests, seed `20260924`, shrunk 4 times: `the app was drawn while the slot was retiring`; counterexample ended with non-persisted `pageshow` behind listener retirement. |
| Do not register the `pagehide` listener    | The property failed after 175 tests, seed `20260924`, with no shrink: `a runtime live before a pagehide trigger was still the one live at the end`.                                                 |
| Let `pageshow` bypass the lifetime slot    | The property failed after 3 tests, seed `20260924`, shrunk 6 times: `the app was drawn while the slot was empty`.                                                                                   |
| Also render the app from `attempt`'s catch | The property failed after 87 tests, seed `20260924`, shrunk 4 times: `the app was drawn while the slot was fatal`.                                                                                  |

The four adjacent production `Proof:` comments record only these observed
faults.

### Slice verification

- Strict OpenSpec validation after implementation: exit 0; one report, 114
  items passed and 0 failed, unchanged from the slice baseline.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx successfully ran
  the build target, transforming 993 modules.
- Prettier write over the three slice-owned files: exit 0; the two source/test
  files were already formatted and this verification record was formatted.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- The whole `tool-devsync:test`, `wbs-fe-01:test:unit`, and `wbs-fe-01:test`
  targets and the host gate remain pending planner verification under the
  executor sandbox contract.

## Packet 050.7e, slice 3 — bounded Chromium application lifecycle and hand-over

- Attempt `050-7-e-page-lifecycle.3.20260923T070723Z` started at
  `ef83ebf5c3bd868b88db5c457d0cecaa023cfc89`; its recorded starting inventory
  was empty.
- The pre-edit sandbox node subset passed 46 files and 674 tests. Strict
  OpenSpec validation passed its exact predicate with one report, 114 items
  passed and 0 failed.
- The three `chromium-regular` configuration cases landed before the config
  change. Against the unchanged config, the focused run exited 1 with two
  failures and one pass: the opt-in project was absent and the default project
  did not exclude the bfcache spec. Vitest 5 also reported the file's other 11
  cases as skipped by the filter.
- The opt-in `chromium-regular` project now selects only the bfcache spec under
  the regular Chromium channel, while the default project excludes that spec.
  The browser probe drives the real application bootstrap and records both
  acquisition count and service usability across a persisted restoration.
- Task 5 remains unchecked: page hide and persisted restoration are closed by
  this packet, while hot-reload disposal is handed to 050-7-e2 with the state-
  machine requirements in the packet's sections 1 and 11.

### Negative-proof observations

Every fault below was saved as a patch and failing log under this attempt's
`evidence/` directory, then restored byte-for-byte with `cmp` before its named
test reran green.

| Fault                                           | Observed failure                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Make the regular Chromium project unconditional | The default-gate case received 2 projects instead of the required 1. |
| Remove the default project's bfcache exclusion  | The exclusion assertion received `false` instead of `true`.          |
| Corrupt the regular project's test match        | The bfcache-spec match assertion received `false` instead of `true`. |
| Remove the regular Chromium channel             | The channel assertion received `undefined` instead of `chromium`.    |

The four adjacent configuration-test `Proof:` comments record only these
observed faults.

### Slice verification

- Forced TypeScript build: exit 0 with no diagnostics.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`: exit 0; Nx
  successfully ran the uncached lint target without an autofix round.
- The focused `chromium-regular` configuration block passed all 3 selected
  tests; Vitest 5 reported the file's other 11 tests as skipped by the filter.
- Strict OpenSpec validation after implementation: exit 0; one report, 114
  items passed and 0 failed, unchanged from the slice baseline.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0; Nx successfully ran
  the build target.
- The post-edit sandbox node subset passed 46 files and 674 tests, exactly
  matching this slice's own baseline.
- Prettier write over the six slice-owned files: exit 0; the four source/test
  files and `tasks.md` were already formatted, and this verification record was
  formatted. `NX_DAEMON=false bunx nx format:check --all`: exit 0.
- `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` and its model test remain
  unchanged.
- The whole `playwright-config.test.ts`, `tool-devsync:test`,
  `wbs-fe-01:test:unit`, `wbs-fe-01:test`, the opt-in Chromium case, and the
  host gate remain pending planner verification under the executor sandbox
  contract.

## Packet 050.7f1, slice 1 — typed preference-store lifecycle refusals

- Attempt `050-7-f1-theme-hook-model.1.20260923T192617Z` started at
  `474be8df0826bdd36ce4003adb1034b880d3fa6a` with an empty working tree and
  fast-check 4.9.0.
- Step-0 focused baseline: exit 0, 4 files and 59 tests passed. The theme-only
  baseline passed 1 file and 17 tests; the preferences baseline passed 6 files
  and 39 tests; the sandbox node baseline passed 46 files and 674 tests.
- Strict OpenSpec baseline: exit 0; the strict predicate accepted one report
  with 114 items passed and 0 failed. After the classification requirement was
  added first, the same strict check remained at 114 passed and 0 failed.
- With the new class, predicate and classification tests present but both
  production throws still plain `Error`s, the preferences red checkpoint exited
  1: 2 files failed and 4 passed; exactly the 2 new tests failed while 39 passed,
  both on `expected false to be true`. Typecheck on that red tree exited 0.
- After both refusal sites used `PreferenceStoreLifecycleError`, the preferences
  suite exited 0 with 6 files and 41 tests passed, and the sandbox node suite
  exited 0 with 46 files and 675 tests passed. Typecheck and lint both exited 0.

### Negative-proof observations

Each fault was saved as a patch and failing log under this attempt's
`evidence/` directory, restored byte-for-byte with `cmp`, and its named test
rerun green before the adjacent production `Proof:` comment was added.

| Fault                                                                      | Named test and observed failure                                                                                                                                                               | Evidence                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the withdrawn `PreferenceStoreLifecycleError` with a plain `Error` | `a withdrawn refusal is a lifecycle refusal of kind withdrawn` exited 1 on `AssertionError: expected false to be true`; 1 failed and 22 skipped, then 1 passed and 22 skipped after restore   | `withdrawn-lifecycle-classification.patch`, `withdrawn-lifecycle-classification.log`, `withdrawn-lifecycle-classification-restored.log` |
| Replace the revoked `PreferenceStoreLifecycleError` with a plain `Error`   | `a revoked store refuses with a lifecycle refusal of kind revoked` exited 1 on `AssertionError: expected false to be true`; 1 failed and 3 skipped, then 1 passed and 3 skipped after restore | `revoked-lifecycle-classification.patch`, `revoked-lifecycle-classification.log`, `revoked-lifecycle-classification-restored.log`       |

### Slice verification

- Owned-file Prettier write and check exited 0. The repository-wide
  `NX_DAEMON=false bunx nx format:check --all` exited 0.
- The final preferences suite exited 0 with 6 files and 41 tests passed; the
  final sandbox node suite exited 0 with 46 files and 675 tests passed.
- Final typecheck and lint both exited 0.
- Final strict OpenSpec validation exited 0; the exact predicate accepted one
  report with 114 items passed and 0 failed, unchanged from step 0.

### Pending planner verification

- `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
  `wbs-fe-01:e2e`, `tool-devsync:test`, and the host gate were not run in the
  executor sandbox and remain pending planner verification.

## Packet 050.7f1, slice 2 — runtime-owned theme preferences and model

- Attempt `050-7-f1-theme-hook-model.2.20260923T195454Z` started at
  `61cb28144ccfdc4bb81566bca88e9bc29088d223` with an empty working tree and
  fast-check 4.9.0.
- Step-0 focused baseline: exit 0, 4 files and 59 tests passed. The theme-only
  baseline passed 1 file and 17 tests; preferences passed 6 files and 41 tests;
  the sandbox node baseline passed 46 files and 675 tests.
- Strict OpenSpec baseline and the check after adding the delivery-degradation
  requirement each exited 0 with one report, 114 items passed and 0 failed.
- With the model and migrated call-site tests present but `theme.ts` unchanged,
  the red typecheck exited 1 with 12 errors in the named 3 files. The red focused
  run exited 1 with 2 files failed and 3 passed, and 4 tests failed while 56
  passed. After the hook change, typecheck exited 0 and all 5 files and 60 tests
  passed.
- Lint exited 0 without an autofix round. Preferences remained at 6 files and
  41 tests; the sandbox node suite remained at 46 files and 675 tests.

### Negative-proof observations

Every fault used seed 20260925 and 300 runs. It was saved as the named patch and
log under this attempt's `evidence/` directory, restored byte-for-byte with
`cmp`, and the model test reran green before the next fault.

| Fault                                                  | Run, shrunk counterexample, and observed failure                                                                                                                     | Evidence                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Replace the theme write with a read                    | Run 14, shrunk 5 times to `chooseWhileAcquiring(A, system), choose(system)` (`AFAAAK:q`): stored bytes in A were `undefined` instead of `"system"`.                  | `s2-a-persistence-removed.patch`, `s2-a-persistence-removed.log`, `s2-a-restored-green.log`     |
| Disable the superseded-chooser guard                   | Run 14, shrunk 3 times to `retainChooser, chooseWhileAcquiring(A, system), useRetainedChooser(system)` (`ACDI:K`): `persists` was false instead of true.             | `s2-b-superseded-guard.patch`, `s2-b-superseded-guard.log`, `s2-b-restored-green.log`           |
| Swallow the chooser's ordinary failure                 | Run 42, shrunk once to `replace(denied, settles), choose(system)` (`AAACB:V`): expected the retained `write denied` error but received null.                         | `s2-c-chooser-rethrow.patch`, `s2-c-chooser-rethrow.log`, `s2-c-restored-green.log`             |
| Remove the resync effect's lifecycle recovery          | Run 1, shrunk twice to `replaceThenRetireFromLayoutEffect(A)` (`BAABDB:q`): the withdrawn `PreferenceStoreLifecycleError` escaped.                                   | `s2-d-effect-catch.patch`, `s2-d-effect-catch.log`, `s2-d-restored-green.log`                   |
| Remove the withdrawn-state reset                       | Run 1, shrunk 4 times to `replace(A, settles), retire` (`BAAEAK:q`): `persists` was true instead of false.                                                           | `s2-e-withdrawn-branch.patch`, `s2-e-withdrawn-branch.log`, `s2-e-restored-green.log`           |
| Substitute an ordinary cleanup error for budget expiry | Run 9, shrunk once to `replace(A, never), retire` (`BCAB:K`): the disposal was not the slot's typed budget expiry, and teardown reported the cleanup corruption too. | `s2-f-expiry-classification.patch`, `s2-f-expiry-classification.log`, `s2-f-restored-green.log` |
| Inject an unrelated teardown failure                   | Run 1, shrunk once to the empty command list (`BAAF:K`): teardown reported the unverified `unrelated teardown failure`.                                              | `s2-g-teardown-accounting.patch`, `s2-g-teardown-accounting.log`, `s2-g-restored-green.log`     |

### Slice verification

- Final focused suite: exit 0, 5 files and 60 tests passed. Final preferences
  suite: exit 0, 6 files and 41 tests passed. Final sandbox node suite: exit 0,
  46 files and 675 tests passed.
- Final typecheck and lint exited 0; lint required no autofix round.
- Owned-file Prettier write and check exited 0. Repository-wide
  `NX_DAEMON=false bunx nx format:check --all` exited 0.
- Final strict OpenSpec validation exited 0; the exact predicate accepted one
  report with 114 items passed and 0 failed, unchanged from step 0.

### Pending planner verification

- `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
  `wbs-fe-01:e2e`, `tool-devsync:test`, and the host gate were not run in the
  executor sandbox and remain pending planner verification.

## Packet 050.7f1, slice 3 — named theme transitions and hand-over

- Attempt `050-7-f1-theme-hook-model.3.20260923T201611Z` started at
  `61473d5b873ea701ca9ddd570c6714065648101a` with an empty working-tree status and
  fast-check 4.9.0.
- Step-0 focused baseline (`theme.test.tsx`, `index-bootstrap.test.ts`, `app.test.tsx`,
  `account-menu.test.tsx`): exit 0, 4 files and 59 tests passed. The theme suite alone
  passed 1 file and 17 tests; preferences passed 6 files and 41 tests; the sandbox node
  suite passed 46 files and 675 tests.
- Strict OpenSpec baseline exited 0 with one report: 114 items, 114 passed, 0 failed.
- With the ten named examples added, the theme suite exited 0 with 27 tests passed
  (17 + 10). Each of the ten `-t` titles, read byte for byte from the packet, selected
  exactly one test before any fault was injected (`s3-filter-check.log`).
- Typecheck exited 0 and lint exited 0 without an autofix round.

### Negative-proof observations

Each fault was injected into `apps/wbs/fe-01/src/lib/theme.ts` alone, saved as
`s3-proof-NN.patch` with its failing output as `s3-proof-NN.log` under this attempt's
`evidence/` directory, restored from the saved passing bytes and verified with `cmp`,
and its named test reran green (`s3-proof-NN.green.log`) before the next fault. Every
failing run reported `Tests 1 failed | 26 skipped (27)` and exit 1.

| #   | Fault                                                  | Observed failure                                                                                |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Lazy initialiser reads the store unguarded             | `TypeError: Cannot read properties of null (reading 'read')`                                    |
| 2   | Resync effect's withdrawn reset deleted                | `AssertionError: expected 'dark' to be 'system'`                                                |
| 3   | Resync effect's live branch sets no state              | `AssertionError: expected 'system' to be 'dark'`                                                |
| 4   | Chooser's whole `try`/`catch` removed                  | `AssertionError: expected [Function] to not throw an error but 'PreferenceStoreLifecycleError…` |
| 5   | Chooser's null guard drops `setChoice(next)`           | `AssertionError: expected 'system' to be 'light'`                                               |
| 6   | Superseded-chooser guard disabled                      | `AssertionError: expected 'dark' to be 'light'`                                                 |
| 7   | Resync effect's whole `try`/`catch` removed            | `AssertionError: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to be null`  |
| 8   | Only the chooser's non-lifecycle rethrow removed       | `AssertionError: expected null to be Error: write denied`                                       |
| 9   | Only the resync effect's non-lifecycle rethrow removed | `AssertionError: expected null to be Error: read denied`                                        |
| 10  | Resync effect reads without dropping                   | `AssertionError: expected '"midnight"' to be undefined`                                         |

### Slice verification

- Final focused suite: exit 0, 4 files and 69 tests passed (59 + 10). Final theme suite:
  exit 0, 27 tests. Model test: exit 0, 1 test. Final preferences suite: exit 0, 6 files
  and 41 tests. Final sandbox node suite: exit 0, 46 files and 675 tests.
- Final typecheck and lint exited 0.
- Owned-file Prettier write and check exited 0 with all five files unchanged.
  Repository-wide `NX_DAEMON=false bunx nx format:check --all` exited 0.
- Final strict OpenSpec validation exited 0 with one report: 114 items passed and 0
  failed, unchanged from the step-0 baseline.

### Pending planner verification

- `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`,
  `tool-devsync:test`, and the host gate were not run in the executor sandbox and remain
  pending planner verification.

## Packet 050.7e2a — document replacement amendment

- Attempt `050-7-e2a-hmr-amendment.1.20260923T212406Z` started at
  `b34ace7cb500cf988bbc849b9179c867b65a8e47` (`base.txt`); its recorded
  starting inventory was empty (`status-before.txt`).
- Pre-edit runtime baseline (`base-runtime.log`): exit 0, 7 files and 71 tests
  passed. The sandbox node subset (`base-sandbox.log`): exit 0, 46 files and
  674 tests. Strict OpenSpec validation passed its exact predicate with one
  report, 114 items passed and 0 failed.
- The packet's six section-7 diffs were extracted and applied with
  `git apply` (working tree only): `extracted=6`, then `all patches applied`.
- Strict OpenSpec validation after the diffs: exit 0; one report, 114 items
  passed and 0 failed, unchanged from the baseline.
- After the diffs (`after-runtime.log`, `after-sandbox.log`): the runtime
  directory passed 7 files and 72 tests, exactly one more than the baseline;
  the sandbox node subset stayed at 46 files and 674 tests. The new test is
  green on unchanged production code by design: it characterises what
  `pagehide` already does.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` and `wbs-fe-01:lint`: exit
  0 both before (`typecheck.log`, `lint.log`) and after the `Proof:` comments
  (`typecheck-final.log`, `lint-final.log`); no autofix round.

### Negative-proof observations

Every fault below was saved as a patch and failing log under this attempt's
`evidence/` directory, run against the new test alone
(`-t 'starts retirement before its pagehide dispatch returns'`: 1 failed, 17
skipped each time), then restored byte-for-byte with `cmp`.

| Fault                                                                                          | Observed failure                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| N1: delete the `pagehide` registration in `application-bootstrap.tsx`                          | `AssertionError: pagehide returned before withdrawing the runtime: expected 'live' to be 'retiring'` |
| N2: `startRetirement();` → `setTimeout(startRetirement, 0);` in `onPageHide`                   | `AssertionError: pagehide returned before withdrawing the runtime: expected 'live' to be 'retiring'` |
| N3: `invalidateRoot();` → `queueMicrotask(invalidateRoot);` in `onPageHide`                    | `AssertionError: pagehide returned before invalidating the root: expected +0 to be 1`                |
| N4: a `setTimeout` wait before `lifetime-slot.ts`'s `transition()` `await disposeWithdrawn();` | `AssertionError: pagehide returned before the disposal began: expected +0 to be 1`                   |
| N5: `if (!isLive())` → `if (false)` in `preferences.resource.ts`'s `ensureLive`                | `AssertionError: expected [Function] to throw an error`                                              |

After the five adjacent `Proof:` comments were added, the new test alone
passed: 1 passed, 17 skipped (`new-test-after-proofs.log`).

### Slice verification

- Task 5 is checked: hot-reload disposal is closed by amendment (Dany,
  2026-09-23) — a development edit to the bootstrap is a document replacement,
  and a gated in-document replacement is not provided.
- The requirement's disjunct "or queued it behind a transition that is already
  running" is stated, not proved: the new test and its scenario cover an idle
  live page only.
- The scenario "An edit to the bootstrap reloads the document" has no automated
  check; it rests on vite.config.ts's React plugin (@vitejs/plugin-react 6.1.1,
  refresh runtime injecting import.meta.hot.accept only into modules that
  define components) injecting no accepting boundary into main.tsx or
  application-bootstrap.tsx, neither of which defines a component, and is kept
  by review.
- Owned-file Prettier and `nx format:check --all`, and the final strict
  OpenSpec validation, run after this entry was written; their results are in
  `prettier-check.log`, `format-check.log` and `openspec-final.*.json`.
- Pending planner verification: the whole `wbs-fe-01:test` target (expected:
  the jsdom tier's baseline plus 1 test, plus 0 files), `wbs-fe-01:test:unit`
  (expected unchanged), `tool-devsync:test` with the seven paths staged, and
  the host gate `bin/h2puni-gate.sh <sha>`.

## Packet 050.7f2, slice 1 — the call-time reader, and the fixture in the twenty-one files

Attempt `050-7-f2-delivery-call-sites.1.20260923T233913Z`, starting hash
`1698ed98bb247062b89e7c156ef8fcada93c1fce`, empty status before any edit
(`status-before.txt`), `fast-check=4.9.0`. Observed on 2026-09-23 (UTC), inside
the executor sandbox; every log named below is in the attempt's evidence
directory.

### Baselines, before any edit

| Check                                           | Result                                   | Log                    |
| ----------------------------------------------- | ---------------------------------------- | ---------------------- |
| preferences suite (`src/modules/preferences`)   | 6 files, 41 tests, `status=0`            | `base-preferences.log` |
| sandbox node suite (the batch README's command) | 46 files, 675 tests, `status=0`          | `base-sandbox.log`     |
| strict OpenSpec validation                      | `{"items":114,"passed":114,"failed":0}`  | `openspec-base.*.json` |
| the twenty adopted default-tier files, serially | 20 files, 1204 tests, `status=0` (318 s) | `s1-base-adopted.log`  |
| zoned config (`TZ=Pacific/Auckland`)            | 2 files, 3 tests, `status=0`             | `s1-base-zoned.log`    |
| `application-services-context.test.tsx`         | 12 tests, `status=0`                     | `s1-base-context.log`  |

### Contract, red and green

- The new requirement applied first; strict OpenSpec validation stayed
  `{"items":114,"passed":114,"failed":0}` (`openspec-s1-contract.*.json`).
- Red, with the four reader examples applied and the context unchanged:
  `wbs-fe-01:typecheck` `status=1` with one diagnostic,
  `application-services-context.test.tsx:17:3 - error TS2724: '"./application-services-context"' has no exported member named 'useApplicationServicesReader'. Did you mean 'useApplicationServicesState'?`
  (`s1-red-typecheck.log`); Vitest `status=1`, `Tests 4 failed | 12 passed (16)`
  — three on `TypeError: useApplicationServicesReader is not a function`, and
  `refuses to read below no provider, naming itself` on
  `AssertionError: expected '(0 , __vite_ssr_import_5__.useApplica…' to be 'useApplicationServicesReader must be …'`
  (`s1-red-vitest.log`).
- Green, with the reader, the fixture and the twenty-one adoptions applied:
  typecheck `status=0`; context 16 tests (12 + 4); adopted 20 files, 1204
  tests (unchanged, 316 s); zoned 2 files, 3 tests (unchanged); lint
  `status=0` (`s1-green-*.log`, `s1-lint.log`).

### Negative-proof observations

Each filter matched exactly one test first (`s1-proof-filters.log`). Every
fault was injected from its fault patch, observed failing, restored from the
saved bytes and compared with `cmp`, then rerun green (`r1`–`r3` `.patch`,
`.log`, `.green.log`; `s1-proof-loop.log`).

| Fault                                                  | Named test                                                                                 | Observed (`Tests 1 failed \| 15 skipped (16)` each)                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| r1: the reader answers the state its render saw        | `answers withdrawn the instant a retirement is accepted, while the render still says live` | `AssertionError: expected { Object (status, remembered) } to deeply equal { status: 'withdrawn' }` |
| r2: the reader is a new function every render          | `keeps its identity across renders of the same provider`                                   | `AssertionError: expected [Function] to be [Function]`                                             |
| r3: below no provider it falls back to the page's slot | `refuses to read below no provider, naming itself`                                         | `AssertionError: expected null to be 'useApplicationServicesReader must be …'`                     |

After the three `Proof:` comments were added: context 16 tests, preferences 6
files and 41 tests, sandbox node suite 46 files and 675 tests, all
`status=0`, unchanged from the baselines (`s1-final-*.log`).

### Slice verification

- Owned-file Prettier, the repository-wide format check and the final strict
  OpenSpec validation run after this entry was written; their results are in
  `s1-prettier-check.log`, `s1-format-check.log` and `openspec-s1-final.*.json`.
- Pending planner verification: `wbs-fe-01:test` (expected: UTC + 4 tests,
  - 0 files; Auckland zoned unchanged), `wbs-fe-01:test:unit` (unchanged),
    `wbs-fe-01:build`, `wbs-fe-01:e2e` (no production path changed in this
    slice), `tool-devsync:test` with the twenty-six paths staged, and the host
    gate `bin/h2puni-gate.sh <sha>`.

## Packet 050.7f2, slice 2 — the settings modal and the project page, read at the moment of use

Attempt `050-7-f2-delivery-call-sites.2.20260923T235846Z`, starting at
`dea3c79391cb6a39e56a1dfb01ea22b0f3465a6f` with an empty status and `fast-check` 4.9.0 (`base.txt`,
`status-before.txt`, `fast-check.txt`). Observed 2026-09-24, in the executor sandbox.

Step 0 baselines: preferences suite 6 files, 41 tests, `status=0` (`base-preferences.log`); sandbox
node suite 46 files, 675 tests, `status=0` (`base-sandbox.log`); strict OpenSpec
`{"items":114,"passed":114,"failed":0}` (`openspec-base.*.json`). Slice baselines, each `status=0`:
`project-settings-modal.test.tsx` 15 tests, `project-page.test.tsx` 67, `app-router.test.tsx` 5
(`s2-base-modal.log`, `s2-base-page.log`, `s2-base-router.log`).

Contract first: the scenario "With no runtime live, the default is shown and reported as not
remembered" applied before any test or code; strict OpenSpec `{"items":114,"passed":114,"failed":0}`
(`openspec-s2-contract.*.json`).

Red, with the two test files applied and the production code unchanged:

- `wbs-fe-01:typecheck` `status=1`, `Found 5 errors in 2 files.` — `project-page.test.tsx:38:23` and
  `:38:42` `TS2305` (`recallLastProject`, `rememberLastProject` not exported);
  `project-settings-modal.test.tsx:427:79` and `:486:73` `TS2554: Expected 1 arguments, but got 2.`;
  `:507:80` `TS2554: Expected 2 arguments, but got 3.` (`s2-red-typecheck.log`).
- Vitest over the two files `status=1`, `Test Files 2 failed (2)`, `Tests 11 failed | 81 passed (92)`
  (`s2-red-vitest.log`): the edited `reads an absent key as the first section` on
  `expected 'teams' to deeply equal { value: 'teams', persists: true }`; modal `opens on the first
section …` on `expected 'priorities' to be null`; `stops remembering …` on
  `expected undefined to be false`; `reopens on a replacement runtime’s own remembered section` on
  `toHaveAttribute("aria-selected", "true")`; `writes a section chosen after a replacement …` on
  `expected undefined to be 'steps'`; `lets a store’s own write failure through …` on
  `expected [] to have a length of 1 but got +0`; page `restores nothing …` on
  `expected 'p2' to be null`; `stops remembering …` and `restores the replacement runtime’s own
project …` on `expected '' to be 'Paint the fence'`; `writes a project chosen after a replacement …`
  on `expected undefined to be 'p2'`; `lets a store’s own write failure through …` on
  `expected [] to have a length of 1 but got +0`.

Green, after `Recalled<T>`, the modal and the page: typecheck `status=0` (`s2-green-typecheck.log`);
the two files 92 tests (82 + 10), `status=0` (`s2-green-vitest.log`); router 5, unchanged
(`s2-green-router.log`); the twenty adopted files, serially, 20 files, 1214 tests, `status=0`
(`s2-green-adopted.log`); `wbs-fe-01:lint` `status=0` (`s2-lint.log`).

Proofs: all twelve filters matched exactly one test (`s2-filters.txt`). Each fault was injected from
its patch, its named test run, the file restored from the saved copy and `cmp`-identical, and the
test rerun green (`s2-faults.log`, `<id>.patch`, `<id>.log`, `<id>.green.log`). Modal faults each
`Tests 1 failed | 19 skipped (20)`, page faults each `Tests 1 failed | 71 skipped (72)`, all `status=1`:

| Id  | Fault                                            | Observed                                                                                                                                      |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| m1  | no runtime, yet the read claims `persists: true` | `expected { value: 'teams', persists: true } to deeply equal { value: 'teams', persists: false }`                                             |
| m2  | no runtime, yet the write answers `true`         | `expected true to be false`                                                                                                                   |
| m3  | `show` uses the runtime read at render           | `toHaveAttribute("aria-selected", "true")`, with `PreferenceStoreLifecycleError: the preferences store was revoked with its runtime` reported |
| m4  | `show` shows the section before writing it       | `toHaveAttribute("aria-selected", "true")` on Teams                                                                                           |
| m5  | `show` swallows the write's failure              | `expected [] to have a length of 1 but got +0`                                                                                                |
| m6  | opening shows the first section without reading  | `toHaveAttribute("aria-selected", "true")` on Priorities                                                                                      |
| p1  | no runtime, yet the read claims `persists: true` | `expected { value: null, persists: true } to deeply equal { value: null, persists: false }`                                                   |
| p2  | no runtime, yet the write answers `true`         | `expected true to be false`                                                                                                                   |
| p3  | the list load reads the runtime once, at mount   | `PreferenceStoreLifecycleError: the preferences store was revoked with its runtime`                                                           |
| p4  | `choose` uses the runtime read at render         | `expected '' to be 'Paint the fence'`, with the revoked refusal reported                                                                      |
| p5  | `choose` selects before writing                  | `expected <button …(3)></button> to be null`                                                                                                  |
| p6  | `choose` swallows the write's failure            | `expected [] to have a length of 1 but got +0`                                                                                                |

The `Proof:` comments were written after all twelve were observed. Afterwards: the two files 92 tests
`status=0` (`s2-final-vitest.log`); preferences 6 files, 41 tests and sandbox 46 files, 675 tests,
both unchanged and `status=0` (`s2-final-preferences.log`, `s2-final-sandbox.log`).

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` (`e2e/project-settings.spec.ts`, `e2e/project-picker.spec.ts`), `tool-devsync:test`
and the host gate `bin/h2puni-gate.sh <sha>`, none of which the sandbox can run.

## Packet 050.7f2, slice 3 — the detail switch, a continuous consumer

Attempt `050-7-f2-delivery-call-sites.3.20260924T001504Z`, starting hash
`e26c8ddddb31b17ce292622e15240086653a2ff6`, clean status, `fast-check` 4.9.0. Evidence basenames are
relative to that attempt's evidence directory. Observed 2026-09-24.

Baselines, all `status=0`: preferences suite 6 files, 41 tests (`base-preferences.log`); sandbox node
suite 46 files, 675 tests (`base-sandbox.log`); `gantt-panel.test.tsx` 242 tests (`s3-base-gantt.log`);
Auckland zoned 2 files, 3 tests (`s3-base-zoned.log`); strict OpenSpec `{"items":114,"passed":114,"failed":0}`.

Red, with `gantt-detail.test.tsx` applied over the unchanged hook: typecheck `status=1`, `Found 9 errors
in the same file`, nine `TS2339: Property 'persists' does not exist on type 'GanttDetail'.`
(`s3-red-typecheck.log`); Vitest `status=1`, `Tests 7 failed (7)` (`s3-red-vitest.log`) — `expected
undefined to be false` (twice), `expected true to be false`, `expected false to be true` (three times)
and `expected null to be Error: write denied`, each on the test section 6 names.

Green, after `gantt-detail.ts`, all `status=0`: typecheck clean (`s3-green-typecheck.log`); the new file
7 tests (`s3-green-vitest.log`); `gantt-panel.test.tsx` 242 (`s3-green-gantt.log`); zoned 2 files, 3 tests
(`s3-green-zoned.log`); the twenty adopted files serially, 20 files, 1214 tests (`s3-green-adopted.log`);
lint `status=0` (`s3-lint.log`).

Proofs, each filter first shown to select exactly one test (`s3-filters.txt`), each fault run as
`Tests 1 failed | 6 skipped (7)`, `status=1`, restored with `cmp` and rerun green (`<id>.patch`,
`<id>.log`, `<id>.green.log`):

| Id  | Fault                                                | Observed                                                                       |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| g1  | `ask` with nothing live reports `persists: true`     | `expected true to be false`                                                    |
| g2  | the resync effect's not-live branch no longer resets | `expected false to be true`                                                    |
| g3  | the resync effect drops keys without adopting        | `expected false to be true`                                                    |
| g4  | the superseded guard deleted                         | `expected false to be true`                                                    |
| g5  | `ask` shows before writing                           | `expected true to be false`                                                    |
| g6  | `ask` swallows the write's failure                   | `expected null to be Error: write denied`                                      |
| g7  | the resync effect reads the render's runtime         | `expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to be null` |
| g8  | a withdrawal counted as a supersession               | `expected true to be false`                                                    |

After the `Proof:` comments, all `status=0`: preferences 6 files, 41 tests; sandbox 46 files, 675 tests
(both unchanged); the new file 7 tests; typecheck and lint clean (`s3-final-*.log`).

Pending planner verification: `wbs-fe-01:test` (expected UTC + 1 file, + 7 tests; zoned unchanged),
`wbs-fe-01:test:unit` (unchanged), `wbs-fe-01:build`, `wbs-fe-01:e2e` (`e2e/gantt-detail.spec.ts`),
`tool-devsync:test`, and the host gate, which was not run.

## Packet 050.7f2, slice 4 — the layout handle, its model test, and the layout's typed results

Attempt `050-7-f2-delivery-call-sites.4.20260924T002854Z`, starting hash
`1e5b5535ce543249c94d25b54cf964d5ddfd7c46`, observed on 2026-09-24. The working tree was clean at the start, and
`fast-check` was 4.9.0. Evidence names are relative to that attempt's evidence directory.

### Baselines (step 0 and step 1)

| Check                                                                      | Result                                  | Evidence                    |
| -------------------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| preferences suite (`src/modules/preferences`)                              | 6 files, 41 tests, status 0             | `base-preferences.log`      |
| sandbox node suite                                                         | 46 files, 675 tests, status 0           | `base-sandbox.log`          |
| layout suites, serial (plan-layout, plan-filter, plan-toolbar, plan-table) | 4 files, 218 tests, status 0            | `s4-base-layout.log`        |
| strict OpenSpec                                                            | `{"items":114,"passed":114,"failed":0}` | `openspec-base.9jLTfd.json` |

### Contract and red checkpoint

- Section 7.14, the layout-handle scenario, was applied first. The strict block then gave `{"items":114,"passed":114,"failed":0}`
  (`openspec-s4-contract.AvHIzh.json`).
- With section 7.15, the model test, applied and `lib/remembered.ts` unchanged, `wbs-fe-01:typecheck` exited with status 1
  and `Found 2 errors in the same file` (`s4-red-typecheck.log`):
  `remembered-layout.model.test.ts:5:27 - error TS2305: Module '"@/lib/remembered"' has no exported member 'RuntimeRemembered'.`
  and `remembered-layout.model.test.ts:627:71 - error TS2554: Expected 2 arguments, but got 3.`
- Vitest on the model test exited with status 1 and `Tests 1 failed (1)` (`s4-red-vitest.log`):
  `Property failed after 2 tests`, seed `20260924`, counterexample
  ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,accessWhileAcquiring(A, write(outline)) /*replayPath="ADB:F"*/]``,
  shrunk 2 times, caused by `write(outline) while acquiring: what the handle answered: expected undefined to deeply equal false`.

### Green checkpoint (after sections 7.16, 7.17 and 7.18)

| Check                            | Result                                                  | Evidence                 |
| -------------------------------- | ------------------------------------------------------- | ------------------------ |
| `wbs-fe-01:typecheck`            | status 0                                                | `s4-green-typecheck.log` |
| model test                       | 1 test passed, status 0                                 | `s4-green-vitest.log`    |
| layout suites, serial            | 4 files, 218 tests (unchanged), status 0                | `s4-green-layout.log`    |
| zoned (Pacific/Auckland)         | 2 files, 3 tests (unchanged), status 0                  | `s4-green-zoned.log`     |
| the twenty adopted files, serial | 20 files, 1214 tests (unchanged from slice 3), status 0 | `s4-green-adopted.log`   |
| `wbs-fe-01:lint`                 | status 0                                                | `s4-lint.log`            |

### Proofs, each observed failing before its comment was written

Every filter first matched exactly one test (`s4-filters.log`). Each fault was injected from the packet's own patch, its test
exited with status 1, the file was restored and `cmp`-identical, and the test reran green. The records are `<id>.patch`,
`<id>.log` and `<id>.green.log`. The model faults ran under fast-check 4.9.0, seed `20260924`, `numRuns: 300`,
`maxCommands: 12`, and each gave `Tests 1 failed (1)`. `⏎` marks the newline fast-check prints.

| Id   | Fault                                                        | Run | Shrunk counterexample                                                                                                                                              | Observed                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ha` | the runtime resolved once, when the handle is built          | 8   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, settles),write(outline) /*replayPath="O:B"*/]``, shrunk 4 times                           | `write(outline): what the handle answered: expected false to deeply equal true`                                                                                                                          |
| `hb` | the last live store kept for when nothing is live            | 13  | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, settles),read,retire,read /*replayPath="CCABH:V"*/]``, shrunk 2 times                     | `read: what the handle answered: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to deeply equal { value: null, persists: false }`                                                     |
| `hc` | a read with nothing live claims `persists: true`             | 2   | ``[schedulerFor()`⏎`,read /*replayPath="CBA:F"*/]``, shrunk 1 time                                                                                                 | `read: what the handle answered: expected { value: null, persists: true } to deeply equal { value: null, persists: false }`                                                                              |
| `hd` | `readAndDrop` replaced by `read`                             | 106 | ``[schedulerFor()`⏎-> [task${1}] promise::dispose B resolved`,tamper(B, 7),accessWhileAcquiring(B, write(outline)),read /*replayPath="AFCF:K"*/]``, shrunk 2 times | `stored bytes in B: expected '7' to be undefined`                                                                                                                                                        |
| `he` | `write` swallows the store's own failure                     | 18  | ``[schedulerFor()`⏎-> [task${1}] promise::dispose denied resolved`,replace(denied, settles),write(outline) /*replayPath="BGB:F"*/]``, shrunk 1 time                | `write(outline): an ordinary storage failure did not propagate unchanged: expected false to be Error: write denied`                                                                                      |
| `hh` | a write with nothing live answers `true`                     | 2   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,accessWhileAcquiring(A, write(outline)) /*replayPath="ADB:F"*/]``, shrunk 2 times                    | `write(outline) while acquiring: what the handle answered: expected true to deeply equal false`                                                                                                          |
| `hf` | the model test's bounded close replaced by an ordinary error | 2   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, never),replace(A, settles) /*replayPath="L:B"*/]``, shrunk 3 times                        | `the property failed and its teardown refused: …`, caused by `replace(A): the disposal did not expire the way the slot's budget expires; it failed some other way: Error: unexpected cleanup corruption` |
| `hg` | the model test's teardown retirement rejects                 | 1   | ``[schedulerFor()`⏎`, /*replayPath=":"*/]``, shrunk 0 times                                                                                                        | `Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure`                                                                                        |
| `fx` | the fixture publishes no runtime                             | —   | —                                                                                                                                                                  | `plan-layout.test.tsx` › `lays a remembered width out over the one it would have resolved`: `expected '68px' to be '240px'`, `Tests 1 failed \| 77 skipped (78)`                                         |

### After the Proof comments

The model test passed with 1 test and status 0 (`s4-final-model.log`). `plan-layout.test.tsx` passed with 78 tests and
status 0 (`s4-final-plan-layout.log`). The preferences suite gave 6 files and 41 tests, and the sandbox node suite gave
46 files and 675 tests, both unchanged from step 0 (`s4-final-preferences.log`, `s4-final-sandbox.log`).
`wbs-fe-01:typecheck` and `wbs-fe-01:lint` both gave status 0 (`s4-final-typecheck.log`, `s4-final-lint.log`).

### Pending planner verification

`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e` (`e2e/layout.spec.ts`) and
`tool-devsync:test` are still pending. The host gate was not run.

## Packet 050.7f2, slice 5 — the duplicate deleted, task 3's note, and the closing checks

Attempt `050-7-f2-delivery-call-sites.5.20260924T004635Z`, starting at
`592030962ba973ea03aadf3d72fa4ca9dfc62399` with an empty status and `fast-check` 4.9.0
(`base.txt`, `status-before.txt`, `fast-check.txt`). Observed 2026-09-24.

Step 0 baselines: preferences suite 6 files, 41 tests, `status=0` (`base-preferences.log`); sandbox
node suite 46 files, 675 tests, `status=0` (`base-sandbox.log`); strict OpenSpec
`{"items":114,"passed":114,"failed":0}` (`openspec-base.*.json`).

Red checkpoint, after `git apply --check` of section 7.19 passed and exactly its three files were
removed: `wbs-fe-01:typecheck` `status=0` — nothing imports the deleted module
(`s5-red-typecheck.log`); sandbox node suite `status=1`, `Test Files 1 failed | 44 passed (45)`,
`Tests 3 failed | 671 passed (674)`, all three in `src/test-tiers.test.ts`: `lists every DOM-free
suite in the fast tier, and only those`, `partitions the suite — every file is in exactly one tier`
and `names files that exist` (`s5-red-sandbox.log`).

Sections 7.20, 7.21 and 7.22 applied; task 3's note dated `observed 2026-09-24` from `date -u +%F`,
no placeholder left, the box still unchecked.

Green checkpoint, every check `status=0`: typecheck (`s5-green-typecheck.log`); lint (`s5-lint.log`);
sandbox node suite 45 files, 674 tests — step 0 less one file and one test (`s5-green-sandbox.log`);
preferences suite 4 files, 39 tests — step 0 less two files and two tests
(`s5-green-preferences.log`); tier test 5 tests (`s5-green-tiers.log`).

Proof `n1`: the filter `names files that exist` matched exactly one test (`n1-filter.txt`). Listing
`src/modules/preferences/composition.test.ts` in `vitest.node-suites.ts` again (`n1.patch`) failed it,
`status=1`, `Tests 1 failed | 4 skipped (5)`, on `src/modules/preferences/composition.test.ts:
expected [Function] to not throw an error but 'Error: ENOENT: no such file or direct…' was thrown`
(`n1.log`); the file was restored by copy, `cmp`-identical, and the rerun passed, `Tests 1 passed | 4
skipped (5)` (`n1.green.log`). The `Proof:` comment was added afterwards and the tier test rerun,
5 tests, `status=0` (`s5-tiers-after-comment.log`).

The owned-file Prettier write and check, `nx format:check --all` (`s5-format.log`) and the strict
OpenSpec block run after this entry is written, so that they check it; their results are in those
evidence files and the attempt's report.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, which was not run.

## Packet 050.7g, slice 1 — the channel and the busy store, each with its model test

Attempt `050-7-g-project-prerequisites.1.20260924T031312Z`, starting hash
`d71dd2d69b3aa26bced0334415bcade2f17b786c` (equal to the slice note), empty status, fast-check
4.9.0 (`base.txt`, `status-before.txt`, `fast-check.txt`). Observed on 2026-09-24. Evidence names
are basenames in that attempt's evidence directory.

### Baselines (step 0)

| Check                                                  | Status | Result                                  |
| ------------------------------------------------------ | ------ | --------------------------------------- |
| preferences suite (`base-preferences.log`)             | 0      | 4 files, 39 tests                       |
| sandbox node suite (`base-sandbox.log`)                | 0      | 45 files, 674 tests                     |
| strict OpenSpec (`openspec-base.KXURWt.json`)          | 0      | `{"items":114,"passed":114,"failed":0}` |
| strict OpenSpec after section 7.1, the new requirement | 0      | `{"items":114,"passed":114,"failed":0}` |

### Red checkpoint (after section 7.2, before section 7.3)

`wbs-fe-01:typecheck` status 1 (`s1-red-typecheck.log`), `Found 3 errors in 2 files.`:

```text
apps/wbs/fe-01/src/modules/channel.model.test.ts:4:45 - error TS2307: Cannot find module './channel' or its corresponding type declarations.
apps/wbs/fe-01/src/modules/channel.model.test.ts:136:48 - error TS7006: Parameter 'event' implicitly has an 'any' type.
apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts:4:39 - error TS2307: Cannot find module './busy-store' or its corresponding type declarations.
```

Vitest on the two model tests status 1 (`s1-red-vitest.log`): `Test Files 2 failed (2)`,
`Tests no tests`, on `Failed to resolve import "./channel"` and
`Failed to resolve import "./busy-store"`.

### Green checkpoint (after section 7.3)

| Check                                               | Status | Result                       |
| --------------------------------------------------- | ------ | ---------------------------- |
| `wbs-fe-01:typecheck` (`s1-green-typecheck.log`)    | 0      |                              |
| the two model tests, serial (`s1-green-models.log`) | 0      | 2 files, 2 tests             |
| `src/test-tiers.test.ts` (`s1-green-tiers.log`)     | 0      | 5 tests                      |
| sandbox node suite (`s1-green-sandbox.log`)         | 0      | 47 files, 676 tests (+2, +2) |
| `wbs-fe-01:lint` (`s1-lint.log`)                    | 0      |                              |

### Proofs, each observed failing before its comment was written

Every filter matched exactly one test (`s1-proof-filters.txt`). Every fault failed its model test
with `Tests 1 failed (1)` and status 1, was restored and compared with `cmp`, and its named test then
passed again (`<id>.patch`, `<id>.log`, `<id>.green.log`, `s1-proof-loop.txt`). Seed `20260924`,
300 runs; the run numbers and counterexamples are identical to the packet's section 8.1.

| Id   | Fault                                             | Run | Counterexample, shrunk                                                                       | Cause observed                                                                                                        |
| ---- | ------------------------------------------------- | --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `c1` | recipients are the live set, not a copy           | 5   | `subscribe(join),publishLater(1)`, `replayPath="BBf:F"`, shrunk 5 times                      | `teardown refused: AssertionError: who heard 1, in what order` (two deliveries where the model has one)               |
| `c2` | an unsubscribed listener is still called          | 16  | `subscribe(dropNewest),publishLater(1),subscribe(record),settle`, `"AAAAABGBS:VF"`, shrunk 4 | `publish(1) threw with no failing listener: expected AssertionError: listener 1 heard 1 after …`                      |
| `c3` | an inner publication is delivered at once, nested | 17  | `publishLater(1),subscribe(echo),settle`, `"CGC:F"`, shrunk 1 time                           | `listener 0 was entered re-entrantly: expected 2 to be 1`                                                             |
| `c4` | failures are collected and never rethrown         | 5   | `subscribe(fail),publishLater(1)`, `"BBf:F"`, shrunk 5 times                                 | `publish(1) did not rethrow the one failure by identity: expected null to be Error: listener 0 refused 1`             |
| `c5` | the first failure stops delivery                  | 5   | `subscribe(fail),subscribe(join),publishLater(1)`, `"BBe:F"`, shrunk 4 times                 | `who heard 1, in what order` (one delivery where the model has two)                                                   |
| `c6` | several failures rethrow only the first           | 5   | `subscribe(fail),subscribe(fail),publishLater(1)`, `"BBi:F"`, shrunk 5 times                 | `publish(1) did not aggregate its failures: expected Error: listener 0 refused 1 to be an instance of AggregateError` |
| `b1` | a raise or lower that changes nothing still tells | 1   | `lower`, `"AN:B"`, shrunk 0 times                                                            | `lower: changes heard by the listener that never leaves: expected 1 to be +0`                                         |
| `b2` | listeners told before the value changes           | 1   | `raise`, `"DKA:F"`, shrunk 1 time                                                            | `raise: the last value the sentinel read: expected false to be true`                                                  |
| `b3` | `lower` does nothing                              | 1   | `raise,lower`, `"EJE:F"`, shrunk 2 times                                                     | `lower: busy: expected true to be false`                                                                              |
| `b4` | `raise` toggles                                   | 2   | `gesture,raise`, `"ACLB:K"`, shrunk 1 time                                                   | `raise: busy: expected false to be true`                                                                              |

### After the Proof comments

| Check                                               | Status | Result              |
| --------------------------------------------------- | ------ | ------------------- |
| the two model tests, serial (`s1-final-models.log`) | 0      | 2 files, 2 tests    |
| preferences suite (`s1-final-preferences.log`)      | 0      | 4 files, 39 tests   |
| sandbox node suite (`s1-final-sandbox.log`)         | 0      | 47 files, 676 tests |
| `wbs-fe-01:lint` (`s1-lint-after-proofs.log`)       | 0      |                     |

Owned-file Prettier `--write` then `--check` over the seven paths, and the strict OpenSpec block
after this entry, are recorded in the attempt's report.

### Pending planner verification

`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and
the host gate `bin/h2puni-gate.sh`, none of which the executor runs in its sandbox.

## Packet 050.7g, slice 2 — the delivered plan and presence stores, each with its model test

Attempt `050-7-g-project-prerequisites.2.20260924T032154Z`, starting hash
`8edb8a55025997da7bbc4761f60402292fc9a494`, observed 2026-09-24. Evidence basenames are relative to
that attempt's evidence directory.

### Step 0

- `base.txt`: `HEAD` equal to the slice note's hash; `status-before.txt` empty; `fast-check=4.9.0`.
- Step 0b: `patches=17`, `mutations=43`, twenty adopted paths.
- Preferences suite (`base-preferences.log`): 4 files, 39 tests, `status=0`.
- Sandbox node suite (`base-sandbox.log`): 47 files, 676 tests, `status=0`.
- Strict OpenSpec (`openspec-base.*.json`): `{"items":114,"passed":114,"failed":0}`, exit 0.

### Contract (section 7.4)

The scenario "A publication that says nothing new changes nothing" applied; strict OpenSpec
(`openspec-s2-contract.*.json`) `{"items":114,"passed":114,"failed":0}`, exit 0, `passed` unchanged.

### Red checkpoint (after section 7.5, before section 7.6)

- `s2-red-typecheck.log`: `status=1`, `Found 2 errors in 2 files.` —
  `delivered-plan-store.model.test.ts:13:8 - error TS2307: Cannot find module './delivered-plan-store'`
  and `presence-store.model.test.ts:4:67 - error TS2307: Cannot find module './presence-store'`.
- `s2-red-vitest.log`: `status=1`, `Test Files 2 failed (2)`, `Tests no tests`, on
  `Failed to resolve import "./delivered-plan-store"` and `Failed to resolve import "./presence-store"`.

### Green checkpoint (after section 7.6)

- `s2-green-typecheck.log`: `status=0`.
- `s2-green-models.log`: `Test Files 2 passed (2)`, `Tests 2 passed (2)`, `status=0`.
- `s2-green-tiers.log`: 1 file, 5 tests, `status=0`.
- `s2-green-sandbox.log`: 49 files, 678 tests, `status=0` — step 0 plus 2 files and 2 tests.
- `s2-lint.log`: `wbs-fe-01:lint` `status=0`.

### Proofs, each observed failing before its comment was written

Every filter matched exactly one test (`s2-filters.txt`). Every fault ran through section 8's loop
(`s2-fault-loop.txt`, exit 0): the named test failed with `Tests 1 failed (1)` and `status=1`, the
file was restored and `cmp`-identical, and the green rerun passed. Seed `20260924`, 300 runs,
fast-check 4.9.0; every run number, shrunk counterexample and cause below equals the packet's table.

| Id   | Fault                                                          | Run | Shrunk | Replay path  | Observed cause                                                                              |
| ---- | -------------------------------------------------------------- | --- | ------ | ------------ | ------------------------------------------------------------------------------------------- |
| `d1` | an equal step list replaces the held one (`sameSteps` dropped) | 1   | 0      | `AN:B`       | `redeliver: a new snapshot exactly when something changed: expected true to be false`       |
| `d2` | a null tree clears the held tree                               | 1   | 13     | `IFp:F`      | `deliverNow: a new snapshot exactly when something changed: expected true to be false`      |
| `d3` | listeners told before the snapshot is replaced                 | 1   | 14     | `GHq:F`      | `listener 0: markers: expected [] to be []`                                                 |
| `d4` | the tree failure compared by its wrapper                       | 5   | 10     | `MCx:F`      | `redeliver: a new snapshot exactly when something changed: expected true to be false`       |
| `d5` | the delivered step array kept instead of a copy                | 1   | 6      | `CLL:F`      | `deliverLater #0: steps are not the store’s own: expected true to be false`                 |
| `r1` | a frame with the list already held is a change                 | 1   | 3      | `NAAABCF:VB` | `users(["lee"]): a new snapshot exactly when something changed: expected true to be false`  |
| `r2` | a frame arriving while disconnected is dropped                 | 1   | 2      | `CLD:F`      | `later users([]): a new snapshot exactly when something changed: expected false to be true` |
| `r3` | listeners told before the snapshot is replaced                 | 1   | 2      | `CLF:F`      | `listener 0: users: expected [] to be []`                                                   |
| `r4` | a connection change also clears the list                       | 1   | 1      | `DKA:F`      | `connection(true): users: expected [] to be []`                                             |

Patches and failing output: `<id>.patch`, `<id>.log`, `<id>.green.log`.

### After the Proof comments

- `s2-final-models.log`: 2 files, 2 tests, `status=0`.
- `s2-final-preferences.log`: 4 files, 39 tests, `status=0`.
- `s2-final-sandbox.log`: 49 files, 678 tests, `status=0`.
- `s2-final-typecheck.log` and `s2-lint-after.log`: `status=0`.

### Pending planner verification

`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and
the host gate were not run in this attempt; each is pending planner verification.

## Packet 050.7g, slice 3 — commands, refusals and busy through the project's ports

Attempt `050-7-g-project-prerequisites.3.20260924T033155Z`, starting hash
`c1fa2735b018c399b8304f5e5c10b0262101eef1` (`base.txt`); the working tree was clean
(`status-before.txt` empty) and fast-check was 4.9.0 (`fast-check.txt`). Step 0b extracted 17
patches and 43 fault patches.

### Baselines (step 0 and step 1)

| Check                                                        | Status | Result                                  | Log                    |
| ------------------------------------------------------------ | ------ | --------------------------------------- | ---------------------- |
| preferences suite                                            | 0      | 4 files, 39 tests                       | `base-preferences.log` |
| sandbox node suite                                           | 0      | 49 files, 678 tests                     | `base-sandbox.log`     |
| strict OpenSpec                                              | 0      | `{"items":114,"passed":114,"failed":0}` | `openspec-base.*.json` |
| `plan-writer.test.ts`                                        | 0      | 1 file, 2 tests                         | `s3-base-writer.log`   |
| adopted set, serial (`--no-file-parallelism --maxWorkers=1`) | 0      | 20 files, 1214 tests (332.94 s)         | `s3-base-adopted.log`  |

After section 7.7 (the scenario "The writer and the feed announce through the project's ports"),
strict OpenSpec exit 0, `{"items":114,"passed":114,"failed":0}` (`openspec-s3-contract.*.json`).

### Red checkpoint (after section 7.8, before section 7.9)

`wbs-fe-01:typecheck` status 1, `Found 6 errors in 2 files.` (`s3-red-typecheck.log`):

```text
apps/wbs/fe-01/src/components/wbs/use-channel-listener.test.tsx:7:36 - error TS2307: Cannot find module './use-channel-listener' or its corresponding type declarations.
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:52:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:57:29 - error TS7006: Parameter 'refusal' implicitly has an 'any' type.
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:92:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:114:7 - error TS2561: Object literal may only specify known properties, but 'commandsIssued' does not exist in type 'PlanWriterHost'. Did you mean to write 'noteCommandIssued'?
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:134:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
```

Vitest status 1, `Test Files 2 failed (2)`, `Tests 4 failed (4)` (`s3-red-vitest.log`): the four
writer tests on `TypeError: noteCommandIssued is not a function`, and the listener file on
`Failed to resolve import "./use-channel-listener"`.

### Green checkpoint (after section 7.9)

| Check                             | Status | Result                                      | Log                      |
| --------------------------------- | ------ | ------------------------------------------- | ------------------------ |
| `wbs-fe-01:typecheck`             | 0      |                                             | `s3-green-typecheck.log` |
| writer and listener files, serial | 0      | 2 files, 9 tests (writer 2 + 2, listener 5) | `s3-green-focused.log`   |
| adopted set, serial               | 0      | 20 files, 1214 tests — unchanged (344.99 s) | `s3-green-adopted.log`   |
| sandbox node suite                | 0      | 49 files, 680 tests (step 0 + 0 files, + 2) | `s3-green-sandbox.log`   |
| `wbs-fe-01:lint`                  | 0      |                                             | `s3-lint.log`            |

### Proofs, each observed failing before its comment was written

Every filter matched exactly one test (`s3-filters.log`). Each fault was injected from its section 8.3
patch, its named test run, the file restored and compared with `cmp`, and the test rerun green
(`<id>.patch`, `<id>.log`, `<id>.green.log`; loop summary `s3-faults.log`, status 0).

| Id   | Fault                                             | Named test                                                                  | Observed                                                                                                                                |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `l1` | the subscription in a passive `useEffect`         | `hears an event a child publishes from its own mount effect`                | `expected [] to deeply equal [ 'first read refused' ]`; `Tests 1 failed \| 4 skipped (5)`                                               |
| `l2` | the latest listener's ref never written           | `calls the listener of the latest render and never a superseded one`        | `expected [ 'after the re-render' ] to deeply equal []`; `Tests 1 failed \| 4 skipped (5)`                                              |
| `l3` | `[]` dependencies on the subscription             | `follows a channel replaced while it stays mounted, and leaves the old one` | `expected [ 'from the replaced channel' ] to deeply equal [ 'from the replacement' ]`; `Tests 1 failed \| 4 skipped (5)`                |
| `l4` | the unsubscribe dropped                           | `hears nothing once it is unmounted, and a publication then throws nothing` | `expected [ 'after the unmount' ] to deeply equal []`; `Tests 1 failed \| 4 skipped (5)`                                                |
| `l5` | the listener's failure swallowed                  | `lets a listener’s own failure reach the publisher by identity`             | `expected null to be Error: the toast stack is gone`; `Tests 1 failed \| 4 skipped (5)`                                                 |
| `w1` | the command announced after the request is sent   | `says a command was issued before it sends anything`                        | `expected [ 'request sent', 'command issued' ] to deeply equal [ 'command issued', 'request sent' ]`; `Tests 1 failed \| 3 skipped (4)` |
| `w2` | busy lowered without the `isActiveReader()` guard | `leaves the project busy when its reader left before the answer arrived`    | `expected false to be true`; `Tests 1 failed \| 3 skipped (4)`                                                                          |

Each fault run was filtered to its named test, so no other test ran under a fault. The seven `Proof:`
comments were then written, dated 2026-09-24, five in `use-channel-listener.ts` and two in
`plan-writer.feature.ts` (`w2` below the existing lines there).

### After the Proof comments

Writer and listener files 2 files, 9 tests (`s3-final-focused.log`); preferences 4 files, 39 tests
(`s3-final-preferences.log`); sandbox 49 files, 680 tests (`s3-final-sandbox.log`); all status 0.
Lint, typecheck, format check and strict OpenSpec after the owned-file Prettier are recorded in the
attempt report.

### Pending planner verification

`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test`
and the host gate were not run in the executor sandbox.

## Packet 050.7g, slice 4 — the table selects the delivered plan

Attempt `050-7-g-project-prerequisites.4.20260924T040032Z`, starting hash
`1453f6d3228584c39b1a899fb954290921d8bc78`, observed 2026-09-24. Evidence basenames are relative to
that attempt's evidence directory.

- Step 0: `base=` equal to the slice note's hash, `status-before.txt` empty, `fast-check=4.9.0`.
  Preferences suite 4 files, 39 tests, `status=0` (`base-preferences.log`); sandbox node suite 49
  files, 680 tests, `status=0` (`base-sandbox.log`); strict OpenSpec
  `{"items":114,"passed":114,"failed":0}`.
- Step 1: adopted set, serial, 20 files, 1214 tests, `status=0`, 344.88 s (`s4-base-adopted.log`).
- Step 2: section 7.10 applied; strict OpenSpec `{"items":114,"passed":114,"failed":0}`.
- Step 3, red: typecheck `status=1`, one error,
  `use-snapshot-changes.test.tsx:8:36 - error TS2307: Cannot find module './use-snapshot-changes'`
  (`s4-red-typecheck.log`); Vitest `status=1`, `Test Files 1 failed (1)`, `Tests no tests`, on
  `Failed to resolve import "./use-snapshot-changes"` (`s4-red-vitest.log`).
- Step 5, green: typecheck `status=0`; hook file `Tests 6 passed (6)`; adopted set 20 files, 1214
  tests, `status=0` (unchanged from step 1); sandbox 49 files, 680 tests (unchanged from step 0).
- Step 6: `wbs-fe-01:lint` `status=0` (`s4-lint.log`).
- Step 7: every filter matched exactly one test (`s4-filters.txt`); every fault observed failing,
  its file restored and `cmp`-identical, its named test green again (`s4-faults.txt`, `<id>.patch`,
  `<id>.log`, `<id>.green.log`):
  - `u1` no catch-up: `expected [] to deeply equal [ [ 5, +0 ] ]`; `1 failed | 5 skipped (6)`.
  - `u2` unchanged snapshot handed on: `expected [ [ +0, +0 ], [ +0, +0 ] ] to deeply equal []`;
    `1 failed | 5 skipped (6)`.
  - `u3` ref never updated: `expected [ 1 ] to deeply equal []`; `1 failed | 5 skipped (6)`.
  - `u4` `[]` dependencies: `expected [ [ 1, +0 ] ] to deeply equal [ [ 7, +0 ], [ 8, 7 ] ]`;
    `1 failed | 5 skipped (6)`.
  - `u5` never unsubscribed: `expected [ 1 ] to deeply equal []`; `1 failed | 5 skipped (6)`.
  - `s1` hover card not settled: `expected <div role="tooltip" …(2)>…(2)</div> to be null`;
    `1 failed | 125 skipped (126)`.
  - `s2` drafts not settled: `expected [ '010' ] to deeply equal []`; `1 failed | 87 skipped (88)`.
  - `s3` tree owner not recorded: `Unable to find an accessible element with the role "button" and
name "Reset layout"`; `1 failed | 77 skipped (78)`.
  - `s4` connection reports dropped: `Unable to find an accessible element with the role
"status"`; `1 failed | 87 skipped (88)`.
  - `s5` failure words never built: `expected 'This plan may be out of date — the la…' to contain
'Optimized scheduling is unavailable i…'`; `1 failed | 87 skipped (88)`.
  - `f1` feed refusals dropped: `expected [] to include 'Optimized scheduling is unavailable i…'`;
    `1 failed | 87 skipped (88)`.
- Step 8, after the eleven `Proof:` comments: hook file 6 tests, preferences 4 files 39 tests,
  sandbox 49 files 680 tests, typecheck and lint `status=0`.
- Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
  `wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none run in the executor sandbox.

## Packet 050.7g, slice 5 — presence from a store, the ports' production-path proofs, and task 8

Attempt `050-7-g-project-prerequisites.5.20260924T042313Z`, starting hash
`31949887ed05b92a16c6b6d987b3502b4775d696`, observed 2026-09-24. Evidence basenames are relative
to that attempt's evidence directory.

**Step 0.** `base.txt` equal to the slice note's hash; `status-before.txt` empty; `fast-check=4.9.0`;
17 patches and 43 fault patches extracted. Preferences suite 4 files, 39 tests, `status=0`
(`base-preferences.log`); sandbox node suite 49 files, 680 tests, `status=0` (`base-sandbox.log`);
strict OpenSpec `{"items":114,"passed":114,"failed":0}` (`openspec-base.*.json`).

**Step 1.** Page and router pair 2 files, 77 tests, `status=0` (`s5-base-page.log`); the reporter
printed no per-file line, so the page file alone was run for its own number: 72 tests, `status=0`
(`s5-base-page-only.log`). Adopted set 20 files, 1214 tests, `status=0` (`s5-base-adopted.log`).

**Contract.** Section 7.13 applied; strict OpenSpec `{"items":114,"passed":114,"failed":0}`, exit 0
(`openspec-s5-contract.*.json`).

**Characterisation, no red by design.** Section 7.14 applied to the unchanged page: typecheck
`status=0` (`s5-before-typecheck.log`); `project-page.test.tsx` 73 passed (73), `status=0`
(`s5-before-page.log`) — the page file's 72 plus the new example.

**Implementation.** Sections 7.15, 7.16 and 7.17 applied; the task 8 note dated `2026-09-24` by
`date -u +%F`, no placeholder left.

**Green.** Typecheck `status=0` (`s5-green-typecheck.log`); page and router 2 files, 78 tests,
`status=0` (`s5-green-page.log`); adopted set 20 files, 1215 tests, `status=0` (`s5-green-adopted.log`,
step 1's 1214 plus the new example); sandbox 49 files, 680 tests, `status=0` (`s5-green-sandbox.log`);
`nx format:check --all` `status=0` (`s5-format.log`); `wbs-fe-01:lint` `status=0` (`s5-lint.log`).

**Proofs.** Every filter matched exactly one test (`s5-proof-filters.txt`). Each fault was injected
from its patch, its named test run, the file restored and compared with `cmp`, and the test rerun
green (`<id>.patch`, `<id>.log`, `<id>.green.log`; loop `status=0` in `s5-proof-loop.log`):

| Id   | Test                                                                                | Observed                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t1` | `names an unavailable optimizer and offers no export before a plan is installed`    | `expected [ Array(1) ] to include 'Optimized scheduling is unavailable i…'`; `1 failed \| 87 skipped (88)`                                         |
| `t2` | `Cmd+Enter on the last row makes one and lands in it`                               | `expected <textarea …(6)></textarea> to be <textarea …(6)></textarea>`; `1 failed \| 95 skipped (96)`                                              |
| `t3` | `says a refused rename in a toast, and puts nothing above the table`                | `expected [] to deeply equal [ Array(1) ]`; `1 failed \| 87 skipped (88)`                                                                          |
| `m1` | `rereads a marker refused because a peer already deleted it`                        | `the given combination of arguments (undefined and string) is invalid for this assertion`; `1 failed \| 22 skipped (23)`                           |
| `q1` | `hands the presence slot who the project’s stream says is here, and its connection` | `expected { users: [], connected: false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`; `1 failed \| 72 skipped (73)`                        |
| `q2` | `hands the presence slot who the project’s stream says is here, and its connection` | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`, `connected` `false`; `1 failed \| 72 skipped (73)` |

Every green rerun `1 passed`. The six `Proof:` comments were written afterwards, four in
`use-plan-read.ts` and two in `project-page.tsx`.

**Final.** Page and router 78 tests, preferences 39, sandbox 49 files and 680 tests, each `status=0`
(`s5-final-page.log`, `s5-final-preferences.log`, `s5-final-sandbox.log`).

**Pending planner verification:** `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of which the executor sandbox runs.

## Packet 050.7h, slice 1 — the plan feed's and the plan commands' own ports, and the project composition root

Attempt `050-7-h-project-api-ports.1.20260924T062624Z`, starting hash
`c07055de0f91463ad58c34432f0430196ef5d205` (equal to the slice note's reviewed base), clean status
before any edit (`status-before.txt` empty). Run on 2026-09-24 inside the executor sandbox, every
Vitest run with `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset, every multi-file run serial.

Step 0b extracted 9 patches, a 27-line `markers-memo.ts` and 13 fault patches.

Baselines, before any edit:

| Check                                                                       | Result                                  | Evidence                    |
| --------------------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| preferences suite                                                           | 4 files, 39 tests, 0                    | `base-preferences.log`      |
| sandbox node suite                                                          | 49 files, 680 tests, 0                  | `base-sandbox.log`          |
| strict OpenSpec                                                             | `{"items":114,"passed":114,"failed":0}` | `openspec-base.DIEOzg.json` |
| feed-and-markers set (`plan-feed`, `calendar-markers`, both refresh suites) | 8 files, 58 tests, 0                    | `s1-base-feed.log`          |
| `plan-read-and-write.test.tsx`                                              | 1 file, 88 tests, 0                     | `s1-base-read.log`          |

After the new requirement (section 7.1): strict OpenSpec exit 0,
`{"items":114,"passed":114,"failed":0}` (`openspec-s1-contract.rkNxcR.json`).

Red checkpoint, after the tests and the named fixture edit (section 7.2) and before the code:

- `wbs-fe-01:typecheck` `status=1`, `Found 47 errors in 4 files.` — `plan-commands.feature.test.ts`
  2 × TS2307, 6 × TS7006, 34 × TS7019; `project/composition.test.ts` 1 × TS2307, 1 × TS7006;
  `plan-refresh.test.ts` 2 × TS2353 (lines 19 and 63); `plan-refresh-stream.test.ts` 1 × TS2353
  (line 86), each `'routes' does not exist in type '{ projectId: string; api: ProjectApi; }'`
  (`s1-red-typecheck.log`).
- Vitest `status=1`, `Test Files 3 failed (3)`, `Tests 14 failed (14)`: `Failed to resolve import
"./contract"`, `Failed to resolve import "./composition"`, and all fourteen tests of
  `plan-refresh.test.ts` on `expected 'failed' to be 'installed'` (`s1-red-vitest.log`).

Green checkpoint, after section 7.3:

| Check                                   | Result                 | Evidence                 |
| --------------------------------------- | ---------------------- | ------------------------ |
| `wbs-fe-01:typecheck`                   | exit 0                 | `s1-green-typecheck.log` |
| feed set plus the two new module suites | 10 files, 65 tests, 0  | `s1-green-feed.log`      |
| `plan-read-and-write.test.tsx`          | 1 file, 88 tests, 0    | `s1-green-read.log`      |
| `src/test-tiers.test.ts`                | 1 file, 5 tests, 0     | `s1-green-tiers.log`     |
| sandbox node suite                      | 51 files, 687 tests, 0 | `s1-green-sandbox.log`   |
| `wbs-fe-01:lint`                        | exit 0                 | `s1-lint.log`            |

Every proof filter matched exactly one test (`s1-filters.txt`). Each fault was injected from its
patch, its named test run, the file restored and compared with `cmp`, and the test rerun green
(`<id>.patch`, `<id>.log`, `<id>.green.log`):

| Id   | Fault                                                                 | Observed                                                                                                                         |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `p1` | `freezeProject` sent to the `unfreezeProject` route                   | `Tests 1 failed \| 2 skipped (3)`; strict-equal diff `- "freezeProject"` / `+ "unfreezeProject"`                                 |
| `p2` | a work-item route handed the project in place of the work item        | `Tests 1 failed \| 2 skipped (3)`; strict-equal diff `- "w1"` / `+ "p1"`                                                         |
| `p3` | the route bound when the commands are built                           | `Tests 1 failed \| 2 skipped (3)`; `expected [ 'patch:w1' ] to deeply equal [ 'freeze:p1', 'patch:w1' ]`                         |
| `p4` | the route's promise wrapped in another                                | `Tests 1 failed \| 2 skipped (3)`; `exportPlan: expected Promise{…} to be Promise{…}`                                            |
| `p5` | `setStatus` passes its optional `factStart` even when it was left out | `Tests 1 failed \| 2 skipped (3)`; strict-equal diff `+ undefined,`                                                              |
| `k1` | the first project's commands handed out for every project             | `Tests 1 failed \| 3 skipped (4)`; `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]`                                      |
| `k2` | the ports cut as a copy of the client taken when composed             | `Tests 1 failed \| 3 skipped (4)`; `expected [] to deeply equal [ 'tree:p1', 'arrange:p1' ]`                                     |
| `k3` | the feed read through a second client                                 | `Tests 1 failed \| 3 skipped (4)`; `expected null not to be null`                                                                |
| `k4` | the marker gestures written through a second client                   | `Tests 1 failed \| 3 skipped (4)`; `Error: refused: WbsRequestError: Failed to parse URL from /api/projects/p1/calendar-markers` |

The `Proof:` comments were written after all nine were observed. Afterwards: the two new module
suites 2 files, 7 tests, exit 0 (`s1-final-modules.log`); preferences 4 files, 39 tests, exit 0
(`s1-final-preferences.log`); sandbox node suite 51 files, 687 tests, exit 0
(`s1-final-sandbox.log`); `wbs-fe-01:lint` and `wbs-fe-01:typecheck` exit 0 (`s1-final-lint.log`,
`s1-final-typecheck.log`). Owned-file Prettier and the strict OpenSpec block were run after this
entry was written.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of which the executor sandbox runs.

## Packet 050.7h, slice 2 — the table's hooks, toolbar and columns write through the project's commands

Attempt `050-7-h-project-api-ports.2.20260924T063902Z`, starting at
`36c499d48c761f74e902032612be957123952b8d` (slice 1's planner commit), with an empty status
(`base.txt`, `status-before.txt`). Every test command ran with `CLAUDECODE` and
`CLAUDE_CODE_ENTRYPOINT` unset.

Baselines, before any edit: preferences 4 files, 39 tests (`base-preferences.log`); sandbox node
suite 51 files, 687 tests (`base-sandbox.log`); the twenty adopted files, serial, 20 files, 1215
tests (`s2-base-adopted.log`); zoned (Auckland) 2 files, 3 tests (`s2-base-zoned.log`); strict
OpenSpec `{"items":114,"passed":114,"failed":0}` (`openspec-base.*.json`). Every one `status=0`.

The scenario "The table's gestures write through the project's commands" was applied first; the
strict block then read `{"items":114,"passed":114,"failed":0}`, exit 0
(`openspec-s2-contract.*.json`).

No red checkpoint, by design: this slice adds and edits no test. The table still takes the client and
composes over it, so the adopted set is the oracle, unchanged.

Section 7.5's diff applied cleanly (`git apply --check`, then `git apply`). The markers memo script
printed exactly `markers memo rewritten, 3 comment lines kept`, exit 0 (`s2-markers-memo.txt`): three
`//` lines, the `Proof:` comment packet g's slice 5 wrote above `announceRefusal`, were kept unchanged.
The packet's rehearsal base had 0 lines there.

Green: `wbs-fe-01:typecheck` `status=0` (`s2-green-typecheck.log`); adopted 20 files, 1215 tests,
unchanged (`s2-green-adopted.log`); zoned 2 files, 3 tests (`s2-green-zoned.log`); sandbox 51 files,
687 tests, unchanged (`s2-green-sandbox.log`). `wbs-fe-01:lint` `status=0` (`s2-lint.log`).

Proof `d1`: the filter matched exactly one test. With `isCurrent` in `dependOn` replaced by
`() => true` (`d1.patch`), `plan-read-and-write.test.tsx` › `keeps an old dependency-list refusal out
of its busy API replacement` failed, `Tests 1 failed | 87 skipped (88)`, `status=1`, on
`expect(element).toHaveAttribute("aria-busy", "true")`: the old client's answer lowered the
replacement's busy state (`d1.log`). Restored, compared with `cmp`, rerun green `1 passed | 87 skipped
(88)` (`d1.green.log`). The `Proof:` comment was written above that line after the observation.

Final: `plan-read-and-write.test.tsx` alone 88 tests (`s2-final-read.log`); preferences 4 files, 39
tests (`s2-final-preferences.log`); sandbox 51 files, 687 tests (`s2-final-sandbox.log`); each
`status=0`. Owned-file Prettier and the strict OpenSpec block were run after this entry was written.

Accepted residual: four stale-client guards in `use-plan-read.ts` changed operand from the client
to the composition without a production-path negative: the feed's `isActiveReader`,
`refreshResourcesOrMarkStale`'s guard, the markers' `isActiveReader` and `stepStack`'s `isCurrent`.
No existing test reaches the window between a commit that installs new services and the passive
effect that retires the old feed. Task 11 ("a stale completion changes nothing") owns the test that
opens it.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of which the executor sandbox runs.

## Packet 050.7h, slice 3 — the table takes the project's services, the page composes them, and task 9 closes

Attempt `050-7-h-project-api-ports.3.20260924T065909Z`, starting hash
`88624cffae825ce4455b6d6755fa3985ba979966` (slice 2's planner commit); the starting status was
empty (`status-before.txt`). All observations 2026-09-24, in the executor sandbox, every Vitest run
with `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset.

Baselines before any edit, each `status=0`: preferences 4 files, 39 tests; sandbox node suite 51
files, 687 tests; adopted set, serial, 20 files, 1215 tests; zoned (Auckland) 2 files, 3 tests; the
page and the router 2 files, 78 tests; strict OpenSpec `{"items":114,"passed":114,"failed":0}`
(`base-*.log`, `s3-base-*.log`, `openspec-base.*.json`).

Contract first: the scenario "The page composes the table's services once per client" applied, then
the strict block exit 0, `{"items":114,"passed":114,"failed":0}`.

Red, after the new `src/testing/project-services-of.ts` and the named fixture edit in the seventeen
table suites (`api={X}` → `projectServices={projectServicesOf(X)}`, one import each, no `expect`
line changed — `git diff -U0 -- '*.test.tsx' | grep -E '^[-+].*expect\('` printed nothing):
`wbs-fe-01:typecheck` `status=1`, `Found 256 errors in 17 files.`, all 256 `TS2322` — 1
page-shortcuts, 3 gantt-panel, 7 optimization-integration, 56 plan-cards, 31 plan-cells, 4
plan-chart-seam, 9 plan-dependencies, 6 plan-estimates, 15 plan-filter, 3 plan-keyboard, 23
plan-layout, 44 plan-read-and-write, 1 plan-row-dependencies, 5 plan-row-render-cost, 8
plan-structure, 25 plan-table, 15 plan-toolbar — the first at `page-shortcuts.test.tsx:155:34`;
`plan-row-dependencies.test.tsx` `status=1`, `Tests 5 failed (5)`, all five on
`Unable to find a label with the text of: Name of 010` (`s3-red-typecheck.log`, `s3-red-vitest.log`).

Green, after `WbsTableProps.projectServices`, the table's and the page's edits, the READMEs, the
markers composition's JSDoc, the lifetime map's K2 note and task 9 (both notes dated by
`date -u +%F`, `2026-09-24`): typecheck `status=0`; `nx format:check --all` `status=0`; adopted set
20 files, 1215 tests (unchanged); zoned 2·3 (unchanged); page and router 2·78 (unchanged); sandbox
51·687 (unchanged); `wbs-fe-01:lint` `status=0` (`s3-green-*.log`, `s3-format.log`, `s3-lint.log`).
The client-holder `git grep` listed exactly `components/wbs/project-page.tsx` and
`components/wbs/use-plan-import.ts` (`s3-client-holders.txt`).

Proofs: each filter matched exactly one test (`s3-filters.txt`); each fault injected, observed
failing, restored and `cmp`-identical, then green (`s3-proofs.txt`, `<id>.patch`, `<id>.log`,
`<id>.green.log`):

- `t1`, the table's commands keyed on `[projectServices]` alone: `plan-table.test.tsx` › `keeps an
add burst and its refetch inside the project where it started`, `Tests 1 failed | 46 skipped
(47)`, `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]`.
- `t2`, the writer's `isActiveReader` comparing the project only: `plan-read-and-write.test.tsx` ›
  `does not spend an old API success against its busy replacement`, `Tests 1 failed | 87 skipped
(88)`, `expected 'false' to be 'true'`.
- `q1`, the page composing on every render: `project-page.test.tsx` › `recovers a persistent
resume_ack without replacing the registered socket`, `Tests 1 failed | 72 skipped (73)`,
  `expected 3 to be 2`.

After the comments: page and router 2·78, preferences 4·39, sandbox 51·687, lint `status=0`
(`s3-final-*.log`). Owned-file Prettier, `nx format:check --all` and the strict block run after this
entry is written.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of which the executor sandbox runs.

## Packet 050.7j, slice 1 — the project runtime and its owner, with the state machine's model test

Attempt `050-7-j-project-runtime.1.20260924T165651Z`, starting hash
`f683ceab8f5d4a346d03a5842b78456270393a7e`, working tree empty at the start (`status-before.txt`).
Every Vitest run carried `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; every Nx run `NX_DAEMON=false`.
Evidence names below are relative to the attempt's evidence directory.

Step 0: 9 patches, scripts of 42 and 87 lines, 23 fault patches extracted. Baselines: preferences
4 files, 39 tests, `status=0` (`base-preferences.log`); sandbox node suite 51 files, 687 tests,
`status=0` (`base-sandbox.log`); strict OpenSpec `{"items":114,"passed":114,"failed":0}`;
read-and-write suite 88 tests, `status=0` (`s1-base-read.log`).

| Check                                          | Status | Observed                                         |
| ---------------------------------------------- | ------ | ------------------------------------------------ |
| strict OpenSpec after the new requirement      | 0      | `{"items":114,"passed":114,"failed":0}`          |
| red typecheck (`s1-red-typecheck.log`)         | 1      | `Found 14 errors in 2 files.`                    |
| red Vitest (`s1-red-vitest.log`)               | 1      | `Test Files 2 failed (2)`, `Tests no tests`      |
| green typecheck (`s1-green-typecheck.log`)     | 0      | `wbs-fe-01:typecheck` succeeded                  |
| runtime pair (`s1-green-runtime.log`)          | 0      | 2 files, 8 tests passed                          |
| read-and-write (`s1-green-read.log`)           | 0      | 88 tests passed, unchanged                       |
| test tiers (`s1-green-tiers.log`)              | 0      | 5 tests passed                                   |
| sandbox node suite (`s1-green-sandbox.log`)    | 0      | 53 files, 695 tests: step 0 + 2 files, + 8 tests |
| lint (`s1-lint.log`)                           | 0      | `wbs-fe-01:lint` succeeded                       |
| every proof filter (`s1-filters.txt`)          | 0      | each of the 18 records matched exactly 1 test    |
| final runtime pair (`s1-final-runtime.log`)    | 0      | 2 files, 8 tests passed                          |
| final preferences (`s1-final-preferences.log`) | 0      | 4 files, 39 tests, unchanged                     |
| final sandbox (`s1-final-sandbox.log`)         | 0      | 53 files, 695 tests, as the green checkpoint     |

The red typecheck's diagnostics: 8 in `project-runtime.model.test.ts` (3 × TS2305 for
`ProjectRuntime`, `ProjectSource`, `ProjectStreamHandlers`; 1 × TS2307 for `./project-runtime` at
15:78; 4 × TS7006) and 6 in `project-runtime.test.ts` (2 × TS2305 for `ProjectSource`,
`ProjectStreamHandlers`; 1 × TS2307 at 11:59; 3 × TS7006). The red Vitest failed both files on
`Failed to resolve import "./project-runtime"`.

Faults, each injected into `apps/wbs/fe-01/src/runtime/project-runtime.ts`, its named test run
(`<id>.log`, `status=1`), the file restored and compared with `cmp`, the test rerun green
(`<id>.green.log`, `status=0`); the patch is `<id>.patch`. The model faults each failed
`keeps one runtime current, and nothing of a withdrawn one reaches anybody` (seed 20260924, 300
runs), `Tests 1 failed (1)`:

| Id    | Run | Shrunk sequence, times                                            | Innermost cause                                                                                                     |
| ----- | --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `m1`  | 2   | `reenter(p1),open(p1),drain`, 2                                   | `drain: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2`          |
| `m2`  | 2   | `open(p1),drain,leave,frame(0, change)`, 7                        | `teardown: r1's delivered plan changed after it was withdrawn: expected false to be true`                           |
| `m3`  | 6   | `reenter(p1),openBroken(p1),drain,open(p1),reread(0)`, 5          | `reread: withdrawn r2 sent a request: expected 1 to be +0`                                                          |
| `m4`  | 2   | `open(p1),leave,reenter(p1)`, 5                                   | `teardown: r1's feed closed 2 times, live=false: expected 2 to be 1`                                                |
| `m5`  | 2   | `open(p1),leave,reenter(p1)`, 5                                   | `teardown: r1's feed closed 0 times, live=false: expected +0 to be 1`                                               |
| `m6`  | 2   | `reenter(p1),open(p1),mark(0)`, 2                                 | `mark: withdrawn r1 sent a request: expected 1 to be +0`                                                            |
| `m7`  | 3   | `reenter(p1),openBroken(p1),drain,open(p1),frame(0, connect)`, 7  | `frame(r2, connect): r2's presence changed after it was withdrawn: expected false to be true`                       |
| `m8`  | 6   | `reenter(p1),openBroken(p1),drain,open(p1),frame(0, presence)`, 5 | `frame(r2, presence): r2's presence changed after it was withdrawn: expected false to be true`                      |
| `m9`  | 2   | `reenter(p1),open(p1),drain`, 1                                   | `drain: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2`          |
| `m10` | 3   | `openBroken(p1),reread(0)`, 6                                     | `teardown refused: Error: a project transition was refused by the slot itself`, caused by `PartialAcquisitionError` |

The examples, each `Tests 1 failed | 6 skipped (7)`:

| Id   | Test                                                                             | Observed                                                                                                                    |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `k1` | `publishes the project’s feature and store surfaces, and nothing else`           | `expected [ 'busy', 'commands', …(10) ] to deeply equal [ 'busy', 'commands', …(9) ]`                                       |
| `k2` | `gives back the feed a half-built runtime had already opened`                    | `expected +0 to be 1`                                                                                                       |
| `r1` | `tells the project’s presence who its stream says is here, and whether it is up` | `expected { users: [], connected: true } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`                                 |
| `r2` | the same                                                                         | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`                              |
| `o1` | `settles a request a newer one overtook, and builds nothing for it`              | `promise rejected … instead of resolving`, caused by `TransitionSupersededError: lifetime transition 1 was superseded by 2` |
| `o2` | `shows a retirement that fails as the fatal state, and refuses the next project` | `promise rejected … instead of resolving`, caused by the slot-fault wrapper and `DI_BAG_CLEANUP_FAILED`                     |
| `o3` | `gives back the feed a half-built runtime had already opened`                    | `Error: a project transition was refused by the slot itself`, caused by `PartialAcquisitionError`                           |
| `o4` | `is terminal, and still settles, when a half-built runtime cannot be released`   | `promise rejected … instead of resolving`, caused by the slot-fault wrapper and `DI_BAG_CLEANUP_FAILED`                     |

The eighteen `Proof:` comments were written afterwards at the twelve named sites. Prettier moves
`o4`'s comment from above the rewrap's `?` to just after it, the start of the same branch.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none run in the executor sandbox.

## Packet 050.7j, slice 2 — the table draws from the runtime, and the page owns it

Attempt `050-7-j-project-runtime.2.20260924T170958Z`, starting hash
`6c562db7b2df3c1a1d729b69c581da6e3dd3848f` (slice 1's planner commit), working tree
empty (`status-before.txt`). Run inside the executor sandbox on 2026-09-24, every
test command under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

- Step 0: 9 patches, scripts of 42 and 87 lines, 23 fault patches extracted.
  Baselines: preferences 4·39, sandbox node suite 53·695, adopted set (serial)
  20·1215, zoned (Auckland) 2·3, page and router 2·78, each `status=0`
  (`base-runs.out`). Strict OpenSpec `{"items":114,"passed":114,"failed":0}`.
- Contract first: section 7.4 applied; strict OpenSpec exit 0, 114 · 114 · 0
  (`openspec-s2-contract.*.json`).
- The named fixture edit (`s2-suites-script.txt`): seventeen per-suite lines, the
  last `suites=17 sites=256`, exit 0; Prettier over the seventeen.
- Red checkpoint, after section 7.6: typecheck `status=1`, `Found 4 errors in 2
files.` — `wbs-table-over-client.tsx:12:18 TS2430` (`WbsTableOverClientProps`
  incorrectly extends `Omit<WbsTableProps, "project">`) and `:59:46 TS2322`, each
  twice; Vitest over `plan-row-dependencies.test.tsx` `status=1`, `Tests 5 failed
(5)`, each on `TypeError: Cannot read properties of undefined (reading
'planCommandsFor')`.
- Regions script (`s2-regions.txt`): `read hook: 111 lines replaced by 19`,
  `table: 21 lines replaced by 14` — the rehearsal's 108 and 18 plus packet h's
  three-line `t2` and `t1` comments. Section 7.8 applied.
- Green checkpoint (`green-runs.out`): typecheck `status=0`; adopted 20·1217 (step
  1 + 2); zoned 2·3; page and router 2·80 (+ 2); sandbox 53·695 (unchanged). The
  builder `git grep` over `src/components` printed nothing (`s2-builders.txt`
  empty). `wbs-fe-01:lint` `status=0`.
- Proof `w1`: the filter matched exactly one test. `announceRefusal: () =>
undefined` in the runtime's markers factory (`w1.patch`) failed
  `plan-chart-seam.test.tsx` › `rereads a marker refused because a peer already
deleted it`: `Tests 1 failed | 22 skipped (23)`, `AssertionError: the given
combination of arguments (undefined and string) is invalid for this assertion`
  (`w1.log`); restored, `cmp` identical, rerun `1 passed | 22 skipped (23)`
  (`w1.green.log`). The `Proof:` comment was written afterwards.
- Final: page and router 2·80, preferences 4·39, sandbox 53·695, each `status=0`.

Pending planner verification: `wbs-fe-01:test`, `wbs-fe-01:test:unit`,
`wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of
which can run in the executor sandbox.

## Packet 050.7j, slice 3 — presence from the runtime, reset by a switch, and the records

Attempt `050-7-j-project-runtime.3.20260924T173141Z`, starting hash
`b9e093314d3a520ff92c9920d9a76f7b66351eb7` (the slice-2 planner commit; step 0a found it equal to
the slice note's `b9e09331` and the working tree clean, `status-before.txt` empty). Step 0b
extracted 9 patches, scripts of 42 and 87 lines and 23 fault patches. Every Vitest run was under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

### Baselines (step 0 and step 1)

| Check                                    | Status | Files · tests                           |
| ---------------------------------------- | ------ | --------------------------------------- |
| `base-preferences`                       | 0      | 4 · 39                                  |
| `base-sandbox` (sandbox node suite)      | 0      | 53 · 695                                |
| strict OpenSpec (`openspec-base.*.json`) | 0      | `{"items":114,"passed":114,"failed":0}` |
| `s3-base-adopted` (twenty files, serial) | 0      | 20 · 1217                               |
| `s3-base-zoned` (Pacific/Auckland)       | 0      | 2 · 3                                   |
| `s3-base-page` (page and router)         | 0      | 2 · 80                                  |

### Contract first (section 7.9)

The scenario "A project switch resets presence" added and packet g's "The header selects presence
from a store" amended to name the runtime's store; strict OpenSpec exit 0,
`{"items":114,"passed":114,"failed":0}`, `passed` unchanged.

### Red checkpoint (after section 7.10, before section 7.11)

`s3-red-vitest`, `project-page.test.tsx -t 'hands the presence slot nobody in the next project
until its own stream says'`: `status=1`, `Tests 1 failed | 75 skipped (76)`, on
`AssertionError: expected -1 to be greater than or equal to 0` — after the switch the header was
never handed nobody. No typecheck red was expected or run for this slice.

### Implementation and dated notes (section 7.11)

Applied with `git apply --check` then `git apply`; the two `<observed-date-j>` placeholders, one
each in `tasks.md` and the lifetime map, replaced by the observed `date -u +%F`, `2026-09-24`; no
placeholder left. Task 10's box still reads `- [ ] 10.`.

### Green checkpoint

| Check                | Status | Result                                  |
| -------------------- | ------ | --------------------------------------- |
| `s3-green-typecheck` | 0      | `wbs-fe-01:typecheck`                   |
| `s3-format`          | 0      | `nx format:check --all`                 |
| `s3-green-adopted`   | 0      | 20 · 1218 (step 1 + 1: the new example) |
| `s3-green-zoned`     | 0      | 2 · 3, unchanged                        |
| `s3-green-page`      | 0      | 2 · 81 (step 1 + 1)                     |
| `s3-green-sandbox`   | 0      | 53 · 695, unchanged                     |
| `s3-lint`            | 0      | `wbs-fe-01:lint`                        |

### Proofs, each observed failing before its comment was written

Every filter matched exactly one test first (`s3-filters.txt`). Each fault was applied from its
section 8.3 patch, its named test run, the file restored and `cmp`-identical, and the test rerun
green (`<id>.patch`, `<id>.log`, `<id>.green.log`); summary in `s3-proofs.txt`.

| Id   | Fault                                             | Test                                                                                  | Observed (`1 failed \| 75 skipped (76)` each)                                                                             |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `q1` | a fatal project draws the page's main anyway      | `shows the sanitized report when a project will not let go, and never draws the next` | `AssertionError: expected null not to be null`                                                                            |
| `q2` | the owner's effect never leaves the project       | `closes the selected project’s stream once the page goes`                             | `AssertionError: expected +0 to be 1 // Object.is equality`                                                               |
| `x1` | the stream's roster never reaches the runtime     | `hands the presence slot who the project’s stream says is here, and its connection`   | `expected { users: [], connected: false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`                              |
| `x2` | the stream's connection never reaches the runtime | same                                                                                  | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`, `"connected": false` diff |

The four `Proof:` comments were then written in `project-page.tsx` above the tabled lines: `q1`
above `if (projectState.status === 'fatal') {`, `q2` above the owner effect's `return () => {`
(the line directly above `void projectOwner.leave();`), `x1` above
`onPresence: handlers.onPresence,` and `x2` above `onConnectionChange: handlers.onConnectionChange,`.

### After the Proof comments

`s3-final-page` 2 · 81, `s3-final-preferences` 4 · 39, `s3-final-sandbox` 53 · 695, each
`status=0`; `s3-lint-after`, `s3-format-after` and the strict OpenSpec block follow this entry's
edit and are reported with the attempt.

### Pending planner verification

`wbs-fe-01:test` (UTC + 1 test expected), `wbs-fe-01:test:unit` (unchanged expected),
`wbs-fe-01:build`, `wbs-fe-01:e2e` (every spec that opens a project, then unfiltered),
`tool-devsync:test`, and the host gate `bin/h2puni-gate.sh` — none can run in the executor sandbox.

## Packet 050.7i, slice 1 — the session runtime, its owner and the directory-management module

Attempt `050-7-i-session-runtime.1.20260924T183653Z`, starting hash
`6128153ccebd97817db76ebb74079c6c1a379ebe`, clean tree (`status-before.txt` empty). Every Vitest run
under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; every Nx command with `NX_DAEMON=false`.
Evidence names are relative to the attempt's evidence directory.

### Baselines (step 0)

- Step 0b: 9 patches and 24 fault patches extracted from the packet.
- Preferences suite 4 files, 39 tests; sandbox node suite 53 files, 695 tests; session set (serial)
  3 files, 59 tests; each `status=0` (`base-preferences.log`, `base-sandbox.log`,
  `base-session.log`).
- Strict OpenSpec `{"items":114,"passed":114,"failed":0}`.

### Contract first (section 7.1)

The requirement and its first scenario applied; strict OpenSpec exit 0,
`{"items":114,"passed":114,"failed":0}`.

### Red checkpoint (after section 7.2, before section 7.3)

`wbs-fe-01:typecheck` `status=1`, `Found 34 errors in 5 files.` (15 in `module.test.ts`, 11 × TS2554
in `directory.resource.test.ts`, 1 × TS2554 in `directory-management.feature.test.ts`, 6 in
`session-runtime.model.test.ts` — 1 × TS2307, 5 × TS7006 — and 1 in `session-runtime.test.ts`),
including:

```text
apps/wbs/fe-01/src/modules/directory-management/module.test.ts:7:43 - error TS2307: Cannot find module './module' or its corresponding type declarations.
apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts:12:42 - error TS2554: Expected 1 arguments, but got 2.
apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts:18:8 - error TS2307: Cannot find module './session-runtime' or its corresponding type declarations.
apps/wbs/fe-01/src/runtime/session-runtime.test.ts:11:59 - error TS2307: Cannot find module './session-runtime' or its corresponding type declarations.
```

Vitest over the three new suites `status=1`, `Test Files 3 failed (3)`, `Tests no tests`, on
`Failed to resolve import "./session-runtime"` (twice) and `Failed to resolve import "./module"`
(`s1-red-typecheck.log`, `s1-red-vitest.log`).

### Green checkpoint (after section 7.3)

- `wbs-fe-01:typecheck` `status=0`.
- Runtime set (the two session suites, `modules/directory-management`, `modules/directory`), serial:
  5 files, 37 tests, `status=0`.
- `src/test-tiers.test.ts`: 1 file, 5 tests, `status=0`.
- Sandbox node suite: 56 files, 708 tests, `status=0` — step 0 plus 3 files and 13 tests.
- `wbs-fe-01:lint` `status=0`, before and after the Proof comments.

### Proofs, each observed failing before its comment was written

Every filter first matched exactly one test (`proof-filters.txt`). Each fault was applied from its
patch, its named test run (`status=1`), the file restored and compared with `cmp`, and the test rerun
green (`<id>.patch`, `<id>.log`, `<id>.green.log`, `proof-loop.txt`). The model faults each failed
`keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody`,
`Tests 1 failed (1)`, seed 20260924:

| Id    | Run | Shrunk sequence, times                                               | Innermost cause                                                                                                         |
| ----- | --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `m1`  | 3   | `signIn(u2, ''),signInBroken(u1)`, 2                                 | `signInBroken(u1): a session is still current after withdrawal: expected [ 's1' ] to deeply equal []`                   |
| `m2`  | 10  | `signIn(u1, ''),signInBroken(u1),read(0)`, 6                         | `teardown: the last user asked for is not the one live: expected 'fatal' to be 'u1'`                                    |
| `m3`  | 2   | `signIn(u2, ''),read(0),signIn(u1, ''),reenter(u1)`, 6               | `teardown: s1's directory changed after it was withdrawn: expected false to be true`                                    |
| `m4`  | 1   | `signIn(u1, ''),signOut,read(0)`, 4                                  | `read: withdrawn s1 sent a request: expected 5 to be +0`                                                                |
| `m5`  | 1   | `signIn(u1, ''),signIn(u2, ''),gesture(0)`, 5                        | `gesture: withdrawn s1 sent a request: expected 1 to be +0`                                                             |
| `m6`  | 1   | `signIn(u1, ''),signIn(u2, ''),signOut,drain`, 5                     | `drain: the published session is not the user last asked for: expected 'u2' to be null`                                 |
| `m7`  | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2),gesture(0)`, 7   | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     |
| `m8`  | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2)`, 5              | `signInBroken(u2): a project is still current after its session was withdrawn: expected [ 's1.p1' ] to deeply equal []` |
| `m9`  | 3   | `signIn(u2, ''),signInBroken(u1),drain,openProject(0, p1),drain`, 11 | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     |
| `m10` | 2   | `signIn(u2, ''),signIn(u1, ''),reenter(u1)`, 6                       | `teardown: more than one session says it is current: expected [ 's1', 's2' ] to have a length of 1 but got 2`           |
| `m11` | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2),gesture(0)`, 7   | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     |
| `m12` | 2   | `signInBroken(u1),reenter(u1)`, 4                                    | `teardown refused: Error: a session transition was refused by the slot itself`                                          |

For `m1` and `m6` the outermost message is the teardown's (`the published session is not the user
last asked for: expected 'u2' to be 'u1'`; `signOut settled before s1's retirement had run`), with
the tabled cause as its cause.

The examples, each `status=1`:

| Id   | Test                                                                                          | Tests line                  | Observed                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `k1` | `publishes the session’s directory and its projects, and nothing else`                        | `1 failed \| 6 skipped (7)` | `expected [ 'directory', 'directoryApi', …(3) ] to deeply equal [ 'directory', 'isCurrent', …(2) ]`                                      |
| `o1` | `settles a request a newer one overtook, and builds nothing for it`                           | `1 failed \| 6 skipped (7)` | rejected with `a session transition was refused by the slot itself`, caused by `TransitionSupersededError`                               |
| `o2` | `fails the session’s retirement when its project will not let go`                             | `1 failed \| 6 skipped (7)` | rejected with `a session transition was refused by the slot itself`, caused by `DI_BAG_CLEANUP_FAILED`                                   |
| `o3` | `settles a half-built session that cannot be released, and leaves the owner terminally fatal` | `1 failed \| 6 skipped (7)` | rejected with `a session transition was refused by the slot itself`, caused by `and what it took could not be given back`                |
| `d1` | `fails the session’s retirement when its project will not let go`                             | `1 failed \| 6 skipped (7)` | `expected false to be true`: the session left `empty`, not terminally `fatal`                                                            |
| `l1` | `names itself when a host omits the client`                                                   | `1 failed \| 4 skipped (5)` | `expected [Function] to throw error including 'Cannot resolve "frontend.directory-ma…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…'` |
| `l2` | `keeps its directory resource out of a host graph`                                            | `1 failed \| 4 skipped (5)` | `expected [Function] to throw an error`                                                                                                  |

### After the Proof comments

Runtime set 5 files, 37 tests; preferences 4 files, 39 tests; sandbox 56 files, 708 tests; session set
3 files, 59 tests (unchanged from step 0); each `status=0` (`s1-final-*.log`).

### Pending planner verification

`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and
the host gate were not run in the executor sandbox.

## Packet 050.7i, slice 2 — the directory drawn from the signed-in user's session, kept across a same-user update

Attempt `050-7-i-session-runtime.2.20260924T185138Z`, observed 2026-09-24, in the executor sandbox.
Starting hash `a295df56ff682ce4cca3a4a13dc3b0aa615bac6c` (the slice-1 planner commit), equal to the
slice note's reviewed base; the starting status was empty (`status-before.txt`). Every test run had
`CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset. Evidence names are relative to the attempt's
evidence directory.

**Baselines** (`s2-baselines.out`), each `status=0`: preferences 4 files · 39 tests; sandbox node
suite 56 · 708; session set, serial, 3 · 59; adopted set, serial, 20 · 1218; zoned (Auckland) 2 · 3.
Strict OpenSpec `{"items":114,"passed":114,"failed":0}` (`openspec-base.*.json`).

**Contract first.** The scenario "The same user keeps the session, the router and the address"
applied; strict OpenSpec unchanged at 114 · 114 · 0 (`openspec-s2-contract.*.json`).

**Red** (the test side applied, nothing else): `wbs-fe-01:typecheck` `status=1`,
`Found 22 errors in 6 files.` — 17 × TS2741 in `directory-page.test.tsx` (`Property 'token' is
missing in type '{ api: DirectoryApi; … }' but required in type 'DirectoryPageOverClientProps'`),
2 × TS2322 at `directory-page-over-client.tsx:32:25`, 1 × TS2322 in `app-router.test.tsx`
(`session` not yet a region prop), 1 × TS2339 in `app.test.tsx` (`Property 'SignedInApp' does not
exist`), 1 × TS2724 in `session-runtime.test.ts` (no exported member `sessionFor`)
(`s2-red-typecheck.log`). Vitest over `src/app.test.tsx` `status=1`, `Tests 3 failed | 9 passed
(12)`: `keeps the router, the address and a draft …`, `shows the sanitized report …` and `gives the
session back …`, all on `Element type is invalid: … got: undefined` (`s2-red-vitest.log`).

**Green**, each `status=0` (`s2-green.out`): typecheck; session set 3 · 64 (+5); adopted set
20 · 1218 (unchanged); zoned 2 · 3 (unchanged); sandbox 56 · 709 (+1). `composition.ts` is gone, and
the builder `git grep` over delivery printed nothing (`s2-builders.txt` empty). `wbs-fe-01:lint`
`status=0` (`s2-lint.log`).

**Proofs.** Each filter matched exactly one test (`s2-proof-filters.txt`); each fault was injected,
its named test failed, the file was restored and `cmp`-identical, and the test reran green
(`s2-proofs.txt`, `<id>.patch`, `<id>.log`, `<id>.green.log`):

| Id   | Fault                                                 | Observed                                                                   |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `g1` | `sessionFor` hands out whatever is live, for any user | `1 failed \| 7 skipped (8)`; `expected { userId: 'u1', …(3) } to be null`  |
| `g2` | a fatal session draws the region anyway               | `1 failed \| 11 skipped (12)`; `Error: no fatal state yet`                 |
| `g3` | the region's unmount never leaves the session         | `1 failed \| 11 skipped (12)`; `expected 'live' to be 'empty'`             |
| `g4` | the owner is opened with an empty credential          | `1 failed \| 11 skipped (12)`; `expected [ '' ] to deeply equal [ 'tok' ]` |

**After the comments** (`s2-final-*.log`), each `status=0`: session set 3 · 64, preferences 4 · 39,
sandbox 56 · 709.

**Pending planner verification:** `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate, none of which runs in the executor sandbox.
