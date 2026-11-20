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

## Workspace capacity after the 90-minute cancellation, 2026-10-24

Run [40060433745](https://github.com/Prosperous-Unification/puni-00/actions/runs/40060433745)
at `05fd381f5664945478a1da07d9e58919742916d2` started its workspace job at
03:58:16 UTC and was cancelled near 05:28:24 UTC. Nx began at 04:02:13 UTC, leaving about
86m11s before cancellation and no final Nx task summary. The backend suite finished in
42m57s, remote scripts in 31m18s with five failures, devsync in 16m39s, SQLite store in
15m11s, and frontend node unit in 2m48s. The separate frontend test and final typecheck
were still running. The five remote failures and a protected-operation matrix failure are
independent incidents, not evidence that more time would make the gate green.

The configured capacity partition assigns whole projects `wbs-be-01`,
`tool-remote-scripts` and `wbs-fe-01` to separate 90-minute runners with 75-minute Nx
phases. The residual runner owns every other non-Twilight project and retains independent
affected lint; `gate_checks` runs the former non-Nx checks in parallel with a 30-minute
ceiling. Every runner keeps Nx parallelism two, frozen install, native provisioning, exact
scope and a required result. This is a capacity hypothesis until a cold exact-head hosted
run completes all jobs and the stable `gate` reducer. The approximately four minutes of
setup observed in this cancelled run and the prior approximately six minutes of non-Nx
overhead support the finite allowances but do not establish a required duration.

## Twilight allowance, 2026-11-03

PR #787 run [41544558083](https://github.com/Prosperous-Unification/puni-00/actions/runs/41544558083),
Twilight job [125617033412](https://github.com/Prosperous-Unification/puni-00/actions/runs/41544558083/job/125617033412),
was cancelled after exhausting its 75-minute allowance. The retained Nx log reports
2,571 Burokrat tests passing, zero failing, across 104 files in 3719.64 seconds.
Dash was still running store-directory cleanup tests when the log ended. No failed
assertion was observed in that captured log, but it has no complete Dash exit or
successful aggregate verdict; the packed-package phase was skipped. The cancelled
job is not passing validation.

The original Nx artifact is 13192189566; its downloaded ZIP SHA-256 is
`8470a9fe7fa4569a396a6cd445e395cb0eabd822b2604ad937a3d1e9df6358cf`.
The extracted log is retained locally as
`.superpowers/sdd/runtime-write-delivery-20261101/ci41544558083-twilight-nx-gate.log`.

Twilight now declares a finite 120-minute allowance, matching the workspace job.
Only its timeout and adjacent explanation changed: selected phases, commands,
parallelism, cache behavior, resource guards, independent lint and required gate
semantics remain unchanged. This declaration does not establish that the complete
gate passes within 120 minutes. Fresh successful final-head hosted checks and
canonical verification remain required before merge.

The existing focused production-workflow test failed against 75 with
`Expected: 120 · Received: 75` (native exit 1; 0 pass, 1 fail), then passed against
120 (native exit 0; 1 pass, 0 fail). The covering workflow suites passed 40 tests
with zero failures. Original stdout, stderr, native exits and before/after source
hashes are retained in local capture receipts under
`.superpowers/sdd/runtime-write-delivery-20261101/ci-allowance-task1-attempt17-*`;
the implementation report indexes the exact receipts.

## Workspace lint at parallelism one, 2026-11-20

Workspace lint now runs at `--parallel=1`
([R5-32](checks-that-cannot-fail.md#a-lost-hosted-runner-leaves-no-step-conclusion-and-no-log),
A-CI-WORKSPACE-MEMORY-1). In full mode it is now a separate `run-many -t lint` after
`test typecheck build`, which keep parallelism two. In affected mode lint already ran as its
own phase after the tests, so only its parallelism changes. The other shards are unchanged.
This is a cheap narrowing lever: the timings do not place the runner losses in lint.

These are the measurements the estimate starts from:

| Run                                                       | Phase                               | Time     | Task time summed |
| --------------------------------------------------------- | ----------------------------------- | -------- | ---------------- |
| Full, main `d40d0aee8`, run 44496836205, job 135466352451 | one `run-many`, 185 tasks           | 71m21s   | 137.5 min        |
| same                                                      | its 49 lint tasks                   | (inside) | 12.2 min         |
| Affected, PR #955 run 44684301175 attempt 2               | `test typecheck build`, 50 projects | 68m24s   | not summed       |
| same                                                      | `affected -t lint`, 12 projects     | 7m04s    | 11.6 min         |

The full run's critical path was 40m56s (`tool-fleet:test`). The affected lint summary said
"Increase parallelism to recover up to 3m 56s". Its largest tasks were `wbs-fe-01:lint` (3m06s)
and `wbs-be-01:lint` (2m04s). That pull request's whole gate step took 76m12s.

These are estimates, not measurements. In full mode the remaining 125.3 minutes of non-lint
task time take at least 62.7 minutes at two, and likely close to the 71 minutes measured. Lint
then adds about 12 to 13 minutes. That gives 75 to 84 minutes against the 105-minute phase,
which is up to 13 minutes more than before. In affected mode lint takes about 11.6 minutes
instead of 7, so a full-scope pull request would take about 81 minutes instead of 76.

`--parallel=1` for every phase was rejected. The full run's 137.5 minutes of task time already
exceed the 105-minute phase. Even if serial tasks ran a quarter faster without contention, the
run would leave almost no reserve. The next five hosted workspace runs should confirm or
correct these figures.

The workspace gate step now records its runner in `nx-gate.log`. The first record, from the
#957 workspace job at `ab1607590`, was `ubuntu-24.04` image 20261116.376.1 on Ubuntu 24.04.5 LTS
with a Node `heap_size_limit` of 4345298944 bytes (about 4144 MiB). Per-run image versions now
let a duration change be matched against an image roll.

## Heavy bun test shard, 2026-11-20

`gate workspace-heavy` (A-CI-WORKSPACE-MEMORY-2,
[R5-32](checks-that-cannot-fail.md#a-lost-hosted-runner-leaves-no-step-conclusion-and-no-log))
owns `tool-fleet`, `tool-devsync`, `wbs-store-sqlite` and `wbs-core` and runs them at
`--parallel=1`. `wbs-core` is there for memory, not time: its 4-minute test suite peaked at 7.3
GiB RSS in CI and 5.7 GiB locally. The fix at the source is #959.

These are estimates from the full-mode run 44496836205 above, not measurements:

| Shard     | Task time moved or kept                               | Estimated wall time | Phase   |
| --------- | ----------------------------------------------------- | ------------------- | ------- |
| heavy     | tests 85.2 min, lint 4.2 min, typecheck 3.9 min, deps | about 93 min        | 135 min |
| workspace | about 36 min non-lint at two, about 8 min lint at one | about 26 to 30 min  | 105 min |

The heavy shard's 41-minute `tool-fleet:test` is now its single largest task. About 93
minutes of task time at parallel-2 timings would have left only about 12 minutes of a
105-minute phase. So `gate_heavy` has its own finite budget: a 135-minute phase in a 150-minute
job. The workspace shard stays at 105 of 120. Parallel-1 timings are unknown until the first
full-mode heavy logs. Both shards start together, so the slowest
required shard sets the gate's wall time. That is the heavy shard or Twilight, not the
workspace shard.

## One job per heavy project, 2026-11-21

The single heavy job was lost on main `982f36697` (job 136597156506, [R5-32](checks-that-cannot-fail.md#a-lost-hosted-runner-leaves-no-step-conclusion-and-no-log)).
`gate workspace-heavy` is now one matrix leaf per project (A-CI-WORKSPACE-MEMORY-3), each at
`--parallel=1`.

The task times below are per project from the full-mode run 44496836205, measured at
parallelism two. Each budget adds a finite allowance and a 15-minute reserve:

| Leaf               | test     | lint    | typecheck (+ module) | Total    | Phase  | Job    |
| ------------------ | -------- | ------- | -------------------- | -------- | ------ | ------ |
| `tool-fleet`       | 40.9 min | 1.6 min | 0.3 min              | 42.9 min | 75 min | 90 min |
| `tool-devsync`     | 22.0 min | 0.3 min | 0.03 min             | 22.4 min | 45 min | 60 min |
| `wbs-store-sqlite` | 18.5 min | 0.8 min | 0.4 min              | 19.7 min | 45 min | 60 min |
| `wbs-core`         | 3.8 min  | 1.4 min | 0.5 + 2.6 min        | 8.2 min  | 30 min | 45 min |

Dependency builds come on top of these figures. The first hosted heavy run, on #958, ran only
`tool-devsync` with 14 dependency tasks in 15m49s. The leaves start together with the other
shards, so the gate's wall time is now set by the `tool-fleet` leaf or by Twilight.
