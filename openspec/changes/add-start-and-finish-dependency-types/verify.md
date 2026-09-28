# verify — add-start-and-finish-dependency-types

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. The CP-SAT design probe named in design.md is feasibility evidence only and is not an implementation or R5 proof.

## Task group 1 — code rollback guard (2026-09-28)

- Stage A `migration.sql` already permits `FS`, `SS`, `FF`, keys uniqueness by endpoints and type, and ships beside a guarded `down.sql`; no SQL migration was added.
- Red: `env -u CLAUDECODE bun test src/swap.test.ts src/lib/reconcile.test.ts` from `tools/tool-remote-scripts` reported 14 pass, 2 fail, 1 error before implementation: the planner lacked `relationship-types`, and the swap test could not import its command builder. The backend CLI test failed with exit 1 before its file existed.
- Green: `env -u CLAUDECODE bun test src/swap.test.ts src/lib/reconcile.test.ts src/lib/docker.test.ts` from `tools/tool-remote-scripts` reported 146 pass, 0 fail. `env -u CLAUDECODE bun test src/relationship-types-cli.test.ts` from `apps/wbs/be-01` reported 1 pass, 0 fail. These cover the production swap's refusal/abort, compatible and FS-only acceptance, absent table, malformed output, command failure, and shell/SQLite command scripts.
- **R5 proof:** Replaced the production comparison with `stored.filter(() => false)`. `env -u CLAUDECODE bun test src/swap.test.ts -t 'refuses FS-only code with stored FF'` reported 0 pass, 1 fail: `Expected value: StringContaining "FF (2)"; Unable to find property`. Restored the comparison and added the adjacent `Proof:` comment in `swap.ts`.
- **R5 proof:** Replaced the source-directory check in `relationshipTypesCommand` with an unconditional FS fallback. `env -u CLAUDECODE bun test src/lib/docker.test.ts -t 'does not treat an inaccessible CLI directory'` reported 0 pass, 1 fail: `Expected: 74, Received: 0`. Restored the check and added the adjacent `Proof:` comment in `docker.ts`. The test was then renamed to say “missing source directory” precisely.
- With `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, `bunx nx run tool-remote-scripts:lint:fast`, `bunx nx run wbs-be-01:lint:fast`, `bunx nx run tool-remote-scripts:typecheck`, and `bunx nx run wbs-be-01:typecheck` each reported `Successfully ran target` and exited 0. Earlier daemon-backed commands had exited 0 after socket warnings without target output, so their exits were not accepted as verification.
- `bunx prettier --check` on all eleven touched files exited 0: `All matched files use Prettier code style!`.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0; 139 items passed, 0 failed.
- Compatible readers have not been deployed; task 1.2 stays open until that happens before Stage B enables SS/FF writes. The h2puni host gate was not run from this `pop-os` worktree. No production deployment was attempted.
- Commit attempt failed before staging: Git could not create `/home/df/wd/puni/puni-00/.git/worktrees/b9-010-4-7-step-deps-b-rollout/index.lock` (`Read-only file system`). The worktree changes remain uncommitted; no push was attempted.

### Astra review follow-up (2026-09-28)

- **Race red:** `env -u CLAUDECODE bun test tools/tool-remote-scripts/src/swap.test.ts -t 'refuses FF inserted after the first check'` exited 1, 0 pass/1 fail: execution reached backfill after `stop-blue` and received `step-code backfill failed...` instead of the FF refusal. The planner-order test also exited 1 before the new step existed: expected `relationship-types-after-stop` after `stop-blue`, received `revoke-alias` in that slot. The shared comparison now runs before migration and in its own non-abortable step immediately after `stop-blue`.
- **R5 race proof:** Omitting the post-stop comparison was the original fault above; the adjacent `Proof:` at the `relationship-types-after-stop` execution case records the observed failure. With the check present, the test observes two database reads, FF (2) in the failure, the outgoing container stopped, and no backfill or commit write.
- **Executable command boundaries:** `env -u CLAUDECODE bun test tools/tool-remote-scripts/src/lib/docker.test.ts -t 'relationship type commands'` reported 8 pass, 0 fail. The generated `sh` command was executed locally with its Docker `exec <container>` prefix removed: present CLI returned `["FS","FF"]`, absent CLI under readable `src` returned `["FS"]`, missing or unreadable `src` exited 74, and a directory at the CLI path exited 73. The generated Bun inline script likewise ran against a temp SQLite table with FS/FF rows (counts 1/2), a DB without `typed_dependency` (`[]`), a missing DB path (non-zero), and unset `DB_PATH` (non-zero).
- **Parser mutations:** Disabling the supported-type string check made `rejects a non-string supported relationship type` fail with `Unable to find property` for the expected malformed-output error (0 pass/1 fail). Disabling the stored-count integer check made `rejects a stored relationship with a fractional count` fail because it received `stored relationship types unsupported ... FF (1.5)` instead of malformed output (0 pass/1 fail). Both checks were restored, with adjacent `Proof:` comments.
- `env -u CLAUDECODE bun test tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/lib/reconcile.test.ts tools/tool-remote-scripts/src/lib/docker.test.ts` reported 154 pass, 0 fail after the new checks. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:lint:fast` and `bunx nx run tool-remote-scripts:typecheck` both reported `Successfully ran target` and exited 0 after a test assertion style fix.
- The requested repo-root `env -u CLAUDECODE bun test tools/tool-remote-scripts` exited 1: 367 pass, 2 skip, 23 fail, 15 errors across 54 files. Its directory argument also collected stale compiled tests under `dist/out-tsc`, which could not resolve source aliases. A source-only run from `tools/tool-remote-scripts` (`env -u CLAUDECODE bun test src`) exited 1: 305 pass, 2 skip, 3 fail across 27 files; the three unrelated Unix-listener tests failed because this sandbox returned `EPERM` from `Bun.listen` on `/tmp` sockets. Neither broad run is claimed green.
- Final targeted rerun reported 154 pass, 0 fail, 275 expect calls. `bunx prettier --check` on the eight touched files reported `All matched files use Prettier code style!`. `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 139 passed, 0 failed. The h2puni gate was not run here; this is a local worktree with read-only Git metadata, and the user will commit.

## Planned checks — pending implementation

- **Pending:** Mounted command/MCP, undo/redo, import/export and frozen snapshot round trips for SS/FF; unsupported type and stale history refusals.
- **Pending:** CP-SAT enforcement of expanded SS/FF edges, negative FF weight, unknown endpoints, floors/deadlines and resource occupancy. Fast and the mounted project `depReach` update are covered in the Fast-slice record below.
- **Pending:** Q=48 FF counterexample, independently recomputed W_FF, quantized baseline feasibility, real materialization validation and cache/contract version retirement.
- **Pending:** Truthful Fast deadline-miss and solver-timeout states. Weighted Fast replay, latest dates, float and critical path are covered in the Fast-slice record below.
- **Pending:** Picker/browser and Gantt geometry for type labels, SS/FF anchor sides, unknown ticks, collapsed proxies and keyboard/mobile access.
- **Pending R5 proof:** Lower or forge W_FF; independent production-path validation must fail. Restore and add an adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Skip materialized real FF comparison; the rounding counterexample must fail its publication test. Restore and record output.
- **Fast-slice proof recorded below:** Clamp a negative FF weight, restore an append-only person tail or use plan-order resource replay; weighted goldens fail.
- **Pending R5 proof:** Attach an SS/FF arrow to the wrong boundary; geometry/accessibility test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.

## Rebase note

2026-09-27 (WBS 010.4.11.1): endpoints and whole-endpoint boundaries rebased on `address-step-nodes` (sources and sinks of the step graph; the step-order chain gives the same first and last nodes as before). Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.

## 2026-09-28 Fast slice (groups 2, 7, 8, 9)

The read type now includes FS/SS/FF; `isWritableRelationshipType` keeps command writes FS only. The mounted command test refused SS (15 pass / 0 fail) and a direct application-boundary test refused it (6 pass / 0 fail). The solver edge builder throws for SS/FF until the typed solver wire lands in the next PR. Fast dispatches weighted graphs to real-duration placement and replay, while all-FS graphs retain the v3 pass and the pinned `f0145c81759486b5` digest under the v4 algorithm ID. Contract version 14 retires old optimized rows; request and Fast/quantum corpus fixtures were rekeyed without regenerating FS results. The solver wire generation remains v1 because it still carries FS edges only.

Observed commands after edits and formatting:

- `env -u CLAUDECODE bun test src` from `libs/wbs/domain/domain`: 762 pass, 0 fail, 39,411 expectations.
- `env -u CLAUDECODE bun test src solver/src` from `libs/wbs/domain/contracts`: 405 pass, 0 fail, 1,202 expectations.
- `env -u CLAUDECODE bun test src` from `libs/wbs/application/core`: 713 pass, 0 fail, 2,186 expectations.
- `env -u CLAUDECODE bun test apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts`: 27 pass, 0 fail, 159 expectations.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 139 items passed, 0 failed; informational archive-base warnings remain.
- `bunx prettier --check` over tracked touched files and the new weighted test: exit 0, all matched files use Prettier style.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run <project>:lint:fast` for `wbs-domain`, `wbs-contracts`, `wbs-core`, `wbs-be-01`: each exit 0 after fixing an import-order error in core. The same projects' `typecheck` targets each exited 0; core's dependency module check ran and its final TypeScript target was cached on the last run.
- The requested repo-root `env -u CLAUDECODE bun test libs/wbs/domain/domain libs/wbs/domain/contracts/solver` was also run: 1,726 pass, 9 fail, 4 errors. Bun collected generated `dist/out-tsc` and unrelated root-sensitive tests; the project-scoped commands above are the project test contracts and passed. The first root run, before fixture rekeying, additionally failed the expected v13 pins; those were updated.

Observed production-path negative proofs, with each fault restored:

- Whole endpoint expansion changed to first leaf only: `slice-edges.test.ts` gave 30 pass / 4 fail, including parent SS/FF output of one pair instead of four and the FS parent cycle disappearing. `Proof:` is adjacent to the map in `resolveEndpoint`.
- FF weight clamped to zero: `schedule-weighted.test.ts` gave 3 pass / 3 fail; B moved from day 0 to day 4 in the early FF case. `Proof:` is adjacent to the weight derivation.
- Person search restored to an append-only tail: weighted suite gave 4 pass / 2 fail; B moved from day 0 to day 11 instead of filling the gap. `Proof:` is adjacent to `findPersonWindow`.
- Person resource edges kept in node/plan order: weighted suite gave 5 pass / 2 fail; the feasible augmented cycle's latest starts changed from 10/0/9 to 9/0/10. Omitting those edges also gave 5 pass / 2 fail and C latest start 10 instead of 9. Both `Proof:` comments sit at `rebuildResourceOrder`.
- Backward relaxation limited to one pass: weighted suite gave 6 pass / 1 fail; A/C latest starts became 20/19 instead of 10/9. `Proof:` is adjacent to the cyclic fallback.
- Materialized boundary comparison forced false: weighted suite gave 8 pass / 1 fail; B finished at 32024810461.572468 before A at 32024810461.57247. Restoring it reconciled Fast placement and made the unreconciled pinned start throw. Reverting the resource annotation to raw `before.start + edge.weight` gave 8 pass / 1 fail, mislabeling the reconciled Fast slice `optimizer` instead of `predecessor`. Both `Proof:` comments are adjacent to those checks.
- All three application write guards widened to the read predicate: `work-item/module.test.ts` gave 5 pass / 1 fail, accepting SS with `{ ok: true, value: "item-7" }`. The adjacent `Proof:` is in `typedRefusal`. Widening only the two command entry checks did not fail because `typedRefusal` still refused the write; the direct test makes the collective gate breakable.

The full Nx gate, host gate, build, CP-SAT wire, command/import SS/FF writes and UI checks were not run or changed in this slice; the wire and write opening belong to later PRs, and the host gate runs on the integration branch. Astra (high) reviewed the slice from the lane; its verdicts are quoted in the PR.

## 2026-09-28 solver-wire slice (groups 5, 6, 10)

Wire v2 carries FS/SS/FF edges and FF's signed `startWeightUnits`. The one Bun derivation uses the maximum of integer finish difference and conservative real-duration ceiling in Q=48 units. CP-SAT enforces the corresponding typed inequalities. The Bun revalidator checks the wire edge set against the canonical graph and recomputes FF weights from canonical slices before it accepts any response status. Fast and optimized publication share a real-boundary validator. A rounded Fast baseline that misses the strengthened FF bound is replaced by a serial topological placement; Python installs its hint and stage-1 bound only after a pinned-start model proves that placement satisfies all active constraints, including deadlines. Stage-1 integer infeasibility is now `no-solution` for the fractional plan, so it does not create a persistent real-plan infeasibility certificate. The scheduler contract remains 14 from the Fast slice, and a type edit changes the canonical input hash. The review fix below advances the Python solver version to 0.1.4 to retire the previous cache key. The v2 schema copy matches the normative schema byte for byte (`cmp`, exit 0).

Final observed scoped checks:

- `env -u CLAUDECODE bun test src` in `libs/wbs/domain/contracts/solver`: 285 pass, 0 fail.
- `env -u CLAUDECODE bun test src` in `libs/wbs/domain/domain`: 766 pass, 0 fail.
- `env -u CLAUDECODE bun test` on the five touched service/coordinator/event test files from `apps/wbs/be-01`: 58 pass, 0 fail.
- `/home/df/wd/puni/puni-plan/venv-solver-py/bin/python -m unittest discover -s tests -t tests` from `libs/wbs/adapters/solver-py`: 226 tests, OK, 33.619 seconds.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run <project>:lint:fast` and `:typecheck` for `wbs-contracts`, `wbs-domain`, `wbs-be-01`: all exited 0. The final domain typecheck used `--skip-nx-cache` and ran fresh.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 139 passed, 0 failed.
- `bunx prettier --check` on every touched tracked TS/JSON/Markdown file and four new TS/JSON files: exit 0 after formatting this record.

Observed fault injections, all restored with adjacent `Proof:` comments:

| Removed or damaged production check                      | Observed negative                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Return only `D_a-D_b` as FF weight                       | Contracts focused run: 56 pass / 2 fail; baseline put B at 0 instead of at least 1 and forged zero weight was accepted.      |
| Bypass FF canonical weight comparison                    | Forged 0.030/0.021 request was accepted as `published:false` instead of `malformed-request`; revalidation: 47 pass / 1 fail. |
| Bypass Bun edge type and misplaced-weight guards         | Unsupported SF and weighted SS edges were accepted; revalidation: 47 pass / 2 fail.                                          |
| Bypass canonical edge-set comparison                     | Omitted SS edge was accepted; revalidation file: 47 pass / 1 fail, expected false, received true.                            |
| Replace SS boundary check with false                     | Response with A start 1, B start 0 was accepted; revalidation file: 44 pass / 1 fail.                                        |
| Drop Python SS or FF weight constraint                   | Each model golden changed from `INFEASIBLE` to `OPTIMAL`.                                                                    |
| Install Python hints without feasible-baseline probe     | Hint count changed from `[0, 0, 0, 0]` to `[0, 2, 2, 2]`.                                                                    |
| Disable materialized FF real-boundary comparison         | Domain publication test failed with `Received function did not throw`; 6 pass / 1 fail.                                      |
| Remove relationship type from canonical hash             | Focused cache test failed: FS and FF canonical strings became equal (0 pass / 1 fail).                                       |
| Certify integer infeasibility as real-plan infeasibility | Quantized-only 49-step case failed its expected `no-solution` outcome (0 pass / 1 fail).                                     |
| Short-circuit on Fast's deadline miss                    | Feasible alternate resource order failed to publish (0 pass / 1 fail).                                                       |

The full be-01 suite was attempted earlier in this slice: 1288 pass, 1 skip, 36 fail. Most failures were sandbox `EPERM` on socket listeners; one spawn-handshake test timed out. Two stale contract-version expectations were corrected afterward and their 10-test file passed; the full suite was not rerun. The host gate, full Nx gate and build were not run: the user explicitly excluded the full gate and prohibited commits, while this worktree's Git metadata is read-only. Other OpenSpec groups remain pending.

## 2026-09-28 weighted Fast review fixes (uncommitted)

## 2026-09-28 weighted Fast review fixes

The weighted Fast path now checks a pinned person's actual interval, repeats person and pool searches during explanation, and searches with the tiled interval before reserving a resource. Invalid pinned pool intervals reach the actual-width slot replay refusal. The cyclic backward relaxation is a named production function so a synthetic positive cycle can directly exercise its refusal. All-FS dispatch remains on the original path; the Fast golden corpus and digest passed unchanged.

Observed negatives, each with the fault restored and an adjacent `Proof:` comment in `schedule.ts`:

- Removed the exact pinned-person refusal: `rejects a pinned person overlap even when an earlier gap is free` failed, returning A `[5,7)` and B `[6,7)` with A float `-1` (13 pass / 1 fail).
- Removed the materialized resource-window search: `reconciles a tiled fractional interval before reserving a pool` failed with `C waited for capacity with nothing holding the pool` during replay (13 pass / 1 fail). The fixture makes two size-2 pool reservations start at `7.666666666666666` while a tiled predecessor finishes at `7.666666666666667`.
- Reduced the shared person/pool search to one pass: `explains a person delay after a pool delay` failed; C started at 5 but was labeled `optimizer` with no person predecessor (13 pass / 1 fail).
- Removed the pool slot-overlap refusal: `rejects a pinned pool overlap in resource-order replay` failed, returning A `[5,7)` and B `[6,7)` on a size-1 pool (12 pass / 1 fail).
- Removed the positive-cycle refusal: `refuses a positive cycle in the production backward relaxation` failed because the two-node positive cycle returned without throwing (13 pass / 1 fail). This test calls the same `relaxWeightedStarts` function used by the production weighted late-time path; it does not construct the cycle through public `schedule()` input. A separate public-input attempt with large-offset rounding returned a valid schedule and did not reach the guard.

Verification after restoring the faults:

- `env -u CLAUDECODE bun test libs/wbs/domain/domain/src/schedule-weighted.test.ts`: 14 pass, 0 fail, 25 expectations.
- Project-root source runs: domain `bun test src` 767 pass / 0 fail, 39,417 expectations; solver contracts `bun test solver/src` 274 pass / 0 fail, 604 expectations; application core `bun test src` 713 pass / 0 fail, 2,186 expectations. Domain's FS golden corpus and digest passed in its source run.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint:fast` and `:typecheck`: both exited 0. `bunx prettier --check` on the three touched files exited 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 139 items passed, 0 failed; informational archive warnings remain.
- The requested repository-root `env -u CLAUDECODE bun test libs/wbs/domain/domain libs/wbs/domain/contracts/solver libs/wbs/application/core` exited 1: 2,529 pass, 102 fail, 85 errors. It also collected generated `dist/out-tsc` tests that cannot resolve workspace aliases and unrelated root-sensitive tests. The project-root source runs above are the applicable source checks.

The h2puni gate was not run: its SHA checkout would test a committed tree, while these changes must remain uncommitted. No commit or Git metadata write was attempted. Mounted DB tests and the full gate remain unverified in this review fix.

## 2026-09-28 commands and transfer slice (groups 3–4c)

Stage A's `20260927213000_add_typed_dependency/{migration,down}.sql` pair is present. The forward table checks `type IN ('FS','SS','FF')`; its endpoint uniqueness index includes `type`. Saved-plan canonical schema v3 already stores relationship ID, endpoints and type, so its stored shape and version did not change. Whole-project copy uses export/import with fresh IDs; subtree duplication uses the existing generic endpoint remapping.

Observed source and mounted tests after restoring every injected fault:

| Command                                                                                                                                                                                                                                                                                                                                 | Observed result                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE bun test src` from `libs/wbs/domain/domain`                                                                                                                                                                                                                                                                          | 771 pass, 0 fail, 39,423 expectations                                                                             |
| `env -u CLAUDECODE bun test src solver/src` from `libs/wbs/domain/contracts`                                                                                                                                                                                                                                                            | 416 pass, 0 fail, 1,228 expectations                                                                              |
| `env -u CLAUDECODE bun test src` from `libs/wbs/application/core`                                                                                                                                                                                                                                                                       | 719 pass, 0 fail, 2,204 expectations                                                                              |
| `env -u CLAUDECODE bun test src` from `libs/wbs/adapters/store-memory`                                                                                                                                                                                                                                                                  | 133 pass, 0 fail, 5,430 expectations                                                                              |
| `env -u CLAUDECODE bun test src` from `libs/wbs/adapters/store-sqlite`                                                                                                                                                                                                                                                                  | 1,032 pass, 0 fail, 9,699 expectations                                                                            |
| `env -u CLAUDECODE bun test src/controller/typed-dependency-commands.controller.db.test.ts src/controller/typed-dependency-graph.controller.db.test.ts src/controller/typed-dependency-copy.controller.db.test.ts src/controller/saved-plan.controller.db.test.ts src/http/elysia/plan-document-boundary.test.ts` from `apps/wbs/be-01` | 100 pass, 0 fail, 464 expectations                                                                                |
| `env -u CLAUDECODE bun test src` from `apps/wbs/mcp-01`                                                                                                                                                                                                                                                                                 | 323 pass, 0 fail, 1,132 expectations                                                                              |
| `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /tmp/wbs-openapi-010-4-7.json`                                                                                                                                                                                                                                                      | exit 0; generated add/update command enum includes FS, SS and FF, also checked by the MCP generated-document test |

R5 production-path fault injections, all restored with adjacent `Proof:` comments:

| Fault injected                                                  | Observed negative                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Relax typed command schema to any string                        | Mounted SF request returned 422 rather than input-boundary 400.                                                             |
| Relax typed update schema to any string                         | Mounted SF update returned 422 rather than input-boundary 400.                                                              |
| Accept every string in the application write predicate          | SF application command returned `{ ok: true, value: "item-7" }` instead of `unsupported_relationship_type`.                 |
| Bypass journalled endpoint/type comparison                      | Type-only stale undo returned 200 instead of 409.                                                                           |
| Omit `addDependency` from the runner's combined-graph check     | SS-then-legacy cycle batch returned 200 instead of 409 at command 1.                                                        |
| Exclude the proposed legacy edge from the direct combined graph | Direct legacy add returned `{ ok: true, value: null }` instead of `cycle`.                                                  |
| Skip replay's combined-graph check with SS stored               | Undo returned 200 instead of 409.                                                                                           |
| Force FF to FS on export                                        | Import/export round trip expected FF but received FS (0 pass, 1 fail).                                                      |
| Permit missing v5 relationship type                             | Mounted import returned HTTP 204 instead of 400 (0 pass, 1 fail).                                                           |
| Apply v5 type schema to a v4 import                             | v4 SS relationship was accepted instead of refused (0 pass, 1 fail).                                                        |
| Retain a source predecessor ID in subtree copy                  | Mounted copy suite: 1 pass, 2 fail; copied FF relationship was absent from the remapped pair.                               |
| Substitute live FS for a captured saved-plan FF                 | Mounted saved read expected FF but received FS (0 pass, 1 fail).                                                            |
| Return stale type after working-plan update                     | Retained read expected SS but received FF; strengthened later-command read received FS instead of FF (each 0 pass, 1 fail). |

The first full SQLite run reported 1,028 pass and 4 fail: three tests still treated SS as unreadable, and a cached-median performance threshold failed during concurrent project tests. The unknown-type fixtures now inject SF through SQLite's test-only `ignore_check_constraints` pragma. Their two-file rerun passed 16/16; the performance file passed 8/8 in isolation; the final full SQLite run passed 1,032/1,032. The first full core run reported 718 pass, 1 fail from a stale v4 export expectation; the final core run passed 719/719.

The full host gate and build were not run, as this slice must remain uncommitted and the request explicitly excludes the full gate. No frontend files were changed, so the fe-01 test target was not run.

Final static checks:

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run <project>:lint:fast` and `:typecheck` each exited 0 for `wbs-domain`, `wbs-contracts`, `wbs-core`, `wbs-store-sqlite`, `wbs-be-01` and `wbs-mcp-01`. Core's module typecheck also exited 0.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck` exited 0, including module checks.
- `git diff --name-only -z | xargs -0 bunx prettier --check` exited 0: all touched files use Prettier style. `git diff --check` exited 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 139 passed, 0 failed. It reported informational archive-base warnings for still-unarchived prerequisite specs.

## 2026-09-28 solver-wire v2 review fixes

The FF start weight now ceilings the unsnapped difference of canonical real durations. The serial baseline carries each FS, SS and FF predecessor start bound, including an FF bound after a zero-unit predecessor. Python solver 0.1.4 retires cached `14+0.1.3` integer-infeasibility certificates. The v2 schema says null estimates have zero solver duration in both copies.

Observed red/green proofs:

- `ffStartWeightUnits(0.03 + 1e-12, 0.03)` and the two sides of the `1/48` unit boundary: the old snap failed both focused tests; after removal the focused 72-test contracts selection passed. Restoring the snap also made the request-to-materialization boundary case fail with upper-side wire weight 1 instead of 2. Restoring the snap temporarily made the production request round-trip test fail with FF wire weight 0 instead of 1; restored code passed.
- The serial fallback with A=`5e-10` days and B unknown returned both starts at zero before predecessor bounds; the focused baseline case failed. With weighted bounds, B starts at or beyond A+1 and the case passed.
- An old `14+0.1.3` `plan-infeasible` row was read under the current request fixture before the version bump (`Expected: miss, Received: plan-infeasible`). With solver 0.1.4, the old-key read still returns the certificate and the current-key read misses.
- Python helper guard scope is explicit. Disabling both the typed-edge guard and `validate_request`'s schema call made the production entrypoint's malformed-edge test fail in all three subcases (`RequestRejected not raised`). Both protections restored.
- Bun revalidation now tests a forged FF weight with `canonicalInput`. Disabling both its direct FF weight comparison and the canonical edge signature's weight made that production-shaped test fail (`Expected: false, Received: true`). Both protections restored.

Final observed checks: repository-root `env -u CLAUDECODE bun test libs/wbs/domain/contracts/solver`: 290 pass, 0 fail; `env -u CLAUDECODE bun test libs/wbs/domain/domain`: 771 pass, 0 fail; Python `/home/df/wd/puni/puni-plan/venv-solver-py/bin/python -m unittest discover -s tests -t tests` from the solver package: 226 tests, OK. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast typecheck -p wbs-contracts wbs-domain wbs-be-01 --skip-nx-cache --output-style=static`: 7 targets succeeded with the cache skipped. `bunx prettier --check` on modified TS, JSON and Markdown files, `cmp` on the v2 schema copies, and `git diff --check` all exited 0. Ignored `dist/` was removed after typecheck.

`env -u CLAUDECODE bun test src/service` from be-01: 461 pass, 1 skip, 1 fail. The failed `optimization-spawn-handshake.proc.db.test.ts` case timed out waiting for a child-process marker at line 185; it also failed in an isolated rerun. The version-sensitive mounted service test passed after its expected release key was updated. Full gate and build were not run in this uncommitted review pass.

At that review checkpoint, mounted DB tests, build, and the h2puni gate remained unverified.

## 2026-09-28 weighted FF horizon review fix

For A=`1/48 + 1e-12`, B=`0`, FF, the generated request has `startWeightUnits=2`, baseline B start `2`, and `horizonUnits=2`. Every baseline start plus duration is at most the horizon. Python accepts the matching two-slice request through `validate_request`; CP-SAT accepts the baseline with both starts pinned. The horizon is the latest floor plus all durations plus each positive FF weight excess over predecessor duration. Serial topological placement can pay every such excess and thus stays within the CP-SAT start domain when deadlines permit placement.

Proof: before adding the FF placement gaps to preflight, `env -u CLAUDECODE bun test libs/wbs/domain/contracts/solver/src/build-solver-request.test.ts` reported 14 pass / 1 fail: the generated B baseline finish was 2 and the horizon was 1. With the gap included, the focused builder and preflight run reported 30 pass / 0 fail. The adjacent `Proof:` comment is on the horizon calculation.

Observed checks: repository-root `env -u CLAUDECODE bun test libs/wbs/domain/contracts/solver libs/wbs/domain/domain` reported 1,067 pass / 0 fail across 80 files; `/home/df/wd/puni/puni-plan/venv-solver-py/bin/python -m unittest discover -s tests -t tests` from `libs/wbs/adapters/solver-py` reported 227 tests, OK. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast typecheck -p wbs-contracts wbs-domain --skip-nx-cache --output-style=static` reported four successful targets. `bunx prettier --check` on the modified TypeScript files and this verify file, and `git diff --check`, exited 0. The focused builder test after the final exact-horizon assertion reported 15 pass / 0 fail; the focused Python validation and CP-SAT test after matching its horizon to 2 reported 1 test, OK. The h2puni gate was not run because it checks out a committed SHA and this fix remains uncommitted.

## 2026-09-28 fractional replay and read-contract review fixes

Weighted Fast replay now checks finite pins and explicit floors before tiling, then checks FS/SS/FF dependencies against materialized boundaries. A two-step A beginning at day 2 with two `1/3`-day steps and a one-day FF successor B pinned at `1.6666666666666665` replays with both finishes at `2.6666666666666665`. The new regression failed before the fix at the nominal weighted floor (18 pass / 1 fail) and passed after it (19 pass / 0 fail). The all-FS Fast golden corpus reproduced every stored schedule value in the domain run.

The SQLite read tests now accept stored SS and FF, and inject unsupported `SF` past the SQLite check constraint to test read and bulk-removal refusals. The rollback restore test was also updated: SS/FF restore and remain readable, while `SF` is refused atomically. Before correction, the repository suite had two stale SS refusal failures (7 pass / 2 fail), and the first full mounted store run had the stale rollback refusal (1,032 pass / 1 fail).

Observed fault injections, each restored:

- Removing `Number.isFinite(start)` made the `schedule()` non-finite pin cases fail for NaN and Infinity (1 pass / 2 fail); removing the explicit-floor comparison accepted B at day 1 below its day-2 floor (0 pass / 1 fail). Reinstating the nominal weighted comparison rejected the valid fractional FF replay (0 pass / 1 fail). The adjacent `Proof:` is at the weighted pin guard.
- Bypassing `isRelationshipType` returned an injected `SF` row from `listByProject` (0 pass / 1 fail); masking `SF` as FS during bulk removal let removal succeed (0 pass / 1 fail). The adjacent `Proof:` comments are at the repository reads.
- Masking saved `SF` as FS during rollback restore moved the refusal to SQLite's insert constraint, so the `unknown relationship type` assertion failed (0 pass / 1 fail). The adjacent `Proof:` is at the rollback read.

Verification: repo-root `env -u CLAUDECODE bun test libs/wbs/domain/domain` reported 772 pass / 0 fail and 39,423 expectations; `env -u CLAUDECODE bun test libs/wbs/domain/contracts/solver` reported 274 pass / 0 fail and 604 expectations. With ignored generated `dist/out-tsc` removed, repo-root `env -u CLAUDECODE bun test libs/wbs/adapters/store-sqlite --timeout=30000` reported 1,034 pass / 0 fail and 9,702 expectations across 77 files. The same command with Bun's default five-second timeout reported 1,033 pass / 1 timeout in a saved-plan conformance case that took 7.8 seconds. An earlier root run also collected generated `dist/out-tsc` tests and failed because they could not resolve workspace aliases or migration paths. `bunx @fission-ai/openspec@1.12.0 validate --all --json` reported 139 passed / 0 failed. The `wbs-domain`, `wbs-contracts`, and `wbs-store-sqlite` `lint:fast` and `typecheck` targets each exited 0. Prettier check over the touched files exited 0. Build and the h2puni gate were not run.
