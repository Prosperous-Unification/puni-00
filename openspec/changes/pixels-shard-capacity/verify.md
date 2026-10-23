# Verification

## Scope and hosted evidence

Base: `5328162f7`. Reviewed 2026-10-23 using the `openspec-verify-change` workflow.
The two delta requirements map to the production shard matrix and required `pixels`
reducer; the focused workflow test covers every scenario. No non-trivial technical
shape requires `design.md`; no glossary or hard-to-reverse decision changed.
The delta spec is pending sync/archive. Exact-head hosted completion remains pending.

[Hosted run 39898917880](https://github.com/Prosperous-Unification/puni-00/actions/runs/39898917880)
canceled shard 1/4 at the 25-minute job cap while Layout gate was running:
161 cases green, zero failed. Chromium installation took 4m15s on shard 1,
versus about 19–21s on the other shards. Shard 2/4's layout step took 21m03s.
The failed run therefore establishes insufficient setup/layout headroom, not a test failure.

Real Playwright `--list` evidence contains 625 cases. Shard 1/4 owns 164 cases;
1/6 owns 138, retaining all 58 Gantt cases; 1/8 owns 80 and moves Gantt elsewhere.
Mapping the old run's observed case pass durations onto eight native partitions
estimates the costs below. These exclude startup and installation and are not
measured eight-shard job durations.

| Shard | Native listed cases | Mapped prior pass cost (min) |
| ----- | ------------------- | ---------------------------- |
| 1/8   | 80                  | 10.2                         |
| 2/8   | 84                  | 9.9                          |
| 3/8   | 119                 | 15.8                         |
| 4/8   | 31                  | 4.7                          |
| 5/8   | 78                  | 4.7                          |
| 6/8   | 85                  | 6.9                          |
| 7/8   | 72                  | 9.9                          |
| 8/8   | 76                  | 6.2                          |

The native lists were inspected from `/tmp/pixels-current-list.json` and
`/tmp/pixels-current-list-{1..8}of8.json`, produced by the independent design review.
A fresh Bun comparison of test IDs confirmed the eight lists cover all 625 cases
exactly once, with no duplicates or omissions. These scratch paths are local evidence,
not durable CI artifacts. The workflow keeps one worker, zero retries,
`fullyParallel: false`, fail-fast disabled, the 25-minute cap and organization
acceptance on shard 1. More jobs may increase runner setup cost and queueing;
only a fresh hosted run can establish the elapsed improvement.

## Failure proofs

All mutations below changed the actual production workflow and were restored.
The targeted command used the scratch preload and explicit `--timeout=10000`.

| Check                              | Injected fault                                                        | Observed failure                                                  |
| ---------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Complete shard oracle              | Existing four-shard production workflow after eight-shard test update | 8 pass / 1 fail; expected 1–8, received 1–4                       |
| Complete shard oracle              | Remove shard 8 from the new matrix                                    | 0 pass / 1 fail; expected 1–8, received 1–7                       |
| Matching CLI partition             | Restore only Layout gate denominator to `/4`                          | 0 pass / 1 fail; expected `/8`, received `/4`                     |
| Preserve full matrix execution     | Set production fail-fast to true                                      | 0 pass / 1 fail; expected false, received true                    |
| Preserve finite allowance          | Lower production timeout to 20                                        | 0 pass / 1 fail; expected 25, received 20                         |
| Required aggregate execution table | Remove affected-arm shard-success assertion                           | 0 pass / 1 fail; `success/affected/failure` exited 0 unexpectedly |

Adjacent `Proof:` comments name each observed fault. The aggregate table also
executes cancellation, unexplained skip, missing shard verdict, failed scope,
unknown stack and the two legitimate success cases.

## Local checks

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=10000 tools/tool-git-hooks/src/hooks/{pixels-workflow,gate-workflow,pr-merge-base}.test.ts`:
  exit 0, 62 pass / 0 fail, 427 assertions across three files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:lint --skip-nx-cache`:
  exit 0, `Successfully ran target lint for project tool-git-hooks`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:typecheck --skip-nx-cache`:
  exit 0, `Successfully ran target typecheck for project tool-git-hooks`.
- Initial Nx invocation hit sandbox socket refusals and printed no target execution;
  its exit 0 was not accepted as evidence. The explicit environment reruns above
  executed both configured targets.
- Parsed workflow comparison against the base, stripping whole-line shell comments:
  equal after changing only matrix entries, display denominator and Layout gate
  denominator. Required aggregate, scope and organization step remain identical.
- `bunx openspec validate --all --json`: exit 0, 272 passed / 0 failed
  (254 changes, 18 specs).

Full `bunx nx run-many -t test lint typecheck build`, full `bunx nx format:check --all`,
the browser suite and canonical `bin/h2puni-gate.sh <sha>` were not run locally.
This repair uses focused checks on pop-os; the parent must obtain exact-head hosted CI
and the isolated h2 gate before release acceptance. No complete CI/gate pass is claimed.
Changed-file Prettier and `git diff --check` exited 0. The final isolated pixels
suite passed 10 tests with 97 assertions. All three implementation tasks are complete;
spec sync and full hosted gates remain pending and block archive/release acceptance.
The implementation is committed from `5328162f7` through this evidence commit;
normal hooks run during commit and their actual outcome is reported to the parent.
No push is authorized for this worktree.
