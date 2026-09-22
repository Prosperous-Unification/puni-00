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
