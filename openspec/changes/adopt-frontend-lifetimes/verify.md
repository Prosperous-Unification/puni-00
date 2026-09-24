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
