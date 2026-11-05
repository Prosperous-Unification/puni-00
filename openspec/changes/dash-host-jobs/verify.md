# Verify — dash-host-jobs

## Slice 1

Branch `feat/dash-host-jobs-1-catalogue`, from `plan/dash-host-jobs` at `39af9f692`. Local
worktree on the laptop; no h2puni gate was run for this slice (the plan reaches main through
one gate later, task 0.1).

### Assumptions

Each is overrulable by id, like J1 to J18.

- **S1-A1 Shape placement.** The pure `JobType` / Job envelope contract and `parseJobCatalogue`
  live in `@twilight-burokrat/contracts` (`contracts/job-catalogue.ts`), the facade Twilight Dash
  already imports for plan and progress records. Burokrat's rule reads it; Dash will admit from
  it; neither imports the other's runtime. A new `libs/shared/domain/` library was rejected: the
  contract is Twilight-suite vocabulary, not shared by WBS.
- **S1-A2 File shape.** `{ "schemaVersion": 1, "jobs": [ … ] }`, entries exactly as J2 shows.
  Calibrated provenance is `{ kind, hostClass, calibratedAt, recordCount, p95: { cpuCores,
memoryGib, tmpDiskGib }, recordIds }` with as many unique ids as the count. The shape does not
  enforce J9's three-record minimum; that stays `ops job propose`'s provisional refusal.
- **S1-A3 Argument profile grammar.** Space-separated tokens matched one to one with the
  arguments after the entrypoint: literal tokens or `<sha>` (a full 40- or 64-hex commit id);
  `""` takes none; no optional token, because J9 partitions measurements by profile.
  `parseJobArguments(jobType, args)` throws naming type, profile and arguments; Dash maps it to
  exit 64 in slice 2.
- **S1-A4 Package-script entrypoint.** `test-queued`'s entrypoint is
  `package.json#scripts.test:queued`: a JSON file and a dotted key path. The rule requires the
  file and a string at that key. JSON holds no comment, so that entrypoint carries none.
- **S1-A5 Profiles per type.** `gate` `<sha>` (J15's outer launcher resolves it);
  `release-build` `""` (the runbook call; tier arguments would be another profile);
  `test-queued` `""`; `solver-image-publish` `<sha>`, the source revision `publish` builds.
- **S1-A6 Estimates.** `release-build` and `solver-image-publish` share the
  `wbs-dagger-engine` container (fixed name and port 8081), so both name exclusive unit
  `dagger_engine` and declare its bound `{ memoryGib: 8, cpuCores: 6 }` from tool-dagger's
  `--memory=8g --cpus=6`. `test-queued` declares `{ 1, 1 }` like the gate, because
  `tool-remote-scripts:test:caddy` starts a Caddy container; that container is unbounded
  today, which the basis says (task 6.2 bounds it). Every basis states read-not-measured.
- **S1-A7 Expiry instant.** An `until` date is valid through its last UTC millisecond, as
  `inspect-manual` reads a deadline date: `2026-12-01T23:59:59.999Z` passes,
  `2026-12-02T00:00:00.000Z` fails.
- **S1-A8 How the instant arrives.** `check` gains `--now <UTC instant>` (parsed by the
  existing `readEvaluationInstant`), carried as `RuleContext.evaluatedAt`; the rule declares
  input `invocation.evaluatedAt`. `--now` without a dated rule selected is refused, as
  Performance evidence without PERF-THRESHOLD is.
- **S1-A9 Absent catalogue and absent instant.** A candidate with no `infra/jobs/catalogue.json`
  declares no host jobs: observed, no findings (other consumers of the package have none). A
  candidate with a catalogue and no `--now` leaves the rule unevaluated, so a full `check` of
  this repository without `--now` is not allowed, as it already is not without Performance
  evidence.
- **S1-A10 Findings, not refusals to evaluate.** Undecodable, non-JSON, non-regular or
  malformed-header catalogues are findings on the candidate; an unreadable blob is
  unevaluated.
- **S1-A11 Containers finding.** ArkType errors whose path starts at `containers` become the
  "neither none nor a bound" finding; the entry's other errors become one malformed-entry
  finding.
- **S1-A12 Task 1.1 left open.** The `puni-pr-00` companion catalogue with `website-dev-build`
  is outside this slice's brief, so 1.1 stays unticked; everything else in 1.1 is done. The
  glossary terms of 1.3 were already in `docs/twilight-structure/CONTEXT.md`.
- **S1-A13 No module index for `infra/jobs`.** No module index covers `infra/`; the README is
  a plain document, linked from the Burokrat README.

### Commands and results

Run 2026-11-01 on the laptop (load average 6 to 12, a peer worker's tests sharing it), with
`CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset for every test run. Outputs trimmed.

| Command                                                                                                                                                          | Result                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                      | exit 0; the four new Burokrat files are members of `apps/twilight-structure/twilight-burokrat/cli/README.md`                                                                                 |
| `bunx nx run twilight-burokrat:test --skip-nx-cache`                                                                                                             | `2568 pass`, `1 fail`, `Ran 2569 tests across 103 files. [4055.73s]`; the one failure was `rules.test.ts` pinning the complete-check rule list without `JOB-CATALOGUE`, fixed in `e13bba0d2` |
| `bun test src/rules/rules.test.ts src/rules/job-catalogue.test.ts src/contracts/job-catalogue.test.ts` (Burokrat cwd, target's preload and budget) after the fix | `89 pass`, `0 fail`                                                                                                                                                                          |
| `bunx nx run twilight-burokrat:typecheck --skip-nx-cache`                                                                                                        | `Successfully ran target typecheck`                                                                                                                                                          |
| `bunx nx run twilight-burokrat:lint:source --skip-nx-cache`                                                                                                      | `Successfully ran target lint:source`                                                                                                                                                        |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts`                        | `24 pass`, `0 fail`                                                                                                                                                                          |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                  | `981 pass`, `1 fail`, `Ran 982 tests across 50 files. [1284.68s]`; the failure is pre-existing (below)                                                                                       |
| `bunx nx run tool-devsync:typecheck --skip-nx-cache`                                                                                                             | `Successfully ran target typecheck`                                                                                                                                                          |
| `bunx prettier --check` on every touched file                                                                                                                    | clean (`bin/*.sh` are not Prettier files; `shellcheck bin/h2puni-gate.sh bin/publish-release.sh` exit 0)                                                                                     |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                                                                                    | `"valid": true`, `passed: 1`, `failed: 0`                                                                                                                                                    |
| `bun …/cli.ts check committed . HEAD <policy copy outside the tree> --rule JOB-CATALOGUE --now 2026-11-01T16:00:00.000Z`                                         | exit 0, `"findings":[]`, `"unevaluated":[]`                                                                                                                                                  |
| the same at `--now 2026-12-02T00:00:00.000Z`                                                                                                                     | four `estimated envelope expired: until 2026-12-01 …` findings, `effect: debt` (observe mode)                                                                                                |

The new rule tests pass alone: `bun test …/rules/job-catalogue.test.ts --timeout=60000` gave
`16 pass, 0 fail`; `bun test …/contracts/job-catalogue.test.ts` gave `9 pass, 0 fail`.

### Fault injection

Each fault was applied by a scratch script, the named test file run with
`bun test <file> --timeout=60000` (CLAUDECODE unset), and the source restored.

| Fault injected                                                        | Test that observed it                                                                                                 | Result             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `until` comparison replaced with `false` (task 1.2 negative)          | `fails every estimate on 2026-12-02`: exit 0 where 1 expected; 15 others passed                                       | red, then restored |
| entrypoint presence replaced with `false`                             | `names an entrypoint absent at the revision`, `names a package script entrypoint …`                                   | red, then restored |
| p95 compared with `<=`                                                | `names an envelope below its own calibrated p95` (at-p95 half)                                                        | red, then restored |
| p95 comparison replaced with `false`                                  | `names an envelope below its own calibrated p95`                                                                      | red, then restored |
| containers errors folded into malformed                               | `names containers that are neither none nor a bound`                                                                  | red, then restored |
| malformed entries push nothing                                        | `names a malformed entry …`, `names an entry that is not an object …`, containers case                                | red, then restored |
| duplicate ids judged over `[]`                                        | `names a duplicate id`                                                                                                | red, then restored |
| absent catalogue reported not-evaluated                               | `has nothing to judge in a candidate without a catalogue`                                                             | red, then restored |
| instant guard disabled                                                | `cannot judge without the evaluation instant`: reason `undefined is not an object (evaluating 'evaluatedAt.getTime')` | red, then restored |
| verdict `evaluatedAt` dropped (review fix 2)                          | `passes the four job types of this repository before their until date`: verdict lacked `evaluatedAt`                  | red, then restored |
| entrypoint blob read moved back inside the parse `try` (review fix 3) | `cannot judge an entrypoint blob the repository cannot supply`: exit 0 where 1 expected (absence finding)             | red, then restored |
| `until` comparison replaced with `false`, architecture level          | `job-catalogue.architecture.test.ts`: exit 0 where 1 expected                                                         | red, then restored |
| `--now` not forwarded by `writeCheckCommand`, after review fixes      | 14 of 17 rule cases, now including `passes on the last millisecond of the until date` (review fix 5)                  | red, then restored |
| `--now` not forwarded by `writeCheckCommand`                          | 12 of 16 rule cases, every one that supplies `--now`                                                                  | red, then restored |
| `--now`-without-dated-rule refusal disabled                           | `check refuses --now without a dated rule`: empty stderr                                                              | red, then restored |
| `parseJobArguments` always matches                                    | `refuses arguments outside the argument profile`, `the empty profile takes no arguments`                              | red, then restored |

Each is recorded as a `Proof:` comment beside the check it breaks.

### Skipped or unverified

- `tool-devsync:test` failed one case,
  `Performance level target production boundary > refuses a dirty, committed or content-masked
checkout after execution`: `Received: "Error: Performance supervisor exited 143"` at its own
  40-second budget. It fails the same way on the base `39af9f692` with none of this slice's
  changes (run alone with `-t`, 40043 ms, same 143), so it is not caused by this slice; it is
  unverified whether it is load on this laptop or a real defect. CI and the h2puni gate decide.
- No h2puni gate and no CI run: this PR targets `plan/dash-host-jobs`, which reaches main
  through one gate later.
- `tool-devsync:lint` and `twilight-burokrat:lint` (the diagnostic wiki lint) were not run;
  lefthook's `lint` passed on each commit.
- The `puni-pr-00` companion catalogue (`website-dev-build`) is not part of this slice (S1-A12).
- Every envelope is an estimate read from scripts, not a measurement; slice 6.4 calibrates.

### Review fixes (Fable, PR #806, MERGE AFTER FIXES)

1. `docs/platform-map.md` says 15 rules in both places.
2. A `check` verdict now records `evaluatedAt` (ISO) when `--now` is supplied. This is additive,
   and `schemaVersion` stays 1.
3. `entrypointIsPresent` reads the blob outside the parse `try`. A missing blob makes the rule
   unevaluated; a non-UTF-8 or unparseable JSON entrypoint is still absent.
4. The spec scenario reads "passes with no finding and no unevaluated rule".
5. The last-millisecond case also asserts exit 0 and `unevaluated: []`.
6. `src/architecture/job-catalogue.architecture.test.ts` is mapped in
   `architecture-fixtures.json`. Its production negative is the 2026-12-02 case.
7. The containers bases name every container the suites start. One reviewer item was not
   adopted: the swap preflight (`swap-mcp-preflight.db.test.ts`) runs the swap's `docker run`
   script with `sh -c` and starts no container (read 2026-11-01), so it is not listed.
8. `test-queued`'s basis says its exclusive units wait on task 6.2, because one checkout and one
   `.nx` cache are shared.
9. Left as the review asked: the Burokrat README's link to `infra/jobs/README.md` is dead on
   npmjs.com, like its existing ADR links.
10. The rule goes through `evaluateWrapped` like the others. `judgeJobCatalogue` returns
    observations and throws when it cannot judge.

Not in this slice: the scenario "An uncatalogued type" (`ops job run … ` exits 64) belongs to
slices 2 and 3.

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

## Slice 3 — measured runs, container bounds, status (tasks 3.1–3.3)

Branch `feat/dash-host-jobs-3-run` from `plan/dash-host-jobs` at `056466709` (slices 1 and 2,
the race-test fix, the Dash CLI on Optique), 2026-11-01, on the 24-core workstation (Linux 7.0,
systemd 255, cgroup v2 delegating `cpu memory pids` to the user manager, Docker 29.7.2, another
worker beside it). Code: `apps/twilight-structure/twilight-dash/cli/src/ops/` (`commands.ts`,
`job-run.ts`, `scope.ts`, `containers.ts`, `run-records.ts`, `catalogue.ts`, `status.ts`,
`refusal.ts`), the `ops` grammar in `src/cli-parser.ts`, its handler in `src/cli.ts`, exit 64
for an `ops` usage refusal in `src/entrypoint.ts`. Tests: `src/ops/job-run.test.ts`,
`src/ops/status.test.ts` (fixture `src/ops/ops.test.fixture.ts`) and three `ops` tests in
`src/cli.test.ts`. Nothing in `src/compute`, `src/resources/runtime.ts`, `@wbs/contracts`,
be-01, fe-01 or `bin/` changed.

### Assumptions (open decisions taken per design.md; overrulable by id)

- **S3-A1 Typed namespace.** `ops` is parsed whole by Optique (J17), as `plan-enrollment` is:
  each leaf is `object({ command: 'ops', words: 'job run', … })`, and `src/ops/commands.ts`'s
  `opsHandlers` is a mapped type over `words`, held equal to the parser by a test. `ops` sits in
  the root `or` beside the delegated list, which is at Optique's fifteen-parser limit with 14.
  `calibrate`, `propose`, `audit` and `switch-mode` are not declared: help would list commands
  that cannot run; slices 4 and 6 add them.
- **S3-A2 Checkout and revision.** The catalogue is the one in the checkout holding the
  current directory, read with `git show HEAD:infra/jobs/catalogue.json`, never the working
  tree; HEAD is the payload SHA the record pins. Schema 3's configuration is the runtime's
  closed shape (`onUndeclaredKey('reject')`, `runtime.ts`), so it names no enrolled checkouts
  yet; which checkout a launcher stands in is `run_heavy_job`'s and the `gate_host` role's
  (6.1, 6.3). An absent catalogue, unknown type or argument mismatch is 64; a malformed
  catalogue is 70.
- **S3-A3 Payload words.** The words after `--` are the payload: the first is the program, the
  rest must match the argument profile. The first word is not compared with the catalogue's
  `entrypoint`: J15 splits the gate into outer launcher and payload in 6.2, and the spec's own
  scenario runs `--type test-queued -- true`.
- **S3-A4 Run records.** One owner-only SQLite file, `<root>/.dash/host-job-runs.sqlite`, with a
  `runs` table (the start pinned at the gate, the outcome at exit) and a `samples` table (one
  row per sample), not a JSON column: the ledger's job snapshot is the runtime's closed shape.
  `ops pool init` creates it, as does the first run while the ledger holds no host job;
  missing beside a ledger that has host jobs is 70, never recreated.
- **S3-A5 Launch.** `ResourceRuntime.run` is bound to the worktree `uses` table and
  `runtime.ts` belongs to slice 5's worker, so `src/ops/job-run.ts` reproduces its FD-gate
  protocol over the host-job seams: `systemd-run` is spawned detached (its own session) and
  execs `/bin/sh` reading `start` from fd 3; `recordHostJobLaunch` persists the leader's
  identity right after spawn, then the scope is awaited in `/proc/<pid>/cgroup`, the counters
  are read and the gate sample stored, and only then is `start` written. The gated shell stays
  the session leader and runs the payload in the foreground, so its status is the payload's
  own (128 + signal); it reports it on fd 4 and keeps the scope occupied until the launcher
  writes `done` after the exit sample (the observation boundary). A no-op trap keeps the shell
  alive through a forwarded SIGINT/SIGTERM/SIGHUP; the payload gets default dispositions.
  Extracting one launcher for worktree uses and host jobs is follow-up work in `runtime.ts`.
- **S3-A6 Refusals before and at the gate.** "No user manager" is found by a throwaway probe
  scope (`dash-probe-<uuid>`, the job's memory properties, `true`) before the ticket, so it
  reserves nothing. A refusal after admission (scope not started within 15 s, a counter
  unreadable, the run record unwritable at the gate) closes the gate unopened: the shell exits
  125 without running the payload, the exit is recorded and the job settles on its terminal
  evidence (released in the test). `--expand-environment=no` and `--collect` need systemd 254
  or later. h2puni and h4claw both report systemd 259 (259.5-0ubuntu3.4), as the Fable review
  read on the hosts (corrected from "255", which was this workstation's version, review F12).
- **S3-A7 Exit codes and flags.** An `ops` usage refusal exits 64 (the entrypoint keeps 1 for
  every other command); an interrupted waiter 130 or 143 with its ticket withdrawn; an
  unusable configuration or ledger 70. `--config` is required (no default path: J12's shim
  passes the fixed one); `--wait-seconds` defaults to 0 and `--poll-seconds` to 5 within 1 to
  30, as the shell lock; `--label` defaults to `unlabeled`.
- **S3-A8 Record identity.** Host class `linux-<arch>-<nproc>c-<floor MemTotal GiB>g`;
  descriptor digest the SHA-256 of the catalogue entry's JSON as parsed.
- **S3-A9 Docker reading.** `src/compute/docker.ts`'s `parseContainerIds` and `sumLabelled`
  are module-private and `src/compute` is slice 5's, so `src/ops/containers.ts` reads Docker
  over `compute/execution.ts`'s exported `spawnClient` and `execute`: a `docker events` stream
  of `create` events from the gate instant, each container judged at once by its labels and
  `docker inspect`'s `HostConfig.Memory` and `NanoCpus` (only `--cpus` counts as a CPU bound),
  a closing replay of the window for anything the stream had not delivered, and per sample
  `docker ps --filter label=puni.job=<id>` plus `docker stats --no-stream`. Verdicts: `bounded`,
  `unlabelled`, `unbounded`, `unverified` (gone before its bound was read, or the replay
  failed); a container labelled with another job is that job's. Settlement's evidence is "no
  running container carries the label".
- **S3-A10 `watch` and containers.** `watch` still settles with `declaredContainersOnly`
  (a `runtime.ts` change): a declared-bound job whose launcher died stays charged until an
  operator settles it. Recorded in `docs/resources.md`.
- **S3-A11 Fifth counter.** `memory.events` `high` is read with the four counters and required
  at the gate like them: J9's proposal excludes throttled runs by it.
- **S3-A12 Observe mode.** `ops job run` does not yet run under the shell lock's queue protocol
  (J12); `run_heavy_job` brings that in 6.1, before any host is enrolled, and with it the
  spec's `with-heavy-lock.sh status` half of "One running, one waiting". Nothing in `bin/`
  changed, so that command's first line is untouched.
- **S3-A13 Output and settlement.** The payload keeps stdout and stderr; Dash's own lines go to
  stderr as `ops job: …`. The launcher settles for up to 30 seconds, then leaves what is still
  charged to `watch`, one line per entry either way.
- **S3-A14 Test isolation.** The tests run inside a private user and PID namespace that maps
  this account to itself (`--map-user`), not to root: a mapped root's `CAP_DAC_OVERRIDE` would
  read a mode-000 `memory.peak` anyway (checked). Real-scope tests skip, named with the probe's
  diagnostic, where `systemd-run --user --scope` fails (a CI runner without a user manager);
  container tests skip, named, without a local daemon holding `busybox:1.37.0-musl` (never
  pulled). The wrapper prints the inner results so a skip stays visible.

### Fault injection

Each fault was applied by exact text replacement from a scratch script outside the repository,
the named file run (`bun test`, CLAUDECODE unset; the namespace wrapper reruns the file
inside), and the file restored byte for byte, its SHA-256 checked. All against the final code.

| Fault injected                                                              | Test that went red                                                                           | Observed                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| scope probe result ignored (stub `systemd-run`: "Failed to connect to bus") | `refuses 70 when the user manager is unavailable, nothing reserved`                          | job admitted; refused only at launch, "launch identity … unrecorded" |
| `systemd-run` absence unchecked                                             | `refuses 70 before admission when systemd-run is absent`                                     | `Executable not found in $PATH: "null"`, no 70                       |
| gate-sample refusal skipped (`memory.peak` mode 000 in the real scope)      | `refuses 70 when memory.peak is unreadable at the gate, the payload never runs`              | no refusal: the payload ran unmeasured                               |
| observation boundary dropped (`read done <&3` → `:`)                        | `a one-second job is still measured`, `a gate is measured`                                   | exit sample `scope … torn down before the exit sample`               |
| container memory and cpu bound checks dropped                               | `an unbounded container makes the run's attribution incomplete`                              | `attributionIncomplete` false                                        |
| `ops job audit` added to the parser, not to `opsHandlers`                   | `every ops command the parser declares has a handler, and every handler a command`           | `+ "job audit"`                                                      |
| catalogue read from the working tree                                        | `reads the catalogue at HEAD, not the working tree`                                          | the uncommitted type was found, no refusal                           |
| unknown-type check dropped                                                  | `an uncatalogued type exits 64 …`, `reads the catalogue at HEAD …`                           | `undefined is not an object (evaluating 'jobType.argumentProfile')`  |
| run records recreated beside a ledger with host jobs                        | `refuses 70 run records missing beside a ledger with host jobs`                              | no refusal: records recreated and the job run                        |
| `docker` absence unchecked for a declared bound                             | `refuses 70 before admission when docker is absent and a bound is declared`                  | `Executable not found in $PATH: "null"`                              |
| `runOps` handler guard dropped                                              | `runOps refuses ops words no handler takes`                                                  | `handler is not a function`                                          |
| entrypoint exits 1 for an `ops` usage refusal                               | `an ops usage refusal exits 64; other commands still exit 1`                                 | expected 64, received 1                                              |
| status peak dropped                                                         | `one running, one waiting: the gate with its tree and peak, then the build`                  | running line read `peak unmeasured`                                  |
| sample timer left uncleared                                                 | `the installed entrypoint runs a job and passes its status`                                  | 15.49 s for a payload that exits at once (bound 9.5 s)               |
| exit sample's empty-scope check never refuses (scope torn down underneath)  | `a scope torn down early is a recorded telemetry failure; the status is still the payload s` | `telemetryFailure` null                                              |
| ledger write failure rethrown (payload opens the managed root to 0755)      | `a ledger write failure is recorded apart; the status is still the payload's`                | rejected `resource root must be owner-only` instead of returning 4   |

The negatives the brief named map to rows 1 (stub `systemd-run`), 3 (`memory.peak`), 15 (scope
torn down early: the payload's 3 still returned), 5 (bound check) and 6 (parser without
handler).

### Commands

Fresh on 2026-11-01/02, worktree root, final code (after the lint boundary fix); trimmed.

| Command                                                                                                            | Result                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run twilight-dash:test --skip-nx-cache`                       | exit 0, `Successfully ran target test for project twilight-dash` (28m26s): `4186 pass, 0 fail, Ran 4186 tests across 126 files`; `job-run.test.ts in a private Linux namespace` ✓ 25.5 s (24 inside), `status.test.ts …` ✓ 4.2 s (3 inside), `host-jobs.test.ts …` ✓ |
| first run of the same target, before the lint fix                                                                  | exit 1: `4185 pass, 1 fail`, the slice-2 test `a replaced tmp directory or symlink stays charged and untouched` (see below); it passed 3 of 3 runs alone and in the rerun                                                                                            |
| `bunx nx run twilight-dash:typecheck`                                                                              | `Successfully ran target typecheck`                                                                                                                                                                                                                                  |
| `bunx nx run twilight-dash:lint`                                                                                   | `Successfully ran target lint` (it first failed `ops/catalogue.ts:4 Imports of apps are forbidden`; fixed by an exact entry in `twilight-dash/eslint.product.mjs`)                                                                                                   |
| `bunx nx run twilight-dash:build`                                                                                  | `Successfully ran target build`                                                                                                                                                                                                                                      |
| `bun test tools/tool-devsync/src/eslint-boundaries.test.ts src/lint-policy-cache.test.ts` (product policy changed) | `54 pass, 0 fail`                                                                                                                                                                                                                                                    |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                        | exit 0; no Burokrat index covers twilight-dash `src/ops`, as none covers `src/resources`; review debt listed is pre-existing (store-memory, plan-commands)                                                                                                           |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test …/pilot-policy.test.ts`                                 | `24 pass, 0 fail, 430 expect() calls, Ran 24 tests across 1 file. [329.89s]`                                                                                                                                                                                         |
| `bunx prettier --check` on the 20 touched files                                                                    | `All matched files use Prettier code style!`                                                                                                                                                                                                                         |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                                      | `passed: 1, failed: 0`                                                                                                                                                                                                                                               |
| `systemd-run --user --scope -p MemoryHigh=100M …` reading its own counters (before writing code)                   | exit 0; `memory.peak 1417216`, `memory.high 104857600`, `cpu.stat usage_usec 8626`; also inside the test namespace                                                                                                                                                   |

### Skipped or unverified

- No real gate, release build or `test:queued` ran through `ops job run`; the payloads were
  fixture scripts. Launchers move onto it in slice 6.
- Real-scope and container tests ran on this laptop only (its user manager, Docker 29.7.2 with
  `busybox:1.37.0-musl` already pulled). On a CI runner with no user manager or no such image
  they skip, each naming its probe's diagnostic, so CI may not exercise them (S3-A14).
- `--expand-environment=no` needs systemd 254 or later; both gate hosts run 259 (review F12).
  Not run there by me. h4claw also refuses `unshare --user`, so these tests cannot run there.
- Not done in this slice: `calibrate`, `propose`, `audit`, `switch-mode` (slices 4, 6); J12's
  observe-mode queue protocol and the `with-heavy-lock.sh status` half of "One running, one
  waiting" (6.1); `watch` reading Docker for declared-bound jobs (S3-A10); WBS publication
  (slice 5).
- Pre-existing race, not fixed (outside this slice's files): the `directory` case of
  `a replaced tmp directory or symlink stays charged and untouched` (host-jobs.test.ts) does
  `rmdirSync` then `mkdirSync` on the same path, and the file system may hand the new directory
  the old inode number; the runtime then sees the recorded identity and removes it, so the test
  sees `released`. It failed once in a full run, passed 3 of 3 alone and in the full rerun.
- The h2puni gate is not run for a slice PR into `plan/dash-host-jobs` (task 0.1).

### Review fixes (Fable, PR #809, MERGE AFTER FIXES)

All of F1–F13 were applied on `feat/dash-host-jobs-3-run`. The plan head was still `056466709`, so no re-merge was needed. `runtime.ts` was in scope for F1 and F5.

#### New assumptions (overrulable by id)

- **S3-A15 (F1).** Rule for an uninspectable process: when reading a same-user process's `cwd`, `fd` or `maps` returns `EACCES` or `EPERM`, settlement reads that process's `/proc/<pid>/cgroup`.
  - Outside the job's unit `dash-job-<id>.scope` (matched as a path segment) **and started before the job's leader** (amended by S3-A25): the process is not a holder. It is recorded in the entry's reason as `uninspectable_outside_scope: <pid> (<comm>)`. The entry shape is `{ state, reason }`, so the evidence stays in the text.
  - Inside the unit, or with its cgroup unreadable: the entry stays `blocked`.
  - The runtime knows the unit name from the job id. It knows no cgroup path.
  - Worktree cleanup and `ops pool init`'s unit check are unchanged and still refuse (task 6.6). On h2puni this means `ops pool init` refuses until 6.6 is done.
- **S3-A16 (F5).** `HostJob.launchFailure` is optional, so existing ledgers still parse. `recordHostJobLaunchFailure` records `payload did not run: <reason>`, and the exit code stays null. `ops job status` prints that reason.
- **S3-A17 (F4).** A signal that arrives before the gate opens refuses at the gate: SIGHUP 129, SIGINT 130, SIGTERM 143. `awaitScope` returns at once, and a leader still in `systemd-run` 2 s after the gate closed is killed. After the gate opens, signals are forwarded as before.
  - The synchronous work before the gate (gate sample, HEAD check, `records.begin`, watch start) is followed by an event-loop turn (review R2), so a signal received during it is acted on before `start`.
  - What remains is unavoidable: a signal that lands after that last check and before `gate.write('start')` (a few synchronous statements, no I/O). It is dispatched at the next turn, after the payload started, and is then forwarded to the payload's session. The payload sees it, and the run records the payload's own status.
- **S3-A18 (F9).** HEAD is checked again just before the gate opens, after the gate sample. If it moved, the job is refused 64 unrun and settled. `payloadSha` is renamed `launcherSha`.
  - This narrows the gap; it guarantees nothing (review R3). HEAD can still move between the check and the payload's exec, and at any time during the run. `launcherSha` names the commit the catalogue was read at, not one the payload provably ran.
- **S3-A19 (F3).** The fake scope seam: a fake `systemd-run` that execs its command (after the probe's `-- true`), plus `fakeScopeTelemetry`.
  - The gated shell is "in" `/fake/dash-job-<id>.scope`.
  - Counters are files under a scratch root, read by the production reader.
  - Members are the live processes whose environment carries the job's `DASH_JOB_ID`.
- **S3-A20 (F7).** `ops job status` opens the run records read-only. Missing records are 70 even on a jobless pool, and status never creates them.
- **S3-A21 (F8).** A `puni.job` label naming no unreleased ledger job (a released job included) is `unlabelled`. A label naming a live job is that job's.
- **S3-A22 (F11).** Watch failures fold into `unverified` verdicts:
  - a rejected `docker events` iteration (id `stream`), including an event line over 1 MiB, which the reader now refuses;
  - any judgement that throws.
- **S3-A23 (F2c, F2d).** Two faults could not be injected by host state:
  - The launch-identity test injects its fault through an environment getter. Once the job's tmp directory exists, it opens the managed root to 0755. The ledger's refusal is real; the trigger is synthetic.
  - A run-records file owned by another account cannot be made without another account, so the uid branch is unverified.
- **S3-A24 (F6).** The launcher settles once a second, not every 100 ms. Moving the Git and Docker reads out of the transaction is a follow-up note under task 3.1.

#### Which tests use which seam

| Seam                                                        | Where it runs                                  | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fake (runs on every Linux host with `unshare`, CI included) | `job-run.test.ts`                              | - "a host job runs measured over the fake scope": gate measured (FD gate, environment, pipes, record, settlement lines), one-second, failure passthrough, 128 + signal, interval samples, `memory.peak` unreadable, scope torn down, ledger failure.<br>- "launch faults over the fake seam": scope never starts (F2a), `systemd-run` vanishes (F13), launch identity unrecorded (F2c), run record busy at the gate (F2b), checkout moved (F9), SIGINT while the scope starts (F4), the launcher process ends with its job (timer), `killSession` on a gone session (F10).<br>- 73/75 refusals, the run-records refusals (F2d) and the docker daemon refusal (F2e, needs only the CLI). |
| Fake                                                        | `job-run.test.ts`, "declared container bounds" | Containers, which also need a local daemon with the image.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Real scope (skip, named, without a user manager)            | `job-run.test.ts`                              | The same measured set "over the real scope", plus `MemoryHigh`/`MemoryMax`/real-cgroup assertions, `cap`, and the installed entrypoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| None (runs everywhere)                                      | `containers.test.ts` (stub `docker`)           | Replay failure (F2f), labels of no live job (F8), stream failure (F11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| None (outside any namespace)                                | `host-job-holds.test.ts`                       | Outside-scope predating process, later process outside the scope, note cap (run everywhere); later process in another scope and inside-scope (need a real scope).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| —                                                           | `status.test.ts`                               | Status refusal and launch-failure display (F7, F5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

#### Fault injection (review fixes)

Same method as above: exact replacement, the named file run, restore byte for byte with the digest checked.

| Fault injected                                      | Test that went red                                                             | Observed                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| scope branch dropped in `inspectHolds`              | `a non-dumpable process outside the job scope does not hold its tmp directory` | `blocked`; the inside test also saw this laptop's own `(sd-pam)` (PID 2327) refuse first, the real condition F1 named |
| `outsideScope` always true                          | `… inside the job scope still holds its tmp directory`                         | `released`                                                                                                            |
| interruption check before the gate dropped          | `a SIGINT while the scope starts refuses 130, the payload never runs`          | refused 70 "did not start scope", not 130                                                                             |
| null-cgroup refusal dropped                         | `refuses 70 when the scope never starts, the payload never runs`               | misattributed `scope counters unreadable … "paths[1]" … got object`                                                   |
| HEAD re-check dropped                               | `refuses 64 when the checkout moved while waiting`                             | no refusal: the payload ran                                                                                           |
| `records.begin` failure rethrown                    | `refuses 70 when the run record cannot be written at the gate`                 | rejected after the 10 s busy timeout                                                                                  |
| launch-identity failure rethrown                    | `refuses 70 when the launch identity cannot be recorded`                       | bare `resource root must be owner-only`                                                                               |
| ESRCH rethrown in `killSession`                     | `killing a session already gone is not an error`                               | threw                                                                                                                 |
| unstarted-leader check dropped                      | `refuses 70 when systemd-run vanishes before the launch`                       | `host job gate pipes unavailable`                                                                                     |
| owner-only refusal removed                          | `refuses run records that are not an owner-only regular file`                  | the symlink opened (removing only the link test stayed green: `!isFile()` also refuses a link)                        |
| schema-version check dropped                        | `refuses run records of another schema version`                                | version 7 opened                                                                                                      |
| docker daemon check dropped (`DOCKER_HOST` nowhere) | `refuses 70 before admission when the docker daemon does not answer`           | no refusal                                                                                                            |
| replay failure treated as empty                     | `a failed docker events replay is an unverified verdict`                       | no verdict                                                                                                            |
| other labels never judged                           | `a container labelled with no live job is unlabelled …`                        | no verdict                                                                                                            |
| stream rejection uncaught                           | `a failing docker events stream is an unverified verdict`                      | unhandled `an event line exceeds 1048576 bytes`                                                                       |
| status opens records for writing                    | `status refuses 70 when the run records are missing, creating nothing`         | exit 0, records created                                                                                               |
| `recordHostJobLaunchFailure` guard dropped          | `a job whose payload never ran says so`                                        | a second record accepted                                                                                              |

#### Commands (fresh, review fixes; the full target was not rerun, CI carries it)

| Command                                                                                       | Result                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun test src/ops src/resources/host-job-holds.test.ts` (CLAUDECODE unset, project directory) | `7 pass, 0 fail` outer; inside `job-run.test.ts` `43 pass, 0 fail`, inside `status.test.ts` `5 pass, 0 fail`; `containers.test.ts` 3 and `host-job-holds.test.ts` 2 pass |
| `bun test src/cli.test.ts src/resources/host-jobs.test.ts`                                    | `56 pass, 0 fail`                                                                                                                                                        |
| `bunx nx run twilight-dash:typecheck`, `:lint`                                                | `Successfully ran target …` each                                                                                                                                         |
| `bunx prettier --check` on touched files, `openspec validate dash-host-jobs --json`           | see the PR body                                                                                                                                                          |

#### Skipped or unverified (review fixes)

- Worktree cleanup and `ops pool init` still throw `cannot inspect process PID` for a non-dumpable same-user process (task 6.6). On h2puni, with `(sd-pam)` running, `ops pool init` refuses. That blocks slice 6's enrollment until 6.6 is decided.
- The real-host proof of F1 ran on this workstation (systemd 255, its own `(sd-pam)`), not on h2puni or h4claw (systemd 259).
- A run-records file owned by another uid is unverified (S3-A23).

### Second review pass (Fable on d4e31c709, MERGE AFTER FIXES)

All of R1–R9 are applied. The plan head is still `056466709`.

#### New assumptions (overrulable by id)

- **S3-A25 (R1).** A different cgroup alone does not make a process "outside". The process must also have started, in this boot, before the job's leader. The comparison uses `/proc/<pid>/stat` start ticks, which are readable for non-dumpable processes; before a launch it compares against the launcher instead.
  - Anything later blocks, whatever its cgroup.
  - Consequence: a job begun before a reboot is blocked by every uninspectable process of the new boot, and an operator settles it.
  - The reviewer's probe is now a negative: a later non-dumpable holder in `dash-job-other-<uuid>.scope`. So is a later one in no scope at all; that one runs everywhere.
- **S3-A26 (R5).** The outside-scope note names the three most recently started processes (by start ticks; pids wrap, which happened on this workstation) and counts the rest as `and <n> more`.
- **S3-A27 (R8).** An uninspectable process that blocks a host-job entry is named with its `comm`, together with the remedy: end it, or `systemctl --user stop dash-job-<id>.scope`.
- **S3-A28 (R9).** The launcher settles at once, then after 250 ms, then once a second. The gated shell is usually still exiting on the first pass.
- **S3-A29 (R6).** `cli.test.ts`'s exit-code test gets a 90 s budget.
  - The 5 s is the import graph, not the refusal: `cli.ts` loads every command module before a delegated command refuses. Measured: `resources/command` 3082 ms (the runtime and `@wbs/contracts`) and `activation/observation-commands` 1863 ms. `inspect-authority` with no arguments took 5.22 s, while `apply` (refused by the parser) and an `ops` usage error took 0.08 s.
  - Making `cli.ts`'s handlers import their modules lazily is a cross-cutting change with its own dispatcher proofs, so it is recorded as follow-up in tasks.md 3.1, not done here. `ops job run` pays the same roughly 3 s, because it opens the runtime.
- **S3-A30 (R4).** The model's `LaunchFailure` command:
  - is eligible on a launched job whose payload still runs;
  - records the failure, then expects a later exit to be refused and the exit code to stay null;
  - ends the leader, so the model then treats the job as exited.
  - One fixed example runs it. Settlement still inspects holds after a launch failure; skipping that is not done, because it saves one pass and weakens nothing it proves.

#### Seam note (R7)

`scopeArguments` (`--user --scope --quiet --collect --expand-environment=no --unit …`, `-p MemoryHigh=…`, and `-p MemoryMax=…` for `cap`) is verified only by the real-scope tests (the cgroup path, `memory.high` and `memory.max` assertions, and `cap enforcement sets MemoryMax beside MemoryHigh`). The fake `systemd-run` discards every option before `--`, so the fake seam proves nothing about them. Where those tests skip, nothing checks those options.

#### Fault injection (second pass)

| Fault injected                                               | Test that went red                                                                                                                                             | Observed                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| start comparison removed in `outsideScope`                   | `a non-dumpable process started after the job, outside its scope, still holds`; `a non-dumpable process that left for another scope after the job still holds` | both `released` with the file open                      |
| event-loop yields before the last interruption check removed | `a SIGINT during the synchronous gate work refuses 130`                                                                                                        | no refusal: the payload ran and its status was returned |
| outside-scope cap removed                                    | `the outside-scope note names three and counts the rest`                                                                                                       | 11 names                                                |
| remedy dropped from the blocked message                      | `a non-dumpable process inside the job scope still holds its tmp directory`                                                                                    | no `systemctl --user stop …`                            |
| `recordHostJobExit` accepts an exit after a launch failure   | `the admission queue and settlement follow the model under every interleaving` (model `LaunchFailure`)                                                         | exit accepted                                           |

#### Commands (second pass, fresh; no full target)

See the PR body for the trimmed outputs of the touched test files, `cli.test.ts`, typecheck, lint, prettier and `openspec validate`.

## Slice 5 — WBS projection (tasks 5.1–5.3)

Branch `feat/dash-host-jobs-5-projection` from `plan/dash-host-jobs` at `056466709`, 2026-11-01.
Code: be-01 migration `20261101120000_add_host_job_projection`; contracts
`compute-provider-shapes.ts` (`reservedUnits`), `resource-runtime-shapes.ts`
(`resourceRuntimeHostJobUse`, evidence `returned`), `resource-shapes.ts` (`hostJobs`); domain
`compute-provider.ts`; store-sqlite `compute-provider.ts`, `resource-runtime.ts` (`ingestHostJob`),
`schema.ts`; core `compute-providers.ts`, `compute-provider.routes.ts`; Dash
`src/compute/{host-pool-ledger.ts,configuration.ts,provider.ts,report-capacity.ts}` and
`moveHostJobEvents` in `src/resources/runtime.ts`; fe-01 `compute-provider-words.ts`,
`resources-panel.tsx`. Tests: `host-job-projection-migration.db.test.ts`,
`host-job-use.controller.db.test.ts`, `compute-provider.controller.db.test.ts` (two cases),
`report-capacity.host-pool.test.ts`, `host-job-publication.test.ts`,
`compute-provider-words.test.ts`, `resources-panel.test.tsx`. This section is self-contained; a
parallel worker appends Slice 3 to this file.

### Assumptions (open decisions taken per design.md; overrulable by id)

- **S5-A1** One migration, `20261101120000_add_host_job_projection`, carries 5.1's
  `resource_capacity_report.reserved_units` and 5.2's `resource_host_job` table: one ledger
  entry, one rollback guard. Its `down.sql` refuses while any host job row exists (the
  authority's sequence already counts those events, so Dash would never send them again) and
  drops the column freely (display state each report replaces). The 53 test files that pin the
  migration ledger were updated mechanically (new name after `…agent_pools`, `slice(-16)`).
- **S5-A2** `reservedUnits` sits inside the measured outcome beside `usageUnits`; an unreachable
  report never carries it (contract and CHECK). The same-body idempotency compares it, so the
  same instant with other reserved units is `report_superseded`.
- **S5-A3** The ledger's change notification is the cheapest honest seam: the reporter reads
  `MAX(host_job_events.sequence)` on a read-only connection every 2 s. Every admission and every
  settlement commits one `host_job_events` row in the same transaction as the reservation
  change, so a new sequence is exactly a new reservation state. A file watch on the WAL was
  rejected: it fires on checkpoints and other writers' unrelated commits, and inotify is
  per-host plumbing for a 2 s gain.
- **S5-A4** The reporter configuration names the ledger file, `"hostPool": {"ledger":
"<root>/.dash/resources.sqlite"}`, exactly when a binding's source is `host_pool` (either
  without the other is `config_malformed`). The reporter must run on the pool's host; an
  absent ledger or one whose `user_version` is not 1 throws at load.
- **S5-A5** A `host_pool` dimension pairs with one measure: `cpuCores`/`cpu_cores`,
  `memoryGib`/`memory_gib`, `tmpDiskGib`/`disk_gib`, an exclusive id/`agent_slots`; `source`
  and `dimension` come together or not at all.
- **S5-A6** The reserved sum mirrors the runtime's `reservations()` for host jobs only: cores
  and memory while the compute entry is unreleased, tmp GiB while the tmp entry is, one per
  unreleased unit of an exclusive id. Worktree uses reserve disk units, never `tmpDiskGib`.
- **S5-A7** v2 is the union `resourceRuntimeUse | resourceRuntimeHostJobUse`, discriminated by
  `kind: 'host_job'`; no separate version field. A v1 use is unchanged byte for byte. The
  admission contract takes a v1 use only: WBS never admits a host job (J10).
- **S5-A8** Ownership is stamped by WBS from the authority binding the event arrives through
  (`authority_id`, `organization_id`, `provider_id` columns), never carried in the body, so a
  body cannot claim another tenant.
- **S5-A9** Planning links (`projectId`, `workItemId`, `responsiblePersonId`) are optional,
  kept in the declaration as sent, and never resolved or validated; nothing that deletes a
  planning row touches `resource_host_job`. Dash sends none yet (the host pool admits without
  them).
- **S5-A10** A host job has two WBS events: `registered` at revision 1 and `release_verified` at
  revision 2, the latter with the same declaration; any other kind is `400 invalid_body`.
  Dash maps `admitted` to `registered` and the settlement that leaves every entry released to
  `release_verified`; launches, partial and blocked settlements stay local.
- **S5-A11** Settlement evidence (J2'): the digest is the SHA-256 of the settling
  `host_job_events` row, the ledger's durable record of that settlement; the locator is
  `dash-host-job://<authorityId>/<jobId>/<revision>`; disposition `returned`. WBS requires
  `returned` for a host job and refuses it for a v1 use. The run record of slice 3 (#809)
  carries `descriptorDigest` and no durable locator, so replacing the row digest with the run
  record's is follow-up task 6.8, not part of slice 3 (review fix, 2026-11-02).
- **S5-A12** `host` is the pool's `enrollmentId`. `launcherSha` (renamed from `payloadSha`
  with #809's run-record field) is the HEAD of the checkout that launched the job; for a gate
  the tested SHA is in its argv, not here. Dash sends null until the launcher records the HEAD
  on the job (review fix, 2026-11-02).
- **S5-A13** One authority sequence: `synchronize` first moves unmoved `host_job_events` rows into
  the existing `events` outbox (next sequence, one transaction, oldest first) and the existing
  loop publishes them, because WBS requires each authority's sequence to be gap-free. A moved
  row is `published=1`.
- **S5-A14** Where WBS shows host jobs, and where the chip's names come from: the project
  resources read gains `hostJobs` on each resource whose provider instance is the authority's
  (`resource.provider_id = resource_host_job.provider_id`), listing jobs in state `registered`
  (not returned), oldest registration first, with `label`, `type`, `host` and `reservations`.
  The project-scoped resource uses list keeps v1 uses only: its `resourceUse` shape requires a
  project, resource and work item a host job need not have. The read lists every unreturned
  host job of the instance; the chip names only those reserving the report's dimension
  (S5-A16).
- **S5-A15** The brief's "`kind` CHECK widened": `resource_use` has no SQL CHECK on kind (kind
  lives in the JSON declaration), so the variant gets its own table; `returned` is added to the
  contract's evidence enum.
- **S5-A16** The chip keeps `data-report="measured"` and adopt-by-command. The report carries
  `reservedDimension` beside `reservedUnits` (both or neither: contract, route `invalid_body`,
  and a CHECK on `reserved_dimension` in the same migration), and a job holds the resource only
  when one of its reservation entries names that dimension with units above 0. So a gate with
  no tmp disk on a `disk_gib` resource reads `none reserved`, and a build with no exclusive id
  is no holder of a `gate_tree` resource. The headline gains `, 12 reserved by 2 jobs`
  (`1 job`), the detail line names the holders (`Reserved by gate a and gate b.`); reserved units
  with no holder read `12 reserved` and `Jobs not yet published by Dash.`; zero reads `none
reserved`. `stale`, `unreachable` and `No report yet` read as before (review fix,
  2026-11-02).
- **S5-A17** The WBS-down scenario drives the real ledger through the `WbsTools` port with no
  answer and then a transient mcp-01 refusal, rather than an HTTP fixture server: the outbox
  reaches WBS only through that port, and slice 2 already proves admission against a refusing
  HTTP server.
- **S5-A18** Outside the outbox publication, `runtime.ts` changed in one type annotation:
  `declaration()` returns `ResourceRuntimeAdmission['use']`, because the event's `use` is now a
  union (and `hostJobOutbox`'s JSDoc).
- **S5-A19** The reporter tests over a real ledger run in the private namespace the runtime's
  `/proc` inspection needs, as `host-jobs.test.ts` does.
- **S5-A20** Bounded retry across a blue/green window (review P1): an outgoing be-01 without v2
  answers the first host-job event `400`, and before this fix `watch` stopped and every later
  worktree event and cleanup-request pull stalled. A host-job event refused `400` is now retried
  (as `ResourceWbsUnavailable`, one stderr line per retry) for 30 minutes from its first refusal,
  then the refusal throws as before. The first-refusal instant is kept per event id in the
  process only: a restarted `watch` starts the bound again, which the bound's purpose (outlasting
  a swap) tolerates. A v1 event's `400` still stops `watch` at once. `answeredBody` now throws
  `ResourceWbsRefusal` (status attached) for refused answers. Task 6.7 adds a restarting unit for
  `watch`; `docs/resources.md` states the deploy order WBS before Dash.
- **S5-A21** The reporter opens the host-pool ledger before any adapter and refuses an absent or
  unknown ledger `config_malformed` (naming `resources init`), so nothing is open when it fails;
  an adapter failing afterwards closes the ledger. `reserved()` reads only unreleased jobs, and
  the projection index is `(provider_id, state)`, the columns `hostJobsOf` filters on (review
  P5, P6, P7).
- **S5-A22** Trusted-state throws without negatives: `hostJobsOf`'s
  `resourceRuntimeHostJobUse.assert` on a stored declaration (ingestion stored only what the
  contract accepted) and `moveHostJobEvents`'s `HostJobChangeShape.assert` on a ledger row (only
  the runtime writes it) throw rather than default; neither has a fault-injected test (review
  P4).

### Fault injection

Each fault went in as an exact text replacement through a scratch script outside the
repository. The script ran the named test, restored the file and checked its SHA-256. Every
fault ran against the final code.

| Fault injected                                             | Test that went red                                                                                                       | Observed                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| reservations overwrite `usageUnits` in `reportInput`       | `reports the ledger's reservation beside the measured usage` (report-capacity.host-pool.test.ts)                         | `usageUnits` 12 for 8                              |
| ledger change subscription dropped from `reportInstance`   | `re-observes on the ledger's change, outside its cadence`                                                                | `waited out the cadence`                           |
| dimension/measure pairing check disabled                   | `refuses a host pool binding the loader cannot honour, config_malformed`                                                 | configuration loaded, no refusal                   |
| `projectId` made required in `resourceRuntimeHostJobUse`   | `projects two gates with no planning link…` (be-01); both tests of host-job-publication.test.ts                          | 400 on registration; Dash's move refused the event |
| host-job rows moved newest first                           | `a gate run while WBS is down publishes registered then returned, in order`; `a job still held…`                         | outbox `release_verified` ahead of `registered`    |
| `returned`-only-for-host-jobs check made `false` (store)   | `refuses what a host job cannot be…` (host-job-use.controller.db.test.ts)                                                | `removed` host job answered 200 for 400            |
| declaration comparison dropped from the host-job return    | same                                                                                                                     | return under another label 200 for 409             |
| `stored !== undefined` dropped from host-job registration  | same                                                                                                                     | second registration 500 (primary key) for 409      |
| rollback guard count replaced by `0` (`down.sql`)          | `refuses rollback over one host job, keeping it` (host-job-projection-migration.db.test.ts)                              | rollback exit 0                                    |
| reserved figure dropped from the measured headline (fe-01) | `reads reserved units and both job names…` (compute-provider-words.test.ts); `renders reserved units and the two gates…` | headline `Measured 15 GiB, 8 in use`               |

Not fault-injected: the "planning never reads `reservedUnits`" check
(`changes no schedule and no claim…`, compute-provider.controller.db.test.ts). It asserts that
the optimization hash and the startable read stay the same after a report that reserves all 15
units. Nothing in planning reads the column, so the only fault to inject would be adding a
reader.

### Commands

Fresh on 2026-11-01/02 on the 24-core workstation. Another worker shared it (load average 5 to 9).
Run from the worktree root against commit `79f525520` plus the lint-only test fix. `CLAUDECODE`
was unset for every test. Output is trimmed.

| Command                                                                                                                                                                                                                     | Result                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                 | exit 0. Review debt listed is pre-existing (store-memory 53/40, plan-commands 48/40)                                                                                                                                                             |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01,wbs-fe-01` | every library target ✔. `wbs-be-01:typecheck` first failed on Dash's `declaration()` return type (S5-A18); after the fix, `bunx tsc -p apps/wbs/be-01/tsconfig.{lib,spec}.json` was clean                                                        |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                                                                                                         | exit 0, `Ran 2016 tests across 151 files [981.46s]`, `Successfully ran target test`. The first run failed 4: three table-list filters lacked `resource_host_job` (fixed), and the performance certification saw my `git add -N` mid-run          |
| `bunx nx run wbs-contracts:test --skip-nx-cache`                                                                                                                                                                            | exit 0                                                                                                                                                                                                                                           |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                                                | `Ran 3862 tests across 266 files [2665.74s]`, 3 fail, all in `runtime-dispatch.boot.db.test.ts` (inner-deadline timing under load). Run alone: `14 pass, 0 fail`                                                                                 |
| `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`                                                                                                                                                                           | `Tests 1 failed / 1079 passed`; the failure is `playwright-config.test.ts` `spawnSync bun ETIMEDOUT`. Run alone with `src/test-tiers.test.ts`: `2 passed, 25 tests`. The first attempt died on an Nx DB `FOREIGN KEY` error before any test      |
| `bunx nx run wbs-mcp-01:test --skip-nx-cache`                                                                                                                                                                               | exit 0. The tool count is unchanged (no route added), so the README's `76 tools in all` stands                                                                                                                                                   |
| `bunx nx run twilight-dash:test --skip-nx-cache`                                                                                                                                                                            | `Ran 4183 tests across 126 files [1956.61s]`, 2 fail, in `src/runs/testing/store-directory-cleanup.db.test.ts` (cleanup budget) and `src/runs/sqlite/snapshot.db.test.ts` (timeout). Both rerun alone with the target's flags: `15 pass, 0 fail` |
| `bun test src/compute src/resources/host-job-publication.test.ts src/resources/runtime-wbs.test.ts` (Dash, after the lint fix)                                                                                              | `81 pass, 0 fail`                                                                                                                                                                                                                                |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`, `:lint`                                                                                                                                                              | `Successfully ran target …` each (after the TS2698 and dot-notation fixes in report-capacity.host-pool.test.ts)                                                                                                                                  |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                                             | exit 0, `Ran 982 tests across 50 files [1167.91s]`                                                                                                                                                                                               |
| migration lint (`tools/tool-git-hooks/src/hooks/migration-lint.ts` on the pair; lefthook on commit)                                                                                                                         | clean; lefthook `migration-lint` ✔                                                                                                                                                                                                               |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test …/pilot-policy.test.ts`                                                                                                                                          | `24 pass, 0 fail, 430 expect() calls, Ran 24 tests across 1 file. [325.24s]`                                                                                                                                                                     |
| `bunx prettier --check` on the touched files                                                                                                                                                                                | `All matched files use Prettier code style!` (the 75 non-SQL files of the diff)                                                                                                                                                                  |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                                                                                                                                               | `passed: 1, failed: 0`                                                                                                                                                                                                                           |

`docs/code-organization/kinds.json`: no file under a backend `service/` directory was added.
`audit.test.ts`: the one new `tx.update` targets the exempt `resourceHostJobRecord`, whose
exemption is listed there. `plan-refusal.ts`: no parser refusal code was added.

### Skipped or unverified

- Eye review of the resources section's reserved-units line is Dany's (UI acceptance rule). Task
  5.3 stays unticked until then. The rendering tests pass.
- No end-to-end run of Dash's outbox against a composed be-01 and mcp-01. The Dash tests check
  each published event with the shared contract (`resourceRuntimeEvent.assert`), and the be-01
  tests send the same shapes through mcp-01's forwarded grant.
- The h2puni gate (`bin/h2puni-gate.sh`) is not run for a slice PR into `plan/dash-host-jobs`;
  task 0.1 schedules it before the plan reaches main.
- The settlement digest covers the ledger row, not the run record (S5-A11, task 6.8).
  `launcherSha` is null until the launcher records it (S5-A12).
- The pre-existing flakes above (`runtime-dispatch.boot.db.test.ts`, `playwright-config.test.ts`,
  two Dash `src/runs` files) failed under the loaded full runs and passed alone. Nothing they
  cover changed.

### Review fixes (Fable, PR #811, MERGE AFTER FIXES)

P1 bounded retry (S5-A20; tasks renumbered 6.7 and 6.8 when #809 landed its 6.6), P2 `reservedDimension` (S5-A16), P3 `launcherSha` (S5-A11, S5-A12),
P4 host-job ingest refusals (S5-A22), P5 ledger before adapters, P6 unreleased-only scan, P7
index order (S5-A21), P8 the no-holder sentence. Faults, each injected against the fixed code
with the file restored and its SHA-256 checked:

| Fault injected                               | Test that went red                                                                          | Observed                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| host-job 400 rethrown instead of retried     | `a host-job event refused 400 twice publishes in order once WBS accepts it`; the bound test | stopped at the first refusal                  |
| retry bound never reached                    | `a host-job event refused past the bound stops watch`                                       | still `ResourceWbsUnavailable` past 30 min    |
| registration evidence check made unreachable | `refuses what a host job cannot be…`                                                        | registration with evidence 200 for 400        |
| registration revision check dropped          | same                                                                                        | revision-2 registration 200 for 409           |
| registration `requestId` check dropped       | same                                                                                        | 200 for 409                                   |
| `resource_use` id lookup dropped             | same                                                                                        | host job over a worktree use's id 200 for 409 |
| return incarnation comparison dropped        | same                                                                                        | 200 for 409                                   |
| return `requestId` check dropped             | same                                                                                        | 200 for 409                                   |
| return authority comparison dropped          | same                                                                                        | another authority's return 200 for 409        |
| route reserved pair check made unreachable   | `refuses reserved units without their dimension, and either alone, invalid_body`            | not `400 invalid_body`                        |
| ledger refusal rethrown unwrapped            | `refuses a host pool binding the loader cannot honour, config_malformed`                    | plain Error, not `ConfigurationRefusal`       |
| holder filter keeps every listed job (fe-01) | `names only the jobs reserving the report's dimension`                                      | `none reserved` with a holder named           |

P6 (`WHERE state != 'released'`) and P7 (index columns) change no behaviour: a released job
already reserved nothing, and the index only serves the query. Neither got a negative.

Commands, fresh on 2026-11-02, from the worktree root:

| Command                                                                                                                                                                 | Result                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun test src/controller/host-job-use.controller.db.test.ts src/controller/compute-provider.controller.db.test.ts src/host-job-projection-migration.db.test.ts` (be-01) | `42 pass, 0 fail, Ran 42 tests across 3 files. [40.22s]`                                   |
| `bun test src/compute src/resources/host-job-publication.test.ts src/resources/runtime-wbs.test.ts --timeout=60000` (Dash)                                              | `81 pass, 0 fail, Ran 81 tests across 8 files. [44.18s]` (both namespace wrappers pass)    |
| `bunx vitest run src/lib/compute-provider-words.test.ts src/components/wbs/resources-panel.test.tsx src/test-tiers.test.ts` (fe-01)                                     | `Test Files 3 passed (3)`, `Tests 79 passed (79)`                                          |
| `bun test src/calendar-marker-migration.db.test.ts src/migrate-down.db.test.ts src/audit.test.ts` (store-sqlite)                                                        | `29 pass, 0 fail, Ran 29 tests across 3 files.`                                            |
| `bunx nx run-many -t typecheck -p wbs-contracts,wbs-domain,wbs-core,wbs-store-sqlite,wbs-be-01,wbs-fe-01,twilight-dash`                                                 | `Successfully ran target typecheck for 7 projects and 3 tasks they depend on`              |
| `bunx nx run twilight-dash:lint`; `bunx eslint` on the touched WBS files                                                                                                | `Successfully ran target lint for project twilight-dash`; eslint on the 14 WBS files clean |
| `bunx prettier --check` on the touched files                                                                                                                            | `All matched files use Prettier code style!`                                               |
| migration lint on the pair (and lefthook on commit)                                                                                                                     | clean                                                                                      |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                                                                                           | `passed: 1, failed: 0`                                                                     |

No full Nx test target was rerun for the review fixes (coordinator's instruction).

## Slice 4 — calibration, proposal, audit (tasks 4.1–4.2)

Branch `feat/dash-host-jobs-4-calibrate` from `feat/dash-host-jobs-3-run` at `f5f36c760`
(slice 3, PR #809), 2026-11-02, on the 24-core workstation (Linux 7.0, systemd 255, a working
user manager). Code: `apps/twilight-structure/twilight-dash/cli/src/ops/` (new `measures.ts`,
`propose.ts`, `audit.ts`, `audit-units.ts`; `job-run.ts`, `scope.ts`, `catalogue.ts`,
`run-records.ts`, `commands.ts` extended), the `ops job calibrate|propose|audit|
render-audit-units` grammar in `src/cli-parser.ts`, and calibration admission in
`src/resources/runtime.ts` (request and use flag, drain fit, whole-vector reservation, every
unit). `moveHostJobEvents`, `publishEvent`, `src/compute`, WBS, be-01 and fe-01 are untouched
(slice 5's). Tests: `src/ops/propose.test.ts`, `src/ops/audit.test.ts` (synthetic records,
fixture `src/ops/run-record.test.fixture.ts`), `src/ops/audit-units.test.ts`,
`src/ops/calibrate.test.ts` (real ledger, fake scope seam, one real-scope test) and the parity
list in `src/cli.test.ts`.

### Assumptions (open decisions taken per design.md; overrulable by id)

- **S4-A1 Calibration admission.** A `calibration: true` flag on the runtime's `HostJobRequest`
  and `HostJob`, not a second admission path. The ticket queues like any waiter, so it can be
  overtaken and becomes a barrier after three (J6). It fits only when the pool has drained:
  every dimension of the reserved vector is zero, no unit is held, no host job is `starting` or
  `held`, every unit is ready and measured free space covers the whole disk budget. Admitted,
  it reserves all four `allocatable` dimensions (cores, memory, disk units, slots) and every
  unit of every exclusive id. That is J9's "whole `allocatable` vector" read literally, so on a
  host with long-lived worktree uses it waits until they are released. `ops job calibrate`
  defaults to `--wait-seconds 7200` and `--label calibration`; its payload gets the first unit
  of each id its type names.
- **S4-A2 Toolchain identity.** `bun <version>+<revision>` from `bun --revision` of the first
  `bun` on the payload's `PATH`, or `no bun on PATH`. A `bun` that does not answer is 70 before
  anything is reserved. `ops job run` records it too, so ordinary runs feed memory and tmp.
- **S4-A3 Oversize.** A calibration skips the cores, memory and tmp oversize refusal (73), so an
  envelope too large for the pool can be measured. It still refuses an exclusive id with no
  units.
- **S4-A4 Records.** The run-record schema stays version 1. `toolchain` and `calibration` are
  optional keys of the start. A record without `toolchain` was written by slice 3 and is named
  and excluded as not comparable. A record without `calibration` is an ordinary run, because
  only `calibrate` writes the flag.
- **S4-A5 Dimension sources and minimum.** Memory comes from every complete record that was
  neither throttled (largest `memory.events high` > 0) nor capped (`enforcement: cap`, ordinary
  runs only). CPU and duration come from calibration records alone. Tmp disk comes from every
  complete record, since J9 does not say which. The minimum is three records per dimension in
  its own source; the spec's "two calibration records for CPU and duration" scenario implies
  memory and tmp may count ordinary runs. CPU is the largest rate over the window from each
  sample to the first sample at least ten seconds later; a run shorter than one window is
  measured over its whole span. A refusal prints the lines, one `error:` line, and exits 1.
- **S4-A6 Complete.** Ended with status 0, no telemetry failure, no ledger failure, container
  attribution complete, and an exit sample with counters.
- **S4-A7 Output.** `propose` prints the **replacement entry** for `jobs[i]`, not an RFC 6902
  patch: one line per dimension with the p95, the source and the record ids, each excluded
  record with why, then the entry as JSON. The entry is validated by Burokrat's catalogue
  contract. Envelope values are ⌈p95 × 1.25⌉, at least one core and one GiB. Provenance is
  `calibrated` with the host class, the clock's instant, the p95s rounded to hundredths (always
  below the envelope) and the union of record ids. Duration is printed but has no catalogue
  field. Burokrat stays reachable only from `catalogue.ts` (the lint boundary of slice 3).
- **S4-A8 Audit scope and overrun.** The audit reads the current checkout's catalogue at HEAD
  plus the catalogue of every checkout a record names, each at its HEAD. A missing checkout or
  catalogue refuses (64 or 70), never skips. An overrun is a peak above the envelope the run was
  admitted under, in memory, CPU or tmp, for any ended run including a failed one. It is
  superseded only when the HEAD entry covers the peak, or the entry's digest changed since the
  run and its provenance is `calibrated`.
- **S4-A9 Waste.** Judged over complete runs whose descriptor digest equals the HEAD entry's,
  per dimension. Memory excludes throttled and capped runs. A zero tmp envelope is skipped.
  At least ten values are needed.
- **S4-A10 Attribution.** `attribution_incomplete` is kept until a later ended run of the same
  type and catalogue saw containers, every one `bounded`, with attribution complete: positive
  evidence of coverage. J16 does not say how it ends.
- **S4-A11 Estimates and notes.** `estimate_expired` reads every catalogue the audit read and
  treats `until` as valid through its last UTC millisecond, as `JOB-CATALOGUE` does. `--now`
  must be `YYYY-MM-DDTHH:MM:SS[.sss]Z`, else 64. Runs without an outcome, and runs of a type no
  longer catalogued, print `note: not judged …` and are not drift.
- **S4-A12 Weekly units.** `ops job render-audit-units` is a fifth `ops job` word beside J17's
  list. It writes a systemd **user** oneshot service (`WorkingDirectory` the checkout,
  `ExecStart` bun, Dash, `ops job audit --config …`) and a timer (`OnCalendar=weekly`,
  `Persistent=true`, `RandomizedDelaySec=1h`). The templates are embedded in TypeScript, so the
  build bundle carries no `.tmpl` assets. Paths use the observation units' grammar, and an
  existing file is never replaced. A drift fails the unit, which `systemctl --user --failed`
  shows. Installing is the operator step in `docs/resources.md`; nothing was installed.
- **S4-A13 Exit codes.** Audit drift and a refused proposal exit 1. They are outcomes, not
  `OpsRefusal`s, whose codes keep the shell lock's contract (J13).

### Fault injection

Each fault was applied by exact text replacement from a scratch script outside the repository.
The named test file was run (`bun test`, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset; the
namespace wrapper reruns `calibrate.test.ts` inside), then the file was restored byte for byte
and its SHA-256 compared with the original: equal in every row. Proof comments were reworded
afterwards, with no code change, to match what was observed.

| Fault injected                                                     | Test that went red                                                                                       | Observed                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| minimum records lowered to one (`measures.ts`)                     | `too few records`                                                                                        | expected `refused`, received `proposed`              |
| throttled runs taken into memory (`propose.ts`)                    | `a throttled run does not lower the proposal`                                                            | memoryGib expected 6, received 5                     |
| overruns aged out after five later runs of the type (`audit.ts`)   | `an overrun is drift eight runs later` (and the superseded-by-envelope test)                             | the overrun line missing: no drift                   |
| `until` judged from the start of its day                           | `an expired estimate is drift, valid through its until day`                                              | `estimate_expired` named at 2026-12-01T23:59:59.999Z |
| `waste` never named                                                | `a p95 below half the envelope over ten runs is waste`                                                   | no drift                                             |
| `attribution_incomplete` never named                               | `a run with an unbounded container is attribution_incomplete …`                                          | no drift                                             |
| unit path check returns at once (`audit-units.ts`)                 | `refuses a unit path with a systemd specifier`                                                           | `/home/%u/bun` rendered, no throw                    |
| existing-file pre-check dropped                                    | `writes both files and replaces neither`                                                                 | the service written beside the operator's timer      |
| CPU of a run shorter than one window left null (`measures.ts`)     | `three calibrations record calibration records; propose …`, `propose refuses naming the count …`         | propose exit 1, not 0; the count line changed        |
| calibration scope keeps `MemoryHigh`/`MemoryMax` (`scope.ts`)      | `a calibration scope sets no memory bound …`, real-scope `a calibration runs with no MemoryHigh`         | `MemoryHigh=6G`, `MemoryMax=6G` present              |
| any `bun --revision` answer accepted (`catalogue.ts`)              | `a bun that cannot name its revision refuses 70 before anything is reserved`                             | no refusal: the job ran                              |
| `--now` unchecked (`commands.ts`)                                  | `--now must be an ISO instant`                                                                           | exit 0, not 64                                       |
| calibration admitted on the envelope fit, no drain (`runtime.ts`)  | `a calibration waits for the pool to drain`, `a calibration measures an envelope larger than the pool …` | expected `waiting`, received `admitted`              |
| calibration charged its envelope, not `allocatable` (`runtime.ts`) | `a calibration holds the whole allocatable vector`                                                       | reserved 2 cores, 0 disk units, not 8 and 16         |
| calibration claims only its envelope's units (`runtime.ts`)        | `… waits for the pool to drain`, `… holds the whole allocatable vector`, the end-to-end calibrate test   | units `[]`, not both gate trees                      |

The brief's negatives are rows 1 (minimum one), 2 (throttled run included: the proposal drops)
and 3 (overruns aged out after five runs: the eight-runs-later fixture passes without drift).

### Commands (fresh, 2026-11-02, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset for tests)

| Command                                                                                                                                                     | Result                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun test src/ops/propose.test.ts src/ops/audit.test.ts src/ops/audit-units.test.ts src/ops/calibrate.test.ts src/cli.test.ts src/no-ambient-clock.test.ts` | 76 pass, 0 fail (6 files); the namespace rerun of `calibrate.test.ts`: 9 pass, 0 fail        |
| `bun test` on `status`, `job-run`, `containers`, `host-jobs`, `host-job-holds`, `host-jobs.model` (callers of the changed runtime and launcher)             | 5, 44, 3 pass; the namespaced `host-jobs`, `host-job-holds`, `host-jobs.model` wrappers pass |
| `bunx nx run twilight-dash:test --skip-nx-cache`                                                                                                            | 4213 pass, 0 fail, 132 files, 1751.92 s; no flake rerun needed                               |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`, `:lint --skip-nx-cache`, `:build --skip-nx-cache`                                                    | each `Successfully ran target`                                                               |
| `bunx prettier --check` on every touched file                                                                                                               | `All matched files use Prettier code style!`                                                 |
| `bunx openspec validate dash-host-jobs --json`                                                                                                              | `valid: true`, 1 passed, 0 failed (the existing compute-provider warning only)               |
| `bun …/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                       | exit 0; review debt only the two existing WBS indexes                                        |

### Skipped or unverified

- Not host-proven: nothing ran on h2puni or h4claw, and no unit was installed anywhere. The real
  scope test ran on this workstation's user manager; CI skips it, named, without one.
- The `tool-devsync` pilot-policy test was not run: every new file is under `src/ops/`.
- `host-jobs.model.test.ts` does not yet generate calibrations (J18 lists them); the slice adds
  example tests of drain, whole-vector hold and every unit, not a model. Follow-up.
- Slice 5's `resourceRuntimeUse` v2 mapping (PR #811) must charge a calibration use the event's
  `reserved` vector, which this slice already writes, not its descriptor's envelope. Follow-up
  for that slice; `runtime.ts`'s `moveHostJobEvents` and `publishEvent` are untouched.
- Two invariant guards have no production-path negative, because only a corrupted ledger or run
  record reaches them: `jobEnvironment`'s "holds no `<id>` unit" and `checkoutOfCatalogue`'s
  malformed catalogue path.
- `ops job status` shows a calibration's catalogue envelope on its running line. The pool line's
  `reserved` shows the whole vector; no `calibration` marker was added.

### Review fixes (Fable, PR #814 at `f07b9c74f`, MERGE AFTER FIXES)

Applied on `feat/dash-host-jobs-4-calibrate`, 2026-11-02. `plan/dash-host-jobs` (head `c01dae8d5`)
was not merged in: #811 lands first.

- **A1** `ops job audit`'s overrun clears only when the HEAD entry's envelope is at least the
  peak. The second disjunct (a changed `calibrated` entry) was deleted, matching the spec
  scenario "An overrun is drift". The test now expects the overrun under a calibrated 6 GiB
  entry, and the docs sentences were dropped (S4-A8 amended).
- **A2** The audit judges every record by job id against the catalogue of the checkout it runs
  in. The per-record `readCommittedCatalogue` loop is gone, so a record from a deleted scratch
  worktree no longer refuses the weekly audit (`auditDrift` takes one catalogue).
- **A3** `HostJob.reserved: PoolVector` is persisted at admission: `allocatable()` for a
  calibration, else envelope, tmp disk units and one slot. `reservations()` sums it. A row
  written before this fix has no `reserved`; the shape keeps it optional and `hostJobOf` derives
  it from the descriptor on read, as `reservations()` did before (tested). Slice 5's
  `hostJobDeclaration` will read `job.reserved` and group `job.units` by id after #811; not done
  here.
- **A4** The model (`host-jobs.model.test.ts`) gains a real calibration type (`calibration:
true`, a gate naming `gate_tree`). It is admitted only on a drained model pool, is charged
  the whole `allocatable` vector and both trees, and is exited and settled like any job. An
  example walks build, calibration waiting, calibration admitted, gate waiting, gate admitted.
  New invariants: held units never exceed the pool's, never double-held, and equal the
  model's. Coverage counters `drainedCalibration` and `calibrationWaited` must be reached.
- **A5** A calibration requires and holds every unit of each id its **type** names; other ids'
  units are untouched (S4-A14).
- **A6** A refusal at the end of the wait names a free-space shortfall: free bytes, needed
  bytes, disk units and headroom.
- **A7** `ops job status` prints `running calibration <type> …` and `waiting calibration
<type> …` (`HostJobTicket.calibration`).
- **A8** `propose` names a record of the type admitted from another catalogue path (`excluded
… another catalogue: <path>`).
- **A9** `provenance.recordIds` leaves out records excluded from any dimension (throttled or
  capped), which the dimension lines still cite (S4-A16).
- **A10** J9's "window" is, until a window is designed, the partition's entire history
  (S4-A15), stated in `docs/resources.md` and `infra/jobs/README.md`.
- **A11** The unit files are written `wx` with mode 0600, as `render-observation-units` writes
  its bundle. Both names are checked first, so no half pair is left.
- **A12** The parser, README and catalogue README say "replacement catalogue entry", not
  "patch".
- **A13** The negatives below. `auditInstant` also gains a round trip, because
  `2026-02-30T00:00:00Z` passes the pattern and `Date.parse` rolls it to 2 March. Waste's
  `declared === 0` skip was removed rather than proved: no p95 is below half of zero.
  `checkoutOfCatalogue` was removed with A2.

#### New assumptions (overrulable by id)

- **S4-A14** A calibration holds every unit of the exclusive ids its type names, and only
  those. A type naming none holds no unit and is not blocked by another id's dirty tree. Other
  jobs still cannot start beside it, because it holds every core and GiB.
- **S4-A15** J9's "window" is the partition's entire run history until a window (count or
  age) is designed.
- **S4-A16** `provenance.recordIds` cites the records that fed every dimension they were
  eligible for. The `calibrated` provenance has one id list, not one per dimension.
- **S4-A17** A ledger row without `reserved` (written before this fix) reads its reservation
  from its descriptor: the envelope, its tmp disk units and one slot, or `allocatable` if
  flagged `calibration`. No such calibration row exists outside this branch's tests.
  Amended by slice 6b (S3 follow-up b): a `calibration` row without `reserved` now throws.
  Calibration and `reserved` landed together, so such a row is a broken invariant, not an old
  row.
- **S4-A19** `propose` partitions records by `cataloguePath`: a record admitted from another
  checkout's catalogue is named and left out. `audit` judges every record by job id against the
  current checkout's catalogue. The two answer different questions: which measurements
  describe this catalogue's entry, and whether any run overran what it was admitted under.
  Recorded in `docs/resources.md`. Added by slice 6b, S3 follow-up d.

#### Fault injection (review fixes)

Same method as above: scratch-script replacement, the named file run with `CLAUDECODE` and
`CLAUDE_CODE_ENTRYPOINT` unset, byte-for-byte restore with SHA-256 equal in every row.

| Fault injected                                                                        | Test that went red                                                                              | Observed                                                                                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A1 calibrated-entry disjunct restored                                                 | `a calibrated entry that does not cover the peak keeps the overrun`                             | the overrun line missing                                                                                             |
| A2 audit reads each record's own checkout                                             | `three calibrations …; audit reads them` (vanished-checkout record)                             | exit 64, expected 0                                                                                                  |
| A3 `reservations()` sums the envelope's cores                                         | `a calibration holds the whole allocatable vector`                                              | cpuCores 4, expected 8                                                                                               |
| A3 admission persists the envelope for a calibration                                  | `… holds the whole allocatable vector`, `… waits for the pool to drain`                         | the gate's envelope, not `allocatable`                                                                               |
| A3 legacy-row fallback dropped                                                        | `a ledger row written before reserved was persisted reads it from its descriptor`               | no reservation read                                                                                                  |
| A4 drain fit skipped (model)                                                          | `the admission queue and settlement follow the model under every interleaving`                  | property failed after 3 tests: `waiting` expected, `admitted`                                                        |
| A5 a calibration claims none of its ids' units                                        | `a calibration of a gate holds every gate tree`, `… whole allocatable vector`, end-to-end tests | neither tree held                                                                                                    |
| A5 drain checks every unit of the pool                                                | `a calibration of a type naming no unit holds none and ignores a dirty tree`                    | refused, expected admission                                                                                          |
| A13a unit readiness dropped from `drained()`                                          | `a calibration waits while a unit of its type is dirty`                                         | `host pool unit vanished during admission`                                                                           |
| A13a free space dropped from `drained()`                                              | `a calibration waits for free space for the whole disk budget, naming the shortfall`            | `admitted`, expected `refused`                                                                                       |
| A13a starting/held dropped from `drained()`                                           | none: stayed green                                                                              | see below                                                                                                            |
| A6 shortfall text silent                                                              | `… naming the shortfall`                                                                        | refusal without the free-space clause                                                                                |
| A7 `calibration` word dropped                                                         | `a second calibration waits behind the first; status names both`                                | running line without it                                                                                              |
| A8 other-catalogue record skipped silently                                            | `a record from another catalogue is named and left out`                                         | no `excluded` line                                                                                                   |
| A9 every source cited                                                                 | `a throttled run does not lower the proposal`                                                   | `throttled` in recordIds                                                                                             |
| A11 units written 0644                                                                | `writes both files owner-only and replaces neither`                                             | modes 644                                                                                                            |
| A13d capped branch dropped                                                            | `a capped run is left out of memory, named`                                                     | memoryGib 3, expected 2                                                                                              |
| A13e each of telemetry, ledger, attribution, exit-sample branches dropped (four runs) | `each kind of incomplete record is named and left out`                                          | memoryGib 12, expected 5, each time                                                                                  |
| A13f each of the four `readCommittedCatalogue` refusals dropped (four runs)           | `propose refuses a checkout without a usable catalogue, and an uncatalogued type`               | exit 1 outside a checkout; "does not exist" for no HEAD; 70 for no catalogue; the contract's own error for malformed |
| A13f uncatalogued-type refusal dropped                                                | same test                                                                                       | threw from `proposeEnvelope`, no 64                                                                                  |
| A13g `isFinite` dropped                                                               | `--now must be an ISO instant`                                                                  | `RangeError: Invalid Date` for `2026-13-45T00:00:00Z`                                                                |
| A13g round trip dropped                                                               | `--now must be an ISO instant`                                                                  | exit 0 for `2026-02-30T00:00:00Z`                                                                                    |
| A13h zero-container coverage allowed                                                  | `a later run that started no container does not clear attribution_incomplete`                   | no drift                                                                                                             |
| A13i version pattern dropped (exit status kept)                                       | `a bun that answers its revision with garbage refuses 70`                                       | no refusal: the job ran                                                                                              |
| A13b drain fit and whole-vector reservation both dropped                              | `a second calibration waits behind the first; status names both`                                | `admitted` (either alone stayed green)                                                                               |

Not provable alone from the production path, so stated rather than tested:

- **`drained()`'s "no starting or held host job" conjunct.** The catalogue contract gives every
  type at least one core and one GiB, and every starting or held job also holds a workspace
  slot, so the reserved-is-zero conjunct already refuses. It stays as a guard for a
  zero-envelope runtime descriptor; dropping it stayed green.
- **A13b.** The second calibration is kept out by two independent checks; each alone suffices.
  The double fault is the proof.
- **A13c.** A calibration naming an id with no units is refused 73 by the existing `oversize`
  check, which the calibration does not skip for exclusive ids. Tested as `a calibration naming
an exclusive id with no units is refused 73` (an example, not a new check).
- **A13j.** The waste `declared === 0` skip was removed, not proved (above).

#### Commands (fresh, review fixes; no full target, as the coordinator asked)

| Command                                                                                                                                                                                   | Result                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun test` `src/ops/propose`, `audit`, `audit-units`, `calibrate`, `status`, `job-run`, `src/cli`, `src/no-ambient-clock`, `src/resources/host-jobs`, `host-jobs.model`, `host-job-holds` | 8, 11, 3, 18 (namespace), 5, 44, 55, 2 pass; the namespaced `host-jobs`, `host-jobs.model`, `host-job-holds` wrappers pass (`host-job-holds` 5 pass); 0 fail |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`, `:lint --skip-nx-cache`                                                                                                            | each `Successfully ran target`                                                                                                                               |

#### After #811: the WBS mapping reads the persisted reservation (A3, second half)

`plan/dash-host-jobs` at `b116cb40e` (#811 merged) was merged in with a merge commit. Only
`verify.md` conflicted; its sections now run Slice 3, #809 fixes, Slice 5, #811 fixes, Slice 4,
#814 fixes.

- **S4-A18 WBS mapping.** `hostJobDeclaration` declares the job's persisted reservation, not
  its envelope:
  - `cpuCores`, `memoryGib` and `tmpDiskGib` come from `job.reserved`;
  - each exclusive id is counted from `job.units` grouped by `exclusiveId`;
  - a calibration of `website-dev-build` therefore declares 8 cores, 13 GiB and the 2 GiB disk
    budget, and a gate calibration declares `gate_tree` 2.

  `reserved` now also stores `tmpDiskGib`, set at admission: the envelope's figure for a run,
  `⌊diskUnits × diskUnitBytes / GiB⌋` of the whole budget for a calibration. A stored GiB figure
  keeps the ledger reader in `src/compute` free of the runtime configuration. `reserved` and
  `units` never change after admission, so `registered` and `release_verified` still carry one
  declaration (tested). `HostJobChangeShape` ignores undeclared keys, so event rows of jobs with
  `reserved` and `calibration` publish (tested).

- **The reporter's ledger port** (`openHostPoolLedger().reserved`) recomputed from the
  envelope. It now sums `job.reserved`; a snapshot without one (written before slice 4's
  review) charges its envelope, as before.

| Fault injected                          | Test that went red                                                                              | Observed                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| declaration reads the envelope          | `a calibration projects the whole allocatable vector` (host-job-publication.test.ts)            | units 2, 2, 0, expected 8, 13, 2 |
| declaration counts `envelope.exclusive` | `a calibration of a gate declares every gate tree it holds`                                     | `gate_tree` 1, expected 2        |
| ledger port sums the envelope           | `a calibration's ledger port reads the whole pool reserved` (report-capacity.host-pool.test.ts) | 2, 2, 0, 0, expected 8, 13, 2, 0 |

Commands (fresh, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset):

- `bun test src/ops src/compute src/resources/{host-jobs,host-jobs.model,host-job-holds,host-job-publication,runtime-wbs}.test.ts src/cli.test.ts src/no-ambient-clock.test.ts`:
  172 pass, 1 fail across 20 files.
  - The failure is `report-capacity.test.ts` > `refuses a configuration readable by others
before any request`, at its 5 s default timeout. It spawns the entrypoint, which takes 5.1 to
    5.2 s on this workstation.
  - It fails the same way on an untouched `b116cb40e` checkout (22 pass, 1 fail), so it predates
    this branch. It is the import-cost follow-up of task 3.1 (review R6).
- `twilight-dash:typecheck` and `:lint` (`--skip-nx-cache`) succeed.

## Slice 6a — launchers through `run_heavy_job`, conflict inventory, J19 (tasks 6.1, 6.2, 6.6)

Branch `feat/dash-host-jobs-6a-launchers` from `plan/dash-host-jobs` at `c01dae8d5`. Nothing here
touched a real host: no ssh, no Ansible, no enrollment (tasks 6.3 to 6.5). The inventory is
[`docs/infra/heavy-job-launchers.md`](../../../docs/infra/heavy-job-launchers.md); J19 is in
design.md after J18.

### Assumptions (overrulable by id)

- **S6-A1 Fixed pool root.** The configuration path is J12's
  `/home/puni1/.config/dash/host-pool.json`. The ledger that proves a host was enrolled is
  `<root>/.dash/resources.sqlite`, and `root` comes from the configuration, so a missing
  configuration leaves the ledger unlocatable. The root is therefore fixed too, at
  `/home/puni1/.local/share/dash/host-pool`. `run_heavy_job` refuses 70 for a configuration naming
  another root, read with `jq`, which the gate host role already installs. Task 6.3's role must
  write that root.
- **S6-A2 Not enrolled yet.** J12's observe phase (Dash jobs under the legacy queue protocol) and
  the concurrent-mode singleton flock guard are not in this slice; they land with
  `ops pool switch-mode` after slice 4. Until both land no gate host may get a pool
  configuration. tasks.md 6.1 and the inventory say so. Both landed with slice 6b (merged
  into it at `994512439`), which also moves the remaining precondition to task 6.7 (the `watch`
  unit) before enrollment.
- **S6-A3 Type required everywhere.** `run_heavy_job` refuses 64 without a catalogue-shaped
  `HEAVY_LOCK_JOB_TYPE` on unenrolled hosts too, so a launcher that forgets its type fails before
  any host enrolls. A prefix assignment (`HEAVY_LOCK_JOB_TYPE=gate run_heavy_job …`) is how every
  launcher passes it.
- **S6-A4 Dash location.** Dash is `bun <checkout>/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts`,
  where `<checkout>` is the directory above the sourced `heavy-lock-lib.sh`. That makes it the
  launcher's own revision, which is also the revision whose catalogue Dash reads. `bun` comes
  from `PATH`, as every gate step's does; a missing entrypoint or `bun` is 70. The tests use a
  fixture checkout, not an override.
- **S6-A5 Payload scripts.** `ops job run` checks the payload's arguments against the type's
  profile, so each launcher splits into an outer half and a payload script whose arguments fit
  (`<sha>`, or none): `bin/h2puni-gate-payload.sh`, `bin/publish-release-payload.sh`,
  `bin/test-queued-payload.sh`, `bin/solver-image-publish-payload.sh`. Unenrolled, the payload
  runs under `with_heavy_lock` exactly as the old inline command did. The gate's trusted wiki
  launcher copy and the solver candidate's Bun and root go through the environment
  (`H2PUNI_GATE_TRUSTED_LAUNCHER`, `SOLVER_PUBLISH_BUN`, `SOLVER_PUBLISH_ROOT`). `test:queued`
  is now `bin/test-queued.sh`, and its payload runs `bunx nx run-many -t test`.
- **S6-A6 Enrolled gate tree.** The payload gates `DASH_JOB_UNIT_GATE_TREE` on an enrolled host
  and refuses 64 without it, or when it names the launcher checkout itself. A missing gated
  commit is fetched from the launcher checkout. The payload restores the tree to its resting
  commit after a pass as well as after a failure, so settlement can release the unit; an
  unenrolled gate still keeps the gated commit. An unenrolled payload refuses 64 when an
  inherited `DASH_JOB_UNIT_GATE_TREE` is set. The launcher refuses an unresolvable sha 64 before
  queueing; that refusal used to belong to `gate_with_pinned_head`, which keeps its own for
  fixtures.
- **S6-A7 `dagger_engine` unit.** Host pool units must be Git work trees (slice 2), so the
  `dagger_engine` unit that `release-build` and `solver-image-publish` name can only be a token
  Git tree that the role creates. A non-tree unit kind is a Dash follow-up.
- **S6-A8 Release arguments.** `release-build`'s profile is `""`, so an enrolled host refuses
  `bin/publish-release.sh` with arguments (64). Unenrolled, they pass through as before.
- **S6-A9 Solver publish from the live checkout.** `bin/solver-image-publish.sh` runs from the
  live checkout `~/wbs-dev/src`, the only Git checkout in that path, because Dash reads the
  catalogue there. Its poller can move HEAD while the job waits, and Dash then refuses 64 at the
  gate; the publish fails loudly and runs nothing.
- **S6-A10 J16 coverage.** The solver smoke's four direct `docker run`s now carry `--memory 1g
--cpus 1` (the `gate` bound) and, inside a Dash job, `--label puni.job=$DASH_JOB_ID`. Other
  containers stay unlabelled or unbounded: the supervisor's managed solver containers, the orphan
  proc tests and Caddy in `mcp-body-limit.test.ts`. So `gate` stays serialised by J16
  (`attribution_incomplete`) until they are covered (follow-up).
- **S6-A11 J19 leader.** A use that never ran a command has no leader, so its creator stands in.
  "Dash-owned process group" means the session of any unreleased use or host job in the ledger.
  "Dash-owned scope" means any `dash-job-*.scope` cgroup component. Host-job settlement keeps its
  own job-scope rule unchanged.
- **S6-A12 Signals.** Dash runs in the background of the launcher shell, which forwards INT,
  TERM and HUP to it; a signal arriving before Dash has a pid is held and forwarded once it does.
  Dash's own 129/130/143 or the payload's 128 + signal is the launcher's status.

### Commands (fresh, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`)

| Command                                                                                                              | Result                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `bash bin/heavy-lock.test.sh`                                                                                        | `all heavy-lock checks passed` (cases 1-28 unchanged, 40-45 new)                       |
| `bash bin/h2puni-gate.test.sh`                                                                                       | `all cases passed` (44a-44h, 45a-45d new)                                              |
| `shellcheck -x` on every edited or new `bin/*.sh`; `shellcheck -s bash apps/wbs/be-01/scripts/solver-image-smoke.sh` | exit 0                                                                                 |
| `bun test src/ops/launchers.test.ts` (namespace)                                                                     | 7 inner pass, outer pass                                                               |
| `bun test` resource-holds, host-job-holds, host-jobs, host-jobs.model, host-pool, runtime, no-ambient-clock          | 22 pass after renaming a `self` local the clock detector flagged                       |
| `bun test scripts/solver-image-smoke.test.ts` (be-01)                                                                | 40 pass                                                                                |
| `bun test src/heavy-lock.test.ts` (tool-dagger)                                                                      | 9 pass                                                                                 |
| `bun test src/policy/gate-entrypoints.test.ts` (Burokrat)                                                            | 56 pass, 2 fail; the same 2 fail on untouched `origin/plan/dash-host-jobs` (see below) |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                      | 982 pass, 0 fail                                                                       |
| `bunx nx run twilight-dash:typecheck` / `:lint` (`--skip-nx-cache`)                                                  | both succeeded                                                                         |
| `bunx prettier --check` on every touched `.ts`, `.md`, `.json`                                                       | all formatted                                                                          |
| `bunx openspec validate dash-host-jobs --json`                                                                       | 1 passed, 0 failed                                                                     |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` (files staged)           | exit 0                                                                                 |
| `bunx nx run twilight-dash:test --skip-nx-cache`                                                                     | 4202 pass, 0 fail across 130 files, 28m 15s; no flake this run                         |

### Fault injection

Every fault was applied by script, watched red, then restored. The file's SHA-256 was checked
equal before and after (`restored=yes` for every row).

SHA-256 is the first 12 hex digits of the file at fault time; four proof comments were reworded
afterwards, so the current files hash differently.

| Fault injected                                                          | File (SHA-256 before = after)                    | Went red                                                                                                 | Observed                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ledger check in `read_host_pool_enrollment` → `if false`                | `bin/heavy-lock-lib.sh` `f72dd976338a`           | heavy-lock 40a                                                                                           | `want exit 70, got 0`; ran on the legacy lock beside the ledger             |
| readability check dropped (`-r`)                                        | same                                             | heavy-lock 40c                                                                                           | still 70, but `names no root` (jq) instead of `is not a readable file`      |
| root check → `if false`                                                 | same                                             | heavy-lock 40e, 40c-40f                                                                                  | `want exit 70, got 0`; Dash ran over a foreign root                         |
| `read_path_presence` unknown → `absent`                                 | same                                             | heavy-lock 41                                                                                            | `want exit 70, got 0`; legacy lock beside a hidden ledger                   |
| `HEAVY_LOCK_MECHANISM=legacy` chooses the legacy lock                   | same                                             | heavy-lock 42b                                                                                           | `want 'dash', got 'legacy'`                                                 |
| type refusal → `if false`                                               | same                                             | heavy-lock 43a, 43b                                                                                      | `want exit 64, got 0`; the payload ran without a type                       |
| `env -u HEAVY_LOCK_WAIT_SECONDS -u HEAVY_LOCK_POLL_SECONDS` → `env`     | same                                             | heavy-lock 44c, 44d                                                                                      | payload saw `1800 7`                                                        |
| TERM forwarding trap → `trap ':' TERM`                                  | same                                             | heavy-lock 45b                                                                                           | `want exit 143, got 97`; Dash never got TERM                                |
| enrolled refusal in `resolve_gate_tree` → gate the launcher checkout    | `bin/h2puni-gate-lib.sh` `bdd9e16bcba3`          | gate 44a                                                                                                 | `want exit 64, got 0`                                                       |
| unenrolled refusal → `if false`                                         | same                                             | gate 44d                                                                                                 | `want exit 64, got 0`                                                       |
| launcher-checkout refusal → `if false`                                  | same                                             | gate 44c                                                                                                 | `want exit 64, got 0`                                                       |
| `restore` read as `keep` in `run_pinned_checkout`                       | same                                             | gate 45a, 45b                                                                                            | tree left detached at the gated commit                                      |
| `DASH_JOB_UNIT_<ID>` not set by `jobEnvironment` (`src/ops/job-run.ts`) | `job-run.ts` `39c47189ebba`                      | launchers: two gates, gate beside release, failing gate                                                  | every enrolled gate exited 64 (`Received: 64`)                              |
| enrolled refusal removed (end to end)                                   | `bin/h2puni-gate-lib.sh` `bb77be6616df`          | launchers: `the enrolled payload run without an admission refuses 64`                                    | exit 0                                                                      |
| `restore` read as `keep` (end to end)                                   | same                                             | launchers: two gates (unit not at resting commit), gate beside release and failing gate (120 s timeouts) | units stayed charged, so later gates waited for a tree                      |
| solver smoke registry run without the bound                             | `solver-image-smoke.sh` `46dad3701e46`           | both J16 cases in `solver-image-smoke.test.ts`                                                           | registry `run` lacked `--memory 1g --cpus 1`                                |
| label dropped                                                           | same                                             | `runs every container it starts bounded and labelled`                                                    | no `puni.job=`                                                              |
| `initScopeOf` owns every cgroup (the old refusal)                       | `runtime.ts` `a70da101351b` (rerun after rename) | resource-holds: the three pool-init cases                                                                | refused on this host's own `systemd --user`, PID 2327                       |
| start comparison dropped in `outsideScope`                              | `runtime.ts` `171ad7972b39`                      | resource-holds: init-after, cleanup-after; host-job-holds: started-after, left-for-another-scope         | released / initialized beside a later holder                                |
| session test dropped                                                    | same                                             | resource-holds: another use's process group                                                              | released                                                                    |
| owned-scope test dropped                                                | same                                             | resource-holds: pool init and cleanup beside a `dash-job-*` scope                                        | exit 0 / released                                                           |
| `useScope` owns every cgroup (the old refusal)                          | same                                             | resource-holds: the four cleanup cases                                                                   | every cleanup blocked on this host's own `systemd --user` before the holder |

### Skipped or unverified

- No real host: J19 and `ops pool init` were proven on this workstation (systemd 255, its own
  `systemd --user` PID 2327 and `(sd-pam)` PID 2328), not on h2puni or h4claw (systemd 259).
- The launcher concurrency test runs Dash over the fake scope seam inside a user namespace, so no
  real `systemd-run` scope measured those gates. The real-scope path is slice 3's
  `job-run.test.ts`.
- The real solver smoke was not run with the new bounds. Whether the solver run and the Bun
  clients fit in 1 GiB and one CPU is unverified until the next real gate, on h2puni or in CI's
  solver-image-smoke step.
- `bin/heavy-lock.test.sh` cases 40c and 41 skip when run as root, where mode 000 hides nothing.
- `puni-pr-00`'s `build-release.sh` is not converted (another repository; owed).
- `gate-entrypoints.test.ts` has two failures on this workstation, `the host gate fails
specifically at wiki lint for a stale enforced blob` (78 for 1) and `the real Nx target reruns
an omitted-input mutation …`. Both fail identically on an untouched `origin/plan/dash-host-jobs`
  worktree, so they are pre-existing and environmental. The test this slice changed (`Nx, host
gate, CI and lefthook select the whole tree`) passes.
- Follow-ups: a non-tree unit kind for `dagger_engine`; J16 bounds and labels for the remaining
  containers; a `test-queued` unit or isolation for the shared `.nx` cache; the gate host role
  must provide a launcher-only checkout and the fixed root (6.3); Dash itself could refuse a pool
  root other than the fixed one.

### Review fixes (Fable, PR #816 at `f14b78dd8`, MERGE AFTER FIXES)

All of F1–F11 are applied on `feat/dash-host-jobs-6a-launchers` after re-merging the plan at
`dabffed86` (slices 4 and 5). That merge conflicted only in `tasks.md` and `verify.md`; both sides
were kept. `runtime.ts` and `docs/resources.md` merged cleanly, and the J19 code compiles against
their `HostJob`.

- **F1 (J19 amendment).** A process whose cgroup is exactly
  `/user.slice/user-<uid>.slice/session-<id>.scope` is outside Dash-owned work whenever it
  started, in every position. A Dash-owned session still wins. Written into design.md J19.
- **F2.** `docs/infra/heavy-job-launchers.md` gains a `website-dev-build` row and a direct
  `bin/with-heavy-lock.sh -- …` row, both legacy-only and bypassing Dash on an enrolled host
  until slice 6b; the opening sentence is corrected.
- **F3.** Catalogue `basis` strings for `gate` and `test-queued` are updated. The inventory says
  serialisation today rests only on no mode switch. tasks.md 6.5 specifies `concurrencyEligible`.
- **F4.** The solver smoke applies `--memory 1g --cpus 1` and the label only when `DASH_JOB_ID`
  is set; outside a Dash job the argv is the pre-PR one. Task 6.4 measures the peaks first.
- **F6.** Negatives and Proofs added for: the entrypoint, `bun`, `jq` and `--` refusals (46a–d);
  `resolve_gate_commit` (44g, 44h); the "neither" enrollment (44i); the real launcher's
  non-commit (47); the solver and test-queued launchers and payloads (47a–e).
  - **Uninjectable:** `initScopeOf`'s `pool initializer identity unavailable` (needs the running
    process's own `/proc/self/stat` gone) and `outsideScope`'s `has no session` (needs a
    `/proc/<pid>/stat` with fewer than four fields after the comm). Neither condition can be
    produced from a test without editing the code. Both throw rather than default.
- **F7.** Exit 66 on an enrolled gate names the unit and says `chmod -R go+rX -- <unit>`, because
  a rerun may be admitted to the other tree (case 46).
- **F8.** A unit off its resting commit names `git -C <unit> checkout --detach <resting>` in its
  blocked reason, in `docs/resources.md` and in the inventory.
- **F9.** The known gap (a non-dumpable consumer released by birth or placement that opens the
  locator's files later) is written beside J19 and in `docs/resources.md`.
- **F10.** Applied, then dropped by review G1 (below). The payload judges enrollment under the
  lock again.
- **F11.** `the shim's exact argv gets past the real Dash parser` runs the real
  `bin/heavy-lock-lib.sh` and `entrypoint.ts`, and expects the post-parse refusal `is not inside
a Git checkout with a job catalogue`.

#### Assumptions (review fixes)

- **S6-A13 Login-session shape.** Only the exact four-component path is a login session. A
  sub-cgroup beneath a session scope, or any `session-*.scope` under `user@<uid>.service`, is not.
- **S6-A14 Enrollment while a gate is queued (revised by review G1).** Enrolling a host while a gate
  is queued is operator error. The enrollment procedure in 6.4 drains the queue first (J12's stop
  intake and drain). A configuration that appears while a gate is queued makes the gate's payload
  refuse 64; that refusal is tested and kept. F10's `HEAVY_JOB_ENROLLMENT` is dropped: nothing
  exports it and nothing reads it. An inherited value is ignored both ways, by tests and by a
  grep (heavy-lock case 48).
- **S6-A15 `concurrencyEligible`.** The field is a list of type ids, default `[]`, validated
  against the admitting checkout's catalogue. An unlisted type is admitted in concurrent mode
  only into an otherwise empty pool. Slice 6b implements it.
- **S6-A16 Solver smoke bound.** The bound is unmeasured, so it is applied only inside a Dash
  job, where the catalogue's `containers` declaration governs. CI and unenrolled gates keep the
  old argv.
- **S6-A17 `runtime.test.ts` runs with `--cgroup`.** Every process in its namespace reads `0::/`,
  so the suite behaves the same in a login session (this workstation) and on a CI runner.
  Without it, its protected process sat in `session-3.scope` and was released over.
  The login-session cases in `resource-holds.test.ts` and `host-job-holds.test.ts` run only where
  the suite itself runs in a logind login session (this workstation, an ssh gate). **On CI they
  skip** with that reason in the test name, because runners have no login session. What still
  runs everywhere is a pure test of `isForeignLoginSession`'s shape. No fake `/proc` seam was
  added: the real-process cases depend on real cgroup membership (review G3).
- **S6-A18 `HEAVY_LOCK_TEST_SUITES=jobs`.** This test-only knob in `bin/heavy-lock.test.sh` runs
  cases 40 to 47 alone, for fault runs. CI and the default run everything.
- **S6-A19 Remedies.** The enrolled exit-66 remedy is `chmod -R go+rX -- <unit>`. The
  resting-commit remedy is `checkout --detach <resting>`, which settlement accepts because it
  compares the commit, not the branch.

#### Fault injection (review fixes)

Each fault was applied by script, watched red, and restored with SHA-256 equal before and after.

| Fault                                               | Went red                                                                                | Observed                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| login-session test removed (`outsideScope`)         | resource-holds: init and cleanup login-session cases; host-job-holds login-session case | `blocked` / refused                                  |
| login-session test also matches user-manager scopes | the three "in the user manager" / "outside its scope, still holds" cases                | released                                             |
| resting-commit remedy dropped                       | host-jobs `a dirty tree is not returned`                                                | no `git -C … checkout`                               |
| `HEAVY_JOB_ENROLLMENT` export removed               | launchers `a configuration that appears while a gate is queued …`                       | payload refused `DASH_JOB_UNIT_GATE_TREE is not set` |
| shim flag renamed `--wait`                          | launchers: shim argv, two gates, gate beside release, failing gate                      | `Unexpected option or subcommand: --wait`, 64        |
| `--cgroup` removed from runtime.test.ts             | `existing account runs work despite an unreadable process …`                            | released                                             |
| entrypoint check removed                            | heavy-lock 46a                                                                          | `want exit 70, got 0`                                |
| `bun` check removed                                 | heavy-lock 46b                                                                          | `got 127` (`env: ‘bun’: No such file`)               |
| `jq` check removed                                  | heavy-lock 46c                                                                          | refused as `names no root`                           |
| `--` made optional                                  | heavy-lock 46d                                                                          | `want exit 64, got 0`                                |
| solver launcher usage removed                       | heavy-lock 47a                                                                          | `got 1` (unset `$1`)                                 |
| solver payload 40-hex test removed                  | heavy-lock 47b                                                                          | `got 0`                                              |
| solver payload absolute-path test removed           | heavy-lock 47e                                                                          | `got 1`, `Module not found`                          |
| test-queued launcher refusal removed                | heavy-lock 47c                                                                          | `got 70` (went to the lock)                          |
| test-queued payload refusal removed                 | heavy-lock 47d                                                                          | `got 0`                                              |
| fetch removed from `resolve_gate_commit`            | gate 44g                                                                                | `got ''`                                             |
| `resolve_gate_commit` refusal → print the sha       | gate 44h                                                                                | `want exit 64, got 0`                                |
| "neither" enrollment refusal removed                | gate 44i                                                                                | `want exit 64, got 0`                                |
| launcher non-commit refusal removed                 | gate 47                                                                                 | `want exit 64, got 70`                               |
| enrolled exit-66 remedy removed                     | gate 46                                                                                 | told to rerun with `H2PUNI_GATE_REPAIR_MODES=1`      |
| solver bound applied unconditionally                | `leaves its containers unbounded outside a Dash job`                                    | bound present outside a job                          |
| registry run without the bound                      | `runs every container it starts bounded and labelled inside a Dash job`                 | no bound                                             |
| label dropped                                       | same                                                                                    | no `puni.job=`                                       |

#### Commands (review fixes, fresh)

| Command                                                                                                                                  | Result                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `bash bin/heavy-lock.test.sh`                                                                                                            | `all heavy-lock checks passed` (1–28, 40–47) |
| `bash bin/h2puni-gate.test.sh`                                                                                                           | `all cases passed` (44a–i, 45a–d, 46, 47)    |
| shellcheck on every edited or new script                                                                                                 | exit 0                                       |
| `bun test src/ops src/cli.test.ts src/no-ambient-clock.test.ts` plus host-jobs, host-jobs.model, host-job-holds, resource-holds, runtime | exit 0, no `(fail)`                          |
| `solver-image-smoke.test.ts`, tool-devsync `poller` + `solver-binding-runtime`, tool-dagger `heavy-lock`, Burokrat `whole tree`          | 40, 39, 9, 1 pass                            |
| `twilight-dash:typecheck`, `:lint`                                                                                                       | succeeded                                    |
| prettier on touched files                                                                                                                | clean                                        |
| `openspec validate dash-host-jobs`                                                                                                       | 1 passed, 0 failed                           |
| `check-indexes working . HEAD`                                                                                                           | exit 0                                       |
| `bunx nx run twilight-dash:test --skip-nx-cache` at `1173437ce` (after the re-merge)                                                     | 4230 pass, 0 fail across 136 files, 29m 8s   |

### Second review pass (Fable on `1173437ce`, DO NOT MERGE AS IS)

- **G1 (S1).** F10's exported `HEAVY_JOB_ENROLLMENT` reached every descendant of the gate. That
  included `launchers.test.ts`, which failed under it. It also let an inherited `unenrolled`
  defeat J15's enrolled-payload refusal.
  - Fix: the variable is removed from the launcher and the payload. The payload judges
    enrollment under the lock (S6-A14, revised).
  - Tests: `the enrolled payload ignores an inherited verdict` (payload given `unenrolled`
    still refuses 64); the unenrolled launcher with `enrolled` set still takes the legacy path;
    heavy-lock case 48 greps that no script reads or exports the variable.
  - `HEAVY_JOB_ENROLLMENT=unenrolled bun test src/ops/launchers.test.ts` now passes (1 pass).
- **G2 (S2).** A login session is exempt only when it is not the owning Dash process's own
  (`ownCgroup`; null for host jobs). The design.md J19 amendment is rewritten.
  - New: `pool init refuses beside a non-dumpable process of its own login session started
after it`; `a setsid descendant in Dash's own login session still holds`.
  - The foreign-session case is `pool init succeeds beside a non-dumpable process of another
login session`, with the initializer run under `systemd-run --user --scope`.
- **G3 (S3).** The CI skip is stated in S6-A17; `isForeignLoginSession` has a pure test that runs
  everywhere.
- **G4 (S3).** The PR body's solver-smoke bullet now says "only inside a Dash job".
- **G5 (S3).** All four smoke `docker run` argv are pinned outside a Dash job. They were compared
  against the `c01dae8d5` script under the same harness and are identical after normalising
  ids.

| Fault (each restored, SHA-256 equal)                      | Went red                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `export HEAVY_JOB_ENROLLMENT` put back in `run_heavy_job` | heavy-lock 48                                                                                                            |
| payload reads an inherited `HEAVY_JOB_ENROLLMENT`         | launchers: `an unenrolled host runs the gate …` (forged `enrolled`); `the enrolled payload ignores an inherited verdict` |
| owner comparison dropped from `isForeignLoginSession`     | predicate test; `pool init refuses … its own login session …`; `a setsid descendant … still holds`                       |
| foreign-session exemption removed                         | `pool init succeeds beside … another login session`; host-job-holds login-session case                                   |
| smoke bound applied unconditionally                       | `leaves its containers unbounded outside a Dash job` (pinned argv)                                                       |

### h2puni gate (unenrolled host, `af8cdd00342918a2fc64b834d17ff03ad4d42f49`)

The gate ran in the isolated worktree `~/puni-00-gate-467-9b552fa8`, which was clean at that SHA,
with 7.8 GB free on `/` before it started. Nothing on the host was deleted.

- **First attempt.** It printed `heavy lock: waited 0s behind 0 tickets` and `h2puni gate: running
on af8cdd00342918a2fc64b834d17ff03ad4d42f49`. My SSH session then dropped after about an hour
  (`Timeout, server … not responding`, exit 255). The orphaned gate's output went to a dead pipe,
  so it has no readable verdict; it ran to its end and the lock is free.
- **Rerun.** I started it under `setsid nohup` with its log at
  `/var/tmp/gate-6a-af8cdd00-rerun2.log`, where it exited `GATE-EXIT 1`.
  - It printed `heavy lock: waited 1337s behind 0 tickets` (queued behind the orphan) and then
    `h2puni gate: running on af8cdd00342918a2fc64b834d17ff03ad4d42f49`.
  - The only failed task was `wbs-be-01:test`, and the only failing test in the 11,034-line log
    was `✗ reads a space of 30 projects and their roll-ups within the budget [1721.91ms]`
    (`apps/wbs/be-01/src/controller/space-roll-up-performance.db.test.ts`). Nx marked the task
    flaky.
  - This budget test is a recorded flake: it failed the same way on an h2puni gate for a Dash-only
    PR on 2026-11-01. It is unrelated to this diff.
- **Single-file rerun.** I ran it in the same worktree with no gate running (`heavy lock: holder
none`): `env -u CLAUDECODE bunx nx run wbs-be-01:test --skip-nx-cache --
src/controller/space-roll-up-performance.db.test.ts`. Result: `✓ reads a space of 30 projects
and their roll-ups within the budget [886.18ms]`, 1 pass, 0 fail, exit 0, tree still clean.
- **Not reached on h2puni.** The steps run under `set -e`, so the gate stopped after the first
  `nx run-many`. The Burokrat and Dash split, the two source lints, and
  `wbs-be-01:solver-image-smoke` (with this PR's unchanged argv outside a Dash job) did not run.
  `twilight-dash:test` passed on the workstation at `1173437ce`. Nothing ran the solver smoke
  against this SHA.

## Slice 6b — observe mode, switch-mode, singleton guard (tasks 6.1 observe half, 6.5a)

Branch `feat/dash-host-jobs-6b-transition` from slice 4's `efd168e40`. It implements J12 and
J13 on Dash's side, in five parts:

- **Observe mode.** Every host job also runs under the shell lock's complete queue protocol,
  with one wait budget.
- **`ops pool switch-mode`.** It stops intake, drains, verifies the launchers and flips the
  mode with the operator's record. It also rolls back and releases the guard.
- **The guard.** In concurrent mode, the `resources watch` singleton holds the canonical flock
  as `dash-singleton`.
- **Concurrency eligibility.** The per-type `concurrencyEligible` admission rule, added from
  PR #816's review.
- **Status.** Mode, guard and the shell lock appear in `ops job status` and `ops pool inspect`.

The slice also carries the five S3 follow-ups of PR #814's second review. Nothing touched a
host, and `bin/` is unchanged (`git diff --quiet efd168e40 HEAD -- bin/` exits 0). Code:

- `src/resources/legacy-lock.ts`: the shell holder and the status reader.
- `src/resources/singleton-guard.ts`: the guard.
- `src/ops/switch-mode.ts`: `switch-mode`.
- `runtime.ts`: ledger version 2, the fence, the guard checks, eligibility and withdrawal.
- `job-run.ts`: the observe-mode queue.
- `commands.ts`, `status.ts`, `cli-parser.ts`, `resources/command.ts`: wiring.

Tests: `src/resources/legacy-lock.test.ts` (8) and `src/ops/host-pool-mode.test.ts` (23).

S3 follow-ups of PR #814:

- **(a)** `propose`'s null-measure branch marks the record partial. Test: `a record not
measured in one dimension is not cited`.
- **(b)** `hostJobOf` throws on a calibration row without `reserved` (S4-A17 amended). Test:
  `a calibration row without its reservation is refused`.
- **(c)** `drained()`'s unbreakable "no starting or held job" conjunct is deleted. A starting
  or held job always reserves a workspace slot, so reserved-is-zero is the check.
- **(d)** S4-A19, recorded above and in `docs/resources.md`.
- **(e)** The model test's plain whole-pool type is renamed `whole-pool-run`, and its counter
  `wholePoolRun`.

### Assumptions (open decisions taken per design.md; overrulable by id)

- **S6B-A1 The shell lock's own protocol.** Dash never reimplements the flock queue. In observe
  mode `ops job run` starts `bin/heavy-lock-lib.sh`'s own `with_heavy_lock` on the canonical
  path as a detached shell holder, after pool admission and before the job is prepared.
  Ticket, deadline, holder record, label and dead-ticket reclaim are the library's. The
  library is the one in the checkout Dash runs from (`src/resources` sits six levels below the
  workspace root). The path is whatever its `resolve_heavy_lock_path` answers. Neither has a
  flag or variable.
- **S6B-A2 Who holds the flock** (corrected by review H2 of #818). The shell holder holds it:
  bash in its own session, with working directory `/`, holding it on its fd 9 while the hold
  file `<root>/.dash/legacy-holds/<job id>` exists. The hold file names the holder's pid.
  `status` therefore names the holder's pid, not the payload's: the label
  `dash-job-<job id> <lane label>` ties the two, and `ops job status` names the payload pid.
  - **Its output.** Both of the holder's streams go to `<hold file>.log`, never to a pipe Dash
    reads. The first cut piped them to Dash; a holder orphaned while still queued then died at
    its claim with EPIPE (the library's `printf … >&2` under `set -e`, before its release trap
    was armed), leaving a dead holder record (reproduced; G1).
  - **Dash dies while the holder queues:** the holder claims in its turn and holds. The job
    never launched, so it is released after the launch grace, and `watch` or `resources sweep`
    then removes the hold file. Tested.
  - **Dash dies mid-hold:** the holder keeps the flock until `watch` or `sweep` removes the
    file once the job's compute entry is released. Tested.
  - **The holder is killed outright:** the kernel releases the flock, and the next claimant
    reclaims the holder record from the dead pid. Tested.
- **S6B-A3 One wait budget.** The shell lock gets `ceil(arrival + wait − now)` seconds, so a
  sub-second admission does not cost a caller its last second. The total may therefore exceed
  `--wait-seconds` by under one second.
- **S6B-A4 Intake stop.** Superseded by S6B-A16: the first cut refused every poll, queued
  waiters included.
- **S6B-A5 Waiting for the guard.** In concurrent mode under the guard, a ticket waits for the
  guard until 15 s past its own deadline (`GUARD_WAIT_MS`), then is refused 75 naming it. The
  grace is what keeps a wait-zero caller working: `watch` takes the guard on its next tick.
- **S6B-A6 Fence and singleton guard.** Concurrent `switch-mode`s are fenced by a ledger row
  (`host_pool.switching`, the switcher's pid, boot and start identity) written under
  `BEGIN IMMEDIATE`, not by a lock file. The guard's own singleton is the flock: a second
  `watch`'s attempt queues behind the first's holder.
- **S6B-A7 Guard release.** `switch-mode concurrent --release-guard` re-verifies the launchers
  and writes a `release-guard` mode record. Every flip sets the guard on, so a rollback leaves
  the next flip guarded.
- **S6B-A8 The 6.7 unit.** The guard's holder outlives `watch` by design, but a systemd unit
  with the default `KillMode=control-group` kills it with `watch`. Task 6.7's unit needs
  `KillMode=process`. Open, recorded in `docs/resources.md`.
- **S6B-A9 What releases the shell lock.** It is released once the job's compute entry is
  released, so the payload's processes are gone. Tmp and tree entries may still be
  outstanding, as with a legacy run, whose lock ends with its command.
- **S6B-A10 Launcher checkouts.** The checkouts are named in an optional configuration field,
  `launcherCheckouts`, which the binding does not pin. `switch-mode` requires at least one
  (64). For each it checks three things: the path is the top of a work tree; `run_heavy_job()`
  is defined in `bin/heavy-lock-lib.sh` at HEAD; and the working file equals HEAD. A failure
  is 70.
- **S6B-A11 Concurrency eligibility (PR #816 review).** `concurrencyEligible` is optional,
  absent meaning none; ids are job-type-shaped and each named once. Config load checks the
  shape only, since it has no catalogue. `ops pool init` and `switch-mode concurrent` refuse
  64 an id that no `launcherCheckouts` catalogue names at HEAD. `switch-mode concurrent`
  refuses an empty list 64 unless `--allow-empty`. In observe mode the rule is moot, since the
  shell lock serialises everything.
- **S6B-A12 Drain proof.** `switch-mode concurrent` drains the shell lock by holding it, as
  legacy holder `dash-switch-mode`. It refuses 75 while any waiter queues behind it, since
  that waiter is a launcher still on the legacy path. Rollback drains the pool alone.
- **S6B-A13 Ledger version 2.** Version 2 adds `host_pool.guard`, `guard_holder`, `switching`
  and the table `host_pool_mode_records`. Versions 0 and 1 step forward in one transaction,
  each only when its tables are exactly that version's.
- **S6B-A14 Tests and the canonical path.** No test touches `/home/puni1/.cache`. Every test
  uses the real library on a private path, except one. `the installed entrypoint runs a job`
  goes through production composition, so its pool runs concurrent and unguarded.
- **S6B-A15 Slice 6a interplay.** Two changes are needed when 6a and 6b meet. Both are written
  as a follow-up below, because 6a's files are not edited here:
  - 6a's `launchers.test.ts` builds `JobRunDependencies` itself and now needs `legacyLock`;
  - its two-gates-at-once case runs in observe mode, which 6b serialises.

### Fault injection

Method: `fault.py` replaces one exact text in the named file, runs the named test file with
`CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset (inside the suite's own namespace, filtered to
the test), then writes the original bytes back and compares SHA-256. Every fault was watched
red and every file was restored byte for byte. The SHA-256 values below are those of the
committed files.

| File (SHA-256 before and after)                        | Fault injected                                                       | Test that went red                                                                     | Observed                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| `src/ops/propose.ts` `118c5f2d…752227a`                | Fa: `take()`'s null branch does not mark the record partial          | `a record not measured in one dimension is not cited` (propose.test.ts)                | `calibration-4` in `recordIds`              |
| `src/resources/runtime.ts` `edc1b820…ba798eee`         | Fb: a calibration row without `reserved` derives `wholePool()` again | `a calibration row without its reservation is refused` (calibrate.test.ts)             | did not throw                               |
| runtime.ts                                             | F1: intake fence dropped from admission                              | `stops intake, queued waiters included, …` (host-pool-mode.test.ts)                    | `expected a refusal`: the job ran           |
| runtime.ts                                             | F2: guard check dropped from admission                               | `without the guard a job waits, then is refused 75 naming it`                          | admitted, not `waiting`                     |
| runtime.ts                                             | F2b: the same, end to end                                            | `two eligible Dash jobs overlap while the guard holds; …`                              | holder line not `dash-singleton`            |
| runtime.ts                                             | F3: guard trusts the recorded identity alone                         | `a guard whose holder record names another pid is not held`                            | admitted                                    |
| runtime.ts                                             | F4: guard record cleared under demand                                | `the guard record is not cleared while a ticket is queued or compute is held`          | `true`, expected `false`                    |
| runtime.ts                                             | F5: a second switch takes the fence over                             | `stops intake, … and refuses a second switch while the first drains`                   | second switch not refused 75                |
| runtime.ts                                             | F6: flip without the in-transaction drain check                      | `switch-mode concurrent refuses while a host job is admitted, and reopens intake`      | exit 0, expected 75                         |
| `src/ops/job-run.ts` `3f4031be…3d64b6e4`               | F7: a shell-lock refusal does not withdraw the job                   | `a legacy deadline withdraws the Dash job: 75, nothing reserved, no ticket left`       | job `starting`, expected `released`         |
| runtime.ts                                             | F8: withdrawal accepts a prepared job                                | `a withdrawal of a prepared job is refused`                                            | did not throw                               |
| runtime.ts                                             | F9: concurrency-eligibility rule dropped                             | `an ineligible type beside an eligible one is serialised`                              | the runs overlapped                         |
| `src/ops/switch-mode.ts` `24ed6f40…5da1945b`           | F10: switch ignores waiters queued behind it                         | `refuses while a legacy waiter queues behind it, and reopens intake`                   | exit 0, expected 75                         |
| switch-mode.ts                                         | F11: `run_heavy_job` check dropped                                   | `refuses a launcher checkout without the shim, or whose working library differs …`     | exit 0, expected 70                         |
| switch-mode.ts                                         | F12: working-file-equals-HEAD check dropped                          | the same                                                                               | exit 0, expected 70                         |
| switch-mode.ts                                         | F13: empty eligibility accepted                                      | `refuses an empty eligibility list unless --allow-empty, and an eligible id …`         | exit 0, expected 64                         |
| switch-mode.ts                                         | F14: eligible ids not checked against the catalogues                 | the same                                                                               | exit 0, expected 64                         |
| `src/ops/commands.ts` `ae72e4fa…5652d667`              | F15: `ops pool init` skips the eligibility check                     | `ops pool init refuses an eligible type no catalogue names, creating nothing`          | exit 0, expected 64                         |
| `src/resources/command.ts` `e1e8f996…c61c925`          | F16: `watch` does not tick the guard                                 | `resources watch holds the guard for a queued job and lets go when the pool empties`   | failed after 32.0 s; no assertion line kept |
| `src/resources/singleton-guard.ts` `02378860…b965100c` | F17: guard never records its holder                                  | `two eligible Dash jobs overlap while the guard holds; …`                              | `timed out waiting for both payloads`       |
| singleton-guard.ts                                     | F18: a dead switch-mode's hold is kept                               | `watch ends an orphaned observe-mode hold once the job settles, and a dead …`          | holder never exited (60 s timeout)          |
| singleton-guard.ts                                     | F19: a settled job's hold is kept                                    | the same                                                                               | holder never exited (60 s timeout)          |
| job-run.ts                                             | F20: observe mode skips the shell lock                               | `a Dash job never overlaps a legacy holder, and two Dash jobs serialise`               | the runs overlapped                         |
| job-run.ts                                             | F21: the shell lock released with compute outstanding                | `a surviving child keeps the shell lock until its compute settles, then watch lets go` | holder gone while the child lived           |
| runtime.ts                                             | F22: version-1 table check dropped                                   | `refuses a version-1 ledger with unexpected tables` (host-jobs.test.ts)                | migrated it                                 |
| runtime.ts                                             | F23: launcher checkout named-twice check dropped                     | `the pool shape refuses each malformed statement` (host-jobs.test.ts)                  | loaded                                      |
| runtime.ts                                             | F24: eligible id named-twice check dropped                           | the same                                                                               | loaded                                      |

Two first-cut negatives stayed green and were replaced; the table shows the final ones:

- **F4.** The overlap test never reaches `clearGuardHolder`'s own demand re-check, because
  the guard asks only after it has seen no demand.
- **F6.** The rollback test never reaches `completeModeSwitch`'s drain check, because
  rollback drains first.

Each now has a direct test of the production method.

Not provable alone, so stated rather than tested:

- **The shell holder's `trap '' PIPE`.** It matters only once Dash's stderr reader is gone and
  the library then writes a failure line. No test provokes a library failure after the claim.
- **`readLegacyQueue`'s refusal of a line it cannot parse.** The library prints only the
  shapes parsed. Its refusal of an unreadable holder (exit 70) is tested.

### Commands (fresh, 2026-11-02, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset for tests)

| Command                                                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/ops src/resources/{legacy-lock,host-jobs,host-jobs.model,host-job-holds,host-job-publication}.test.ts src/cli.test.ts src/no-ambient-clock.test.ts` (in `apps/twilight-structure/twilight-dash/cli`, the target's preload) | exit 0; 103 pass, 0 fail across 15 files (outer); the namespaced files' inner runs all pass, `host-pool-mode.test.ts` 23 of 23                                                                                                                                                                                                                                                    |
| `bash bin/heavy-lock.test.sh` (unchanged)                                                                                                                                                                                                | exit 0, `all heavy-lock checks passed`                                                                                                                                                                                                                                                                                                                                            |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`                                                                                                                                                                                    | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                                                                                                                                                                         | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx nx run twilight-dash:build --skip-nx-cache`                                                                                                                                                                                        | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx openspec validate dash-host-jobs --json`                                                                                                                                                                                           | `passed: 1, failed: 0`                                                                                                                                                                                                                                                                                                                                                            |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                              | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx nx run twilight-dash:test --skip-nx-cache`                                                                                                                                                                                         | exit 0; 4229 pass, 0 fail, 136 files, 1793.71 s (on `263bdab9e`). The first run, on `f9ca0768c`, found two failures, both fixed and not flakes: `report-capacity.host-pool.test.ts` (slice 5's read-only ledger port pinned version 1; it now reads version 2) and `a gate is measured` over the real scope (the claim line said `waited 1s`; it is now matched as `waited <n>s`) |

### Skipped or unverified

- **No host was touched.** Nothing was enrolled, `switch-mode` never ran against
  `/home/puni1`, and the canonical lock was never taken. The production composition
  (`productionLegacyLock`) is tested only for its answer: the library beside this checkout and
  `/home/puni1/.cache/wbs-heavy-work.lock`.
- **The 6.7 systemd unit's `KillMode`** (S6B-A8) is not written; that is task 6.7.
- **Watch wiring.** The guard's wiring into `resources watch` is proven by one test that runs
  `runResources watch` as a process, with an unreachable fake WBS. No real WBS was involved.
- **Slice 6a.** `launchers.test.ts` was not run against this branch, because 6a is not merged
  here. The follow-up below is what a merge needs.
- **The real-scope `the installed entrypoint runs a job` test** now runs in concurrent,
  unguarded mode (S6B-A14). The observe path through the production entrypoint is not
  exercised.

### Slice 6a's launcher suite on the combined tree (`launchers.test.ts`)

6a's `src/ops/launchers.test.ts` was written against a pool that admitted host jobs side by
side. Since 6b, a fresh pool is in observe mode and serialises every host job through the shell
lock. Merged at `994512439`, three cases therefore timed out (exit 143): "two gates run at once",
"a gate runs beside a release build" and "a failing enrolled gate's status". The merge applies
this change to that file:

1. The fixture Dash passes `legacyLock: productionLegacyLock()`. Inside the suite's namespace
   `/home/puni1/.cache` is tmpfs, so the canonical lock is a fixture.
2. The fixture catalogue's entrypoints are the real launchers: `bin/h2puni-gate.sh` for `gate`
   and `bin/publish-release.sh` for `release-build`. `switch-mode` verifies that each calls
   `run_heavy_job` (S6B-A20). The fixture default `bin/payload.sh` does not exist in this
   checkout, so with it the switch refuses 70.
3. `writeConfig` adds `launcherCheckouts: [checkout]` and
   `concurrencyEligible: ['gate', 'release-build']`.
4. Right after `ops pool init`, the init case runs `ops pool switch-mode concurrent --operator
launchers-test` through the entrypoint, then the same with `--release-guard`, since the
   suite runs no `watch`. Its timeout is now 120 s.

The fixture checkout already satisfies the remaining launcher checks: a committed, clean `bin/`
whose library defines `run_heavy_job`. With the change, the suite passes 10 of 10 on the
combined tree (commands below).

### Review fixes (Fable, PR #818 at `0073937d1`, MERGE AFTER FIXES)

Per finding, on `feat/dash-host-jobs-6b-transition`. The plan is not merged in yet: #816 lands
first, and the coordinator signals the re-merge.

- **H1 (no `watch` on any host yet).**
  - Task 6.7 now comes before 6.4, with `KillMode=process` and `Restart=on-failure` as hard
    requirements; 6.4 and `docs/resources.md` say observe mode needs the unit running before
    enrollment.
  - `resources sweep` now also calls `SingletonGuard.releaseSettledHolds`, the operator's
    one-shot release.
  - `ops job status` follows a Dash holder line with a `note:` naming its hold file and who
    removes it.
  - Tests: `resources sweep releases the orphan hold of a settled job`, and the status note in
    the observe test.
- **H2.** The holder writes its output to `<hold>.log` (S6B-A2 corrected). Test: `Dash killed
while its holder queues: the holder claims, holds and releases cleanly`.
- **H3 (killed or interrupted switch).**
  - `switchPoolMode` handles SIGINT, SIGTERM and SIGHUP at every step: it withdraws the ticket
    or releases the hold, reopens intake, and exits 130, 143 or 129.
  - A leftover `dash-switch-mode` hold file refuses the next switch 75, naming the file and
    whether its pid is alive. Hold files now carry the holder's pid.
  - Tests: `a switch-mode interrupted while it queues …`, `a switch-mode hold left behind …`,
    and `a fence naming a dead switcher is void: intake proceeds` (admission level).
- **H4 (S6B-A16).** Only `enqueueHostJob` is fenced. Queued tickets keep their place, and the
  switch waits for the pool to drain before it takes the shell lock. The refinement is in
  design.md J12. Test: `switch-mode stops intake; queued waiters keep their place, and a second
switch is refused`.
- **H5 (guard lost).**
  - `tick()` calls `recordGuardLost` for every job with unreleased compute when the recorded
    holder is dead (S6B-A18).
  - `ops job status` shows the mark; the run record carries `guardLost` and
    `attributionIncomplete`; `ops job audit` names it.
  - `prepareHostJob` re-checks the guard and refuses 75, and `ops job run` then withdraws the
    job.
  - Tests: `a guard holder lost mid-run marks the running jobs, and audit names it`, and `a
guard lost between admission and launch refuses 75`.
- **H6 (S6B-A17).** `checkEligibleTypes` runs at every `ops` pool open, `ops job run`'s
  included, and refuses 64. Serialisation keys on unreleased compute (tasks.md 6.5a,
  docs). `host-jobs.model.test.ts` gains `concurrent mode overlaps only eligible types under
every interleaving`: 30 runs, concurrent and unguarded, with `gate` and
  `solver-image-publish` eligible. Its counters `overlapped`, `serialised` and
  `startingCounted` were all reached.
- **H7 (negatives).**
  - Launcher verification takes the caller's environment and names, each with its own text: an
    unreadable path, git's "dubious ownership", not the top of a work tree, `bin/` changed
    (untracked included), and a `bin/*.sh` catalogue entrypoint that does not call
    `run_heavy_job`.
  - **Hold corruption** (S6B-A19): `watch` and `sweep` record a stray name, or a job hold for
    an unknown job, as corruption and release nothing. Concurrent admission refuses 75 and
    status prints it.
  - Method-level tests: the fence answering only its own switch; `releaseGuard` under a live
    fence; a withdrawal for another launcher; a second watch adopting the live holder;
    recording outside the guard; an unreadable guard record; an unreadable compute entry.
- **H7, F4 and F6.** Both are method-level. F4's `clearGuardHolder` demand re-check closes a
  race `tick()` never reaches alone. F6's in-transaction drain check is reached only beside
  the drain loop: since H4 the switch drains first, so the test calls `completeModeSwitch`
  directly.
- **H8.** The `switching to … intake stopped` line is tested through `ops job status`. The 70
  refusal when the shell lock cannot answer is documented.
- **H9.** The deploy-order note for `report-capacity` and the version-1 ledger is in
  `docs/resources.md`.

Assumptions added:

- **S6B-A16 Fence on new tickets only.** Queued tickets keep their budget and place. The switch
  drains the pool first, then the shell lock, with one budget.
- **S6B-A17 Eligibility at every `ops` open.** A typo refuses 64 at `pool init` and at every
  later open: `job run`, `calibrate`, `status`, `propose`, `audit`, `pool inspect`,
  `switch-mode`. `resources watch` does not check, since it admits nothing. Whoever merges
  second keeps "64 at init and at every open" over 6a's "70".
- **S6B-A18 "Guard lost" is a mark on the job, not an outbox event.** `guardLost {at,
holderPid}` is saved on each running job and copied into the run record at finish. A run
  whose launcher died before finishing has no outcome, so audit reports it `not judged`.
- **S6B-A19 Hold corruption.** The state lives in the ledger column `host_pool.hold_corruption`
  (ledger version 2, not yet released, so no further step). It is recorded by `watch` and
  `sweep` and cleared by the next clean scan. While it is set, only concurrent admission
  refuses; observe mode is still serialised by the shell lock.
- **S6B-A20 Launcher scripts checked.** Each catalogue entrypoint matching `bin/*.sh` must
  call `run_heavy_job` on a non-comment line at HEAD. A `package.json#scripts…` or `.ts`
  entrypoint is listed in the evidence as not checked.
- **S6B-A21 Untrusted checkout.** Git's "dubious ownership" is refused 70 with its own text;
  Dash never adds a `safe.directory`.

#### Fault injection (review fixes)

The method is the one above (`faults_g.py`). Every fault was watched red except G19, and every
file was restored byte for byte. The SHA-256 values are those of commit `da4b4680a`.
`legacy-lock.ts` changed afterwards only in the comment that G19 corrects (now `f00857fb…`).

| File (SHA-256)                                        | Fault                                             | Test that went red                                                              |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/resources/legacy-lock.ts` `9b611153…87e771`      | G1 holder output back on pipes to Dash            | `Dash killed while its holder queues …` (legacy-lock.test.ts)                   |
| `src/resources/command.ts` `b2fe3e4c…615d4e0`         | G2 `resources sweep` releases no hold             | `resources sweep releases the orphan hold of a settled job`                     |
| `src/ops/status.ts` `8ad45c96…99eb1bf`                | G3 status drops the Dash hold note                | `a legacy caller arriving during a Dash job …; status names the job first`      |
| `src/ops/switch-mode.ts` `d76d5d75…b22ccc4`           | G4 leftover switch hold not checked               | `a switch-mode hold left behind refuses the next switch 75, naming it`          |
| switch-mode.ts                                        | G5 a cancelled switch not refused as interrupted  | `a switch-mode interrupted while it queues …`                                   |
| `src/resources/runtime.ts` `10497141…aac81c604`       | G6 any fence row treated as live                  | `a fence naming a dead switcher is void: intake proceeds`                       |
| runtime.ts                                            | G7 enqueue not fenced                             | `switch-mode stops intake; queued waiters keep their place …`                   |
| `src/resources/singleton-guard.ts` `14cbb347…7342f59` | G8 lost guard marks no job                        | `a guard holder lost mid-run marks the running jobs, and audit names it`        |
| `src/ops/job-run.ts` `194abb4d…c9c85a57`              | G9 lost guard not `attribution_incomplete`        | the same                                                                        |
| runtime.ts                                            | G10 no guard re-check before launch               | `a guard lost between admission and launch refuses 75`                          |
| switch-mode.ts                                        | G11 eligibility checked at init only              | `a typo added to concurrencyEligible after init refuses ops job run 64`         |
| runtime.ts                                            | G12 eligibility rule dropped                      | `concurrent mode overlaps only eligible types under every interleaving` (model) |
| switch-mode.ts                                        | G13 dubious ownership not named                   | `refuses a launcher checkout git distrusts, saying so`                          |
| switch-mode.ts                                        | G14 unreadable checkout not named                 | `refuses a launcher checkout that is missing or not a work tree`                |
| switch-mode.ts                                        | G15 not-top-of-tree check dropped                 | the same                                                                        |
| switch-mode.ts                                        | G16 `bin/` cleanliness check dropped              | `refuses a launcher checkout whose bin/ holds an untracked launcher, or …`      |
| switch-mode.ts                                        | G17 launcher script check dropped                 | the same                                                                        |
| legacy-lock.ts                                        | G18 a silent exit 0 counted as a refusal of 0     | `a holder that ends 0 without holding is refused 70`                            |
| legacy-lock.ts                                        | G19 no-pid early exit skipped                     | none: stayed green (see below)                                                  |
| job-run.ts                                            | G20 an unreadable compute entry releases the lock | `an unreadable compute entry keeps the shell lock`                              |
| runtime.ts                                            | G21 an unreadable guard record read as absent     | `an unreadable guard record refuses admission rather than guess`                |
| runtime.ts                                            | G22 a second live holder is recorded              | `a second watch adopts the live guard holder rather than queue another`         |
| runtime.ts                                            | G23 holder recorded outside the guard             | `recording a guard holder outside concurrent mode is refused`                   |
| runtime.ts                                            | G24 flip accepts another switcher's fence         | `the fence answers only its own switch`                                         |
| runtime.ts                                            | G25 abandon clears any fence                      | the same                                                                        |
| runtime.ts                                            | G26 `releaseGuard` ignores a live fence           | `releaseGuard refuses 75 under a live fence`                                    |
| runtime.ts                                            | G27 withdrawal for another launcher accepted      | `a withdrawal for another launcher is refused`                                  |
| singleton-guard.ts                                    | G28 corruption never recorded                     | `a stray file in the legacy hold directory stops concurrent admission`          |
| runtime.ts                                            | G29 admission ignores corruption                  | the same                                                                        |
| status.ts                                             | G30 status omits corruption                       | the same                                                                        |
| status.ts                                             | G31 status omits the switching line               | `switch-mode stops intake; queued waiters keep their place …`                   |

**G19** is not a check of its own. A holder that never started has no pid; without the early
exit, the general path answers the same 70 once `exited` rejects. Its comment now says so
rather than claim a proof.

#### Commands (fresh, after the fixes)

All with `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset.

- **Targeted tests**, on `da4b4680a`: exit 0, 107 pass, 0 fail across 16 files (outer), with
  every namespaced inner run passing. The set was `src/ops`,
  `src/resources/{legacy-lock,host-jobs,host-jobs.model,host-job-holds,host-job-publication}.test.ts`,
  `src/compute/report-capacity.host-pool.test.ts`, `src/cli.test.ts` and
  `src/no-ambient-clock.test.ts`. Inner counts: `host-pool-mode.test.ts` 41 of 41,
  `job-run.test.ts` 44, `host-jobs.test.ts` 19. `host-jobs.model.test.ts` 3 of 3, run on its
  own with the same code.
- **`src/resources/legacy-lock.test.ts` after G19's comment edit:** 11 pass, 0 fail.
- **`bash bin/heavy-lock.test.sh`** (bin/ unchanged): exit 0, `all heavy-lock checks passed`.
- **`twilight-dash:typecheck` and `:lint`** (`--skip-nx-cache`): exit 0 each.
- **`bunx prettier --check`** on every touched file: clean.
- **`bunx openspec validate dash-host-jobs --json`:** `failed: 0`.
- **Not run in this pass, as the coordinator asked:** the full `twilight-dash:test` target
  waits for the re-merge with #816. `:build` was not rerun either; no build input outside
  `src/` changed.

### Second review pass (Fable, PR #818 at `b9451408b`, DO NOT MERGE AS IS)

Each finding, on `feat/dash-host-jobs-6b-transition`. The plan is still not merged in.

- **K1 (S1, corrects H6).** `verifyEligibleTypes` is strict only for `ops pool init` and
  `switch-mode`. Every other open treats a checkout whose HEAD has no usable catalogue as
  naming nothing, listed as `<checkout> unverified at <rev>`. It refuses 64 only when no
  readable catalogue names the id. The moved-HEAD case is in `docs/resources.md`.
  Test: `a launcher checkout parked at a pre-catalogue commit does not stop ops job run`. It
  uses two launcher checkouts, one detached at a commit without a catalogue:
  - `ops job run` and `status` still run;
  - `switch-mode` stays strict;
  - a typo still refuses 64, naming the unverified checkout.
- **K2 (S2, corrects H2).** `holdLegacyLock` decides "held" from the shell lock's own record:
  `<lock>.d/holder` names the holder's pid. The log is diagnostics only. The wait is bounded by
  `waitSeconds·1000 + 15 s`, counted in 50 ms polls. Past it, the holder's session gets TERM,
  its files are removed, and the result is `{refused, 70, reason}`. A failed hold-file write
  ends the holder the same way. Tests:
  - `a holder whose log cannot be written still holds, by the lock record itself`: a library
    with `exec 1>/dev/full`;
  - `a holder that neither claims nor ends is ended at its bound`.
- **K3 (S2).** `reclaimDeadTickets` runs in `watch`'s tick and in `resources sweep`, in one
  transaction with the poll's own report lines. `undrained()`, and so `modeDrain()` and the
  guard's demand, ignore dead or expired tickets. Test: `a ticket of a dead launcher holds
neither the switch nor the guard`. A ticket is enqueued for a `sleep` that is then killed;
  `switch-mode` completes, `tick` reclaims the ticket naming it, and the guard holds nothing.
- **K4 (S3).** New `guardStillHeld()`. `ops job run` re-checks it at its payload's exit and marks
  the job (`recordGuardLostFor`). An unreadable guard state at exit also counts as lost. Test:
  `a guard lost mid-run with no watch is still recorded`.
- **K5 (S3).** Hold files now record `pid boot start`. `switch-mode` judges a leftover hold
  alive or dead through `processAlive`, the `/proc` identity check, so it never kills or
  signals a process to find out. A file naming only a pid is reported as `unknown`. The test
  now covers a dead holder, a live one, and a recycled pid.
- **K6 (S3).** Every launcher-check `git` runs with `LC_ALL=C`. The dubious-ownership test's fake
  git answers in German unless asked for the C locale.

Assumptions added:

- **S6B-A22 Lenient eligibility outside init and switch-mode.** It applies to `ops job run`,
  `calibrate`, `status`, `propose`, `audit` and `pool inspect`. A checkout counts as
  unverified on any `OpsRefusal` from reading its catalogue at HEAD: missing, malformed, or no
  HEAD. Other errors still throw. The unverified list appears only inside a refusal or in
  `switch-mode`'s evidence; an open that succeeds prints nothing about it.
- **S6B-A23 Held, by the lock's record.** The library writes `<lock>.d/holder` only under the
  flock and removes it before closing the flock, so a record naming the holder's pid means it
  holds. The bound is counted in polls, not clock reads: Dash's no-ambient-clock rule applies
  to `legacy-lock.ts`, and each poll sleeps at least 50 ms, so the real wait is never shorter
  than the bound. Tests may shorten the 15 s grace with `claimGraceMs`.
- **S6B-A24 Dead tickets.** "Dead" is the poll's own rule: the process is gone by pid, boot and
  start identity, or the wait budget ended over `TICKET_RECLAIM_AFTER_MS` ago.
- **S6B-A25 Guard re-check at exit.** The launcher marks only its own job. `watch` marks every
  running job, as before.

Not provable alone, so stated: the hold-file write failure path of K2. Making the second write
to a just-created owner-only file fail needs a full filesystem under the pool root, which
these tests cannot mount. The path is the same `abandon` that `a holder that neither claims
nor ends …` exercises.

#### Fault injection (second pass)

The method is the one above (`faults_k.py`). Every fault was watched red and every file was
restored byte for byte. Hashes are those of commit `ea02d2986`.

| File (SHA-256)                                         | Fault                                  | Test that went red                                                                    |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/ops/switch-mode.ts` `7df1e67f…6ad7a6e9`           | K1 lenient eligibility refuses again   | `a launcher checkout parked at a pre-catalogue commit does not stop ops job run`      |
| `src/resources/legacy-lock.ts` `253997e8…6e6d4900`     | K2a held decided by the log line again | `a holder whose log cannot be written still holds, by the lock record itself`         |
| legacy-lock.ts                                         | K2b no bound                           | `a holder that neither claims nor ends is ended at its bound` (test timeout)          |
| `src/resources/runtime.ts` `616a5044…cf278b9`          | K3a drains count dead tickets          | `a ticket of a dead launcher holds neither the switch nor the guard`                  |
| `src/resources/singleton-guard.ts` `6072ac7c…e16e47af` | K3b tick reclaims no dead ticket       | the same (no removal line)                                                            |
| `src/ops/job-run.ts` `b3f6ba8f…474bf943`               | K4 no guard re-check at exit           | `a guard lost mid-run with no watch is still recorded`                                |
| switch-mode.ts                                         | K5 hold-file liveness by pid alone     | `a switch-mode hold left behind refuses the next switch 75, naming it` (recycled pid) |
| switch-mode.ts                                         | K6 git in the caller's locale          | `refuses a launcher checkout git distrusts, saying so, in any locale`                 |

#### Commands (fresh, second pass)

All with `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset.

- **Targeted tests**, on `ea02d2986`: exit 0, 109 pass, 0 fail across 16 files (outer), with
  every namespaced inner run passing. The set was `src/ops`,
  `src/resources/{legacy-lock,host-jobs,host-jobs.model,host-job-holds,host-job-publication}.test.ts`,
  `src/compute/report-capacity.host-pool.test.ts`, `src/cli.test.ts` and
  `src/no-ambient-clock.test.ts`. `host-pool-mode.test.ts` passed 44 of 44.
- **`legacy-lock.test.ts`** run twice on its own: 13 pass, 0 fail each time.
- **`bash bin/heavy-lock.test.sh`** (bin/ unchanged): exit 0, `all heavy-lock checks passed`.
- **`twilight-dash:typecheck` and `:lint`** (`--skip-nx-cache`): exit 0 each.
- **`bunx prettier --check`** on every touched file: clean.
- **`bunx openspec validate dash-host-jobs --json`:** `failed: 0`.
- **Not run, as asked:** the full `twilight-dash:test` target waits for the re-merge with
  #816.

### Merge with slice 6a (`994512439`)

Merged into `feat/dash-host-jobs-6b-transition` as a merge commit (`8964a3963`), not a rebase,
on the coordinator's go.

- **Conflicts:** only `tasks.md` and `verify.md`, both resolved by hand.
  - In tasks.md, 6.1 keeps 6a's launcher text with its "no host may be enrolled" note struck,
    since observe mode and the guard land here.
  - 6.4 keeps 6a's container-measurement note.
  - 6.5's eligibility wording is 6b's: 64 at init and at every open.
  - 6.6 keeps 6a's J19 completion.
  - 6.7 stays where 6b moved it.
  - verify.md orders Slice 6a, then Slice 6b.
- **Non-conflicting follow-ups:**
  - `docs/infra/heavy-job-launchers.md` no longer says the observe phase is owed.
  - S6-A2 notes it was resolved here.
  - 6a's `launchers.test.ts` gains the fixture change described under "Slice 6a's launcher
    suite on the combined tree".
- **One fix the merged tree surfaced** (`e6c20afff`). Since K2 the holder counts as held once
  the lock's own record names it. The library writes that record just before its `waited …`
  line, so the real-scope `a gate is measured` missed the line in its report. Dash now gives
  the log up to 20 more polls to show its own `held` marker. That changes diagnostics only, not
  any decision, so there is no new check and no fault row.

Commands (fresh, on `e6c20afff`, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset):

- **Targeted tests:** exit 0, 122 pass, 0 fail across 17 files (outer), every namespaced inner
  run passing. The set was `src/ops` (with `launchers.test.ts`: 10 of 10), `src/resources/{legacy-lock,host-jobs,host-jobs.model,host-job-holds,host-job-publication,resource-holds}.test.ts`,
  `src/compute/report-capacity.host-pool.test.ts`, `src/cli.test.ts` and
  `src/no-ambient-clock.test.ts`.
- **`bash bin/heavy-lock.test.sh`** (6a's cases included): exit 0, `all heavy-lock checks
passed`.
- **`twilight-dash:typecheck` and `:lint`** (`--skip-nx-cache`): exit 0 each.
- **`bunx prettier --check`** on every touched `.ts`, `.md`, `.json` and `.yml` file: clean.
- **`bunx openspec validate dash-host-jobs --json`:** `failed: 0`.
- **`bunx nx run twilight-dash:test --skip-nx-cache`:** exit 0, 4247 pass, 0 fail, 138 files,
  1853.92 s.

## Slice 6c (code) — `gate_host` role for the host pool (tasks 6.3, 6.7: code half)

Branch `feat/dash-host-jobs-6c-role` from `feat/dash-host-jobs-6a-launchers` at `af8cdd003`, with
`feat/dash-host-jobs-6b-transition` at `d5b7a0658` merged in (S6C-A1). **Nothing here touched a
host:** no ssh, no Ansible apply, no enrollment. The apply, the h2puni disk cleanup, the two
converging applies with `changed=0`, the restart proof and `ops pool init` all stay open in 6.3,
6.7 and 6.4. Docs are [gate hosts](../../../docs/infra/gate-hosts.md) ("What the role sets up",
"Enroll a host in the host pool"); the test is
`apps/twilight-structure/twilight-dash/cli/src/ops/gate-host-pool.test.ts`.

### Assumptions (overrulable by id)

- **S6C-A1 6b merged in.** The configuration template writes `launcherCheckouts` and
  `concurrencyEligible`, which only 6b's schema accepts (`onUndeclaredKey('reject')`), and the test
  loads the template through Dash's own loader. So 6b is merged into this branch. tasks.md and
  verify.md took both slices' text. Whoever merges #818 into `plan/dash-host-jobs` resolves the same
  two files.
- **S6C-A2 The configuration is the enrollment.** J12 enrolls a host when
  `/home/puni1/.config/dash/host-pool.json` exists. A role apply must not enroll as a side effect,
  and S6-A14 makes enrolling while a gate is queued operator error. So the role writes it only where
  `puni_gate_host_pool_enroll` is true. That boolean is required, with no default. A host with it
  false must have neither the configuration nor a ledger. `validate` refuses either, and never
  deletes one.
- **S6C-A3 No ledger directory.** `ops pool init` creates `<root>/.dash` itself and refuses a
  non-empty root. So "the ledger directory it needs" is the root's parents. The root is 0700 and
  left empty.
- **S6C-A4 Disk threshold.** Each missing checkout needs 5 GiB, and 10 GiB must be left over. The
  5 GiB is the ~4.4 GB that a clone plus its frozen install measured on h2puni. The 10 GiB is the
  `gate` type's 8 GiB tmp envelope plus margin, so a clone never leaves a host unable to gate
  (h2puni's ENOSPC of 2026-10-20). With all three checkouts missing that is 26843545600 bytes. h2puni
  has about 8 GB free, so the role refuses there until the cleanup. The probe exits 75 and prints
  `clones= avail= need= missing=`. The assert's message adds the threshold and points to the
  cleanup entry in puni-plan `RESUME.md`. A host whose checkouts all exist is never refused.
- **S6C-A5 Budget and headroom.** `cpuCores` is `nproc` (`ansible_facts.processor_nproc`).
  `memoryGib` is `memtotal_mb // 1024`, at or under the MemTotal GiB that init checks. Headroom
  defaults to 1 core and 2 GiB, provisional until 6.4's calibration, and a host may override it.
  `diskUnitBytes` is 1 GiB, `headroomBytes` 10 GiB and `workspaceSlots` 4. `diskBudgetUnits`
  comes per host from `$OPS`.
- **S6C-A6 Token unit.** `git init` runs on a `mktemp -d` sibling, which gets one empty commit
  (`dagger_engine token unit (dash-host-jobs S6-A7)`, fixed author `gate_host`, no signing) and is
  then renamed onto `~/.local/share/dash/units/dagger_engine`. That path is outside the managed
  root: a unit under the root, as the brief suggested, is refused (`overlaps the managed root`).
  The commit gives settlement a resting commit, which an unborn tree lacks. A path that already
  exists must be a clean tree with a commit, or the command refuses 70 naming it. It is never
  repaired over.
- **S6C-A7 No `docker_build` unit.** No catalogue type names `docker_build`, and neither does the
  launcher inventory, so it would only be one more token tree. `exclusiveUnits` is `gate_tree` (two)
  and `dagger_engine` (one).
- **S6C-A8 No `mode` field.** The schema-3 configuration has no `mode` and rejects undeclared keys.
  The ledger starts in `observe`, and only `ops pool switch-mode` changes it.
- **S6C-A9 Launcher-only checkout.** `launcherCheckouts` is not the two gate trees.
  [heavy job launchers](../../../docs/infra/heavy-job-launchers.md) and S6-A6 rule them out: an
  enrolled payload refuses its own launcher's checkout, and a process working in a unit holds it.
  So the role clones a third full checkout, `~/puni-00-gate-launcher`. Gates, the watch and the
  audit run Dash from it, and the list defaults to it. A host overrides the list to add other
  launchers, such as h2puni's `~/wbs-dev/src`.
- **S6C-A10 Audit units, one source.** The renderer `renderAuditUnits` stays the source of truth.
  The role ships equivalent templates, and the test requires them to equal its output for the
  role's paths. The renderer's `Documentation=file://<checkout>/docs/resources.md` names a path
  that does not exist (the file is under `apps/twilight-structure/twilight-dash/cli/docs/`). It is
  mirrored here unchanged and left as a renderer follow-up.
- **S6C-A11 Watch unit.** `ConditionPathExists=<ledger>`: `resources watch` throws without a
  ledger, so before `ops pool init` the unit is skipped, not crash-looped. The role enables the
  watch and the audit timer only on an enrolled host, and starts neither. The operator order is
  init, then start, then the first job. The brief's "start the unit, then init" is reversed
  because a watch has nothing to watch before init. 6b's "watch running before observe jobs" still
  holds. `RestartSec=30`. PATH is the pinned Bun and Node, then the system's. The working
  directory is the launcher checkout.
- **S6C-A12 WBS inputs per host.** `puni_gate_host_pool` has exactly `authorityId`, `epoch`,
  `providerId`, `mcpResource` (https), `credential` and `diskBudgetUnits`, from the operator's
  `$OPS/gate.json`. Nothing is defaulted. The template task is `no_log`, and the shape probe
  discards `jq`'s output, so the credential is never printed.
- **S6C-A13 What the test cannot render.** The test renders templates and probe argv with a
  strict Jinja subset (`{{ name }}`, `.key`, `[n]`, `to_json`, `int`). Anything else in a
  template throws. Real Ansible rendering, the facts arithmetic of S6C-A5, the `systemd_service`
  and `wait_for` tasks and linger itself run only at the apply. `ops pool init` refuses a budget
  above the host's facts loudly.
- **S6C-A14 The 6a × 6b launchers conflict, resolved by #818; its flake was a real race.** Before
  #818 landed, three of 6a's concurrent-gate cases in `launchers.test.ts` failed on this branch's
  6a + 6b tree: 6b's observe mode queues every Dash job through the shell lock. #818's final
  `9855c2343` patched the fixture, and this branch merged the plan at `b578beef9`. The next three
  runs went 9/10, 10/10, 10/10. In the failing run, "two gates run at once" saw `blocked: …
cannot read the cgroup of uninspectable PID 662`. That is not fixture timing. J19's inspection
  listed a process, found its descriptors unreadable, and the process had exited by the time
  `/proc/<pid>/cgroup` was read; the inspection counted it as an unknown holder. On a host this
  would block units at random. Fixed under S6C-A21.
- **S6C-A15 Pinned fields stop the role (review Q1).** Once a ledger and a configuration both
  exist, the role renders the candidate configuration on the controller and passes it on stdin,
  never to disk. A `jq` probe compares it with the live file on the thirteen fields
  `ResourceRuntime.binding` pins: root, authority, epoch, provider, disk unit, disk budget, slots,
  headroom bytes, cores, memory, headroom, units and enrollment id. The probe prints only the
  names of differing fields. An assert stops the play before the template task, with "pinned
  field differs from the ledger; re-enrollment under a new root is required". `mcpResource`,
  `credential`, `launcherCheckouts` and `concurrencyEligible` may still change. "Provisional" is
  gone from the headroom default: it is chosen per host before init.
- **S6C-A16 What the guard compares.** It compares with the live file, not the ledger, which is
  what every open compares with. A configuration missing beside a ledger is rewritten from the
  inputs. That restores a broken enrollment, and the next open checks it against the ledger. The
  assert has one condition (`stdout == '[]'`): a `jq` failure prints nothing, so a separate
  `rc == 0` could never fail on its own, and the evaluator showed exactly that.
- **S6C-A17 h2puni onboarding is its own step (review Q2).** h2puni is not in `gate_hosts` and has
  never been role-managed. Its first apply replaces `~/.bashrc`, installs the pins, packages and
  solver venv, and requires the live shared `~/puni-00-gate-tbf` to be a full clean clone of the
  canonical URL. That is a larger change than this slice. It is owed by 6.3's operator half,
  **for Dany to see before it runs**, as step 0 of gate-hosts.md "Enroll a host in the host pool".
- **S6C-A18 Controller-image evaluator.** `infra/ansible/tests/gate-host-assertions.py` runs the
  role's exact tasks in the digest-locked controller, on localhost, with recorded registered
  values or fake commands. It runs by hand, not in CI: it needs the controller image and
  `--tmpfs /tmp:exec` for the fakes. A fault counts as caught when its bad input gets past the
  named refusal. Either the play passes, or it fails with Ansible's own error instead of the
  task's message: E1 conditions 0, 1 and 4, E2's `failed_when`, E3 condition 0.
- **S6C-A19 Audit documentation path (review Q9).** `renderAuditUnits` (slice 4) now names
  `<checkout>/apps/twilight-structure/twilight-dash/cli/docs/resources.md`, a path that exists.
  `audit-units.test.ts`'s expected text and the role's template follow it, and the equality test
  keeps the two in step.
- **S6C-A20 Launcher freshness is manual (review Q6).** After enrollment, gates launch from
  `~/puni-00-gate-launcher`. AGENTS.md's gate line and gate-hosts.md's launch section say so.
  Its head moves only by hand (`git checkout --detach origin/main` while no job runs from it); task
  6.9 owes a timer. `validate`'s header now says that `ops pool inspect` and `ops job audit` can
  migrate an older ledger forward (review Q5).
- **S6C-A21 A process that vanished holds nothing (coordinator's fix of the S6C-A14 race).**
  `outsideScope` in `runtime.ts` now answers `outside`, `holds` or `gone`. It answers `gone` when
  the process has exited since the scan listed it: ENOENT or ESRCH on its cgroup read or its
  session read. `inspectHolds` skips a `gone` process and records nothing about it. EACCES and
  EPERM keep their J19 meaning. A zombie or an exiting process is S6C-A23's case, and the leaving
  leader inspected through a live thread is S6C-A24's. `HoldScope`, `outsideScope` and
  `inspectHolds` are exported for the tests, which add no seam. A reaped pid is exactly what each
  read sees once the race is lost; the cgroup branch's negative is 6c-F17.
- **S6C-A22 Slice 2's inode-reuse flake is owed, not fixed.** The full-suite failure of
  `a replaced tmp directory or symlink stays charged and untouched` comes from `rmdir` plus `mkdir`
  reusing the inode, which a dev and inode identity cannot tell apart. tasks.md 2.4 owes an
  identity that also carries ctime or birth time, or a content marker.
- **S6C-A23 A leaving process holds nothing; the second form of the race (CI on `37ca6254a`).**
  CI's "two gates run at once" ended with `blocked: … cannot inspect process PID 571 (wc), which
may hold the job's files`. `wc`, a short-lived child of the other gate's steps, was leaving:
  either a zombie, or in `do_exit` with its memory dropped. The kernel then refuses its `fd`
  directory (EACCES) and has no `cwd`. Observed on this workstation: a zombie's `/proc/<pid>/fd`
  is `Permission denied`, `cwd` cannot be read, `maps` is empty, and its stat flags include
  `PF_EXITING` (0x4).
  - Not yet a zombie at the check, it went through J19's EACCES path. Its session was a job's,
    so `outsideScope` answered `holds`.
  - The fix is the new exported `processGone(pid)`, in `runtime.ts`. It answers true when the
    process's stat entry is missing (ENOENT/ESRCH), when its state is `X`, or when it is `Z` or
    has `PF_EXITING` and no other thread in `/proc/<pid>/task` is live.
  - `inspectHolds` uses it at the scan's top and in its catch. Before, both checks were
    `identifyProcess(...) === null`, which also treated a zombie group leader beside live threads
    as dead. `outsideScope` uses it before any other decision. EACCES and EPERM on a process that
    is not leaving keep the J19 rule.
  - A zombie group leader whose threads still run holds those threads' descriptors. It is now an
    unknown holder: identity null and not gone means `holds`, where before it was skipped.
  - Tests in `resource-holds.test.ts`, no seam. "an unreaped zombie holds nothing" forks from a Python parent that installs no SIGCHLD handler and never waits, then waits for the child's state to read `Z`. Its live parent is not gone. The first fixture, `bash -c 'true & echo $!; exec sleep 30'`, raced on CI (ee0f13fb1): bash reaped the child before `exec`. The replacement passed 5 of 5 runs here, and once more with the test pinned to one core (`taskset -c 0`) beside three busy loops. "a group leader that exited beside a live thread still holds" uses Python's main thread calling `pthread_exit` beside a sleeping thread.
  - The first cut required the task list to hold only the leader. On this workstation's
    launchers runs, a Bun mid-group-exit, whose other threads were still tearing down, became an
    uninspectable holder: `cannot inspect process PID 432 (bun)`, 8 or 9 out of 10 on each of
    three runs. Checking each other thread's own state fixed it.
  - The mid-`do_exit` state itself cannot be held still for a test. It shares the zombie's
    `PF_EXITING` flag, and that flag is what the code reads.
  - **Accepted false-release window.** `gone` is declared from `exit_signals` (`PF_EXITING`) on,
    while `do_exit` drops the descriptor table later (`exit_files`, `exit_task_work`). So
    descriptors can stay open for a span of under a millisecond to a few milliseconds, longer only
    when a file's release blocks in FUSE or NFS. The process cannot run user code past that
    point, a later job that re-creates the path gets a fresh inode, and only deleted-open disk
    space lingers until the last `fput` drains.
- **S6C-A24 A leaving leader is inspected through a live thread (review P1/P2 of 63a070156).** In
  an `exit_group` the leader is `PF_EXITING`, and refused (EACCES) after `exit_mm`, while a sibling
  thread still runs for a moment. A leader that called `pthread_exit` stays that way.
  - `inspectionRoot(pid)` answers `/proc/<pid>` while the leader runs, and
    `/proc/<pid>/task/<tid>` of a live thread while the leader is leaving. The descriptor table,
    cwd and memory belong to the whole group, so that view is a real inspection. It answers null,
    meaning gone, when no thread is live. `processGone` is `inspectionRoot(pid) === null`.
  - `inspectHolds` reads cwd, fd and maps under that root.
  - `outsideScope` reads the start time straight from `stat` (`statIdentity`), because
    `identifyProcess` answers null for a zombie by choice. A zombie leader whose live thread is
    itself refused therefore gets the full J19 rules (foreign session, owned session, start
    comparison) instead of `holds`.
  - Nothing is stricter than J19 now. Where no thread is live the process is gone (S6C-A23);
    where one is, either its real view decides or J19 does.
  - Tests in `leaving-holds.test.ts`, inside a private namespace so the scan sees only the
    suite's processes. "a leaving leader is inspected through its live thread" expects no holder
    and no outside-scope record. "a leaving leader's live thread holding a file still holds"
    has the thread hold a file in the locator and expects `live file hold remains charged`.
- **S6C-A25 Launchers under test get a clean environment.** Run inside a real gate,
  `launchers.test.ts` inherited `HEAVY_LOCK_LABEL=gate:<sha>`, which `bin/h2puni-gate.sh`
  exports. Its release launcher then recorded `--label gate:37ca6254` where the case expects
  `unlabeled`; the h2puni gate on 37ca6254a failed this way, and CI never sets the variable.
  `cleanLauncherEnv` drops `HEAVY_LOCK_LABEL`, `HEAVY_LOCK_WAIT_SECONDS`,
  `HEAVY_LOCK_POLL_SECONDS`, `HEAVY_LOCK_JOB_TYPE`, `DASH_JOB_ID`, `DASH_JOB_TYPE`,
  `DASH_JOB_UNIT_*` and `HEAVY_JOB_ENROLLMENT` from every spawn in the file: the namespace rerun,
  the launchers, the legacy holder, `ops pool init` and `switch-mode`, and the shim's argv. The
  negative sets `HEAVY_LOCK_LABEL=gate:deadbeef` around "a gate runs beside a release build" and
  still expects `--label unlabeled`. The production side, a nested `run_heavy_job` inheriting the
  outer label, is owed by task 6.10.

### Commands (fresh, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, this workstation)

| Command                                                                                                       | Result                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test … src/ops/gate-host-pool.test.ts` (twilight-dash)                                                   | 10 pass, 0 fail: nine cases plus the namespace rerun, which runs `ResourceRuntime.initialize` on the rendered configuration with two fixture gate trees and the token unit the role's own command made               |
| `bun test … gate-host-pool audit-units host-pool-mode launchers host-jobs` (twilight-dash, the 6a + 6b merge) | 15 pass, 1 fail: `launchers.test.ts` (6a's), whose three concurrent-gate cases fail on the merged 6a + 6b tree (`heavy lock:` in a gate's stderr; exit 143 after the 120 s case timeout). See S6C-A14                |
| `bunx nx run tool-fleet:check --skip-nx-cache`                                                                | exit 0; `ansible: 15 playbooks syntax-checked`, `yaml: 231 files parsed strictly`, `shellcheck 0.11.0: 12 scripts`, `every family passed`; its `tool-fleet:test` (with `ansible.test.ts`), lint and typecheck passed |
| `ansible-playbook --syntax-check -i localhost, playbooks/gate-host.yml` in the fleet controller image         | rc 0 (`Could not match supplied host pattern … gate_hosts`, as for every playbook)                                                                                                                                   |
| `shellcheck -S style` on the 14 inline `bash -c` scripts of the role's three task files                       | only SC1091 (info, a sourced `~/.bashrc` or library not followed), as the existing probes have; nothing on the new scripts' own code                                                                                 |
| `bunx eslint …/gate-host-pool.test.ts`, `bunx tsc --build --force …/twilight-dash/cli/tsconfig.json`          | clean; exit 0                                                                                                                                                                                                        |
| `bunx prettier --check` on every touched file                                                                 | `All matched files use Prettier code style!`                                                                                                                                                                         |
| `bunx openspec validate dash-host-jobs --json`                                                                | valid; 11 warnings, the same 11 as before this slice (long requirements, text before the first requirement)                                                                                                          |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                   | exit 0; two pre-existing review-debt entries                                                                                                                                                                         |

`ansible-lint` is not pinned in this repository (no toolchain entry and no binary on this
workstation), so it was not run.

### Fault injection

Each fault was applied by script to the real role file, the suite was run, and the file was
restored. Its SHA-256 matched before and after in every row. "Red" lists the failing tests in
`gate-host-pool.test.ts`; each fault also failed the namespace rerun.

| Fault                                                                  | Red                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 6c-F1 `enrollmentId` line dropped from `host-pool.json.j2`             | the loader case, the shape-probe case, the namespace init                              |
| 6c-F2 `KillMode=process` dropped from the watch unit                   | the watch unit case                                                                    |
| 6c-F3 `Restart=on-failure` dropped from the watch unit                 | the watch unit case                                                                    |
| 6c-F4 disk refusal `((avail >= need)) \|\| exit 75` replaced by `true` | the disk probe case                                                                    |
| 6c-F5 linger probe's `&& [[ $linger == yes ]]` dropped                 | the linger case                                                                        |
| 6c-F6 token probe's `rev-parse -q --verify HEAD` dropped               | the token unit case (the unborn tree passed)                                           |
| 6c-F7 token command's commit dropped                                   | the token unit case, the namespace init                                                |
| 6c-F8 shape probe's `.root == $root` dropped                           | the shape-probe case (`another root` exited 0)                                         |
| 6c-F9 shape probe's key-set check dropped                              | the shape-probe case (`an extra mode key` exited 0)                                    |
| 6c-F10 audit timer `OnCalendar=weekly` → `daily`                       | the audit units case (template no longer equals the renderer)                          |
| 6c-F11 pool root default renamed to `.../dash/pool`                    | the shim-paths, loader and watch unit cases, the namespace init                        |
| 6c-F12 checkout probe's `installed=` line dropped                      | the checkout probe case                                                                |
| 6c-F13 shape probe's mode and owner check dropped                      | the shape-probe case (the group-readable copy passed)                                  |
| 6c-F14 a second module added to the linger task in `host-pool.yml`     | `ansible-playbook --syntax-check playbooks/gate-host.yml` rc 4, naming the task's line |

### Review fixes (Fable, PR #819): commands and evaluator

Rerun fresh after the fixes; results are below the evaluator table.

`docker run --rm --network none --read-only --tmpfs /tmp:exec --tmpfs /runner/.ansible -v "$PWD/infra/ansible:/work/ansible:ro" --entrypoint python3 ghcr.io/prosperous-unification/fleet-controller:0.1.0 /work/ansible/tests/gate-host-assertions.py`
exited 0 and printed `{"failures": 0}`. It ran 30 cases and 24 faults:

| Family (exact task)                                         | Cases (each as expected)                                                                     | Faults, each letting its bad input through                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| E1 `Require the host pool inputs of an enrolled host`       | valid passes; unenrolled skips; undefined, non-mapping, extra key, http, `"16"`, `0` refused | each of the six conditions removed; `when` removed             |
| E2 free-space probe and `Require free space …` (fake `df`)  | 26843545600 free passes; 7516192768 refused naming `clones=3 avail=7516192768 need=…`        | assert condition removed; probe's `failed_when: false` removed |
| E3 `Require the pool root and the Dash user units`          | as written passes; root missing, 0755, foreign, each unit file missing refused               | each of the six conditions removed                             |
| E4 `Require no host pool state on a host that is not …`     | clean passes; enrolled skips; configuration or ledger left refused                           | each condition removed; `when` removed                         |
| E5 `Read whether the Dash user units are enabled` (fake)    | `enabled enabled` passes; unenrolled skips; `enabled static` (exit 0) refused                | `failed_when` removed; `when` removed                          |
| E6 skip line and `Inspect the host pool and audit …` (fake) | ledger: inspect then audit run, no skip line; none: skip line, nothing run; audit 1 refused  | either `when` removed                                          |
| E7 `Require the pinned fields to equal the live …`          | `[]` passes; `["memoryGib"]` and a jq failure (rc 2, empty) refused                          | its one condition removed (both bad inputs through)            |

| Fault                                                               | Red in `gate-host-pool.test.ts`                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 6c-F15 `memoryGib` dropped from the pinned-field probe's list       | `the pinned-field probe names a changed budget, never a value`       |
| 6c-F16 audit template's `Documentation=` back to `<checkout>/docs/` | `every unit names documentation that exists …`, the audit units case |

Both were restored with their SHA-256 equal. The new probe case also shows that a changed
headroom or inventory name is named (`["headroom"]`, `["enrollmentId"]`), that a changed
credential, launcher list or eligibility list prints `[]`, and that a missing live file exits
nonzero.

Fresh after the fixes, with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`:

- `gate-host-pool.test.ts` and `audit-units.test.ts`: 15 pass, 0 fail.
- `bunx nx run tool-fleet:check --skip-nx-cache`: exit 0 (`ansible: 15 playbooks syntax-checked`,
  `every family passed`).
- `ansible-playbook --syntax-check -i localhost, playbooks/gate-host.yml` in the controller: rc 0.
- `bunx prettier --check` on every touched Markdown, YAML and TypeScript file: clean. Prettier has
  no parser for `.j2` and `.py`.
- `bunx openspec validate dash-host-jobs --json`: passed, 1 of 1, with the same 11 warnings.
- ESLint on the changed TypeScript and twilight-dash `tsc --build --force`: exit 0.

### After merging the plan at `b578beef9` (#818 landed)

Fresh, with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`:

- `gate-host-pool.test.ts` and `audit-units.test.ts`: 15 pass, 0 fail.
- `launchers.test.ts` alone, three runs: 9/10, then 10/10, then 10/10 (S6C-A14).
- `tool-fleet:check --skip-nx-cache`: exit 0.
- `bunx prettier --check` on the branch's diff against the plan: clean (no parser for `.j2` or `.py`).
- `openspec validate dash-host-jobs`: passed, 1 of 1, with 11 warnings.
- Burokrat `check-indexes working . HEAD`: exit 0.
- `bunx nx run-many -t typecheck lint -p twilight-dash --skip-nx-cache`: exit 0.
- `bunx nx run twilight-dash:test --skip-nx-cache` (31 min): 4258 pass and 1 fail, across 4259
  tests in 139 files.
  - The failure: `host-jobs.test.ts` "review fixes (Fable, PR #804) > a replaced tmp directory
    or symlink stays charged and untouched" expected `blocked` and received `released`.
  - That file alone then passed three times out of three.
  - Slice 2's settlement is unchanged here: the branch's diff under twilight-dash `src` is
    `audit-units.ts` (one line), its test, and `gate-host-pool.test.ts`. So this is recorded as a
    flake under full-suite load and left to slice 2's owner.

### The vanished-holder fix (S6C-A21): commands

Fresh, with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`. "pass" for the namespaced suites is
their outer namespace case, which fails if any inner case fails.

| Command                                                                                      | Result               |
| -------------------------------------------------------------------------------------------- | -------------------- |
| `bun test src/resources/host-job-holds.test.ts`                                              | 6 pass, 0 fail       |
| `bun test src/resources/resource-holds.test.ts` (with the new vanished-process case)         | 12 pass, 0 fail      |
| `bun test src/resources/runtime.test.ts`, `src/resources/host-jobs.test.ts`                  | each passes, 0 fail  |
| `bun test src/no-ambient-clock.test.ts`                                                      | 2 pass, 0 fail       |
| `bun test src/ops/gate-host-pool.test.ts`                                                    | 12 pass, 0 fail      |
| `bun test src/ops/launchers.test.ts`, three runs                                             | 10/10, 10/10, 10/10  |
| `bunx nx run-many -t typecheck lint -p twilight-dash --skip-nx-cache`                        | exit 0               |
| `bunx prettier --check` on the changed files; `bunx openspec validate dash-host-jobs --json` | clean; passed 1 of 1 |

| Fault                                                                      | Red                                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 6c-F17 `if (isMissing(cause)) return 'gone';` dropped from the cgroup read | `a process that exits after the scan listed it holds nothing` threw `cannot read the cgroup of uninspectable PID 3396337` |

Restored with its SHA-256 equal. Not observed: separate negatives for the identity and session
branches (S6C-A21).

### The leaving-process fix (S6C-A23): faults

| Fault                                                                | Red in `resource-holds.test.ts`                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 6c-F18 `taskLeaving` answers `'live'` for every state but `X`        | `an unreaped zombie holds nothing`                                 |
| 6c-F19 `inspectionRoot` answers null (gone) for every leaving leader | `a group leader that exited beside a live thread still holds`      |
| 6c-F17 again, the cgroup ENOENT branch dropped                       | `a process that exits after the scan listed it holds nothing`      |
| 6c-F20 `inspectionRoot` answers the leaving leader's own path        | `leaving-holds.test.ts`: both cases (`cannot inspect process PID`) |

Each was restored with its SHA-256 equal.

Fresh after the fix, with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`:

- host-job-holds 6/0; resource-holds 14/0.
- runtime and host-jobs: the outer namespace case passes for each.
- no-ambient-clock 2/0; gate-host-pool 12/0.
- `launchers.test.ts`: 10/10 on each of three runs.
- `nx run-many -t typecheck lint -p twilight-dash --skip-nx-cache`: exit 0.

### Review P1–P5 of 63a070156: commands

Fresh, with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; namespaced suites count their outer
case:

- `resource-holds.test.ts`: 14/0 on each of three runs.
- `leaving-holds.test.ts`: passes (its two cases run inside the namespace).
- `host-job-holds` 6/0; `runtime` and `host-jobs` pass.
- `no-ambient-clock` 2/0; `gate-host-pool` 12/0.
- `launchers.test.ts`: 10/10 on each of three runs.
- twilight-dash typecheck and lint (`--skip-nx-cache`): exit 0.
- prettier: clean.
- `openspec validate dash-host-jobs`: passed.
- 6c-F17 to 6c-F20 were rerun against these files; each turned its test red and was restored with
  its SHA-256 equal.
- `zombieOf` now throws a named error when its parent printed no pid, or when the pid was reaped
  before it became a zombie (review P5).

### The environment fix (S6C-A25): commands

- `launchers.test.ts`: 10/10 on two runs, then 10/10 with all eight variables exported in the
  shell (`HEAVY_LOCK_LABEL=gate:leaked HEAVY_LOCK_WAIT_SECONDS=1800 HEAVY_LOCK_POLL_SECONDS=7
HEAVY_LOCK_JOB_TYPE=gate DASH_JOB_ID=outer-job DASH_JOB_TYPE=gate
DASH_JOB_UNIT_GATE_TREE=/nonexistent HEAVY_JOB_ENROLLMENT=enrolled`).
- 6c-F21: with `launch` spreading `process.env` in place of `cleanLauncherEnv`, "a gate runs
  beside a release build" failed, its output containing `deadbeef`. Restored with its SHA-256
  equal.

### Skipped and unverified

- **h2puni's first apply (S6C-A17)** is a larger change than this slice, owed by 6.3's operator
  half, for Dany to see first.
- **On a host:** the apply itself; linger; `wait_for` on the user manager socket;
  `systemctl --user daemon-reload`; enabling with `systemd_service`; the facts arithmetic; the
  clones and installs. The two-converging-applies proof (`changed=0`), killing the watch to see
  systemd restart it with the guard holder surviving, `ops pool init` and `--tags validate`
  against a real pool are all open in 6.3, 6.7 and 6.4. The h2puni disk cleanup waits on Dany.
- **Real Jinja:** templates and argv were rendered by the test's strict subset (S6C-A13), never by
  Ansible. `--syntax-check` parses the tasks but templates nothing.
- `ansible-lint`: not pinned, not run.
- The full twilight-dash and repository suites were not run here (laptop memory rule). CI and the
  h2puni gate run them.

## Plan-head gate on h2puni (task 0.1, 2026-11-02)

Both runs used the isolated clean worktree `~/puni-00-gate-467-9b552fa8` on h2puni (never the shared
`puni-00-gate-tbf`), fetched the SHA without checking it out first, and ran `bin/h2puni-gate.sh <sha>`
detached under `setsid nohup` with `HEAVY_LOCK_WAIT_SECONDS=7200`; the log ends with a `GATE-EXIT`
line. Nothing on the host was deleted. The records as reported in PR #819's body and comments.

### 5061911cf (= plan head 27f3205fa after the #819 merge): PASS

- `heavy lock: waited 0s behind 0 tickets`, then `h2puni gate: running on
5061911cf7ec634253f735dd45c5f6848351f254`, then `GATE-EXIT 0`; no `✗` anywhere in
  `/var/tmp/gate-6c-5061911c.log`.
- Steps: `test, lint, typecheck, build` for 52 projects and 10 dependent tasks (60m 22s);
  `test, typecheck, build` for the Burokrat and Dash split (50m 25s); `twilight-burokrat:lint:source`
  (27.4s); `twilight-dash:lint` (44.5s); `wbs-be-01:solver-image-smoke` (4m 21s) — all green.
- Host: lock `holder none` before; `/` 6.8 GB free before, 5.4 GB after; worktree clean before and after.

### 37ca6254a (pre-fix SHA, superseded): exit 1 on one test

- `h2puni gate: running on 37ca6254ad4a2345cc7fd0d587b012e9d1dc88d8`, `GATE-EXIT 1`.
- First `nx run-many` green for 52 projects; the second failed only `twilight-dash:test`:
  4259 pass, 1 fail of 4260 — `launchers.test.ts › a gate runs beside a release build` (and its
  namespace wrapper). Cause: the outer gate exports `HEAVY_LOCK_LABEL=gate:<sha8>` and the fixture
  spread `process.env` into the launchers it spawned, so the release launcher's recorded argv carried
  the gate's label; CI never sets that variable, so only a real gate saw it. Fixed by `5061911cf`
  (`cleanLauncherEnv`, S6C-A25, fault 6c-F21); task 6.10 owes the production rule for a nested
  `run_heavy_job`. The gate stops at the first failure, so the later lints and the solver smoke did
  not run for that SHA; the 5061911cf run above covers them.
- Earlier on the same day, slice 6a's gate on `af8cdd003` had exited 1 only on the recorded
  `wbs-be-01` budget flake, which passed alone (see "Slice 6a").

## 2026-11-04 h2puni apply, blocked (task 6.3, operator half)

The first apply of `gate_host` to h2puni stopped at preflight, before any change (private
`puni-plan` evidence `2026-11-04-h2puni-gate-host-apply.md`). **H2-A1:** `puni1` is in `sudo`
and `sudo -n true` exits 0; its dev poller and monitoring scripts call `sudo docker` and
`sudo openssl` as `puni1`, so the sudo cannot be removed yet. Validate's "Require the gate account
without sudo" would have failed every apply after it changed the host.

The fix (task 6.3b) is `puni_gate_account_may_sudo`, default false and set only on h2puni in the
inventory. When it is true, "Require the sudo exception to still match the gate account" replaces
the no-sudo assertion and requires the state the strict check would refuse (the `sudo` group or
`sudo -n` succeeding), so a stale exception fails.

- Controller-image evaluator (`infra/ansible/tests/gate-host-assertions.py`, E8 and E9, recorded
  probe lines through `set_fact` on localhost), with the digest-locked controller:
  `{"failures": 0}`, 70 `ok` lines, exit 0. E8 passed h4claw's lines, refused the group alone and
  the grant alone, and skipped under the exception. Removing either condition let its line
  through, and removing `when` refused h2puni's lines. E9 passed h2puni's
  `['puni1 sudo docker', 'sudo_rc=0']`, the group alone and the grant alone. It refused h4claw's
  lines as stale and skipped a strict host. Removing the condition let the stale line through,
  keeping one disjunct refused the other's line, and removing `when` refused the strict host.
- `ansible.test.ts` "configures a gate host…" now requires the default false and only h2puni to
  carry the flag. Setting the default to true failed it (`Expected: false`, `Received: true`), and
  so did adding the flag to h4claw (`+ "h4claw"`).
- Not done: no apply. H2-A2 (a gate held the lock) and steps 0 to 1 remain as in `gate-hosts.md`.

### Review fixes (Fable, PR #842)

- M1: a `gate-host` delta (`specs/gate-host/spec.md`) MODIFIES "A gate host converges under
  Ansible": no sudo grant except where the inventory sets `puni_gate_account_may_sudo`, plus
  scenarios for a strict escalating host, an excepted escalating host, a stale exception and a
  string flag.
- M4: "Require supported host and gate inputs" now requires `puni_gate_account_may_sudo is
boolean`. A string `false` from `-e key=value` would make `when: not …` skip the strict check.
  Evaluator E10: `false` and `true` passed, the string `"false"` was refused (rc 2), and with the
  condition removed the string passed (rc 0).
- L3: an accepted case now also needs `skipped=0` in the PLAY RECAP and a skip case
  `skipped=1`, so a skipped assertion no longer counts as accepted. Proof: a copy of the
  evaluator with E8 "exception skips" marked accepted and E9 "h2puni today" marked skipped
  printed `FAIL` for both and `{"failures": 2}`, exit 1.
- Full evaluator after the fixes, digest-locked controller: 74 `ok` lines, `{"failures": 0}`,
  exit 0.

## 2026-11-04 h2puni apply 1 — authorized_keys incident (H2-A7)

Apply 1 of `gate_host` on h2puni (21:16–21:19 UTC) locked out every caller of `puni1` but one
until the pre-apply backup of `~/.ssh/authorized_keys` was restored by hand as root (private
`puni-plan` evidence `2026-11-04-h2puni-gate-host-apply.md`). Apply 2 and validate wait on this
fix.

- **Root cause.** "Install the exact gate authorized keys" wrote `content: |` with
  `{{ puni_gate_authorized_keys | join('\n') }}`. In that block scalar the `\n` stayed two
  characters through Ansible's templating, so the five keys became one 528-byte line; sshd
  honoured the first key and read the other four as its comment. h4claw lists one key, so its
  applies never showed it. The controller image wrote `a\nb\nc` (backslash-n) for that form and
  real newlines for a double-quoted string and for a template file (`od -c`, 2026-11-04).
- **Fix.** The task renders `templates/authorized_keys.j2`, one key and a newline per entry,
  with the same owner, group and 0600. Validate's new "Fingerprint the gate authorized keys"
  (`ssh-keygen -lf`, read-only) and "Require one authorized key per listed key" refuse a file
  whose fingerprint count differs from the list's length, so apply 1 would have stopped at
  validate instead of passing. `~/.cache` is now created 0700, h2puni's own mode; apply 1 had
  widened it to 0755.
- Controller-image evaluator, families E11 and E12, three keys generated per run: the role's
  task with three keys, one key and a key with a `from=` option passed; a malformed third key
  was refused with `holds 2 keys, but puni_gate_authorized_keys lists 3`; the reinstated
  `content: |` task wrote one line and was refused with `holds 1 keys, but
puni_gate_authorized_keys lists 3`. With the count condition removed both bad files passed
  (rc 0). The evaluator now runs as `--user 0:0`, because `ssh-keygen` exits 255 under the
  image's uid 1000, which has no passwd entry. Full run: 81 `ok` lines, `{"failures": 0}`, exit 0.
- `ansible.test.ts` "writes one authorized key per line and validates the count" pins the
  template task, the template's bytes, the `~/.cache` mode, the probe argv and the assertion.
  Restoring the copy task failed it (`- Expected - 7`, `+ Received + 1`), and so did dropping the
  count condition from validate.yml (`- Expected - 3`, `+ Received + 1`).
- `docs/infra/gate-hosts.md`: stage the key list from the live file and compare it byte for byte
  (`cmp`, H2-B1: a trailing space differed between a snapshot and the staged list), and after
  apply 1 log in from a second session before closing the first.
- Not done: no host was touched. Apply 2 and validate on h2puni remain task 6.3's operator half.

### Review fixes (Fable, PR #852)

- M2: the keys no longer reach the live file before they are counted. main.yml renders them to
  `~/.ssh/authorized_keys.staged`, imports `tasks/authorized-keys-count.yml` (the `ssh-keygen -lf`
  probe and the count assertion) on it, copies it into place with `remote_src: true` and removes
  it; validate.yml imports the same file against the live `authorized_keys`. The template
  module's `validate:` cannot do this: `ssh-keygen -lf` exits 0 when any key parses. Staging and
  removal are `changed_when: false`, so a rerun reports only the install. Evaluator E11 to E13:
  the role's sequence installed three keys, one key and a key with a `from=` option, and a rerun
  with the same 0600 file reported `changed=0`; dropping either `changed_when` failed that. The
  reinstated `content: |` render (E12) and a malformed third key were refused at the staged
  count, with no `Install the exact gate authorized keys` task in the output and the previous
  live file unchanged; moving the install before the count overwrote it, and removing the
  condition let both bad files through. E13 refused a joined live file through validate's import.
  Full run: 88 `ok` lines, `{"failures": 0}`, exit 0.
- `ansible.test.ts` "stages the authorized keys, counts them, then installs them" pins the
  four-task order, the staged template, the import and its `puni_gate_keys_file`, the
  `remote_src` copy, the removal, validate's import, the probe and the assertion. Restoring the
  copy task (`- Expected - 7`), moving the install above the count (`- Expected - 1`) and dropping
  the count condition (`- Expected - 3`) each failed it.
- M1, M3, L2: gate-hosts.md says what `cmp` proves (a lossless copy and the final newline) and
  adds a key-count line for comment and blank lines, completes step 0's order through
  `--tags validate`, and records h4claw's `~/.cache` narrowing to 0700.
- L1: the assertion's `fail_msg` prints the parsed fingerprints, and the count file says the
  count is not a login test.

## 2026-11-05 role converged on both hosts (task 6.3, operator half)

`gate_host` at `main` `149e6e85b` converged on both gate hosts, neither enrolled. Private
`puni-plan` evidence: `evidence/2026-11-05-h2puni-gate-host-apply.md` and
`evidence/2026-11-05-h4claw-gate-host-reapply.md`.

- h2puni: apply 1 `ok=66 changed=1` (`~/.cache` 0755 to 0700), apply 2 `changed=0`, validate
  `ok=30 failed=0`.
- h4claw: apply 1 `ok=66 changed=1` (`~/.cache` 0755 to 0700), apply 2 `changed=0`, validate
  `ok=30 failed=0`.
- **H2-A8** `~/puni-00-gate-tbf2` is detached at the night's last gate SHA: the gate script moved
  it, not the role (J15), and validate's clean, canonical and full checks passed on it.
- **H2-A9** The root safety-net ControlMaster did not survive the harness: it was gone minutes
  after it started, so the root path was verified but not held during the applies.
- **H2-A10** `~/.cache` was 0755 from H2-A7's apply until apply 1, which restored 0700.
- **H4-A8** Only `~/.cache` changed: the 2026-11-02 apply had brought everything else to the pins.
- **H4-A9** `~/puni-00-gate-launcher` is detached at `75a78ff3b`, older than `149e6e85b`; the role
  never moves a head, so move it to current `main` before `ops pool init` (gate-hosts.md, step 5).
- **H4-A10** A background `sleep` root session did survive the harness across every step, as
  `ps` showed between steps.

## 2026-11-05 `docker_build` token unit and h2puni's launcher checkouts (task 6.3e)

- The role's token-unit tasks ("Create the token units", "Read the token units") loop over
  `puni_gate_pool_token_units`, `dagger_engine` and the new `docker_build`; the commit subject is
  `<unit> token unit (dash-host-jobs S6-A7)`, so `dagger_engine`'s is unchanged. `exclusiveUnits`
  gains `docker_build`, and validate's shape probe requires it.
- h2puni's inventory sets `puni_gate_pool_launcher_checkouts` to `/home/puni1/puni-00-gate-launcher`
  and `/home/puni1/wbs-dev/src`; h4claw keeps the default.
- Controller-image evaluator, family E14 (digest-locked controller `sha256:372f6f43…`, `--user
0:0`): a fresh host created both units with `changed=1` across two runs of the create task,
  each the top of a clean tree with a commit; a dirty `docker_build` left in place was refused
  (`token unit …/docker_build exists but is not a clean Git tree with a commit`); validate's read
  refused `docker_build` dirtied and re-initialized without a commit. Reducing the create loop
  to `dagger_engine`, removing its `changed_when`, and reducing the read loop to
  `dagger_engine` each turned its case around. Full run: 96 `ok` lines, `{"failures": 0}`, exit 0.
- `gate-host-pool.test.ts` runs the create and read argv for each unit and checks the commit
  subject, the template's `exclusiveUnits`, the shape probe's new `no docker_build unit` case
  and `ops pool init` on both units (namespace test). Dropping `docker_build` from the shape
  probe's expected units failed it (`Expected: 0`, `Received: 1`).
- `ansible.test.ts` "configures a gate host…" pins the exclusive units, the token-unit list, both
  tasks' loop, h2puni's launcher list, its absence on h4claw, the template's
  `launcherCheckouts` line and the configuration task's `when`. Dropping `~/wbs-dev/src`
  (`- Expected - 1`), giving h4claw the list (`+ Received + 4`), dropping `docker_build`
  (`- Expected - 3`), dropping either loop (`- Expected - 1`, `+ Received + 1`) and dropping the
  `when` (`Received: undefined`) each failed it.
- Open: no type in this repository's catalogue declares `docker_build` yet, so the unit
  serialises `website-dev-build` runs with each other only, not with the gate's solver smoke, which
  shares the host daemon's BuildKit cache (release-build builds inside the Dagger engine's own cache).

### Commands (fresh, 2026-11-05, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` for tests)

| Command                                                                             | Result                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------- |
| evaluator (`gate-host-assertions.py`, controller `@sha256:372f6f43…`, `--user 0:0`) | 96 `ok`, `{"failures": 0}`, exit 0            |
| `bun test src/ops/gate-host-pool.test.ts` (twilight-dash)                           | 12 pass, 0 fail                               |
| `bunx nx run tool-fleet:check --skip-nx-cache`                                      | 604 pass, 0 fail; every family passed, exit 0 |
| `bunx nx format:check --all`                                                        | exit 0                                        |
| `bunx openspec validate --all --json`                                               | 328 passed, 0 failed, exit 0                  |
| Burokrat `check-indexes working <worktree> origin/main`                             | exit 0 (two pre-existing review-debt rows)    |
| `bunx nx affected -t lint typecheck test --base=origin/main --parallel=2`           | 8 projects, exit 0                            |

No host was touched: the converging apply of this change on h2puni and h4claw is owed (task 6.3e).

## 2026-11-05 token-unit apply converged on both hosts

`gate_host` at `main` `5150237fc` (task 6.3e) was applied to h2puni and then h4claw, neither
enrolled. Private `puni-plan` evidence: `evidence/2026-11-05-token-unit-apply.md`.

- Each host: apply 1 `ok=66 changed=1`, the one change "Create the token units" for the
  `docker_build` item; apply 2 `ok=66 changed=0`; `--tags validate`
  `ok=30 changed=0 failed=0 skipped=4`.
- Validate on each host: "Require one authorized key per listed key" passed and "Read the token
  units" was ok for both units. The sudo assertions matched each host: on h2puni the exception
  assertion passed and the strict one was skipped; on h4claw the strict one passed and the
  exception was skipped.
- A second-session `puni1` login was verified after apply 1 on both hosts, and the root
  safety-net session was held as a background job throughout (the H4-A10 shape).
- Neither host is enrolled: no `host-pool.json`, no ledger. `docker_build` is a clean
  one-commit tree.
- **H2-A11** A `pgrep -f` probe over ssh matches its own remote shell, whose command line carries
  the pattern; filter it with `pgrep -af … | grep -v pgrep` or a bracket pattern (gate-hosts.md, step 0).
- The `ops job audit` probe under validate was among the 4 skips on both hosts (no ledger yet); it
  stays unexercised live until 6.4. h2puni had 23 GiB free before each apply (role floor 20 GiB).
- **H2-A12 / H4-A11** The token unit was the only drift on either host.

## Slice 6d: nested heavy jobs and launcher freshness (tasks 6.10, 6.9)

Branch `feat/host-jobs-nested-label-and-launcher-timer` from `main` at `5150237fc`. Nothing here
touched a host: no ssh, no apply, no enrollment.

### Assumptions (overrulable by id)

- **S6D-A1 A nested call is re-labelled, on its enclosing job's admission, when that is sound
  (task 6.10).** `run_heavy_job` with `DASH_JOB_ID` set calls `run_nested_heavy_job`, which takes
  no lock, writes no ticket and asks Dash nothing. It runs the payload with
  `HEAVY_LOCK_LABEL=<outer label>/<type>` and prints one stderr line,
  `heavy job: <derived label> runs inside dash job <id> on that job's admission; no lock or
admission of its own`, which lands in the enclosing job's log.
  - Why re-label rather than refuse: the nested work is already inside an admitted scope, which
    measures and caps it, and Dash attributes every process that carries the job's
    `DASH_JOB_ID`. Asking again only queued it behind its own enclosing job: an observe-mode
    ticket behind the job's legacy hold, or an admission behind a `gate` that is not
    concurrency-eligible. With a zero budget either refused 75, under the gate's label.
  - The check proves kernel placement, not Dash admission. The id must have a job id's shape
    (`[0-9a-f-]{36}`, as `status.ts` parses it). This process's cgroup v2 path must be, or sit
    under, a scope named `dash-job-<id>.scope` (`scopeUnitOf`). Otherwise the call is refused 70.
    That refuses an inherited or hand-set `DASH_JOB_ID` outside such a scope; a launcher that
    inherited one unsets it before calling. It does not stop a same-account opt-out: the review
    of #873 reproduced `systemd-run --user --scope --unit dash-job-<id> …` passing it. The lock is
    advisory for the same account anyway. A real admission check would ask the ledger for a
    running job with that id; it is owed under task 6.10.
  - Superseded in slice 6e (S6E-A3): admission is now checked too. After placement the nested
    call asks `ops job admission` and runs only when the ledger has that job running.
  - Correction to the review: it read puni-pr-00 as not unsetting the variable. Its launcher
    `deploy/website/dev/build-release.sh` does, at line 77 on `origin/main` `a31b3c5`
    (`unset DASH_JOB_ID DASH_JOB_TYPE`), before its `run_heavy_job`. Its payload then reads the
    pair Dash sets, for the bounds, labels and receipt.
  - A type that declares an exclusive unit is refused 70. Its unit is either the enclosing job's,
    in use by the payload that started it, or not held at all. Re-labelling cannot make either
    sound. Today that means every type but `test-queued`: a nested solver publish or release build
    is refused with the unit named. It could not run before either: it queued behind the gate.
    An uncatalogued type is 64, as Dash refuses it.
  - The `/` separator is kept. The receipts that `release-pin.ts`, `scoping-rollback.ts`
    (`heavy-lock-claim.ts`) and puni-fleet `fleet-check` read are
    `<library> heavy lock: waited <n>s behind <k> tickets` or
    `dash job <id> type website-dev-build`, and neither form carries a label. A ticket's
    `label` line takes any text. `status.ts` parses a holder label only up to the space after
    `dash-job-<id>`. A nested call writes none of these.
  - The legacy lock is unchanged. On an unenrolled host there is no admitted job, so no
    `DASH_JOB_ID`, and a nested launcher queues behind its parent's lock as before.
- **S6D-A2 No Dash-side assertion in `launchers.test.ts`.** Its fake scope seam
  (`fakeSystemdRun` `exec`, `fakeScopeTelemetry`) runs the payload outside any
  `dash-job-<id>.scope`. A nested launcher there would be refused by the cgroup check, which is the
  check doing its job. The derived label, the absence of a lock and of a second admission, the
  status pass-through and the kernel identity are pinned in `bin/heavy-lock.test.sh` case 49,
  with `read_own_cgroup` redefined in the test shell, the seam this library already uses for its
  fixed paths. Case 49c reads the real `/proc/self/cgroup`.
- **S6D-A3 Tests that spawn launchers with an inherited environment.** Run inside an enrolled
  gate, a test that spawns a real `run_heavy_job` with `process.env` takes the nested path.
  `launchers.test.ts` already removes the job variables (S6C-A25), and `heavy-lock.test.sh`'s job
  suite now unsets `HEAVY_LOCK_LABEL` and every `DASH_JOB_*` before case 40. Nothing is owed in
  `tools/tool-dagger/src/heavy-lock.test.ts`: its gate fixture defines
  `run_heavy_job() { with_heavy_lock; }`, so the nested path is never reached there and the
  inherited variables are harmless (review of #873).

### Faults (6.10, `bin/heavy-lock.test.sh`, `HEAVY_LOCK_TEST_SUITES=jobs`)

| Injected fault                                                | Observed                                                                                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_heavy_job`'s `DASH_JOB_ID` branch replaced by `if false` | `49a: the payload runs under the derived label: want 'gate:abc/test-queued', got 'gate:abc'`; `49a: the nested call asked Dash again: … --label gate:abc …` |
| scope comparison replaced by `if false`                       | `49c`/`49d … want exit 70, got 0`, `something ran beside a forged job identity`; 4 checks failed                                                            |
| exclusive-unit refusal replaced by `if false`                 | `49f … want exit 70, got 0`; the payload ran as `gate:abc/solver-image-publish`; 2 checks failed                                                            |

- **S6D-A4 Who counts as a job launched from the checkout (task 6.9).** It is any live process of
  `puni1` whose working directory is the checkout or lies under it, except the processes of
  `dash-resources-watch.service`, which runs there by design and is restarted after the move.
  - This is the attribution Dash itself uses. `ops job run` reads the catalogue and the payload's
    revision from the checkout that holds the launcher's working directory (`catalogue.ts`).
    Every launcher stays alive as the outer shell of its job (J13). The ledger records no
    checkout for a job (`launcherSha` is null), and the lock's holder record names only a pid and
    a label, so neither can answer the question.
  - The scan also catches what neither record would. A Dash waiter would otherwise be refused 64
    when HEAD moves under it. It also catches a legacy launcher, a `test:queued` run in the
    checkout, the weekly audit, and an operator's shell.
  - Other accounts are not read: git refuses a checkout another account owns. A process whose
    working directory the kernel refuses to `puni1` is skipped. Such a process is more privileged
    than the account, or already leaving, and no launcher is either. Refusing on it instead
    refused every run on this workstation, over `ssh-agent` and `systemd --user`.
  - Busy is exit 75 with one journal line naming the checkout, both commits and each `pid
command`. The unit lists 75 in `SuccessExitStatus`, so a busy hour is not a failed unit. The
    next hour retries.
  - A checkout already at `origin/main` exits 0 and nothing is restarted, so a busy host does not
    wait on a scan.
- **S6D-A5 Accepted window.** A launcher can start between the scan and the checkout. It then
  sees one commit whole, old or new, because git replaces files rather than rewriting them. If
  its catalogue read and its gate straddle the move, Dash's existing HEAD check refuses it 64,
  which is loud and rerunnable. The window is the length of a detached checkout. Taking the heavy
  lock around the move would close it for the legacy queue only. Concurrent-mode admissions do
  not take that lock first, and a zero-budget caller would be refused 75 at random.
- **S6D-A6 Restart and install.** The watch is restarted with `try-restart`, so before
  `ops pool init` a stopped watch stays stopped. A restart while a job from another checkout runs
  is what the unit is built for: `KillMode=process` keeps the concurrent-mode guard holder alive
  across it (S6B-A8).
  - When `bun.lock` changed between the two commits, the checkout's frozen install runs before
    the restart, because the watch would otherwise start on modules the new commit does not pin.
    The brief did not ask for this step; it is needed for the restart to be sound.
  - A failed install returns the checkout to the old commit and reinstalls that commit. The
    watch, never restarted, keeps running the code that matches, and the next hour retries the
    whole move. If the return fails as well, the error names the manual steps.
- **S6D-A7 Installed everywhere, enabled where enrolled, started by the operator.** The role
  installs `gate-launcher-refresh.service` and `.timer` on every gate host, beside the other Dash
  units. It enables only the timer, only where `puni_gate_host_pool_enroll` is true, and starts
  nothing.
  - gate-hosts.md step 5 starts the timer together with the watch and the audit timer, after the
    first move. That move stays manual: the service runs the script from the checkout itself, so
    a checkout older than the script cannot refresh itself.
  - The timer runs `OnCalendar=hourly`, `RandomizedDelaySec=5min`, `Persistent=true`.
  - The service is `WorkingDirectory=<home>`, so the refresh is never a process in the checkout.
  - The script ends in one compound command, so bash has parsed the whole file before the
    checkout holding it moves.
  - validate requires both files and the timer enabled.
- **S6D-A8 CI.** The shell test is a step of its own in `ci.yml`, beside the heavy-lock and gate
  pinning suites, because no Nx project owns `bin/`. The script and its test are in the fleet
  check's shellcheck list (`EXTRA_SHELL_SCRIPTS`), since both are executable. No `package.json`
  script was added: `package.json` is an Nx shared global, and touching it would mark every
  project affected.

### Faults (6.9)

| ID    | Injected fault                                                                                                 | Observed                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6d-F1 | busy refusal (`if [[ -n $workers ]]`) replaced by `if false`                                                   | `1: a process in the checkout refuses the move: want exit 75, got 0`; `1: the checkout did not move` failed; `1b … want exit 75, got 0`                            |
| 6d-F2 | watch-unit exclusion replaced by `:`                                                                           | `4: a watch process in the checkout does not block the move: want exit 0, got 75`; 2 checks failed                                                                 |
| 6d-F3 | dirty-checkout refusal replaced by `if false`                                                                  | `5: a dirty checkout is refused: want exit 65, got 0`; the checkout moved, carrying the edit along (git keeps a non-conflicting edit)                              |
| 6d-F4 | restart status ignored (`systemctl … \|\| :`)                                                                  | `8: a failed watch restart is reported: want exit 70, got 0`; 2 checks failed                                                                                      |
| 6d-F5 | lockfile install replaced by `if false`                                                                        | `10: the frozen install ran in the checkout: want 'install --frozen-lockfile in <launcher>', got ''`, and 10b's failed install exited 0 with the watch restarted   |
| 6d-F6 | return after a failed install replaced by `true`                                                               | `10b: the checkout returned to the commit the watch runs` failed; `10c … want exit 70, got 0`; 4 checks failed                                                     |
| 6d-F7 | service template: `WorkingDirectory` set to the launcher checkout; `SuccessExitStatus=75` dropped              | `gate-host-pool.test.ts` "the launcher refresh runs hourly…": `- "/tmp/gate-host-pool-…"`, `+ ".../puni-00-gate-launcher"`; then `- ["75"]`, `+ undefined`         |
| 6d-F8 | `host-pool.yml`: refresh service dropped from install; timer dropped from enable; enable task's `when` dropped | `ansible.test.ts` "configures a gate host…" failed each time (33 pass, 1 fail)                                                                                     |
| 6d-F9 | the skip for a working directory the kernel refuses, replaced by a 70 refusal                                  | every run refused on this workstation: `cannot read the working directory of pid 10816` (`ssh-agent`), then pid 2226 (`systemd --user`, `CapEff 0000000800000000`) |

Review of #873 additions: 6d-F10, the checked `HEAD` read in `bin/gate-launcher-refresh.sh`
dropped, let a checkout with no HEAD commit move on with an empty head:
`11: a checkout without a HEAD commit is refused: want exit 70, got 0`, then `fatal: Needed a
single revision`. `read_own_cgroup` now refuses an unreadable `/proc/self/cgroup` with its own
message, apart from a file with no `0::` line. That branch has no test: an unreadable
`/proc/self/cgroup` cannot be arranged for an unprivileged test process.

The controller-image evaluator's E3 now records five unit files and drops each of the eight
conditions in turn. E4 records them too. E5 adds `refresh timer disabled`, which the probe
refuses, and removing `failed_when` lets it through. The run's lines are in the commands table.

### Commands (fresh, 2026-11-05, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, this workstation)

| Command                                                                             | Result                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `bash bin/heavy-lock.test.sh`                                                       | `all heavy-lock checks passed`, cases 49a–49g included                           |
| `bash bin/gate-launcher-refresh.test.sh`                                            | `all gate launcher refresh checks passed`                                        |
| `bash bin/h2puni-gate.test.sh`                                                      | exit 0, `all cases passed`                                                       |
| evaluator (`gate-host-assertions.py`, controller `@sha256:372f6f43…`, `--user 0:0`) | 102 `ok`, `{"failures": 0}`, exit 0                                              |
| `bunx nx run twilight-dash:test --skip-nx-cache`                                    | 5714 pass, 53 skip, 0 fail across 183 files; exit 0                              |
| `bunx nx run tool-fleet:check --skip-nx-cache`                                      | 604 pass, 0 fail; `shellcheck 0.11.0: 14 scripts`, `every family passed`, exit 0 |
| `bunx nx format:check --all`                                                        | exit 0                                                                           |
| `bunx openspec validate --all --json`                                               | 328 passed, 0 failed, exit 0                                                     |
| Burokrat `check-indexes working <worktree> origin/main`                             | exit 0 (two pre-existing review-debt rows)                                       |
| `bunx nx affected -t lint typecheck --base=origin/main --parallel=2`                | 10 projects, exit 0                                                              |

Not done: no host apply, so the units are not installed on h2puni or h4claw. That apply is owed
with 6.3e's converging apply, and the timer starts at step 5 of the enrollment. No gate ran on a
host.

## Slice 6e: tmp identity, nested admission, catalogue bookkeeping (tasks 2.4, 6.10a, 1.1)

Branch `feat/host-jobs-inode-identity-and-admission` from `main` at `0ff9b5a1f`. Nothing here
touched a host: no ssh, no apply, no enrollment.

### Assumptions (overrulable by id)

- **S6E-A1 A content marker, not birth time or ctime, completes the tmp directory's identity
  (task 2.4).** `prepareHostJob` writes a random UUID to `<locator>/.dash-tmp-identity` (mode
  0600, `wx`) and persists it as `HostJob.tmpMarker`. Settlement requires device, inode and that
  token: `hostJobTmpPresent` reads it with `O_NOFOLLOW` and requires a regular file with one
  link, and the removal script reads it again through the directory descriptor it then erases,
  so the check and the removal see the same directory.
  - Why not ctime: it changes whenever an entry is added to or removed from the directory, which
    every payload does to its `TMPDIR`. Why not birth time: `statx` reports it only where the
    filesystem records it, and a missing birth time would leave the inode-reuse hole open
    exactly there.
  - The marker lives in the payload's `TMPDIR`, so a payload that deletes or rewrites it leaves
    its tmp entry `blocked` with `identity changed: content marker differs` for an operator.
    That is the fail-closed reading of "not provably the original", and a payload has no reason
    to touch a dot-file it did not create. A deliberate same-account forger can copy the token;
    the lock is advisory for the same account already (S6D-A1), and this closes the accidental
    reuse, which is what the full-suite failure showed.
  - The removal script erases the marker last, after everything else, so a removal refused
    halfway (an outside hard link) leaves the directory still provably the original and the
    next pass keeps the same reason instead of writing a new settlement event. A crash between
    unlinking the marker and the final `rmdir` leaves an empty unmarked directory, which reads
    `blocked` for an operator; that window is one syscall long.
  - Measured on this workstation's ext4 `/tmp`: `rmdir` then `mkdir` returned the same inode on
    the first attempt five times out of five. The old test passed alone only because its
    `mkdir(outside)` between the two took the freed inode.
- **S6E-A2 No ledger version bump.** `tmpMarker` is an optional key of the host-job snapshot,
  the pattern `reserved?` set in slice 4. A row prepared before this change has device and
  inode and no marker; it settles on device and inode as it did, so a job running across the
  upgrade is not stranded. Every row prepared from now on carries one. `HostJobShape` rejects
  undeclared keys, so a Dash from before this commit cannot read those new rows: an
  un-restarted watch, or an older checkout's `ops job status`. The refresh restarts the watch
  right after the checkout moves (S6D-A6), which makes that unlikely.

- **S6E-A3 A nested call asks the ledger through a new read-only `ops job admission` (task
  6.10a).** After the placement and exclusive-unit checks, `run_nested_heavy_job` runs
  `bun <checkout>/…/entrypoint.ts ops job admission --config <fixed path> --job <id>` and
  accepts only `{"job":"<id>","running":true}`.
  - Why a new command: `ops job status` prints text for people and reads the shell lock's
    queue, and `ops pool inspect` prints the whole pool plus that queue. Both are more work and a
    wider contract than one yes or no. The new command opens the ledger as every `ops` command
    does (`openPool`), reads one row and prints one JSON line. It takes no lock: SQLite WAL reads
    do not wait on writers, and it neither sweeps nor settles.
  - Running means launched (`held`), no exit code and no launch failure recorded, and the
    leader recorded at launch still alive (pid, boot id and start time). A job admitted but not
    launched has no payload that could be the caller. A finished job's id, reused by a forged
    scope, is refused.
  - The shell refuses 70 on an unenrolled host before asking: there is no ledger, so no job can
    have been admitted. It also refuses 70 when Dash is missing, exits non-zero, or answers
    anything but a boolean `running` for the same job id. "Cannot tell" is never "admitted".
  - Cost: one Bun start and one SQLite read per nested call, about the cost of `ops job
status`. Nested calls are rare: today only a `test:queued` run inside a gate.
  - What it still does not stop: a same-account process that copies a running job's id into a
    scope it makes. That process runs beside a job that really is admitted and measured. The
    lock is advisory for the account (S6D-A1), and this closes the forged-id case the review of
    #873 reproduced.
  - The Dash queried is the nested caller's own checkout's (`resolve_dash_entrypoint`, from the
    library the caller sourced). Inside a gate that is the gate tree at the candidate commit,
    asked about the production ledger with the production `--config`. So `ops job admission`
    opens the ledger with `ResourceRuntime.openReadOnly` (review of #876 F1). That means SQLite
    `readonly`, the binding still compared, no eligibility check, and no migration. A ledger
    whose `user_version` is not this Dash's `LEDGER_VERSION` is refused 70, and the shell treats
    that refusal like any other Dash failure. A candidate that bumps the schema therefore
    cannot migrate the production ledger from inside a gate. Its nested calls are refused
    until production moves to that version.
  - The query is bounded (review F2): `timeout --kill-after=5 60`. Exit 124 or 137 is refused
    70 with its own message. `timeout` is coreutils, Essential on Ubuntu (gate-hosts.md,
    Packages).

- **S6E-A4 Task 1.1 was complete on `main`; only its box was open.** Each promise, checked
  against `0ff9b5a1f`:
  - `infra/jobs/catalogue.json` holds the four types (`jq -r '.jobs[].id'`: `gate`,
    `release-build`, `test-queued`, `solver-image-publish`). `infra/jobs/README.md` has the
    sections Fields, Heuristics (provisional) and Changing an envelope (the `calibrate` →
    `propose` → pull request → `audit` loop). Both came in `aadff2c3f`.
  - The comment goes on each catalogue `entrypoint`, not on every launcher. `gate` is at
    `bin/h2puni-gate.sh:130` and `release-build` at `bin/publish-release.sh:15`.
    `solver-image-publish` is at `tools/tool-devsync/src/solver-binding-runtime.ts:227`, its
    catalogue entrypoint. `test-queued`'s entrypoint is `package.json#scripts.test:queued`, and
    the README says JSON holds none. The launchers `bin/test-queued.sh` and
    `bin/solver-image-publish.sh` already name their type in `HEAVY_LOCK_JOB_TYPE=<id>`, so a
    comment there would only repeat it. None was added.
  - `puni-pr-00` #75, with `website-dev-build`, merged at `022a7e8b8` on 2026-11-03.
  - Tests: `job-catalogue.test.ts` (Burokrat contracts) has `parses this repository's catalogue
and names its four job types` and `refuses arguments outside the argument profile`.

### Faults (2.4, `bun test src/resources/host-jobs.test.ts` in its namespace)

| ID    | Injected fault                                                       | Observed                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6e-F0 | none: the new reuse test against `main`'s dev+inode identity         | `a replacement directory that reuses the inode stays charged and untouched`: `Expected: "blocked"`, `Received: "released"`                                                                                             |
| 6e-F1 | TypeScript marker comparison replaced by `if (false && …)`           | the reuse test and `a tmp directory whose marker the payload removed stays charged` failed: `Expected to contain: "identity changed"`, `Received: "tmp directory cleanup failed: descriptor-relative removal refused"` |
| 6e-F2 | 6e-F1 plus the removal script's `marker=` option dropped             | both failed: `Expected: "blocked"`, `Received: "released"`                                                                                                                                                             |
| 6e-F3 | removal script erases the marker with the rest, not last             | `a blocked tmp directory adds no outbox rows and backs off its evidence reads`: `Expected: 4`, `Received: 5` (a new settlement event)                                                                                  |
| 6e-F4 | a marker required of a row without one (`job.tmpMarker ?? "absent"`) | `a row prepared before markers settles on device and inode`: `Expected: "released"`, `Received: "blocked"`                                                                                                             |

### Faults (6.10a)

`bin/heavy-lock.test.sh` with `HEAVY_LOCK_TEST_SUITES=jobs`, then `admission.test.ts` in its
namespace.

| ID     | Injected fault                                                    | Observed                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6e-F5  | `if [[ $running != true ]]` replaced by `if false`                | `49h: a forged scope is refused when the ledger answers absent: want exit 70, got 0`; `49h: the payload ran on a forged scope (absent)`; 3 checks failed                                |
| 6e-F6  | unenrolled refusal replaced by `if false`                         | `49k: a nested call on an unenrolled host is refused: want exit 70, got 0`; `49k: something ran or asked Dash on an unenrolled host`; 3 checks failed                                   |
| 6e-F7  | the whole admission block dropped (the library as #873 merged it) | 49a `asked Dash something but its admission`, 49h and every 49i variant `want exit 70, got 0`, the payload ran; 49k `want exit 70, got 0`                                               |
| 6e-F8  | answer-shape check reduced to `(.running \| tostring)`            | `49i … ledger answers another-job: want exit 70, got 0`, `the payload ran on a forged scope (another-job)`; the malformed answer was refused but not named as unusable; 4 checks failed |
| 6e-F9  | `hostJobRunning` reduced to `job.state === 'held'`                | `a job whose payload exited, or whose process is gone, is not running`: `- "running": false`, `+ "running": true` (the exited job)                                                      |
| 6e-F10 | the leader-liveness term dropped                                  | the same test: the killed payload's job read `"running": true`                                                                                                                          |
| 6e-F11 | `--job` typed `flagValue('NAME')` instead of the job-id pattern   | `the grammar takes only a job id`: `Received function did not throw` for `--job gate`                                                                                                   |

### Commands (fresh, 2026-11-05, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, this workstation)

| Command                                                              | Result                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `bun test src/resources/host-jobs.test.ts` (twilight-dash cli)       | 39 pass, 0 fail inside the namespace; outer wrapper 1 pass                       |
| `bun test src/ops/admission.test.ts src/cli.test.ts`                 | 5 pass in the namespace; 127 pass with `no-ambient-clock.test.ts`, 0 fail        |
| `bunx nx run twilight-dash:test --skip-nx-cache`                     | 5717 pass, 53 skip, 0 fail across 184 files (3129 s); exit 0                     |
| `bash bin/heavy-lock.test.sh`                                        | `all heavy-lock checks passed`, cases 49a–49k included                           |
| `bash bin/h2puni-gate.test.sh`                                       | exit 0                                                                           |
| `bun test tools/tool-dagger/src/heavy-lock.test.ts`                  | 9 pass, 0 fail                                                                   |
| `bunx nx run tool-fleet:check --skip-nx-cache`                       | 604 pass, 0 fail; `shellcheck 0.11.0: 14 scripts`, `every family passed`, exit 0 |
| `bunx nx format:check --all`                                         | exit 0                                                                           |
| `bunx openspec validate --all --json`                                | 328 passed, 0 failed, exit 0                                                     |
| Burokrat `check-indexes working <worktree> origin/main`              | exit 0 (two pre-existing review-debt rows)                                       |
| `bunx nx affected -t lint typecheck --base=origin/main --parallel=2` | 8 projects, exit 0                                                               |

Not done: no host apply and no gate on a host. The admission check takes effect on h2puni and
h4claw when their launcher checkouts move to a commit carrying it (the hourly refresh, S6D-A4).

### Review fixes (Fable, #876)

| ID     | Injected fault                                                     | Observed                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6e-F12 | `openReadOnly` calls `migrate` instead of refusing another version | `a read-only open refuses a ledger of another version and leaves it as it was`: `Expected substring: "resource ledger version 1 is not 2, …"`, `Received message: "attempt to write a readonly database"` |
| 6e-F13 | 6e-F12 plus `readonly` dropped                                     | the same test: `Received function did not throw`; the open migrated the ledger                                                                                                                            |
| 6e-F14 | `timeout` dropped from the admission query                         | `HEAVY_LOCK_TEST_SUITES=jobs`, bounded at 90 s from outside, ended 124 before printing `49j`                                                                                                              |
| 6e-F15 | exit 124 folded into the generic refusal                           | `49j: the refusal did not say Dash timed out: … (exit 124)`; 1 check failed                                                                                                                               |

The F3 marker contract is now one sentence each in `docs/resources.md` (the `TMPDIR` bullet of
`ops job run`) and `docs/infra/heavy-job-launchers.md`. F4 adds the nested-call requirement to
the `heavy-lock-queue` delta, with five scenarios. F6: the state text is `(.state // "none" | tostring)`.

After the review fixes, fresh on this workstation: `bunx nx run twilight-dash:test
--skip-nx-cache` 5717 pass, 53 skip, 0 fail across 184 files (3057 s), exit 0. Also:
`bash bin/heavy-lock.test.sh` `all heavy-lock checks passed` (49a–49k, 49j new);
`tool-fleet:check` 604 pass, shellcheck 14 scripts, exit 0; `format:check --all` exit 0;
`openspec validate --all --json` 328 passed, 0 failed; Burokrat `check-indexes` exit 0 (the
two existing review-debt rows); `nx affected -t lint typecheck` 8 projects, exit 0.
