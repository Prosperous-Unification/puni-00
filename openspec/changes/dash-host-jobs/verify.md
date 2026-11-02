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
