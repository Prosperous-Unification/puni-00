# Test time budgets

Bun ends a test at 5 seconds unless told otherwise. On a loaded gate host that default fails
healthy tests at random (WBS 080.15), so every Bun test a target runs states its budget.

## Policy

- Every `bun test` in an Nx target passes `--timeout=<ms>`. The guard is
  `every Bun test command states its own time budget` in
  `tools/tool-devsync/src/workspace-targets.test.ts`.
- Nothing else sets a default. Bun 1.4.2 applies a preload's `setDefaultTimeout` to the first test
  file only and overrides the flag there; later files fall back to 5 seconds. That is why the dev
  poller's overlap test kept timing out at 5000 ms under the shared preload.
  `tools/test/scratch/scratch.test.ts` proves the flag ends a hang in every file.
- A test that needs more than its target's budget states its own as the third argument.
- The target budget is the smallest of 10, 30 or 60 seconds that is at least 3 times the slowest
  idle run and 1.5 times the slowest loaded run. Count only the tests that have no budget of their
  own.
- A test whose own budget timed out on the loaded run gets a new budget. It must be at least 3
  times its idle time and twice the budget it overran, since the loaded run did not show how long
  the test really needed. Round it up to a step: 20, 30, 45, 60, 90, 120, 180, 240 or 420 seconds.
- A budget still ends a hang: Bun kills the test's subprocesses when it times out.

## Measurements, 2026-09-27

Workstation, 24 cores, Bun 1.4.2. Each project's `test` target was run through Nx with
`--skip-nx-cache` and a 600-second `--timeout`, so no test was cut short by its target budget.
Tests with their own budget still timed out at that budget.

- **Idle:** one target at a time. Other agent lanes shared the host (load average 5 to 40),
  so this is a lower bound on idle load, not a quiet host.
- **Loaded:** four targets at once, the gate's Nx parallelism, plus 24 busy-loop Bun processes.
  Load average was 55 to 60 across the run, harsher than the h2puni gate where the incidents
  happened (8 cores, four Nx tasks).

Slowest test without its own budget, in seconds:

| Project                        | Idle | Loaded | `--timeout` (s) |
| ------------------------------ | ---- | ------ | --------------- |
| harness-example                | 1.0  | 1.8    | 10              |
| shared-failures                | 0.0  | 0.1    | 10              |
| shared-validation              | 0.0  | 0.0    | 10              |
| tool-bootstrap                 | 0.0  | 0.2    | 10              |
| tool-compose                   | 0.0  | 0.0    | 10              |
| tool-dagger                    | 0.3  | 2.0    | 10              |
| tool-deploy                    | 0.2  | 0.5    | 10              |
| tool-dev-setup                 | 0.0  | 0.1    | 10              |
| tool-devsync                   | 1.1  | 10.3   | 30              |
| tool-fleet                     | 1.4  | 9.9    | 30              |
| tool-git-hooks                 | 0.3  | 0.8    | 10              |
| tool-observability-stack       | 0.0  | 0.1    | 10              |
| tool-remote-scripts            | 0.4  | 3.8    | 10              |
| tool-secrets                   | 0.0  | 0.0    | 10              |
| tool-smoke                     | 0.5  | 0.5    | 10              |
| tool-test-scratch              | 5.3  | 5.3    | 30              |
| tool-workflows                 | 12.7 | 30.2   | 60              |
| twilight-burokrat              | 8.3  | 24.2   | 60              |
| wbs-auth                       | 0.1  | 0.0    | 10              |
| wbs-be-01                      | 2.9  | 4.1    | 10              |
| wbs-config                     | 0.0  | 0.0    | 10              |
| wbs-conformance                | 0.0  | 0.0    | 10              |
| wbs-contracts                  | 0.1  | 0.3    | 10              |
| wbs-core                       | 0.5  | 0.8    | 10              |
| wbs-domain                     | 0.2  | 1.6    | 10              |
| wbs-gw-01                      | 0.4  | 0.5    | 10              |
| wbs-mcp-01                     | 0.5  | 2.0    | 10              |
| wbs-observability              | 0.0  | 0.0    | 10              |
| wbs-realtime                   | 0.1  | 0.0    | 10              |
| wbs-runtime-portable           | 0.1  | 0.1    | 10              |
| wbs-solver-supervisor-protocol | 0.0  | 0.0    | 10              |
| wbs-store-memory               | 0.3  | 1.8    | 10              |
| wbs-store-sqlite               | 5.1  | 17.3   | 30              |
| wbs-validation                 | 0.0  | 0.0    | 10              |

Where one project has several Bun targets (`test:unit`, `test:api`, `test:conformance`,
`test:store`, `test:package`, `integration`), they all use that project's budget.

## Tests given a new budget of their own

On the loaded run these timed out at their own budget. They were raised by the rule above:

- `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the production index checker:
  30 to 60 s (10.1 s idle).
- `tools/tool-fleet/src/discover.test.ts`, the production discover command: 10 to 30 s
  (5.7 s idle).
- `libs/wbs/adapters/store-sqlite`: terminal certification, 30 to 120 s (17.2 s idle; its
  loaded run took 58.1 s). The fresh-attempt case after a held lock: 9 to 30 s (4.0 s idle).
  On 2026-09-29 (WBS 080.12) every case that starts a saved-plan lock holder went to 60 s
  (`HOLDER_CASE_BUDGET_MS`): at load average 98 to 137 the holder's cold start alone took 19
  to 34 s and overran 30 s.
- `apps/twilight-structure/twilight-burokrat/cli`: 57 budgets in 13 files. Most went from 15 to 30 s
  or 20 to 45 s. The seven radical-modularity pilot cases went from 120 to 240 s. The slowest
  pilot case went from 180 to 420 s (132 s idle).
- `apps/twilight-structure/twilight-burokrat/cli/src/indexes/indexes.test.ts`: its two
  README-cycle cases bounded the CLI subprocess at 3 s. Under load they were killed at about
  3.2 s, so that bound is now 20 s.
- `tools/tool-workflows`: its file-level `setDefaultTimeout(30_000)` was replaced by the
  target's 60 s. One case timed out at 30.2 s on the loaded run.

## Vitest (fe-01), WBS 080.16

Vitest also ends a test at 5 seconds, and a hook at 10. The gate reached that on fe-01: a keyboard
test that takes 1.8 s on a workstation took 5.7 s in CI (pull request 87), and another fe-01 test
timed out at 5 s (pull request 89).

- Every `vitest` in an Nx target passes `--testTimeout=<ms>` and `--hookTimeout=<ms>`. The guard is
  `every Vitest command states its own time budgets` in
  `tools/tool-devsync/src/workspace-targets.test.ts`.
- The configs set no budget, as with Bun: the command line is the one place it lives, and a flag
  beats the config. `apps/wbs/fe-01/vitest-budget.test.ts` runs the real config and setup file over
  a hung test and a hung hook and proves both end at the budget the command line states.
- The target budget follows the Bun rule above. Hooks get the same budget as tests: Vitest's JSON
  report gives no hook times, and fe-01's hooks render and mount under the same load as its tests.
- fe-01 keeps its serial flags, `--no-file-parallelism --maxWorkers=1`.

Measured 2026-09-27 on the same workstation, with Vitest 5.0.0 and a 600-second budget. Idle ran
the three commands one at a time beside other agent lanes (load average 10 to 18). Loaded ran them
beside 24 busy-loop Bun processes (load average 40 to 50). Slowest test without its own budget, in
seconds:

| Command                 | Idle | Loaded | Budget (s) |
| ----------------------- | ---- | ------ | ---------- |
| `test`, UTC half        | 3.5  | 13.7   | 30         |
| `test`, zoned half      | 0.2  | 0.8    | 30         |
| `test:unit` (node tier) | 2.6  | 4.5    | 30         |

The UTC half took 11 minutes idle and 37 minutes loaded. Its slowest case,
`plan-dependencies.test.tsx`, needs 30 s: 3 times idle is 10.4 s and 1.5 times loaded is 20.6 s.
All three commands share one budget so the target reads as one.

`playwright-config.test.ts`'s login probe timed out at its own 10 s bound on both the idle and
the loaded `test:unit` run (2.3 s in the idle UTC half). By the rule above it is now 20 s, and its
case budget 30 s so the probe still reports first.

## Found under load, outside this budget

These tests failed on the loaded run, but not at a time budget. They need their own work items:

- tool-dagger `owns SIGTERM cleanup while engine startup is still in progress`: ENOENT.
- tool-devsync `product lint policy discovery > refuses a policy that is not a function…`.
- wbs-domain `schedules 600 slices in under 20ms`: a speed assertion.
- wbs-store-sqlite: the median-ratio benchmark, and `refuses at once…` against its refusal
  bound. Both were speed assertions. WBS 080.12 fixed both: the benchmark now compares CPU time
  and checks each sample's read counts, and the refusal is told apart from a wait by its outcome.
- twilight-burokrat: `a competing recovery cannot clear publication while Git holds prepared ref
locks` and two `review invocation provenance` cases. All three failed at about 3 s.
