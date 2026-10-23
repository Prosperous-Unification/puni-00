# CI gate duration

WBS 080.02, measured 2026-09-28. The `gate` job in `.github/workflows/ci.yml` took about
62 minutes. The Nx step alone took 54–56 minutes and needed the 90-minute cap.

## Measurements before the split

These come from the step timings of three green gate runs: push to main `262d006c` (run
36454449115), then pull-request runs 36459947779 and 36456068116. Per-task times come from
that main run's `nx-gate-log-1` artifact.

| Part of the single job                                           | Time                   |
| ---------------------------------------------------------------- | ---------------------- |
| Nx step: `test lint typecheck build` for 35 projects (121 tasks) | 29m35s                 |
| Nx step: `twilight-burokrat` test, typecheck and build           | 25m52s                 |
| Nx step: `twilight-burokrat:lint:source`                         | 23s                    |
| **Nx step in total** (runs 1 / 2 / 3)                            | 55.9 / 54.6 / 54.4 min |
| Format, packed suite, solver smoke, lock tests, everything else  | about 6 min            |

- **Root cause.** The two Nx runs ran back to back (`&&`) and share no task.
  `twilight-burokrat:test` is a single task that ran for 25m52s (792 tests in 41 files, 1551s).
  Nothing else waits on it, but it sat on the critical path after the whole workspace run.
- In the workspace run, Nx reported a critical path of 17m19s (2 tasks). That path is mostly
  `wbs-fe-01:test`: vitest reported 957.68s for 159 files. The next-slowest tests are
  `wbs-be-01` (316s) and `wbs-store-sqlite` (260s). Nx reports "Recoverable time 12m16s (41%)"
  at `--parallel=2`.
- **Cache.** 0/121 and 0/3 tasks hit the cache. CI keeps no Nx cache between runs and has no
  remote cache. Every run is cold, as the gate intends.
- The runner is GitHub's standard `ubuntu-latest` (4 vCPU for a public repository). Nx
  parallelism is pinned at 2. The Nx step in `ci.yml` records why: the gate's verdict must not
  depend on how many unrelated tasks share the runner.
- A pull-request run is no faster than a push run: the 3276s and 3263s PR steps match the
  3353s push step. The pull requests sampled touched shared inputs, so `nx affected` selected
  every project.

## Change

The gate is now split into four jobs. `ci.yml` is the source of truth; the jobs are:

- `gate_mode` decides the scope once for both shards.
- `gate_workspace` runs the workspace Nx run and every other gate step.
- `gate_twilight` (the Twilight shard, named `gate_tool_wiki` until 2026-10-12) runs Twilight
  Burokrat's targets, its source lint and the packed suite, and Twilight Dash's targets and lint.
  It runs only when `gate_mode` puts either project in scope.
- `gate` is the single required check. It uses `if: always()` and reduces the other three the
  same way `pixels` reduces its browser shards.

Each shard keeps `--parallel=2`, so the load on each runner is unchanged. No work was removed.
The integrator and `tool-deploy`'s descriptor read the check named `gate`, and that check
still exists. Before 2026-10-23, GitHub had no branch protection or ruleset requiring
checks on `main`; the only ruleset covered release tags. Since 2026-10-23, active
ruleset `25730010` (main merge checks) requires a pull request and the `gate` and
`pixels` verdicts from GitHub Actions on `main`, with zero required approvals,
no bypass actors and no latest-base refresh requirement. Documentation-only
changes retain the existing document checks and explicit runtime/browser skips.

Proofs: `tools/tool-git-hooks/src/hooks/gate-workflow.test.ts` runs the production `gate`
script with each shard result, and its `Proof:` comments record the faults that were watched
failing.

Since the 2026-10-12 rename the shard also runs `twilight-dash`, which receives the activation
controller (WBS a81d93a0). The workspace shard and `bin/h2puni-gate-steps.sh` exclude both
projects. The measurements below predate the rename and still name the shard Tool Wiki.

## Measurements after the split

These are from PR #195 at `ea04c22f`.

| Run                                                        | `gate` job(s)                      | Wall time to `gate` |
| ---------------------------------------------------------- | ---------------------------------- | ------------------- |
| Before: push to main `262d006c`, run 36454449115 (full)    | 62m53s                             | 62m57s              |
| After: dispatch run 36473105834 (full mode, every project) | workspace 26m35s, Tool Wiki 29m16s | 29m48s              |
| After: pull-request run 36472328583 (affected)             | workspace 5m25s, Tool Wiki 22m22s  | 22m54s              |

In the full run, the workspace Nx step took 22m21s and the Tool Wiki Nx step took 26m37s.
The Tool Wiki shard is now the critical path.

## Alternatives not taken

- **Raise `--parallel` to 4.** The Nx step's note rejects this because the verdict would
  depend on how many tasks share the runner. The Tool Wiki suite is one 26-minute task, so
  more parallelism would not shorten it anyway.
- **Persist the Nx cache in CI or connect Nx Cloud.** Tests would replay from cache instead
  of running, and the gate is deliberately uncached (`--skip-nx-cache` on source lint, and the
  host gate runs uncached).
- **Next step, if needed.** After the split, `twilight-burokrat:test` alone bounds the gate
  at about 26 minutes. Sharding that suite, or moving `wbs-fe-01:test` into its own job, is
  the next split.

## Twilight allowance, 2026-10-20

The current Twilight job keeps a finite 75-minute allowance. In PR584 run
[39330836237](https://github.com/Prosperous-Unification/puni-00/actions/runs/39330836237),
the Burokrat test task alone took 49m25s. That run failed assertions; it was not a
timeout observation. The separately successful packed-package step in post-merge
run [39330011791](https://github.com/Prosperous-Unification/puni-00/actions/runs/39330011791)
took 4m45s. Together those observations exceed the former 50-minute allowance
before setup and other work. They come from different runs and do not establish
an exact required minimum. The chosen 75 minutes leaves bounded scheduling
headroom while retaining every check, uncached execution and parallelism of two.
The independent installed-survey 4 GiB/900-second resource guard is unchanged.

Run [39340424241](https://github.com/Prosperous-Unification/puni-00/actions/runs/39340424241)
then passed 2,346 Burokrat tests and failed only the stale assertion that still
expected 50 minutes. Its main test task took 42m44s; the packed suite was skipped
after the failure. The focused allowance test now expects 75. Temporarily
restoring the production workflow to 50 made that test fail with
`Expected: 75 · Received: 50`; restoring 75 passed. The raw focused outcomes and
unchanged guard are retained in the
[allowance evidence](../../openspec/changes/burokrat-serial-legacy-compiler/evidence/ci-allowance/README.md).
