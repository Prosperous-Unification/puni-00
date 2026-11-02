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
  `dash-host-job://<authorityId>/<jobId>/<revision>`; disposition `returned`. Slice 3's run
  record digest replaces the row digest once the launcher writes run records. WBS requires
  `returned` for a host job and refuses it for a v1 use.
- **S5-A12** `host` is the pool's `enrollmentId`; `payloadSha` is null until slice 3 records the
  payload's commit on the job.
- **S5-A13** One authority sequence: `synchronize` first moves unmoved `host_job_events` rows into
  the existing `events` outbox (next sequence, one transaction, oldest first) and the existing
  loop publishes them, because WBS requires each authority's sequence to be gap-free. A moved
  row is `published=1`.
- **S5-A14** Where WBS shows host jobs, and where the chip's names come from: the project
  resources read gains `hostJobs` on each resource whose provider instance is the authority's
  (`resource.provider_id = resource_host_job.provider_id`), listing jobs in state `registered`
  (not returned), oldest registration first, with `label`, `type`, `host` and `reservations`.
  The project-scoped resource uses list keeps v1 uses only: its `resourceUse` shape requires a
  project, resource and work item a host job need not have. Every unreturned host job of the
  instance is listed beside each of its resources, whatever dimensions it reserves.
- **S5-A15** The brief's "`kind` CHECK widened": `resource_use` has no SQL CHECK on kind (kind
  lives in the JSON declaration), so the variant gets its own table; `returned` is added to the
  contract's evidence enum.
- **S5-A16** The chip keeps `data-report="measured"` and adopt-by-command: the headline gains
  `, 12 reserved by 2 jobs` (`1 job`), the detail line names the labels (`Reserved by gate a and
gate b.`). Reserved units with no job yet read `12 reserved` and `Dash has not published the
jobs holding it yet.`; zero reads `none reserved`. `stale`, `unreachable` and `No report yet`
  read as before.
- **S5-A17** The WBS-down scenario drives the real ledger through the `WbsTools` port with no
  answer and then a transient mcp-01 refusal, rather than an HTTP fixture server: the outbox
  reaches WBS only through that port, and slice 2 already proves admission against a refusing
  HTTP server.
- **S5-A18** Outside the outbox publication, `runtime.ts` changed in one type annotation:
  `declaration()` returns `ResourceRuntimeAdmission['use']`, because the event's `use` is now a
  union (and `hostJobOutbox`'s JSDoc).
- **S5-A19** The reporter tests over a real ledger run in the private namespace the runtime's
  `/proc` inspection needs, as `host-jobs.test.ts` does.

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
- The settlement digest covers the ledger row, not slice 3's run record (S5-A11). `payloadSha`
  is null until slice 3 records it (S5-A12).
- The pre-existing flakes above (`runtime-dispatch.boot.db.test.ts`, `playwright-config.test.ts`,
  two Dash `src/runs` files) failed under the loaded full runs and passed alone. Nothing they
  cover changed.
