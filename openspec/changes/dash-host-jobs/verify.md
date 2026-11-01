# Verify — dash-host-jobs

## Slice 2 — ledger extension, admission, settlement (tasks 2.1–2.3)

Branch `feat/dash-host-jobs-2-ledger` from `plan/dash-host-jobs` at `39af9f692`, 2026-11-01, on
the 24-core workstation (another worker beside it, load average 9 to 12). Code:
`apps/twilight-structure/twilight-dash/cli/src/resources/{runtime.ts,host-pool.ts}`; tests:
`host-pool.test.ts`, `host-jobs.test.ts`, `host-jobs.model.test.ts` with the fixtures
`host-pool.test.fixture.ts` and `host-job-launcher.test.fixture.ts`.

### Assumptions (open decisions taken per design.md; overrulable by id)

- **A1** Configuration schema 3 is required; schema 2 is refused naming the five fields to add,
  as schema 1 already is. No compatibility shim (no external users).
- **A2** The ledger gains `user_version` 1. A version-0 ledger (the four `dash-resource-cleanup`
  tables, no `user_version`) migrates forward inside `ResourceRuntime.open`, in one
  `BEGIN IMMEDIATE`, only when its pinned binding equals the configuration's version-0 fields;
  any other version is refused. No separate migrate command. A pre-slice Dash refuses a
  migrated ledger through its own binding check.
- **A3** The pool mode lives in the ledger (`host_pool.mode`, written `observe` at init), not in
  the configuration, so editing the configuration cannot bypass slice 6's fenced switch.
- **A4** The enrollment identity is the configuration's `enrollmentId`, pinned in the binding.
- **A5** `nproc` and `MemTotal` reach init through a `HostFacts` port (`linuxHostFacts` in
  production) so the spec's 8-core, 15 GiB scenarios run on small CI runners; the refusal is
  also proven against this host's real `/proc/meminfo` and `nproc`.
- **A6** A host job reserves `tmpDiskGib` as disk units (ceiling under `diskUnitBytes`) and one
  workspace slot: its private tmp directory is a managed directory under the root (J7).
- **A7** Every exclusive unit must be the top of a Git work tree; its settlement evidence is
  "no live hold, clean, HEAD at the resting commit recorded at admission". A unit of any other
  kind has no defined evidence and is refused at init.
- **A8** Arrival order is the ticket's `AUTOINCREMENT` sequence, assigned under the write lock;
  the ticket stores `arrived_at` in epoch milliseconds (epoch nanoseconds exceed JavaScript's
  safe integers). Deadlines are epoch milliseconds from the injected wall clock because other
  processes compare them, as the shell lock's tickets carry epoch seconds.
- **A9** A ticket is live while its waiter's full identity (pid, boot, start) is alive, which is
  stronger than the lock's pid.
- **A10** A job admitted but never launched stays charged (`unknown`) until its launcher is gone
  and the existing 60-second launch grace has passed; the FD gate opens only after the identity
  is persisted, so no identity means no payload ran. This mirrors the runtime's dead-creator
  recovery and is not release on launcher death alone.
- **A11** Host-job events go to a local outbox `host_job_events` in the same transaction as each
  change; the WBS `events` outbox's v1 contract has no `host_job` kind, so slice 5 publishes.
- **A12** Container evidence is a port (`ContainerEvidence`). `watch`'s sweep settles host jobs
  with `declaredContainersOnly`: `containers: none` has nothing to wait for; a declared bound
  stays charged until slice 3 reads Docker.
- **A13** No CLI in this slice: a top-level `pool` command already exists (`pool import`), and
  an `ops` namespace dispatch is more than a few lines; `resources init` initializes the pool.
  `ops pool init|inspect` lands with slice 3.
- **A14** A 75 refusal names waiting tickets ahead and every unreleased job on the host.
- **A15** Slice 3's launcher calls `prepareHostJob`, `recordHostJobLaunch` and
  `recordHostJobExit`; this slice spawns nothing itself.
- **A16** `captureDescendants` and `ownedProcessesAlive` now take a structural `OwnedGroup`, so
  host jobs reuse the worktree runtime's `/proc` and pidfd evidence unchanged.
- **A17** A tree is clean when `git status --porcelain --untracked-files=all` is empty; ignored
  files (a gate tree's `node_modules`) do not block.

### Race model and fault injection

`host-jobs.model.test.ts` runs `fc.asyncModelRun` 60 times (three fixed examples, then random
draws of up to 80 commands) with five contenders, each a real waiter process, over two ledger
connections: arrivals of five types (gate with a tree, build, whole-pool calibration, declared
containers, larger than the host), polls, cancellations, preparations, real payload launches,
payload exits, container stops, clock advances (budget, reclaim minute, launch grace),
settlement sweeps and a waiter crash at each boundary (ticket, admitted, prepared, launched).
Invariants after every command: reservations within `allocatable`, each tree held by at most
one job, no compute release without terminal evidence; the model predicts every poll outcome
and every settled state independently of `chooseWaiter`. The three examples alone reach every
coverage counter (checked with `numRuns: 3`): admitted 9, barrierHeld 2, severalBarriers 4,
treeBound 1, calibration 2, reclaimed 1, budgetRefused 1, waitZeroRefused 1, oversize 1,
surviving 1, neverLaunched 1, released 6. The second test races six Bun launcher processes,
six rounds each, against one ledger file and replays `host_job_events`.

Each fault was injected by exact text replacement (a scratch script outside the repository; test run in
the private namespace, file restored and its digest checked), all against the final code:

| Fault injected                                                           | Test that went red                                                   | Observed                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `.immediate()` → `.deferred()` in the runtime's `transaction`            | `launcher processes racing one ledger file never overcommit`         | contenders crashed `SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT`            |
| reservations read before the admitting transaction (TOCTOU split)        | same race test                                                       | replay: tree held by 2 jobs (`<= 1`, received 2)                     |
| unit check dropped from `fits` (and the first unit taken when none free) | model run                                                            | poll expected `waiting`, received `admitted`                         |
| barrier dropped in `chooseWaiter`                                        | model run; `a third gate is overtaken, then barred`                  | expected `waiting`, received `admitted`                              |
| compute released on launcher death                                       | model run; `surviving children keep the charge`                      | model: expected `unknown`, got `released`; scenario: 10 GiB admitted |
| compute released on a recorded exit code                                 | `surviving children keep the charge`                                 | expected `refused`, received `admitted` (admitted over the child)    |
| an MCP admission call before host-job admission                          | `admits a host job with no WBS call while WBS refuses everything`    | `Streamable HTTP error: Error POSTing to endpoint: refused`          |
| schema-2 refusal dropped                                                 | `refuses schema 2, naming the host pool fields`                      | only `Validation failed for schemaVersion`                           |
| duplicate unit check dropped                                             | `init refuses duplicate unit paths, by name and by alias`            | load did not throw                                                   |
| `nproc` / `MemTotal` checks dropped                                      | `init refuses a budget above MemTotal and nproc`                     | init returned a runtime                                              |
| unknown-version refusal dropped                                          | `refuses a ledger version it does not know`                          | fell through to the version-0 table check (second guard)             |
| migration binding check dropped                                          | `migrates a version-0 ledger forward, only under its own binding`    | another authority's ledger was rebound                               |
| dirty-tree status check dropped                                          | `a dirty tree is not returned`                                       | unit `released` with `stray.txt` present                             |
| oversize (73) refusal dropped                                            | `refuses an envelope larger than the host, exit 73 without a ticket` | the 14 GiB gate was queued                                           |

Two faults first survived and changed the tests: with 4-core gates the model's cores ran out
before its trees, so dropping the unit check passed; the model's gate is now 2 cores and 4 GiB
and an example drives a third gate onto two held trees. Random draws rarely built a barrier;
the examples now build two and show the oldest applying.

### Review fixes (Fable, PR #804, MERGE AFTER FIXES)

What changed:

- **S1 (blocking).** A wait-zero ticket's deadline is its arrival time. The enqueue's FULL fsync
  already puts that in the past, so the "budget spent" branch refused it 75 on an empty pool
  under a real clock. The branch now applies only when `waitSeconds > 0`. A wait-zero ticket is
  decided once: admitted if it fits, else refused 75 by the no-room branch.
- **S2, outbox churn.** A tmp entry that is `blocked` with a deletion intent stays `blocked`; it
  no longer flips back to `held`. Both settlement transactions now write an event only when the
  entries, state or evidence identities change (`settlementOf`). Otherwise they save only the
  retry schedule.
- **S2, R5 proofs.** Added `Proof:` comments on the refusals that were tested but uncommented.
  Added tests for:
  - both `tmpIntent` blocked branches;
  - a replaced tmp directory or a symlink in its place;
  - version-0 unexpected tables;
  - the duplicate exclusive id;
  - the prepare, launch and exit seam guards;
  - an unreadable pool mode;
  - one table-driven test for the pool-shape refusals;
  - the init unit refusals: not a directory, an inode duplicate through a real bind mount
    inside the namespace, dirty, held.
- **S3.**
  - Init refuses a dirty or held unit.
  - Admission hands out only a ready unit: readable and clean, with its HEAD read in the same
    transaction. A dirty or broken free unit is not free; the waiting outcome names it
    (`unavailableUnits`) and so does the 75 refusal. A broken unit no longer crashes the
    admitting transaction.
  - `git()` errors now name the subcommand and the tree.
  - Reclaim lines are reported after commit.
  - The 0→1 migration prints one line naming the ledger and the step.
  - A `blocked` job backs off: one second, doubling to a one-minute cap.
  - Model draws are biased: seven contenders, extra gate, build and calibration arrivals, more
    polls. Half the random runs start from a barrier seed (a build held, a calibration waiting,
    two builds past it). The test asserts that random runs form more barriers than the three
    examples do (the examples form 2).
  - The spec scenario "A third gate is overtaken, then barred" now states its pool: 16 cores,
    34 GiB, headroom 0 cores and 2 GiB, two trees. The test always ran on that pool; the first
    scenario's 8-core pool cannot hold two gates and three builds.

New assumptions:

- **A18.** A `blocked` host job uses the worktree cleanup's retry delays (1 s doubling to a 60 s
  cap) but not its six-attempt exhaustion. A blocked tree is resolved by an operator, and no
  retry command exists before slice 3, so exhaustion would strand a resolved tree. `unknown` and
  `held` jobs are still read every tick, because termination must be seen promptly.
- **A19.** Admission checks a free unit's readiness with `git status` and `git rev-parse`, but
  not `inspectHolds`. A full `/proc` scan on every poll was judged too costly. Holds are
  checked at init and at settlement, which is when a unit returns.
- **A20.** The migration line goes to stderr. `ResourceRuntime.open` has no report sink, and
  this happens once per ledger.
- **A21.** The `waiting` outcome gains `unavailableUnits`: the free units that cannot be handed
  out now, each with its reason.

Model counters on one run after the bias: barrierHeld 3–18, severalBarriers 4, barrierFormed
12–15, treeBound 4–30. The examples alone contribute barrierHeld 2, severalBarriers 4,
barrierFormed 2 and treeBound 1.

Faults added to the table, all against the final code:

| Fault injected                                                                                   | Test that went red                                                         | Observed                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| budget-spent branch without the `waitSeconds > 0` guard (S1)                                     | `a wait-zero caller on an empty pool is admitted under an advancing clock` | expected `admitted`, received `refused`                               |
| budget-spent check disabled                                                                      | `a waiter past its budget is refused 75 …`                                 | outcome differs from the 75 refusal                                   |
| wait-zero-ahead check disabled                                                                   | `a wait-zero caller is refused 75 while a live ticket is ahead …`          | admitted                                                              |
| reclaim skipped                                                                                  | `dead tickets are reclaimed by whoever sees them …`                        | no lines                                                              |
| `blocked` → `held` flip restored in `tmpIntent`                                                  | `a blocked tmp directory adds no outbox rows …`                            | revision 4 → 8                                                        |
| event on every settlement pass                                                                   | same                                                                       | revision 4 → 8                                                        |
| backoff dropped                                                                                  | same                                                                       | `settleAttempts` 1 → 2 without time passing                           |
| "present without a recorded identity" dropped                                                    | `a tmp directory nobody recorded stays charged`                            | entry released                                                        |
| "absent without a deletion intent" dropped                                                       | `a tmp directory removed behind the runtime stays charged`                 | entry released                                                        |
| tmp identity check (symlink, replaced inode) dropped                                             | `a replaced tmp directory or symlink stays charged and untouched`          | `released`                                                            |
| resting-commit check dropped                                                                     | `a dirty tree is not returned`                                             | "tree clean at its resting commit" on a moved HEAD                    |
| version-0 unexpected-tables check dropped                                                        | `refuses a version-0 ledger with unexpected tables`                        | migrated                                                              |
| duplicate exclusive id check dropped                                                             | `the host-job seams refuse out-of-order calls`                             | gate queued                                                           |
| launch guard, exit guard dropped                                                                 | same                                                                       | accepted                                                              |
| prepare guard dropped                                                                            | same                                                                       | refused only by mkdir `EEXIST` (second guard)                         |
| pool-mode check reduced to `undefined`                                                           | `status refuses an unreadable pool mode`                                   | bare `TypeError`                                                      |
| headroom, exclusive id, empty unit list, absolute path, root overlap checks (each dropped alone) | `the pool shape refuses each malformed statement`                          | the config loaded                                                     |
| not-a-directory check dropped                                                                    | `init refuses each unit the host cannot hand out`                          | refused only as "not the top of a Git work tree" (second guard)       |
| inode-duplicate check dropped                                                                    | same                                                                       | refused only as "held: mounted target remains charged" (second guard) |
| init clean check, init hold check (each dropped)                                                 | same                                                                       | `initialized`                                                         |
| free-unit clean check dropped                                                                    | `a dirty or broken free unit is not free, and is named`                    | the gate was admitted onto the dirty tree                             |
| removal exit-code check alone dropped                                                            | `a failed cleanup leaves the tmp reservation charged`                      | stayed green: the presence re-check refuses                           |
| presence re-check alone dropped                                                                  | same                                                                       | stayed green: the exit-code check refuses                             |
| both removal checks dropped                                                                      | same                                                                       | `released` beside the outside hard link                               |

Every fault from the first table was rerun against this code; see the Commands section.

### Commands

Fresh on 2026-11-01, worktree root, final code; trimmed.

| Command                                                                                      | Result                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run twilight-dash:test --skip-nx-cache` | exit 0, `Successfully ran target test for project twilight-dash` (28m47s on the loaded host); `host-jobs.test.ts in a private Linux namespace` ✓ 10.1 s, `host-jobs.model.test.ts in a private Linux namespace` ✓ 17.7 s, `managed resource runtime real Linux namespace integration` ✓ 46.7 s |
| inside the namespace, `host-jobs.test.ts`                                                    | 22 pass, 0 fail                                                                                                                                                                                                                                                                                |
| inside the namespace, `host-jobs.model.test.ts`, 11 consecutive runs                         | each exit 0; one run reached `admitted 95, barrierHeld 2, severalBarriers 4, treeBound 2, calibration 20, reclaimed 69, budgetRefused 14, waitZeroRefused 4, oversize 10, surviving 3, neverLaunched 29, released 20`                                                                          |
| `bunx nx run twilight-dash:typecheck`                                                        | `Successfully ran target typecheck`                                                                                                                                                                                                                                                            |
| `bunx nx run twilight-dash:lint`                                                             | `Successfully ran target lint`                                                                                                                                                                                                                                                                 |
| `bunx nx run twilight-dash:build`                                                            | `Successfully ran target build`                                                                                                                                                                                                                                                                |
| `bunx nx run wbs-be-01:typecheck` (smoke script changed)                                     | `Successfully ran target typecheck for project wbs-be-01 and 1 task it depends on`                                                                                                                                                                                                             |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`  | exit 0; no Burokrat index covers twilight-dash `src/resources`, so no index entry was due; review debt listed is pre-existing (store-memory, plan-commands)                                                                                                                                    |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test …/pilot-policy.test.ts`           | `24 pass, 0 fail, 430 expect() calls, Ran 24 tests across 1 file. [331.34s]`                                                                                                                                                                                                                   |
| `bunx prettier --check` on the 15 touched files                                              | `All matched files use Prettier code style!`                                                                                                                                                                                                                                                   |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                | `passed: 1, failed: 0`                                                                                                                                                                                                                                                                         |

The baseline flake `unknown surviving child identities stay blocked…` passed inside this run: its namespace wrapper passes only when every inner test does.

After the review fixes (fresh, same host):

| Command                                                                                      | Result                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run twilight-dash:test --skip-nx-cache` | exit 0, `Successfully ran target test for project twilight-dash` (31m52s); `host-jobs.test.ts in a private Linux namespace` ✓ 11.5 s (34 tests inside), `host-jobs.model.test.ts …` ✓ 21.2 s, `managed resource runtime real Linux namespace integration` ✓ 45.2 s |
| `bunx nx run twilight-dash:typecheck`, `:lint`, `:build`                                     | `Successfully ran target …` each                                                                                                                                                                                                                                   |
| `check-indexes working . HEAD`                                                               | exit 0                                                                                                                                                                                                                                                             |
| `bunx prettier --check` on the 16 touched files                                              | `All matched files use Prettier code style!`                                                                                                                                                                                                                       |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                | `passed: 1, failed: 0`                                                                                                                                                                                                                                             |
| fault table, all 46 faults rerun against this code                                           | 44 red; the two single removal-check faults stay green as recorded (each check backs up the other)                                                                                                                                                                 |

`wbs-be-01:typecheck` and `pilot-policy.test.ts` were not rerun: nothing they cover changed in the
review fixes.

### Skipped or unverified

- `tool-devsync` targets: nothing under `tools/tool-devsync` changed, so not run.
- The h2puni gate (`bin/h2puni-gate.sh`) is not run for a slice PR into `plan/dash-host-jobs`;
  task 0.1 schedules it before the plan reaches main.
- Not exercised: a real systemd scope, Docker containers, and real gate launchers (slices 3
  and 6); `ops pool` commands (A13); WBS publication of `host_job_events` (slice 5).
- `be-01`'s `resource-cleanup-smoke.ts` was updated to schema 3 and typechecked, not run (it
  needs a composed be-01 and mcp-01).
- Pre-existing flake: `unknown surviving child identities stay blocked until exact evidence is
restored` (runtime.test.ts) failed once on the untouched base under this host's load (its
  readiness file did not appear within 6 s); see the test run below for its status here.
